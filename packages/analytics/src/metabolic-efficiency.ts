import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, asc, desc } from "drizzle-orm"

// ── Types ───────────────────────────────────────────────────────

export interface MetabolicEfficiency {
  /** Composite metabolic efficiency score 0–100 */
  score: number
  /** Grade: A+ to F */
  grade: string
  /** Individual component scores */
  components: {
    /** Cardiac efficiency: low RHR + high HRV = efficient */
    cardiacEfficiency: ComponentDetail | null
    /** Energy efficiency: calories burned per unit of activity */
    energyEfficiency: ComponentDetail | null
    /** Recovery efficiency: how fast HR returns to baseline after exertion */
    recoveryEfficiency: ComponentDetail | null
    /** Aerobic capacity proxy: HRV/RHR ratio (higher = better) */
    aerobicCapacity: ComponentDetail | null
  }
  /** Trend over last 30 days */
  trend: "improving" | "declining" | "stable"
  /** Gender-adjusted baselines used */
  genderAdjusted: boolean
  date: string
}

export interface ComponentDetail {
  score: number
  value: number
  percentile: number
  detail: string
}

// ── Metabolic Efficiency Engine ────────────────────────────────

/**
 * Computes a metabolic efficiency score that indicates how efficiently
 * the body uses energy and recovers. Based on:
 *
 * 1. **Cardiac Efficiency** — RHR/HRV ratio (Buchheit, 2014). Low RHR
 *    with high HRV indicates efficient autonomic regulation.
 *
 * 2. **Energy Efficiency** — calories per active minute. Athletes with
 *    better metabolic efficiency burn fewer calories for the same effort.
 *
 * 3. **Recovery Efficiency** — speed of HR return to resting after activity.
 *    Faster recovery = better cardiovascular fitness (Cole et al., 1999).
 *
 * 4. **Aerobic Capacity Proxy** — HRV/RHR ratio correlates with VO2max
 *    (Esco & Flatt, 2014). This provides a non-invasive estimate.
 *
 * Gender-adjusted: female athletes have ~10% different baseline ranges.
 */
