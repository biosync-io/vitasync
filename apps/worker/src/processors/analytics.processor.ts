import {
  getDb,
  healthMetrics,
  healthScores,
  anomalyAlerts,
  biometricBaselines,
  goals,
  achievements,
} from "@biosync-io/db"
import type { Job } from "bullmq"
import { and, eq, gte, lte, desc, sql } from "drizzle-orm"

export interface AnalyticsJobData {
  userId: string
  workspaceId: string
  connectionId?: string
  trigger: "post_sync" | "scheduled"
}

/**
 * Post-sync analytics processor.
 *
 * After a provider sync completes, this processor runs:
 * 1. Health score computation for today
 * 2. Anomaly detection scan
 * 3. Achievement check
 * 4. Biometric baseline recomputation
 * 5. Goal progress evaluation
 *
 * All logic uses @biosync-io/db directly to avoid cross-package imports.
 */
export async function processAnalyticsJob(job: Job<AnalyticsJobData>): Promise<void> {
  const { userId, trigger } = job.data
  const db = getDb()
  const today = new Date()

  // 1. Compute health score
  try {
    const score = await computeHealthScore(db, userId, today)
    job.log(`Health score computed: ${score.overallScore} (${score.grade})`)
  } catch (err: any) {
    job.log(`Health score computation failed: ${err.message}`)
  }

  // 2. Anomaly detection
  try {
    const count = await detectAnomalies(db, userId)
    if (count > 0) job.log(`Detected ${count} anomalies`)
  } catch (err: any) {
    job.log(`Anomaly detection failed: ${err.message}`)
  }

  // 3. Achievement check
  try {
    const awarded = await checkAchievements(db, userId)
    if (awarded > 0) job.log(`Awarded ${awarded} new achievements`)
  } catch (err: any) {
    job.log(`Achievement check failed: ${err.message}`)
  }

  // 4. Baseline recomputation (only on scheduled runs)
  if (trigger === "scheduled") {
    try {
      const count = await recomputeBaselines(db, userId)
      job.log(`Recomputed ${count} biometric baselines`)
    } catch (err: any) {
      job.log(`Baseline computation failed: ${err.message}`)
    }
  }

  // 5. Evaluate active goals
  try {
    const evaluated = await evaluateGoals(db, userId)
    if (evaluated > 0) job.log(`Evaluated ${evaluated} active goals`)
  } catch (err: any) {
    job.log(`Goal evaluation failed: ${err.message}`)
  }

  job.log(`Analytics processing complete for user ${userId}`)
}

// ── Inline helpers (no cross-package imports) ───────────────────

async function computeHealthScore(db: ReturnType<typeof getDb>, userId: string, date: Date) {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const metrics = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, dayStart), lte(healthMetrics.recordedAt, dayEnd)))

  const byType = new Map<string, number[]>()
  for (const m of metrics) {
    if (m.value == null) continue
    const arr = byType.get(m.metricType) ?? []
    arr.push(m.value)
    byType.set(m.metricType, arr)
  }

  const sleepScore = scoreFromMetric(byType, "sleep_score", "sleep")
  const activityScore = scoreFromStepsAndActive(byType)
  const cardioScore = scoreFromCardio(byType)
  const overallScore = weightedAvg([
    [sleepScore, 0.25], [activityScore, 0.25], [cardioScore, 0.20], [50, 0.15], [50, 0.15],
  ])
  const grade = overallScore >= 90 ? "A+" : overallScore >= 80 ? "A" : overallScore >= 70 ? "B" : overallScore >= 60 ? "C" : "D"

  const weekAgo = new Date(dayStart)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekRows = await db
    .select({ score: healthScores.overallScore })
    .from(healthScores)
    .where(and(eq(healthScores.userId, userId), gte(healthScores.date, weekAgo)))
  const weeklyAverage = weekRows.length > 0
    ? Math.round((weekRows.reduce((s, r) => s + r.score, overallScore) / (weekRows.length + 1)) * 10) / 10
    : overallScore

  const [row] = await db
    .insert(healthScores)
    .values({ userId, date: dayStart, overallScore, sleepScore, activityScore, cardioScore, recoveryScore: null, bodyScore: null, grade, weeklyAverage, breakdown: {} })
    .onConflictDoUpdate({ target: [healthScores.userId, healthScores.date], set: { overallScore, grade, weeklyAverage } })
    .returning()
  return row!
}

