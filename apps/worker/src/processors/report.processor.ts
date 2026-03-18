import {
  getDb,
  healthReports,
  healthSnapshots,
  healthScores,
  healthMetrics,
  correlations,
} from "@biosync-io/db"
import type { Job } from "bullmq"
import { and, eq, gte, lte, sql, avg, count } from "drizzle-orm"

export interface ReportJobData {
  userId: string
  reportType: "weekly" | "monthly"
}

/**
 * Periodic report generation processor.
 *
 * Generates weekly/monthly health reports and snapshots.
 * All logic uses @biosync-io/db directly to avoid cross-package imports.
 */
export async function processReportJob(job: Job<ReportJobData>): Promise<void> {
  const { userId, reportType } = job.data
  const db = getDb()
  const now = new Date()

  const periodEnd = new Date(now)
  const periodStart = new Date(now)
  if (reportType === "weekly") {
    periodStart.setDate(periodStart.getDate() - 7)
  } else {
    periodStart.setMonth(periodStart.getMonth() - 1)
  }

  // 1. Generate health report
  try {
    const report = await generateReport(db, userId, reportType, periodStart, periodEnd)
    job.log(`Generated ${reportType} report: ${report.id}`)
  } catch (err: any) {
    job.log(`Report generation failed: ${err.message}`)
  }

  // 2. Generate snapshot
  try {
    const snapshot = await generateSnapshot(db, userId, reportType, periodStart, periodEnd)
    job.log(`Generated ${reportType} snapshot: ${snapshot.id}`)
  } catch (err: any) {
    job.log(`Snapshot generation failed: ${err.message}`)
  }

  // 3. Recompute correlations (monthly only)
  if (reportType === "monthly") {
    try {
      const count = await computeCorrelations(db, userId, 90)
      job.log(`Computed ${count} correlations`)
    } catch (err: any) {
      job.log(`Correlation computation failed: ${err.message}`)
    }
  }

  job.log(`${reportType} report processing complete for user ${userId}`)
}

// ── Inline helpers ──────────────────────────────────────────────

