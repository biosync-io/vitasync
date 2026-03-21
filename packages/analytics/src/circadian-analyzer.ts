import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, asc } from "drizzle-orm"

// ── Types ───────────────────────────────────────────────────────

export interface CircadianAnalysis {
  /** Estimated chronotype based on sleep patterns */
  chronotype: "early_bird" | "night_owl" | "intermediate"
  /** Sleep schedule consistency score 0–100 */
  consistencyScore: number
  /** Average sleep onset time (minutes from midnight, e.g., 1380 = 11PM) */
  avgSleepOnsetMinutes: number
  /** Average wake time (minutes from midnight, e.g., 420 = 7AM) */
  avgWakeTimeMinutes: number
  /** Standard deviation of sleep onset (lower = more consistent) */
  onsetVariabilityMinutes: number
  /** Social jet lag: weekend vs weekday sleep midpoint difference (minutes) */
  socialJetLagMinutes: number
  /** Optimal sleep window recommendation */
  optimalWindow: { bedtime: string; wakeTime: string }
  /** Confidence 0–1 based on data availability */
  confidence: number
  date: string
}

// ── Circadian Rhythm Analyzer ──────────────────────────────────

/**
 * Analyzes sleep schedule patterns to determine:
 *
 * 1. **Chronotype classification** — early bird vs night owl based on
 *    sleep midpoint (MSF: mid-sleep on free days)
 * 2. **Schedule consistency** — how regular the user's sleep/wake times are
 * 3. **Social jet lag** — weekend vs weekday sleep timing mismatch
 * 4. **Optimal window** — personalized bedtime recommendation
 *
 * Uses the Munich Chronotype Questionnaire (MCTQ) methodology adapted
 * for wearable data. Social jet lag > 60min is associated with increased
 * health risks (Wittmann et al., 2006).
 */
export async function analyzeCircadianRhythm(
  userId: string,
  date?: Date,
): Promise<CircadianAnalysis> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback30d = new Date(targetDate.getTime() - 30 * 86400000)

  // Fetch sleep data with timing info
  const sleepMetrics = await db
    .select({
      value: healthMetrics.value,
      data: healthMetrics.data,
      recordedAt: healthMetrics.recordedAt,
    })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, "sleep"),
        gte(healthMetrics.recordedAt, lookback30d),
        lte(healthMetrics.recordedAt, targetDate),
      ),
    )
    .orderBy(asc(healthMetrics.recordedAt))

  // Extract onset/wake times
  const timings: Array<{ onset: number; wake: number; dayOfWeek: number }> = []

  for (const m of sleepMetrics) {
    const d = m.data as Record<string, unknown> | null
    if (!d) continue

    const startTime = d.startTime as string | undefined
    const endTime = d.endTime as string | undefined
    if (!startTime || !endTime) continue

    const start = new Date(startTime)
    const end = new Date(endTime)

    // Convert to minutes from midnight
    const onsetMinutes = start.getHours() * 60 + start.getMinutes()
    // Handle overnight: if onset > 720 (noon), it's evening; adjust to 24h scale
    const adjustedOnset = onsetMinutes < 360 ? onsetMinutes + 1440 : onsetMinutes
    const wakeMinutes = end.getHours() * 60 + end.getMinutes()

    timings.push({
      onset: adjustedOnset,
      wake: wakeMinutes,
      dayOfWeek: start.getDay(), // 0=Sun, 6=Sat
    })
  }

  if (timings.length < 5) {
    return {
      chronotype: "intermediate",
      consistencyScore: 0,
      avgSleepOnsetMinutes: 0,
      avgWakeTimeMinutes: 0,
      onsetVariabilityMinutes: 0,
      socialJetLagMinutes: 0,
      optimalWindow: { bedtime: "23:00", wakeTime: "07:00" },
      confidence: 0,
      date: targetDate.toISOString(),
    }
  }

  // Calculate averages
  const avgOnset = timings.reduce((s, t) => s + t.onset, 0) / timings.length
  const avgWake = timings.reduce((s, t) => s + t.wake, 0) / timings.length

  // Onset variability (standard deviation)
  const onsetVariance = timings.reduce((s, t) => s + (t.onset - avgOnset) ** 2, 0) / timings.length
  const onsetVariabilityMinutes = Math.round(Math.sqrt(onsetVariance))

  // Consistency score: lower variability = higher score
  const consistencyScore = Math.max(0, Math.min(100, Math.round(100 - onsetVariabilityMinutes * 1.5)))

  // Social jet lag: compare weekday vs weekend sleep midpoints
  const weekdays = timings.filter((t) => t.dayOfWeek >= 1 && t.dayOfWeek <= 5)
  const weekends = timings.filter((t) => t.dayOfWeek === 0 || t.dayOfWeek === 6)

  let socialJetLagMinutes = 0
  if (weekdays.length >= 3 && weekends.length >= 2) {
    const wdMid = weekdays.reduce((s, t) => s + (t.onset + t.wake) / 2, 0) / weekdays.length
    const weMid = weekends.reduce((s, t) => s + (t.onset + t.wake) / 2, 0) / weekends.length
    socialJetLagMinutes = Math.abs(Math.round(weMid - wdMid))
  }

  // Chronotype based on average sleep midpoint
  const avgMidpoint = (avgOnset + avgWake) / 2
  // Midpoint < 3:30 AM (210 min) = early bird, > 5:00 AM (300 min) = night owl
  const adjustedMidpoint = avgMidpoint > 1440 ? avgMidpoint - 1440 : avgMidpoint
  let chronotype: CircadianAnalysis["chronotype"]
  if (adjustedMidpoint < 210) chronotype = "early_bird"
  else if (adjustedMidpoint > 300) chronotype = "night_owl"
  else chronotype = "intermediate"

  // Optimal window based on 8h sleep centered on user's natural midpoint
  const optOnset = Math.round(avgMidpoint - 240) // 4h before midpoint
  const optWake = Math.round(avgMidpoint + 240) // 4h after midpoint
  const formatTime = (min: number) => {
    const adjusted = ((min % 1440) + 1440) % 1440
    const h = Math.floor(adjusted / 60)
    const m = adjusted % 60
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
  }

  return {
    chronotype,
    consistencyScore,
    avgSleepOnsetMinutes: Math.round(avgOnset > 1440 ? avgOnset - 1440 : avgOnset),
    avgWakeTimeMinutes: Math.round(avgWake),
    onsetVariabilityMinutes,
    socialJetLagMinutes,
    optimalWindow: {
      bedtime: formatTime(optOnset),
      wakeTime: formatTime(optWake),
    },
    confidence: Math.min(1, timings.length / 14),
    date: targetDate.toISOString(),
  }
}
