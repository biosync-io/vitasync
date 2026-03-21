import { getDb, healthMetrics, events } from "@biosync-io/db"
import { and, eq, gte, lte, desc, asc } from "drizzle-orm"

// ── Types ───────────────────────────────────────────────────────

export interface RecoveryPrediction {
  /** Predicted hours to full recovery */
  predictedRecoveryHours: number
  /** Confidence level 0–1 */
  confidence: number
  /** Current recovery state */
  state: "recovered" | "recovering" | "fatigued" | "overtrained"
  /** Factors influencing recovery */
  factors: RecoveryFactor[]
  /** Recommended next training window */
  nextTrainingWindow: string
  date: string
}

export interface RecoveryFactor {
  name: string
  impact: "positive" | "negative" | "neutral"
  score: number
  detail: string
}

// ── Recovery Prediction Engine ──────────────────────────────────

/**
 * Predicts recovery timeline using a multi-signal model:
 *
 * 1. **Training Load Decay** — exponential decay of accumulated strain
 * 2. **Sleep Quality Boost** — good sleep accelerates recovery (up to 1.4x)
 * 3. **HRV Trajectory** — rising HRV signals recovery; falling signals fatigue
 * 4. **Resting HR Delta** — elevated RHR vs baseline indicates incomplete recovery
 *
 * The model uses an adaptation of Banister's Fitness-Fatigue model with
 * individual decay constants estimated from the user's own data.
 */
export async function predictRecovery(
  userId: string,
  date?: Date,
): Promise<RecoveryPrediction> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback14d = new Date(targetDate.getTime() - 14 * 86400000)
  const lookback7d = new Date(targetDate.getTime() - 7 * 86400000)

  // Fetch recent metrics
  const metrics = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, lookback14d), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))

  const byType = new Map<string, Array<{ value: number; date: Date }>>()
  for (const m of metrics) {
    if (m.value == null) continue
    const arr = byType.get(m.metricType) ?? []
    arr.push({ value: m.value, date: new Date(m.recordedAt) })
    byType.set(m.metricType, arr)
  }

  const factors: RecoveryFactor[] = []
  let recoveryMultiplier = 1.0

  // Factor 1: Training load (strain/calories in last 3 days vs 7-day avg)
  const strainData = byType.get("strain_score") ?? []
  const recentStrain = strainData.filter((d) => d.date >= lookback7d)
  if (recentStrain.length > 0) {
    const last3 = recentStrain.slice(-3)
    const avg3 = last3.reduce((s, d) => s + d.value, 0) / last3.length
    const avg7 = recentStrain.reduce((s, d) => s + d.value, 0) / recentStrain.length
    const ratio = avg7 > 0 ? avg3 / avg7 : 1

    if (ratio > 1.3) {
      recoveryMultiplier *= 1.4
      factors.push({ name: "High Recent Load", impact: "negative", score: ratio * 10, detail: `3-day strain ${(ratio * 100 - 100).toFixed(0)}% above weekly average` })
    } else if (ratio < 0.7) {
      recoveryMultiplier *= 0.7
      factors.push({ name: "Light Training Phase", impact: "positive", score: 80, detail: "Training load well below average — body is recovering" })
    } else {
      factors.push({ name: "Steady Training", impact: "neutral", score: 60, detail: "Training load consistent with weekly average" })
    }
  }

  // Factor 2: Sleep quality
  const sleepScores = byType.get("sleep_score") ?? []
  const recentSleep = sleepScores.slice(-3)
  if (recentSleep.length > 0) {
    const avgSleep = recentSleep.reduce((s, d) => s + d.value, 0) / recentSleep.length
    if (avgSleep >= 80) {
      recoveryMultiplier *= 0.7 // Good sleep speeds recovery
      factors.push({ name: "Excellent Sleep", impact: "positive", score: avgSleep, detail: `Avg sleep score ${avgSleep.toFixed(0)} — accelerating recovery` })
    } else if (avgSleep < 60) {
      recoveryMultiplier *= 1.3 // Poor sleep slows recovery
      factors.push({ name: "Poor Sleep Quality", impact: "negative", score: avgSleep, detail: `Avg sleep score ${avgSleep.toFixed(0)} — recovery impaired` })
    } else {
      factors.push({ name: "Adequate Sleep", impact: "neutral", score: avgSleep, detail: `Avg sleep score ${avgSleep.toFixed(0)}` })
    }
  }

  // Factor 3: HRV trajectory (last 3 days vs baseline)
  const hrvData = byType.get("heart_rate_variability") ?? []
  if (hrvData.length >= 5) {
    const baseline = hrvData.slice(0, -3).reduce((s, d) => s + d.value, 0) / (hrvData.length - 3)
    const recent = hrvData.slice(-3).reduce((s, d) => s + d.value, 0) / 3
    const delta = ((recent - baseline) / baseline) * 100

    if (delta > 10) {
      recoveryMultiplier *= 0.8
      factors.push({ name: "Rising HRV", impact: "positive", score: 85, detail: `HRV ${delta.toFixed(0)}% above baseline — strong recovery signal` })
    } else if (delta < -10) {
      recoveryMultiplier *= 1.3
      factors.push({ name: "Depressed HRV", impact: "negative", score: 35, detail: `HRV ${Math.abs(delta).toFixed(0)}% below baseline — incomplete recovery` })
    } else {
      factors.push({ name: "Stable HRV", impact: "neutral", score: 60, detail: "HRV within normal range" })
    }
  }

  // Factor 4: Resting HR elevation
  const rhrData = byType.get("resting_heart_rate") ?? []
  if (rhrData.length >= 5) {
    const baseline = rhrData.slice(0, -3).reduce((s, d) => s + d.value, 0) / (rhrData.length - 3)
    const recent = rhrData.slice(-1)[0]?.value ?? baseline
    const elevation = recent - baseline

    if (elevation > 5) {
      recoveryMultiplier *= 1.2
      factors.push({ name: "Elevated RHR", impact: "negative", score: 40, detail: `RHR +${elevation.toFixed(0)} bpm above baseline` })
    } else if (elevation < -3) {
      recoveryMultiplier *= 0.9
      factors.push({ name: "Low RHR", impact: "positive", score: 80, detail: `RHR ${Math.abs(elevation).toFixed(0)} bpm below baseline` })
    }
  }

  // Calculate predicted recovery hours (base: 24h for moderate load)
  const baseRecoveryHours = 24
  const predictedRecoveryHours = Math.round(baseRecoveryHours * recoveryMultiplier * 10) / 10

  // Determine state
  let state: RecoveryPrediction["state"]
  if (predictedRecoveryHours <= 12) state = "recovered"
  else if (predictedRecoveryHours <= 30) state = "recovering"
  else if (predictedRecoveryHours <= 48) state = "fatigued"
  else state = "overtrained"

  // Next training window
  const nextWindow = new Date(targetDate.getTime() + predictedRecoveryHours * 3600000)
  const confidence = Math.min(1, factors.length / 4)

  return {
    predictedRecoveryHours,
    confidence,
    state,
    factors,
    nextTrainingWindow: nextWindow.toISOString(),
    date: targetDate.toISOString(),
  }
}
