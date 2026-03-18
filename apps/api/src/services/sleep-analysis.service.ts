import { getDb, healthMetrics } from "@biosync-io/db"
import { and, avg, eq, gte, lte, sql } from "drizzle-orm"

export class SleepAnalysisService {
  private get db() {
    return getDb()
  }

  async getSleepDebt(userId: string, days = 14): Promise<{
    idealSleepHours: number
    avgSleepHours: number
    totalDebtHours: number
    dailyDebt: { date: string; hoursSlept: number; debt: number }[]
    recommendation: string
  }> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const sleepData = await this.db
      .select({
        recordedDate: sql<string>`date(${healthMetrics.recordedAt})`,
        avgValue: avg(healthMetrics.value),
      })
      .from(healthMetrics)
      .where(
        and(
          eq(healthMetrics.userId, userId),
          eq(healthMetrics.metricType, "sleep_duration"),
          gte(healthMetrics.recordedAt, since),
        ),
      )
      .groupBy(sql`date(${healthMetrics.recordedAt})`)
      .orderBy(sql`date(${healthMetrics.recordedAt})`)

    const idealSleepHours = 8 // WHO recommendation
    const dailyDebt = sleepData.map((d) => {
      const hoursSlept = Math.round(Number(d.avgValue ?? 0) * 10) / 10
      return {
        date: d.recordedDate,
        hoursSlept,
        debt: Math.round((idealSleepHours - hoursSlept) * 10) / 10,
      }
    })

    const avgSleepHours = dailyDebt.length > 0
      ? Math.round((dailyDebt.reduce((s, d) => s + d.hoursSlept, 0) / dailyDebt.length) * 10) / 10
      : 0

    const totalDebtHours = Math.round(dailyDebt.reduce((s, d) => s + Math.max(0, d.debt), 0) * 10) / 10

    let recommendation = "Your sleep is well-balanced. Keep it up!"
    if (totalDebtHours > 10) {
      recommendation = "Significant sleep debt detected. Prioritize sleep catch-up with earlier bedtimes over the next week."
    } else if (totalDebtHours > 5) {
      recommendation = "Moderate sleep debt. Try adding 30-60 minutes of sleep per night to recover."
    } else if (totalDebtHours > 2) {
      recommendation = "Minor sleep debt. An extra 15-30 minutes per night should help."
    }

    return { idealSleepHours, avgSleepHours, totalDebtHours, dailyDebt, recommendation }
  }

  async getSleepQualityReport(userId: string, days = 30): Promise<{
    avgSleepScore: number
    avgDeepSleepPercent: number
    avgRemSleepPercent: number
    avgLightSleepPercent: number
    avgAwakePercent: number
    avgEfficiency: number
    consistencyScore: number
    weekdayVsWeekend: { weekday: number; weekend: number }
    trend: string
    recommendations: string[]
  }> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const metricTypes = [
      "sleep_score", "deep_sleep_pct", "rem_sleep_pct",
      "light_sleep_pct", "awake_pct", "sleep_efficiency", "sleep_duration",
    ]

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
          sql`${healthMetrics.metricType} = ANY(${metricTypes})`,
          gte(healthMetrics.recordedAt, since),
        ),
      )
      .orderBy(healthMetrics.recordedAt)

    const buckets: Record<string, number[]> = {}
    const durationByDay: Record<string, number[]> = { weekday: [], weekend: [] }

    for (const m of metrics) {
      if (m.value == null) continue
      if (!buckets[m.metricType]) buckets[m.metricType] = []
      buckets[m.metricType]!.push(m.value)

      if (m.metricType === "sleep_duration") {
        const day = m.recordedAt.getDay()
        const key = day === 0 || day === 6 ? "weekend" : "weekday"
        durationByDay[key]!.push(m.value)
      }
    }

    const calcAvg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0

    const avgSleepScore = calcAvg(buckets.sleep_score ?? [])
    const avgDeepSleepPercent = calcAvg(buckets.deep_sleep_pct ?? [])
    const avgRemSleepPercent = calcAvg(buckets.rem_sleep_pct ?? [])
    const avgLightSleepPercent = calcAvg(buckets.light_sleep_pct ?? [])
    const avgAwakePercent = calcAvg(buckets.awake_pct ?? [])
    const avgEfficiency = calcAvg(buckets.sleep_efficiency ?? [])

    // Sleep consistency — measure stddev of sleep duration
    const durations = buckets.sleep_duration ?? []
    let consistencyScore = 100
    if (durations.length > 2) {
      const mean = durations.reduce((a, b) => a + b, 0) / durations.length
      const stddev = Math.sqrt(durations.reduce((s, v) => s + (v - mean) ** 2, 0) / durations.length)
      consistencyScore = Math.max(0, Math.round(100 - stddev * 15))
    }

    // Weekday vs weekend
    const weekdayVsWeekend = {
      weekday: calcAvg(durationByDay.weekday!),
      weekend: calcAvg(durationByDay.weekend!),
    }

    // Trend — compare first half to second half of sleep scores
    const scores = buckets.sleep_score ?? []
    let trend = "stable"
    if (scores.length >= 4) {
      const mid = Math.floor(scores.length / 2)
      const firstHalf = calcAvg(scores.slice(0, mid))
      const secondHalf = calcAvg(scores.slice(mid))
      if (secondHalf > firstHalf + 2) trend = "improving"
      else if (secondHalf < firstHalf - 2) trend = "declining"
    }

    // Recommendations
    const recommendations: string[] = []
    if (avgSleepScore < 60) recommendations.push("Your sleep score is below average. Focus on sleep hygiene fundamentals.")
    if (avgDeepSleepPercent < 15) recommendations.push("Deep sleep is low. Avoid alcohol before bed and maintain cool room temperature.")
    if (avgRemSleepPercent < 20) recommendations.push("REM sleep is low. Reduce caffeine intake after noon.")
    if (avgEfficiency < 85) recommendations.push("Sleep efficiency is low. Only go to bed when truly sleepy.")
    if (consistencyScore < 50) recommendations.push("Sleep consistency is poor. Maintain a regular sleep-wake schedule.")
    if (Math.abs(weekdayVsWeekend.weekend - weekdayVsWeekend.weekday) > 1.5) {
      recommendations.push("Large weekday/weekend sleep difference detected. Try to keep schedules more consistent.")
    }
    if (recommendations.length === 0) recommendations.push("Your sleep patterns look healthy. Keep up the good habits!")

    return {
      avgSleepScore,
      avgDeepSleepPercent,
      avgRemSleepPercent,
      avgLightSleepPercent,
      avgAwakePercent,
      avgEfficiency,
      consistencyScore,
      weekdayVsWeekend,
      trend,
      recommendations,
    }
  }
}
