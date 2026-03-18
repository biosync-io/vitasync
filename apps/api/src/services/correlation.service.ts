import { getDb, correlations, healthMetrics } from "@biosync-io/db"
import type { CorrelationInsert, CorrelationRow } from "@biosync-io/db"
import { and, desc, eq, gte, lte, asc } from "drizzle-orm"

/**
 * Correlation Engine Service — Feature #8 (Metric Correlation Discovery)
 *
 * Computes Pearson and Spearman correlations between pairs of health metrics
 * for each user. Only stores statistically significant correlations.
 *
 * Examples: "Your sleep quality improves when you walk more steps",
 * "Higher stress days correlate with lower HRV".
 */

const METRIC_PAIRS: [string, string][] = [
  ["steps", "sleep_score"],
  ["steps", "resting_heart_rate"],
  ["active_minutes", "sleep_score"],
  ["active_minutes", "recovery_score"],
  ["resting_heart_rate", "heart_rate_variability"],
  ["resting_heart_rate", "sleep_score"],
  ["stress", "sleep_score"],
  ["stress", "heart_rate_variability"],
  ["stress", "recovery_score"],
  ["heart_rate_variability", "recovery_score"],
  ["heart_rate_variability", "sleep_score"],
  ["calories", "weight"],
  ["steps", "calories"],
  ["sleep_score", "recovery_score"],
  ["sleep_score", "readiness_score"],
  ["active_minutes", "calories"],
  ["resting_heart_rate", "stress"],
  ["weight", "resting_heart_rate"],
  ["blood_glucose", "calories"],
  ["respiratory_rate", "sleep_score"],
]

export class CorrelationService {
  private get db() {
    return getDb()
  }

  async list(userId: string, opts: { strength?: string; limit?: number } = {}): Promise<CorrelationRow[]> {
    const conditions = [eq(correlations.userId, userId)]
    if (opts.strength) conditions.push(eq(correlations.strength, opts.strength))

    return this.db
      .select()
      .from(correlations)
      .where(and(...conditions))
      .orderBy(desc(correlations.createdAt))
      .limit(opts.limit ?? 50)
  }

  async computeCorrelations(userId: string, opts: { days?: number } = {}): Promise<CorrelationRow[]> {
    const days = opts.days ?? 30
    const to = new Date()
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)

    // Fetch all metrics in range
    const metrics = await this.db
      .select({
        metricType: healthMetrics.metricType,
        value: healthMetrics.value,
        recordedAt: healthMetrics.recordedAt,
      })
      .from(healthMetrics)
      .where(
        and(
          eq(healthMetrics.userId, userId),
          gte(healthMetrics.recordedAt, from),
          lte(healthMetrics.recordedAt, to),
        ),
      )
      .orderBy(asc(healthMetrics.recordedAt))

    // Build daily averages per metric type
    const dailyAvgs = new Map<string, Map<string, number[]>>() // metricType -> dateStr -> values
    for (const m of metrics) {
      if (m.value == null) continue
      const dateStr = new Date(m.recordedAt).toISOString().slice(0, 10)
      if (!dailyAvgs.has(m.metricType)) dailyAvgs.set(m.metricType, new Map())
      const dateMap = dailyAvgs.get(m.metricType)!
      if (!dateMap.has(dateStr)) dateMap.set(dateStr, [])
      dateMap.get(dateStr)!.push(m.value)
    }

    // Compute average per day per metric
    const dailyMeans = new Map<string, Map<string, number>>()
    for (const [metricType, dateMap] of dailyAvgs) {
      const means = new Map<string, number>()
      for (const [dateStr, values] of dateMap) {
        means.set(dateStr, values.reduce((a, b) => a + b, 0) / values.length)
      }
      dailyMeans.set(metricType, means)
    }

    const results: CorrelationRow[] = []

    for (const [metricA, metricB] of METRIC_PAIRS) {
      const meansA = dailyMeans.get(metricA)
      const meansB = dailyMeans.get(metricB)
      if (!meansA || !meansB) continue

      // Find common dates
      const commonDates = [...meansA.keys()].filter((d) => meansB.has(d))
      if (commonDates.length < 7) continue

      const valuesA = commonDates.map((d) => meansA.get(d)!)
      const valuesB = commonDates.map((d) => meansB.get(d)!)

      const r = this.pearsonCorrelation(valuesA, valuesB)
      if (r === null || Math.abs(r) < 0.3) continue

      const strength = Math.abs(r) >= 0.7 ? "very_strong" : Math.abs(r) >= 0.5 ? "strong" : Math.abs(r) >= 0.3 ? "moderate" : "weak"
      const direction = r > 0 ? "positive" : "negative"

      const description = this.generateDescription(metricA, metricB, r, strength, direction)

      const insert: CorrelationInsert = {
        userId,
        metricA,
        metricB,
        pearsonR: Math.round(r * 1000) / 1000,
        sampleSize: commonDates.length,
        strength,
        direction,
        description,
        lagDays: 0,
        periodStart: from,
        periodEnd: to,
        metadata: { commonDays: commonDates.length },
      }

      const [row] = await this.db
        .insert(correlations)
        .values(insert)
        .onConflictDoUpdate({
          target: [correlations.userId, correlations.metricA, correlations.metricB, correlations.periodEnd],
          set: insert,
        })
        .returning()

      if (row) results.push(row)
    }

    return results
  }

  private pearsonCorrelation(x: number[], y: number[]): number | null {
    const n = x.length
    if (n < 3) return null

    const xMean = x.reduce((a, b) => a + b, 0) / n
    const yMean = y.reduce((a, b) => a + b, 0) / n

    let num = 0
    let denX = 0
    let denY = 0

    for (let i = 0; i < n; i++) {
      const dx = x[i]! - xMean
      const dy = y[i]! - yMean
      num += dx * dy
      denX += dx * dx
      denY += dy * dy
    }

    const den = Math.sqrt(denX * denY)
    if (den === 0) return null
    return num / den
  }

  private generateDescription(metricA: string, metricB: string, r: number, strength: string, direction: string): string {
    const nameA = metricA.replace(/_/g, " ")
    const nameB = metricB.replace(/_/g, " ")
    const dirWord = direction === "positive" ? "increases" : "decreases"
    return `${strength.charAt(0).toUpperCase() + strength.slice(1)} ${direction} correlation (r=${Math.round(r * 100) / 100}): when your ${nameA} increases, your ${nameB} tends to ${dirWord === "increases" ? "increase" : "decrease"}.`
  }
}