export async function computeMetabolicEfficiency(
  userId: string,
  date?: Date,
  gender?: string | null,
): Promise<MetabolicEfficiency> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback30d = new Date(targetDate.getTime() - 30 * 86400000)
  const lookback7d = new Date(targetDate.getTime() - 7 * 86400000)

  const metrics = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, lookback30d), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))

  const byType = new Map<string, Array<{ value: number; date: Date }>>()
  for (const m of metrics) {
    if (m.value == null) continue
    const arr = byType.get(m.metricType) ?? []
    arr.push({ value: m.value, date: new Date(m.recordedAt) })
    byType.set(m.metricType, arr)
  }

  const isFemale = gender === "female"
  let totalScore = 0
  let componentCount = 0

  // Component 1: Cardiac Efficiency (RHR + HRV)
  let cardiacEfficiency: ComponentDetail | null = null
  const rhrData = byType.get("resting_heart_rate") ?? []
  const hrvData = byType.get("heart_rate_variability") ?? []
  if (rhrData.length >= 3 && hrvData.length >= 3) {
    const avgRHR = rhrData.slice(-7).reduce((s, d) => s + d.value, 0) / Math.min(7, rhrData.length)
    const avgHRV = hrvData.slice(-7).reduce((s, d) => s + d.value, 0) / Math.min(7, hrvData.length)

    // Score: lower RHR and higher HRV = better
    const rhrScore = isFemale
      ? Math.min(100, Math.max(0, (85 - avgRHR) * 3.5))
      : Math.min(100, Math.max(0, (80 - avgRHR) * 4))
    const hrvScore = isFemale
      ? Math.min(100, avgHRV * 1.8)
      : Math.min(100, avgHRV * 1.5)
    const combinedScore = Math.round((rhrScore * 0.5 + hrvScore * 0.5) * 10) / 10

    cardiacEfficiency = {
      score: combinedScore,
      value: avgHRV / avgRHR,
      percentile: Math.min(99, Math.round(combinedScore)),
      detail: `RHR ${avgRHR.toFixed(0)} bpm, HRV ${avgHRV.toFixed(0)} ms — ratio ${(avgHRV / avgRHR).toFixed(2)}`,
    }
    totalScore += combinedScore
    componentCount++
  }

  // Component 2: Energy Efficiency (calories per active minute)
  let energyEfficiency: ComponentDetail | null = null
  const caloriesData = byType.get("calories") ?? []
  const activeData = byType.get("active_minutes") ?? []
  if (caloriesData.length >= 3 && activeData.length >= 3) {
    const avgCal = caloriesData.slice(-7).reduce((s, d) => s + d.value, 0) / Math.min(7, caloriesData.length)
    const avgActive = activeData.slice(-7).reduce((s, d) => s + d.value, 0) / Math.min(7, activeData.length)

    if (avgActive > 0) {
      const calPerMin = avgCal / avgActive
      // Lower cal/min at same effort = more efficient
      const baseThreshold = isFemale ? 8 : 10
      const effScore = Math.min(100, Math.max(0, (baseThreshold - calPerMin) * 20 + 50))

      energyEfficiency = {
        score: Math.round(effScore * 10) / 10,
        value: calPerMin,
        percentile: Math.min(99, Math.round(effScore)),
        detail: `${calPerMin.toFixed(1)} cal/min active — ${effScore >= 70 ? "efficient" : effScore >= 40 ? "average" : "needs improvement"}`,
      }
      totalScore += effScore
      componentCount++
    }
  }

  // Component 3: Recovery Efficiency (RHR elevation after high-strain days)
  let recoveryEfficiency: ComponentDetail | null = null
  const strainData = byType.get("strain_score") ?? []
  if (strainData.length >= 5 && rhrData.length >= 5) {
    // Find days with high strain and check next-day RHR elevation
    let elevationSum = 0
    let elevationCount = 0
    const rhrBaseline = rhrData.reduce((s, d) => s + d.value, 0) / rhrData.length

    for (let i = 0; i < strainData.length - 1; i++) {
      if (strainData[i]!.value > 14) { // High strain day (WHOOP scale)
        const nextDayRHR = rhrData.find((r) => {
          const diff = r.date.getTime() - strainData[i]!.date.getTime()
          return diff > 0 && diff < 48 * 3600000
        })
        if (nextDayRHR) {
          elevationSum += nextDayRHR.value - rhrBaseline
          elevationCount++
        }
      }
    }

    if (elevationCount > 0) {
      const avgElevation = elevationSum / elevationCount
      const recScore = Math.min(100, Math.max(0, 80 - avgElevation * 8))

      recoveryEfficiency = {
        score: Math.round(recScore * 10) / 10,
        value: avgElevation,
        percentile: Math.min(99, Math.round(recScore)),
        detail: `Avg RHR elevation after hard days: ${avgElevation > 0 ? "+" : ""}${avgElevation.toFixed(1)} bpm`,
      }
      totalScore += recScore
      componentCount++
    }
  }

  // Component 4: Aerobic Capacity Proxy (HRV/RHR ratio)
  let aerobicCapacity: ComponentDetail | null = null
  if (rhrData.length >= 3 && hrvData.length >= 3) {
    const avgRHR = rhrData.slice(-7).reduce((s, d) => s + d.value, 0) / Math.min(7, rhrData.length)
    const avgHRV = hrvData.slice(-7).reduce((s, d) => s + d.value, 0) / Math.min(7, hrvData.length)
    const ratio = avgHRV / avgRHR

    // Ratio > 1.0 = excellent, 0.5-1.0 = good, < 0.5 = poor
    const aeroScore = Math.min(100, Math.max(0, ratio * 80))

    aerobicCapacity = {
      score: Math.round(aeroScore * 10) / 10,
      value: ratio,
      percentile: Math.min(99, Math.round(aeroScore)),
      detail: `HRV/RHR ratio ${ratio.toFixed(2)} — ${ratio > 1 ? "excellent" : ratio > 0.7 ? "good" : ratio > 0.4 ? "average" : "below average"} aerobic capacity`,
    }
    totalScore += aeroScore
    componentCount++
  }

  const finalScore = componentCount > 0 ? Math.round((totalScore / componentCount) * 10) / 10 : 50
  const grade = scoreToGrade(finalScore)

  // Trend: compare first half vs second half of the period
  const halfPoint = new Date(targetDate.getTime() - 15 * 86400000)
  const firstHalfHRV = hrvData.filter((d) => d.date < halfPoint)
  const secondHalfHRV = hrvData.filter((d) => d.date >= halfPoint)
  let trend: MetabolicEfficiency["trend"] = "stable"
  if (firstHalfHRV.length >= 3 && secondHalfHRV.length >= 3) {
    const avg1 = firstHalfHRV.reduce((s, d) => s + d.value, 0) / firstHalfHRV.length
    const avg2 = secondHalfHRV.reduce((s, d) => s + d.value, 0) / secondHalfHRV.length
    const pctChange = ((avg2 - avg1) / avg1) * 100
    if (pctChange > 5) trend = "improving"
    else if (pctChange < -5) trend = "declining"
  }

  return {
    score: finalScore,
    grade,
    components: { cardiacEfficiency, energyEfficiency, recoveryEfficiency, aerobicCapacity },
    trend,
    genderAdjusted: isFemale,
    date: targetDate.toISOString(),
  }
}

function scoreToGrade(score: number): string {
  if (score >= 95) return "A+"
  if (score >= 90) return "A"
  if (score >= 85) return "B+"
  if (score >= 80) return "B"
  if (score >= 75) return "B-"
  if (score >= 70) return "C+"
  if (score >= 65) return "C"
  if (score >= 55) return "C-"
  if (score >= 45) return "D+"
  if (score >= 35) return "D"
  return "F"
}
