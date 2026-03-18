import { getDb, healthScores, healthMetrics, events } from "@biosync-io/db"
import type { HealthScoreInsert, HealthScoreRow } from "@biosync-io/db"
import { and, avg, count, eq, gte, lte, desc, sql, asc } from "drizzle-orm"
import { computeReadiness, computeBodyScore as computeBodyScoreEngine } from "@biosync-io/analytics"

/**
 * Health Score Service — Feature #1
 *
 * Computes a composite daily health score (0–100) from weighted sub-scores:
 * - Sleep (25%): duration, efficiency, consistency
 * - Activity (25%): steps, active minutes, calories
 * - Cardio (20%): resting HR, HRV trends
 * - Recovery (15%): recovery score, stress levels
 * - Body (15%): weight stability, body composition
 */
export class HealthScoreService {
  private get db() {
    return getDb()
  }

  async getLatest(userId: string): Promise<HealthScoreRow | null> {
    const [row] = await this.db
      .select()
      .from(healthScores)
      .where(eq(healthScores.userId, userId))
      .orderBy(desc(healthScores.date))
      .limit(1)
    return row ?? null
  }

  async getHistory(userId: string, opts: { from?: Date; to?: Date; limit?: number } = {}): Promise<HealthScoreRow[]> {
    const { from, to, limit = 30 } = opts
    const conditions = [eq(healthScores.userId, userId)]
    if (from) conditions.push(gte(healthScores.date, from))
    if (to) conditions.push(lte(healthScores.date, to))

    return this.db
      .select()
      .from(healthScores)
      .where(and(...conditions))
      .orderBy(desc(healthScores.date))
      .limit(limit)
  }

  async computeForDate(userId: string, date: Date): Promise<HealthScoreRow> {
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    // Fetch metrics for the day
    const metrics = await this.db
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

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null

    // Compute sub-scores
    const sleepScore = this.computeSleepScore(byType)
    const activityScore = this.computeActivityScore(byType)
    const cardioScore = this.computeCardioScore(byType)

    // Use proprietary engines for recovery & body scores
    let recoveryScore: number | null = null
    let bodyScore: number | null = null
    try {
      const readiness = await computeReadiness(userId, date)
      recoveryScore = readiness.score
    } catch { /* fall back to basic if insufficient data */ }
    if (recoveryScore == null) recoveryScore = this.computeRecoveryScore(byType)

    try {
      const body = await computeBodyScoreEngine(userId, date)
      bodyScore = body.score
    } catch { /* fall back to basic if insufficient data */ }
    if (bodyScore == null) bodyScore = this.computeBodyScore(byType)

    const weights = { sleep: 0.25, activity: 0.25, cardio: 0.20, recovery: 0.15, body: 0.15 }
    let totalWeight = 0
    let weightedSum = 0

    if (sleepScore != null) { weightedSum += sleepScore * weights.sleep; totalWeight += weights.sleep }
    if (activityScore != null) { weightedSum += activityScore * weights.activity; totalWeight += weights.activity }
    if (cardioScore != null) { weightedSum += cardioScore * weights.cardio; totalWeight += weights.cardio }
    if (recoveryScore != null) { weightedSum += recoveryScore * weights.recovery; totalWeight += weights.recovery }
    if (bodyScore != null) { weightedSum += bodyScore * weights.body; totalWeight += weights.body }

    const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 50

    // Get previous day's score for delta
    const prevDay = new Date(dayStart)
    prevDay.setDate(prevDay.getDate() - 1)
    const [prev] = await this.db
      .select({ overallScore: healthScores.overallScore })
      .from(healthScores)
      .where(and(eq(healthScores.userId, userId), lte(healthScores.date, prevDay)))
      .orderBy(desc(healthScores.date))
      .limit(1)

    const delta = prev ? Math.round((overallScore - prev.overallScore) * 10) / 10 : null

    // 7-day average
    const weekAgo = new Date(dayStart)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekRows = await this.db
      .select({ score: healthScores.overallScore })
      .from(healthScores)
      .where(and(eq(healthScores.userId, userId), gte(healthScores.date, weekAgo)))

    const weekAvg = weekRows.length > 0
      ? Math.round((weekRows.reduce((s, r) => s + r.score, overallScore) / (weekRows.length + 1)) * 10) / 10
      : overallScore

    const grade = this.scoreToGrade(overallScore)

    const insert: HealthScoreInsert = {
      userId,
      date: dayStart,
      overallScore,
      sleepScore,
      activityScore,
      cardioScore,
      recoveryScore,
      bodyScore,
      deltaFromPrevious: delta,
      weeklyAverage: weekAvg,
      grade,
      breakdown: {
        sleepScore,
        activityScore,
        cardioScore,
        recoveryScore,
        bodyScore,
        metricsAvailable: Object.fromEntries([...byType.entries()].map(([k, v]) => [k, v.length])),
      },
    }

    const [row] = await this.db
      .insert(healthScores)
      .values(insert)
      .onConflictDoUpdate({
        target: [healthScores.userId, healthScores.date],
        set: { ...insert },
      })
      .returning()

    return row!
  }

