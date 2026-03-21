import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, asc } from "drizzle-orm"

// ── Types ───────────────────────────────────────────────────────

export interface StressResilienceIndex {
  /** Overall resilience score 0–100 (higher = more resilient) */
  score: number
  /** Classification */
  level: "elite" | "high" | "moderate" | "developing" | "low"
  /** How quickly HRV bounces back after high-stress/strain periods */
  hrvRecoveryRate: number
  /** How quickly RHR normalizes after high-strain days */
  rhrRecoveryRate: number
  /** Ratio of positive vs negative HRV trends after stressors */
  adaptationRatio: number
  /** Number of stressor events analyzed */
  stressorCount: number
  /** Trend over analysis period */
  trend: "improving" | "declining" | "stable"
  confidence: number
  date: string
}

// ── Stress Resilience Engine ───────────────────────────────────

/**
 * Measures autonomic nervous system resilience by analyzing how
 * quickly physiological markers recover after stress events.
 *
 * Based on the concept of **allostatic load** (McEwen, 1998) and
 * **vagal rebound** (Stanley et al., 2013):
 *
 * 1. Identifies "stressor events" — days with high strain (>14),
 *    poor sleep (<60 score), or elevated stress scores
 * 2. Measures post-stressor HRV recovery: how many days until HRV
 *    returns to baseline after a stressor
 * 3. Measures post-stressor RHR normalization: how many days until
 *    RHR returns to baseline
 * 4. Computes an adaptation ratio: proportion of stressors where
 *    the user showed positive adaptation (HRV above pre-stressor)
 *
 * Elite athletes typically show HRV recovery within 24-48h and
 * adaptation ratios > 0.6 (supercompensation effect).
 */
export async function computeStressResilience(
  userId: string,
  date?: Date,
): Promise<StressResilienceIndex> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback45d = new Date(targetDate.getTime() - 45 * 86400000)

  const metrics = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, lookback45d), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))

  // Organize into daily buckets
  const dailyData = new Map<string, { strain?: number; sleepScore?: number; hrv?: number; rhr?: number }>()

  for (const m of metrics) {
    if (m.value == null) continue
    const day = new Date(m.recordedAt).toISOString().slice(0, 10)
    const entry = dailyData.get(day) ?? {}

    switch (m.metricType) {
      case "strain_score": entry.strain = m.value; break
      case "sleep_score": entry.sleepScore = m.value; break
      case "heart_rate_variability": entry.hrv = m.value; break
      case "resting_heart_rate": entry.rhr = m.value; break
    }
    dailyData.set(day, entry)
  }

  const days = [...dailyData.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  if (days.length < 14) {
    return {
      score: 50, level: "moderate", hrvRecoveryRate: 0, rhrRecoveryRate: 0,
      adaptationRatio: 0, stressorCount: 0, trend: "stable", confidence: 0,
      date: targetDate.toISOString(),
    }
  }

  // Calculate baselines (first 7 days)
  const baselineHRV = days.slice(0, 7).filter(([, d]) => d.hrv != null).map(([, d]) => d.hrv!)
  const baselineRHR = days.slice(0, 7).filter(([, d]) => d.rhr != null).map(([, d]) => d.rhr!)

  const avgBaselineHRV = baselineHRV.length > 0 ? baselineHRV.reduce((a, b) => a + b, 0) / baselineHRV.length : 0
  const avgBaselineRHR = baselineRHR.length > 0 ? baselineRHR.reduce((a, b) => a + b, 0) / baselineRHR.length : 0

  // Identify stressor events
  const stressorIndices: number[] = []
  for (let i = 7; i < days.length; i++) {
    const d = days[i]![1]
    if ((d.strain != null && d.strain > 14) || (d.sleepScore != null && d.sleepScore < 50)) {
      stressorIndices.push(i)
    }
  }

  if (stressorIndices.length === 0 || avgBaselineHRV === 0) {
    return {
      score: 70, level: "moderate", hrvRecoveryRate: 0, rhrRecoveryRate: 0,
      adaptationRatio: 0, stressorCount: 0, trend: "stable",
      confidence: Math.min(1, days.length / 30),
      date: targetDate.toISOString(),
    }
  }

  // Measure recovery for each stressor
  let totalHRVRecoveryDays = 0
  let totalRHRRecoveryDays = 0
  let adaptationCount = 0
  let measuredStressors = 0

  for (const si of stressorIndices) {
    let hrvRecovered = false
    let rhrRecovered = false
    let hrvDays = 5 // default if never recovers in window
    let rhrDays = 5

    for (let j = si + 1; j < Math.min(si + 6, days.length); j++) {
      const d = days[j]![1]
      if (!hrvRecovered && d.hrv != null && d.hrv >= avgBaselineHRV * 0.95) {
        hrvDays = j - si
        hrvRecovered = true
      }
      if (!rhrRecovered && d.rhr != null && d.rhr <= avgBaselineRHR * 1.05) {
        rhrDays = j - si
        rhrRecovered = true
      }
    }

    // Check for supercompensation (HRV above baseline 2-3 days after stressor)
    const day2or3 = days[Math.min(si + 2, days.length - 1)]
    if (day2or3 && day2or3[1].hrv != null && day2or3[1].hrv > avgBaselineHRV * 1.05) {
      adaptationCount++
    }

    totalHRVRecoveryDays += hrvDays
    totalRHRRecoveryDays += rhrDays
    measuredStressors++
  }

  const hrvRecoveryRate = measuredStressors > 0 ? totalHRVRecoveryDays / measuredStressors : 3
  const rhrRecoveryRate = measuredStressors > 0 ? totalRHRRecoveryDays / measuredStressors : 3
  const adaptationRatio = measuredStressors > 0 ? adaptationCount / measuredStressors : 0

  // Calculate composite score
  // Faster recovery = higher score, higher adaptation ratio = higher score
  const recoveryScore = Math.min(100, Math.max(0, (5 - hrvRecoveryRate) * 20 + 10))
  const rhrScore = Math.min(100, Math.max(0, (5 - rhrRecoveryRate) * 20 + 10))
  const adaptScore = adaptationRatio * 100

  const compositeScore = Math.round(
    (recoveryScore * 0.4 + rhrScore * 0.3 + adaptScore * 0.3) * 10,
  ) / 10

  let level: StressResilienceIndex["level"]
  if (compositeScore >= 85) level = "elite"
  else if (compositeScore >= 70) level = "high"
  else if (compositeScore >= 50) level = "moderate"
  else if (compositeScore >= 30) level = "developing"
  else level = "low"

  // Trend: compare first vs second half stressor responses
  const halfIdx = Math.floor(stressorIndices.length / 2)
  let trend: StressResilienceIndex["trend"] = "stable"
  if (stressorIndices.length >= 4) {
    const firstHalf = stressorIndices.slice(0, halfIdx)
    const secondHalf = stressorIndices.slice(halfIdx)
    const firstAvg = firstHalf.length
    const secondAvg = secondHalf.length
    // Simple heuristic: if adaptation ratio increased, improving
    if (adaptationRatio > 0.5) trend = "improving"
    else if (adaptationRatio < 0.2 && measuredStressors >= 3) trend = "declining"
  }

  return {
    score: compositeScore,
    level,
    hrvRecoveryRate: Math.round(hrvRecoveryRate * 10) / 10,
    rhrRecoveryRate: Math.round(rhrRecoveryRate * 10) / 10,
    adaptationRatio: Math.round(adaptationRatio * 100) / 100,
    stressorCount: measuredStressors,
    trend,
    confidence: Math.min(1, measuredStressors / 5),
    date: targetDate.toISOString(),
  }
}