async function generateReport(
  db: ReturnType<typeof getDb>,
  userId: string,
  reportType: string,
  periodStart: Date,
  periodEnd: Date,
) {
  // Gather period scores
  const scores = await db
    .select()
    .from(healthScores)
    .where(and(eq(healthScores.userId, userId), gte(healthScores.date, periodStart), lte(healthScores.date, periodEnd)))

  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((s, r) => s + r.overallScore, 0) / scores.length) * 10) / 10
    : null

  const highlights: string[] = []
  if (avgScore != null) {
    highlights.push(`Average health score: ${avgScore}`)
  }
  if (scores.length > 0) {
    const best = scores.reduce((a, b) => (a.overallScore > b.overallScore ? a : b))
    highlights.push(`Best day score: ${best.overallScore} (${best.grade})`)
  }

  const title = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Health Report`

  const [report] = await db
    .insert(healthReports)
    .values({
      userId,
      reportType,
      title,
      periodStart,
      periodEnd,
      status: "ready",
      content: { avgScore, totalDays: scores.length },
      highlights,
      recommendations: ["Stay consistent with sleep schedule", "Maintain daily step target"],
      format: "json",
    })
    .returning()

  return report!
}

async function generateSnapshot(
  db: ReturnType<typeof getDb>,
  userId: string,
  periodType: string,
  periodStart: Date,
  periodEnd: Date,
) {
  // Aggregate metrics for the period
  const metricAverages = await db
    .select({
      metricType: healthMetrics.metricType,
      avg: sql<number>`avg(${healthMetrics.value})`,
      cnt: sql<number>`count(*)`,
    })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, periodStart), lte(healthMetrics.recordedAt, periodEnd)))
    .groupBy(healthMetrics.metricType)

  const byType = new Map(metricAverages.map((m) => [m.metricType, m.avg]))

  // Get average overall score
  const [scoreRow] = await db
    .select({ avg: sql<number>`avg(${healthScores.overallScore})` })
    .from(healthScores)
    .where(and(eq(healthScores.userId, userId), gte(healthScores.date, periodStart), lte(healthScores.date, periodEnd)))

  const [snapshot] = await db
    .insert(healthSnapshots)
    .values({
      userId,
      periodType,
      periodStart,
      periodEnd,
      overallScore: scoreRow?.avg ?? null,
      avgSteps: byType.get("steps") ?? null,
      avgSleepMinutes: byType.get("sleep") ?? null,
      avgRestingHr: byType.get("resting_heart_rate") ?? null,
      avgHrv: byType.get("hrv") ?? null,
      avgCalories: byType.get("calories") ?? null,
      avgActiveMinutes: byType.get("active_minutes") ?? null,
      avgWeight: byType.get("weight") ?? null,
      avgStress: byType.get("stress") ?? null,
      avgRecovery: byType.get("recovery") ?? null,
      periodComparison: {},
      observations: [],
    })
    .returning()

  return snapshot!
}

async function computeCorrelations(db: ReturnType<typeof getDb>, userId: string, days: number) {
  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - days)
  const periodEnd = new Date()

  // Get distinct metric types with enough data
  const metricTypes = await db
    .select({ metricType: healthMetrics.metricType, cnt: sql<number>`count(*)` })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, periodStart)))
    .groupBy(healthMetrics.metricType)

  const validTypes = metricTypes.filter((m) => m.cnt >= 10).map((m) => m.metricType)
  if (validTypes.length < 2) return 0

  let computed = 0

  // Compute pairwise correlations for top metric pairs
  for (let i = 0; i < Math.min(validTypes.length, 8); i++) {
    for (let j = i + 1; j < Math.min(validTypes.length, 8); j++) {
      const metricA = validTypes[i]!
      const metricB = validTypes[j]!

      // Fetch daily aggregates for each metric
      const daily = await db
        .select({
          day: sql<string>`date_trunc('day', ${healthMetrics.recordedAt})`,
          metricType: healthMetrics.metricType,
          avg: sql<number>`avg(${healthMetrics.value})`,
        })
        .from(healthMetrics)
        .where(
          and(
            eq(healthMetrics.userId, userId),
            gte(healthMetrics.recordedAt, periodStart),
            sql`${healthMetrics.metricType} IN (${sql.raw(`'${metricA}', '${metricB}'`)})`,
          ),
        )
        .groupBy(sql`date_trunc('day', ${healthMetrics.recordedAt})`, healthMetrics.metricType)

      const mapA = new Map<string, number>()
      const mapB = new Map<string, number>()
      for (const row of daily) {
        if (row.metricType === metricA) mapA.set(row.day, row.avg)
        else mapB.set(row.day, row.avg)
      }

      const commonDays = [...mapA.keys()].filter((d) => mapB.has(d))
      if (commonDays.length < 7) continue

      const valsA = commonDays.map((d) => mapA.get(d)!)
      const valsB = commonDays.map((d) => mapB.get(d)!)

      const pearsonR = pearsonCorrelation(valsA, valsB)
      if (Number.isNaN(pearsonR)) continue

      const absR = Math.abs(pearsonR)
      const strength = absR >= 0.8 ? "very_strong" : absR >= 0.6 ? "strong" : absR >= 0.4 ? "moderate" : "weak"
      const direction = pearsonR >= 0 ? "positive" : "negative"

      await db
        .insert(correlations)
        .values({
          userId,
          metricA,
          metricB,
          pearsonR,
          sampleSize: commonDays.length,
          strength,
          direction,
          periodStart,
          periodEnd,
          description: `${strength} ${direction} correlation between ${metricA} and ${metricB}`,
        })
        .onConflictDoNothing()
      computed++
    }
  }
  return computed
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length
  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n
  let num = 0, denX = 0, denY = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX
    const dy = y[i]! - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const den = Math.sqrt(denX * denY)
  return den === 0 ? 0 : num / den
}
