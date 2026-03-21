import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, sql, desc } from "drizzle-orm"

/**
 * Sleep Analysis Service
 *
 * Analyzes sleep data from the `sleep` metric type (JSONB data field
 * with durationMinutes, deepSleepMinutes, remSleepMinutes, etc.)
 * and `sleep_score` metric type (numeric score).
 *
 * Gender-aware: adjusts ideal sleep duration recommendations.
 */
export class SleepAnalysisService {
  private get db() {
    return getDb()
  }

  async getSleepDebt(userId: string, days = 14, gender?: string | null): Promise<{
    idealSleepHours: number
    avgSleepHours: number
    totalDebtHours: number
    dailyDebt: Array<{ date: string; hoursSlept: number; debt: number }>
    recommendation: string
  }> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    // Fetch sleep records (structured data in JSONB)
    const sleepData = await this.db
      .select({
        data: healthMetrics.data,
        recordedAt: healthMetrics.recordedAt,
      })
      .from(healthMetrics)
      .where(
        and(
          eq(healthMetrics.userId, userId),
          eq(healthMetrics.metricType, "sleep"),
          gte(healthMetrics.recordedAt, since),
        ),
      )
      .orderBy(healthMetrics.recordedAt)

    // Women typically need slightly more sleep (NSF recommendation)
    const idealSleepHours = gender === "female" ? 8.5 : 8

    // Group by date and extract duration from JSONB data
    const byDate = new Map<string, number>()
    for (const row of sleepData) {
      const d = row.data as Record<string, unknown> | null
      if (!d) continue
      const durationMin = d.durationMinutes as number | undefined
      if (durationMin == null) continue
      const date = new Date(row.recordedAt).toISOString().slice(0, 10)
      // If multiple sleep records per day (e.g., naps), sum them
      byDate.set(date, (byDate.get(date) ?? 0) + durationMin / 60)
    }

    const dailyDebt = [...byDate.entries()].map(([date, hoursSlept]) => ({
      date,
      hoursSlept: Math.round(hoursSlept * 10) / 10,
      debt: Math.round((idealSleepHours - hoursSlept) * 10) / 10,
    }))

    const avgSleepHours = dailyDebt.length > 0
      ? Math.round((dailyDebt.reduce((s, d) => s + d.hoursSlept, 0) / dailyDebt.length) * 10) / 10
      : 0

    const totalDebtHours = Math.round(dailyDebt.reduce((s, d) => s + Math.max(0, d.debt), 0) * 10) / 10

    let recommendation = "Your sleep is well-balanced. Keep it up!"
    if (totalDebtHours > 10) {
      recommendation = "Significant sleep debt detected. Prioritize sleep catch-up with earlier bedtimes over the next week."
    } else if (totalDebtHours > 5) {
      recommendation = "Moderate sleep debt. Try adding 30–60 minutes of sleep per night to recover."
    } else if (totalDebtHours > 2) {
      recommendation = "Minor sleep debt. An extra 15–30 minutes per night should help."
    }

