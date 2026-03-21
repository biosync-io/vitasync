import { getDb, healthMetrics, biometricBaselines, correlations } from "@biosync-io/db"
import type { CorrelationInsert } from "@biosync-io/db"
import { and, eq, gte, lte, sql, asc } from "drizzle-orm"

// ── Statistical Helpers ─────────────────────────────────────────

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length)
}

function pearson(x: number[], y: number[]): number {
  const n = x.length
  if (n < 3) return 0
  const mx = mean(x)
  const my = mean(y)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const xd = x[i]! - mx
    const yd = y[i]! - my
    num += xd * yd
    dx += xd * xd
    dy += yd * yd
  }
  const denom = Math.sqrt(dx * dy)
  return denom === 0 ? 0 : num / denom
}

function spearmanRank(values: number[]): number[] {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const ranks = new Array<number>(values.length)
  for (let i = 0; i < sorted.length; i++) {
    ranks[sorted[i]!.i] = i + 1
  }
  return ranks
}

function spearman(x: number[], y: number[]): number {
  return pearson(spearmanRank(x), spearmanRank(y))
}

/** Approximate p-value for Pearson r using t-distribution */
function pValueApprox(r: number, n: number): number {
  if (n <= 2) return 1
  const t = r * Math.sqrt((n - 2) / (1 - r * r))
  const df = n - 2
  // Approximation using incomplete beta (simplified)
  const x = df / (df + t * t)
  return Math.min(1, Math.exp(-0.5 * Math.abs(t)) * 2)
}

function strengthLabel(r: number): string {
  const abs = Math.abs(r)
  if (abs >= 0.7) return "very_strong"
  if (abs >= 0.5) return "strong"
  if (abs >= 0.3) return "moderate"
  return "weak"
}

// ── Types ───────────────────────────────────────────────────────

export interface CorrelationResult {
  metricA: string
  metricB: string
  pearsonR: number
  spearmanRho: number
  pValue: number
  sampleSize: number
  strength: string
  direction: string
  description: string
}

export interface UserBiologicalContext {
  userId: string
  generatedAt: string
  baselines: Record<string, { mean: number; stddev: number; unit: string; samples: number }>
  recentTrends: Record<string, { direction: string; changePercent: number; period: string }>
  activeAnomalies: Array<{ metricType: string; severity: string; title: string; detectedAt: string }>
  topCorrelations: Array<{ metricA: string; metricB: string; pearsonR: number; description: string }>
  healthScore: { overall: number; sleep: number | null; activity: number | null; cardio: number | null; recovery: number | null } | null
  summary: string
}

// ── Correlation Engine ──────────────────────────────────────────

/**
 * Compute pairwise correlations across all metric types for a user.
 * Only stores statistically significant results (|r| > 0.3, p < 0.05).
 */