async function detectAnomalies(db: ReturnType<typeof getDb>, userId: string) {
  // Check baselines and flag metrics deviating >2 stddev
  const baselines = await db.select().from(biometricBaselines).where(eq(biometricBaselines.userId, userId))
  if (baselines.length === 0) return 0

  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  let detected = 0

  for (const bl of baselines) {
    const recentMetrics = await db
      .select({ value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
      .from(healthMetrics)
      .where(and(eq(healthMetrics.userId, userId), eq(healthMetrics.metricType, bl.metricType), gte(healthMetrics.recordedAt, dayStart)))
      .limit(10)

    for (const m of recentMetrics) {
      if (m.value == null || bl.stddev == null || bl.stddev === 0) continue
      const zScore = Math.abs((m.value - bl.mean) / bl.stddev)
      if (zScore >= 2) {
        const severity = zScore >= 3 ? "critical" : zScore >= 2.5 ? "high" : "medium"
        const title = `Anomaly detected: ${bl.metricType}`
        const description = `${bl.metricType} value ${m.value} deviates ${zScore.toFixed(1)} std deviations from baseline ${bl.mean.toFixed(1)}`
        await db
          .insert(anomalyAlerts)
          .values({ userId, metricType: bl.metricType, observedValue: m.value, expectedValue: bl.mean, zScore, severity, detectionMethod: "z_score", status: "new", title, description, detectedAt: m.recordedAt ?? new Date() })
          .onConflictDoNothing()
        detected++
      }
    }
  }
  return detected
}

async function checkAchievements(db: ReturnType<typeof getDb>, userId: string) {
  // Check milestone-based achievements not yet awarded
  const existing = await db
    .select({ achievementId: achievements.achievementId })
    .from(achievements)
    .where(eq(achievements.userId, userId))
  const existingIds = new Set(existing.map((e) => e.achievementId))

  let awarded = 0

  // Steps milestones
  const [stepsTotal] = await db
    .select({ total: sql<number>`coalesce(sum(${healthMetrics.value}), 0)` })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), eq(healthMetrics.metricType, "steps")))

  const stepsMilestones = [
    { id: "steps-100k", threshold: 100_000, name: "100K Steps", tier: "bronze" },
    { id: "steps-1m", threshold: 1_000_000, name: "Million Steps", tier: "silver" },
    { id: "steps-10m", threshold: 10_000_000, name: "10M Steps", tier: "gold" },
  ]
  for (const m of stepsMilestones) {
    if (!existingIds.has(m.id) && stepsTotal && stepsTotal.total >= m.threshold) {
      await db.insert(achievements).values({
        userId,
        achievementId: m.id,
        category: "milestone",
        name: m.name,
        tier: m.tier,
        unlockedAt: new Date(),
        metadata: { totalSteps: stepsTotal.total },
      }).onConflictDoNothing()
      awarded++
    }
  }

  return awarded
}

async function recomputeBaselines(db: ReturnType<typeof getDb>, userId: string) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const metricTypes = await db
    .selectDistinct({ metricType: healthMetrics.metricType })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, thirtyDaysAgo)))

  let count = 0
  for (const { metricType } of metricTypes) {
    const rows = await db
      .select({ value: healthMetrics.value })
      .from(healthMetrics)
      .where(and(eq(healthMetrics.userId, userId), eq(healthMetrics.metricType, metricType), gte(healthMetrics.recordedAt, thirtyDaysAgo)))

    const vals = rows.map((r) => r.value).filter((v): v is number => v != null).sort((a, b) => a - b)
    if (vals.length < 5) continue

    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const stddev = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length)
    const min = vals[0]!
    const max = vals[vals.length - 1]!

    const baselineDate = new Date()
    baselineDate.setHours(0, 0, 0, 0)
    await db
      .insert(biometricBaselines)
      .values({ userId, metricType, date: baselineDate, mean, stddev, min, max, sampleSize: vals.length })
      .onConflictDoUpdate({ target: [biometricBaselines.userId, biometricBaselines.metricType, biometricBaselines.date], set: { mean, stddev, min, max, sampleSize: vals.length } })
    count++
  }
  return count
}

async function evaluateGoals(db: ReturnType<typeof getDb>, userId: string) {
  const activeGoals = await db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.isActive, true))).limit(50)
  let evaluated = 0
  for (const goal of activeGoals) {
    if (!goal.metricType) continue
    const [metric] = await db
      .select({ total: sql<number>`sum(${healthMetrics.value})` })
      .from(healthMetrics)
      .where(and(eq(healthMetrics.userId, userId), eq(healthMetrics.metricType, goal.metricType)))

    if (metric?.total != null) {
      const newValue = metric.total
      const isComplete = newValue >= goal.targetValue
      await db.update(goals).set({ currentValue: newValue, isActive: !isComplete }).where(eq(goals.id, goal.id))
      evaluated++
    }
  }
  return evaluated
}

// ── Score helper functions ──────────────────────────────────────

function scoreFromMetric(byType: Map<string, number[]>, primary: string, fallback: string): number | null {
  const scores = byType.get(primary)
  if (scores && scores.length > 0) return Math.min(100, scores[0]!)
  const vals = byType.get(fallback)
  if (!vals || vals.length === 0) return null
  const hrs = vals[0]! / 60
  if (hrs >= 7 && hrs <= 9) return 85
  if (hrs >= 6) return 65
  return Math.max(20, hrs * 10)
}

function scoreFromStepsAndActive(byType: Map<string, number[]>): number | null {
  const steps = byType.get("steps")
  const active = byType.get("active_minutes")
  if (!steps && !active) return null
  let score = 50
  if (steps?.[0]) score = Math.min(100, (steps[0] / 10000) * 100)
  if (active?.[0]) score = (score + Math.min(100, (active[0] / 30) * 100)) / 2
  return Math.round(score)
}

function scoreFromCardio(byType: Map<string, number[]>): number | null {
  const rhr = byType.get("resting_heart_rate")
  if (!rhr || rhr.length === 0) return null
  const avg = rhr.reduce((a, b) => a + b, 0) / rhr.length
  if (avg < 50) return 95
  if (avg < 60) return 85
  if (avg < 70) return 75
  if (avg < 80) return 55
  return 35
}

function weightedAvg(items: [number | null, number][]): number {
  let sum = 0, totalW = 0
  for (const [val, w] of items) {
    if (val != null) { sum += val * w; totalW += w }
  }
  return totalW > 0 ? Math.round((sum / totalW) * 10) / 10 : 50
}