    return { idealSleepHours, avgSleepHours, totalDebtHours, dailyDebt, recommendation }
  }

  async getSleepQualityReport(userId: string, days = 30, gender?: string | null): Promise<{
    avgSleepScore: number
    avgDurationHours: number
    avgDeepSleepPct: number
    avgRemSleepPct: number
    avgLightSleepPct: number
    avgAwakePct: number
    avgEfficiency: number
    consistencyScore: number
    weekdayVsWeekend: { weekday: number; weekend: number }
    trend: string
    recommendations: string[]
  }> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    // Fetch sleep records (JSONB data) and sleep scores
    const [sleepRecords, sleepScores] = await Promise.all([
      this.db
        .select({ data: healthMetrics.data, recordedAt: healthMetrics.recordedAt })
        .from(healthMetrics)
        .where(and(eq(healthMetrics.userId, userId), eq(healthMetrics.metricType, "sleep"), gte(healthMetrics.recordedAt, since)))
        .orderBy(healthMetrics.recordedAt),
      this.db
        .select({ value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
        .from(healthMetrics)
        .where(and(eq(healthMetrics.userId, userId), eq(healthMetrics.metricType, "sleep_score"), gte(healthMetrics.recordedAt, since)))
        .orderBy(healthMetrics.recordedAt),
    ])

    // Extract sleep stage data from JSONB
    const durations: number[] = []
    const deepPcts: number[] = []
    const remPcts: number[] = []
    const lightPcts: number[] = []
    const awakePcts: number[] = []
    const efficiencies: number[] = []
    const weekdayDurations: number[] = []
    const weekendDurations: number[] = []

    for (const row of sleepRecords) {
      const d = row.data as Record<string, unknown> | null
      if (!d) continue
      const totalMin = d.durationMinutes as number | undefined
      if (totalMin == null || totalMin <= 0) continue
      const nap = d.nap as boolean | undefined
      if (nap) continue // Skip naps for quality analysis

      const deepMin = (d.deepSleepMinutes as number | undefined) ?? 0
      const remMin = (d.remSleepMinutes as number | undefined) ?? 0
      const lightMin = (d.lightSleepMinutes as number | undefined) ?? 0
      const awakeMin = (d.awakeMinutes as number | undefined) ?? 0
      const efficiency = d.sleepEfficiency as number | undefined

      const hours = totalMin / 60
      durations.push(hours)

      if (totalMin > 0) {
        deepPcts.push((deepMin / totalMin) * 100)
        remPcts.push((remMin / totalMin) * 100)
        lightPcts.push((lightMin / totalMin) * 100)
        awakePcts.push((awakeMin / (totalMin + awakeMin)) * 100)
      }

      if (efficiency != null) efficiencies.push(efficiency)

      const dayOfWeek = new Date(row.recordedAt).getDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendDurations.push(hours)
      } else {
        weekdayDurations.push(hours)
      }
    }

    const calcAvg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0

    const scoreValues = sleepScores.filter((s) => s.value != null).map((s) => s.value!)
    const avgSleepScore = calcAvg(scoreValues)
    const avgDurationHours = calcAvg(durations)
    const avgDeepSleepPct = calcAvg(deepPcts)
    const avgRemSleepPct = calcAvg(remPcts)
    const avgLightSleepPct = calcAvg(lightPcts)
    const avgAwakePct = calcAvg(awakePcts)
    const avgEfficiency = calcAvg(efficiencies)

    // Sleep consistency: stddev of durations
    let consistencyScore = 100
    if (durations.length > 2) {
      const mean = durations.reduce((a, b) => a + b, 0) / durations.length
      const stddev = Math.sqrt(durations.reduce((s, v) => s + (v - mean) ** 2, 0) / durations.length)
      consistencyScore = Math.max(0, Math.round(100 - stddev * 15))
    }

    const weekdayVsWeekend = {
      weekday: calcAvg(weekdayDurations),
      weekend: calcAvg(weekendDurations),
    }

    // Trend: compare first vs second half of sleep scores
    let trend = "stable"
    if (scoreValues.length >= 4) {
      const mid = Math.floor(scoreValues.length / 2)
      const firstHalf = calcAvg(scoreValues.slice(0, mid))
      const secondHalf = calcAvg(scoreValues.slice(mid))
      if (secondHalf > firstHalf + 2) trend = "improving"
      else if (secondHalf < firstHalf - 2) trend = "declining"
    }

    // Gender-aware recommendations
    const idealDeep = gender === "female" ? 18 : 20 // Women: slightly lower deep sleep baseline
    const idealREM = 22 // REM should be ~20-25% for both genders

    const recommendations: string[] = []
    if (avgSleepScore > 0 && avgSleepScore < 60) {
      recommendations.push("Your sleep score is below average. Focus on sleep hygiene fundamentals.")
    }
    if (avgDeepSleepPct > 0 && avgDeepSleepPct < idealDeep - 5) {
      recommendations.push(`Deep sleep is low (${avgDeepSleepPct.toFixed(0)}%). Avoid alcohol before bed and keep room temperature between 65–68°F (18–20°C).`)
    }
    if (avgRemSleepPct > 0 && avgRemSleepPct < idealREM - 5) {
      recommendations.push(`REM sleep is low (${avgRemSleepPct.toFixed(0)}%). Reduce caffeine after noon and maintain a consistent wake time.`)
    }
    if (avgEfficiency > 0 && avgEfficiency < 85) {
      recommendations.push(`Sleep efficiency is ${avgEfficiency.toFixed(0)}%. Only go to bed when truly sleepy, and avoid screens 30 min before bed.`)
    }
    if (consistencyScore < 50) {
      recommendations.push("Sleep schedule is inconsistent. A regular bedtime/wake time is one of the most impactful changes you can make.")
    }
    if (Math.abs(weekdayVsWeekend.weekend - weekdayVsWeekend.weekday) > 1.5) {
      recommendations.push(`Weekend sleep is ${(weekdayVsWeekend.weekend - weekdayVsWeekend.weekday).toFixed(1)}h different from weekdays — this 'social jet lag' disrupts circadian rhythm.`)
    }
    if (recommendations.length === 0) {
      recommendations.push("Your sleep patterns look healthy. Keep up the good habits!")
    }

    return {
      avgSleepScore,
      avgDurationHours,
      avgDeepSleepPct,
      avgRemSleepPct,
      avgLightSleepPct,
      avgAwakePct,
      avgEfficiency,
      consistencyScore,
      weekdayVsWeekend,
      trend,
      recommendations,
    }
  }
}