export async function computeCorrelations(
  userId: string,
  days: number = 90,
): Promise<CorrelationResult[]> {
  const db = getDb()
  const now = new Date()
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  // Fetch all scalar metrics in the period
  const metrics = await db
    .select({
      metricType: healthMetrics.metricType,
      recordedAt: healthMetrics.recordedAt,
      value: healthMetrics.value,
    })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        gte(healthMetrics.recordedAt, since),
      ),
    )
    .orderBy(asc(healthMetrics.recordedAt))

  // Group by metric type, keyed by date (daily aggregation)
  const byType = new Map<string, Map<string, number[]>>()
  for (const m of metrics) {
    if (m.value == null) continue
    const dateKey = new Date(m.recordedAt).toISOString().slice(0, 10)
    let typeMap = byType.get(m.metricType)
    if (!typeMap) {
      typeMap = new Map()
      byType.set(m.metricType, typeMap)
    }
    const existing = typeMap.get(dateKey)
    if (existing) {
      existing.push(m.value)
    } else {
      typeMap.set(dateKey, [m.value])
    }
  }

  // Average multiple readings per day
  const dailyAvg = new Map<string, Map<string, number>>()
  for (const [type, dateMap] of byType) {
    const avg = new Map<string, number>()
    for (const [date, values] of dateMap) {
      avg.set(date, mean(values))
    }
    if (avg.size >= 7) {
      dailyAvg.set(type, avg)
    }
  }

  const types = [...dailyAvg.keys()]
  const results: CorrelationResult[] = []

  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const typeA = types[i]!
      const typeB = types[j]!
      const mapA = dailyAvg.get(typeA)!
      const mapB = dailyAvg.get(typeB)!

      // Find overlapping dates
      const xVals: number[] = []
      const yVals: number[] = []
      for (const [date, valA] of mapA) {
        const valB = mapB.get(date)
        if (valB !== undefined) {
          xVals.push(valA)
          yVals.push(valB)
        }
      }

      if (xVals.length < 7) continue

      const r = pearson(xVals, yVals)
      const rho = spearman(xVals, yVals)
      const pVal = pValueApprox(r, xVals.length)

      if (Math.abs(r) < 0.3 || pVal > 0.05) continue

      const strength = strengthLabel(r)
      const direction = r > 0 ? "positive" : "negative"
      const dirWord = r > 0 ? "increases" : "decreases"
      const label = (s: string) => s.replace(/_/g, " ")

      results.push({
        metricA: typeA,
        metricB: typeB,
        pearsonR: Math.round(r * 1000) / 1000,
        spearmanRho: Math.round(rho * 1000) / 1000,
        pValue: Math.round(pVal * 10000) / 10000,
        sampleSize: xVals.length,
        strength,
        direction,
        description: `When ${label(typeA)} ${dirWord}, ${label(typeB)} tends to ${dirWord === "increases" ? "increase" : "decrease"} as well (r=${Math.round(r * 100) / 100}, ${strength}).`,
      })
    }
  }

  // Persist significant correlations
  if (results.length > 0) {
    const rows: CorrelationInsert[] = results.map((c) => ({
      userId,
      metricA: c.metricA,
      metricB: c.metricB,
      pearsonR: c.pearsonR,
      spearmanRho: c.spearmanRho,
      pValue: c.pValue,
      sampleSize: c.sampleSize,
      strength: c.strength,
      direction: c.direction,
      description: c.description,
      periodStart: since,
      periodEnd: now,
    }))

    await db.insert(correlations).values(rows).onConflictDoNothing()
  }

  return results
}

// ── LLM-Ready Biological Context Builder ────────────────────────

/**
 * Build a pre-formatted biological context object designed for LLM consumption.
 * This is the "LLM-Ready Context Endpoint" — pre-aggregated data that an AI
 * coach can immediately use to understand a user's health state.
 */