  private computeSleepScore(byType: Map<string, number[]>): number | null {
    const sleepScores = byType.get("sleep_score")
    if (sleepScores && sleepScores.length > 0) return Math.min(100, sleepScores[0]!)
    // Estimate from sleep duration data
    const sleep = byType.get("sleep")
    if (!sleep || sleep.length === 0) return null
    const durationHrs = sleep[0]! / 60
    if (durationHrs >= 7 && durationHrs <= 9) return 85 + (1 - Math.abs(durationHrs - 8)) * 15
    if (durationHrs >= 6) return 60 + (durationHrs - 6) * 25
    return Math.max(20, durationHrs * 10)
  }

  private computeActivityScore(byType: Map<string, number[]>): number | null {
    const steps = byType.get("steps")
    const active = byType.get("active_minutes")
    if (!steps && !active) return null
    let score = 50
    if (steps && steps.length > 0) {
      const total = steps.reduce((a, b) => a + b, 0)
      score = Math.min(100, (total / 10000) * 100)
    }
    if (active && active.length > 0) {
      const totalMin = active.reduce((a, b) => a + b, 0)
      const activeScore = Math.min(100, (totalMin / 30) * 100)
      score = (score + activeScore) / 2
    }
    return Math.round(score * 10) / 10
  }

  private computeCardioScore(byType: Map<string, number[]>): number | null {
    const rhr = byType.get("resting_heart_rate")
    const hrv = byType.get("heart_rate_variability")
    if (!rhr && !hrv) return null
    let score = 70
    if (rhr && rhr.length > 0) {
      const avg = rhr.reduce((a, b) => a + b, 0) / rhr.length
      if (avg < 50) score = 95
      else if (avg < 60) score = 85
      else if (avg < 70) score = 75
      else if (avg < 80) score = 55
      else score = 35
    }
    if (hrv && hrv.length > 0) {
      const avg = hrv.reduce((a, b) => a + b, 0) / hrv.length
      const hrvScore = Math.min(100, avg * 1.5)
      score = (score + hrvScore) / 2
    }
    return Math.round(score * 10) / 10
  }

  private computeRecoveryScore(byType: Map<string, number[]>): number | null {
    const recovery = byType.get("recovery_score")
    const stress = byType.get("stress")
    if (!recovery && !stress) return null
    if (recovery && recovery.length > 0) return Math.min(100, recovery[0]!)
    if (stress && stress.length > 0) return Math.max(0, 100 - stress[0]!)
    return null
  }

  private computeBodyScore(byType: Map<string, number[]>): number | null {
    const bmi = byType.get("bmi")
    if (!bmi || bmi.length === 0) return null
    const val = bmi[0]!
    if (val >= 18.5 && val <= 24.9) return 90
    if (val >= 25 && val <= 29.9) return 65
    return 40
  }

  private scoreToGrade(score: number): string {
    if (score >= 95) return "A+"
    if (score >= 90) return "A"
    if (score >= 85) return "B+"
    if (score >= 80) return "B"
    if (score >= 75) return "C+"
    if (score >= 70) return "C"
    if (score >= 60) return "D"
    return "F"
  }
}