export async function buildLLMContext(userId: string): Promise<UserBiologicalContext> {
  const db = getDb()
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // 1. Baselines (30-day stats per metric)
  const baselineRows = await db
    .select({
      metricType: healthMetrics.metricType,
      value: healthMetrics.value,
      unit: healthMetrics.unit,
    })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        gte(healthMetrics.recordedAt, thirtyDaysAgo),
      ),
    )

  const baselineMap = new Map<string, { values: number[]; unit: string }>()
  for (const row of baselineRows) {
    if (row.value == null) continue
    const existing = baselineMap.get(row.metricType)
    if (existing) {
      existing.values.push(row.value)
    } else {
      baselineMap.set(row.metricType, { values: [row.value], unit: row.unit ?? "" })
    }
  }

  const baselines: UserBiologicalContext["baselines"] = {}
  for (const [type, { values, unit }] of baselineMap) {
    baselines[type] = {
      mean: Math.round(mean(values) * 100) / 100,
      stddev: Math.round(stddev(values) * 100) / 100,
      unit,
      samples: values.length,
    }
  }

  // 2. Recent trends (7-day vs previous 7 days)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const trendRows = await db
    .select({
      metricType: healthMetrics.metricType,
      recordedAt: healthMetrics.recordedAt,
      value: healthMetrics.value,
    })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        gte(healthMetrics.recordedAt, fourteenDaysAgo),
      ),
    )

  const recentTrends: UserBiologicalContext["recentTrends"] = {}
  const trendByType = new Map<string, { recent: number[]; previous: number[] }>()
  for (const row of trendRows) {
    if (row.value == null) continue
    let entry = trendByType.get(row.metricType)
    if (!entry) {
      entry = { recent: [], previous: [] }
      trendByType.set(row.metricType, entry)
    }
    if (new Date(row.recordedAt) >= sevenDaysAgo) {
      entry.recent.push(row.value)
    } else {
      entry.previous.push(row.value)
    }
  }

  for (const [type, { recent, previous }] of trendByType) {
    if (recent.length === 0 || previous.length === 0) continue
    const recentAvg = mean(recent)
    const prevAvg = mean(previous)
    const change = prevAvg === 0 ? 0 : ((recentAvg - prevAvg) / prevAvg) * 100
    recentTrends[type] = {
      direction: change > 5 ? "rising" : change < -5 ? "falling" : "stable",
      changePercent: Math.round(change * 10) / 10,
      period: "7d",
    }
  }

  // 3. Active anomalies
  const { anomalyAlerts } = await import("@biosync-io/db")
  const anomalies = await db
    .select({
      metricType: anomalyAlerts.metricType,
      severity: anomalyAlerts.severity,
      title: anomalyAlerts.title,
      detectedAt: anomalyAlerts.detectedAt,
    })
    .from(anomalyAlerts)
    .where(
      and(
        eq(anomalyAlerts.userId, userId),
        eq(anomalyAlerts.status, "new"),
      ),
    )

  const activeAnomalies = anomalies.map((a) => ({
    metricType: a.metricType,
    severity: a.severity,
    title: a.title,
    detectedAt: new Date(a.detectedAt).toISOString(),
  }))

  // 4. Top correlations
  const { correlations: correlationsTable } = await import("@biosync-io/db")
  const corrRows = await db
    .select({
      metricA: correlationsTable.metricA,
      metricB: correlationsTable.metricB,
      pearsonR: correlationsTable.pearsonR,
      description: correlationsTable.description,
    })
    .from(correlationsTable)
    .where(eq(correlationsTable.userId, userId))
    .orderBy(sql`abs(pearson_r) DESC`)
    .limit(10)

  const topCorrelations = corrRows.map((c) => ({
    metricA: c.metricA,
    metricB: c.metricB,
    pearsonR: c.pearsonR,
    description: c.description ?? "",
  }))

  // 5. Latest health score
  const { healthScores } = await import("@biosync-io/db")
  const [latestScore] = await db
    .select()
    .from(healthScores)
    .where(eq(healthScores.userId, userId))
    .orderBy(sql`date DESC`)
    .limit(1)

  const healthScore = latestScore
    ? {
        overall: latestScore.overallScore,
        sleep: latestScore.sleepScore,
        activity: latestScore.activityScore,
        cardio: latestScore.cardioScore,
        recovery: latestScore.recoveryScore,
      }
    : null

  // 6. Generate natural language summary
  const summaryParts: string[] = []
  if (healthScore) {
    summaryParts.push(`Overall health score: ${healthScore.overall}/100.`)
  }
  if (activeAnomalies.length > 0) {
    summaryParts.push(`${activeAnomalies.length} active anomaly alert(s) requiring attention.`)
  }
  const risingMetrics = Object.entries(recentTrends).filter(([, t]) => t.direction === "rising")
  const fallingMetrics = Object.entries(recentTrends).filter(([, t]) => t.direction === "falling")
  if (risingMetrics.length > 0) {
    summaryParts.push(`Rising trends in: ${risingMetrics.map(([k]) => k.replace(/_/g, " ")).join(", ")}.`)
  }
  if (fallingMetrics.length > 0) {
    summaryParts.push(`Declining trends in: ${fallingMetrics.map(([k]) => k.replace(/_/g, " ")).join(", ")}.`)
  }
  if (topCorrelations.length > 0) {
    summaryParts.push(`Top insight: ${topCorrelations[0]!.description}`)
  }

  return {
    userId,
    generatedAt: now.toISOString(),
    baselines,
    recentTrends,
    activeAnomalies,
    topCorrelations,
    healthScore,
    summary: summaryParts.join(" ") || "Insufficient data for summary.",
  }
}
