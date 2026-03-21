import { getDb, healthReports, healthMetrics, events, healthScores } from "@biosync-io/db"
import type { HealthReportInsert, HealthReportRow } from "@biosync-io/db"
import { and, avg, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm"

/**
 * Health Reports Service — Feature #9 (Automated Report Generation)
 *
 * Generates comprehensive health reports (weekly, monthly, quarterly, annual)
 * with trend analysis, recommendations, and comparisons to previous periods.
 */
export class HealthReportService {
  private get db() {
    return getDb()
  }

  async list(userId: string, opts: { reportType?: string; limit?: number } = {}): Promise<HealthReportRow[]> {
    const conditions = [eq(healthReports.userId, userId)]
    if (opts.reportType) conditions.push(eq(healthReports.reportType, opts.reportType))

    return this.db
      .select()
      .from(healthReports)
      .where(and(...conditions))
      .orderBy(desc(healthReports.createdAt))
      .limit(opts.limit ?? 20)
  }

  async findById(id: string, userId: string): Promise<HealthReportRow | null> {
    const [row] = await this.db
      .select()
      .from(healthReports)
      .where(and(eq(healthReports.id, id), eq(healthReports.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async generate(userId: string, reportType: string, periodStart: Date, periodEnd: Date): Promise<HealthReportRow> {
    // Create report placeholder
    const title = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Health Report`

    const [report] = await this.db
      .insert(healthReports)
      .values({
        userId,
        reportType,
        title,
        periodStart,
        periodEnd,
        status: "generating",
        format: "json",
      })
      .returning()

    try {
      // Gather metrics
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
            gte(healthMetrics.recordedAt, periodStart),
            lte(healthMetrics.recordedAt, periodEnd),
          ),
        )

      // Gather workouts
      const [workoutStats] = await this.db
        .select({
          workoutCount: count(),
          totalDuration: sum(events.durationSeconds),
          totalCalories: sum(events.caloriesKcal),
          totalDistance: sum(events.distanceMeters),
        })
        .from(events)
        .where(
          and(
            eq(events.userId, userId),
            eq(events.eventType, "workout"),
            gte(events.startedAt, periodStart),
            lte(events.startedAt, periodEnd),
          ),
        )

      // Gather health scores
      const scores = await this.db
        .select()
        .from(healthScores)
        .where(
          and(
            eq(healthScores.userId, userId),
            gte(healthScores.date, periodStart),
            lte(healthScores.date, periodEnd),
          ),
        )

      // Build metric summaries
      const metricSummaries: Record<string, { avg: number; min: number; max: number; count: number }> = {}
      for (const m of metrics) {
        if (m.value == null) continue
        if (!metricSummaries[m.metricType]) {
          metricSummaries[m.metricType] = { avg: 0, min: Infinity, max: -Infinity, count: 0 }
        }
        const s = metricSummaries[m.metricType]!
        s.count++
        s.avg += m.value
        s.min = Math.min(s.min, m.value)
        s.max = Math.max(s.max, m.value)
      }
      for (const key of Object.keys(metricSummaries)) {
        const s = metricSummaries[key]!
        s.avg = Math.round((s.avg / s.count) * 10) / 10
      }

      // Compute average health score
      const avgHealthScore = scores.length > 0
        ? Math.round(scores.reduce((s, r) => s + r.overallScore, 0) / scores.length * 10) / 10
        : null

      // Generate highlights
      const highlights: string[] = []
      if (workoutStats?.workoutCount) highlights.push(`Completed ${workoutStats.workoutCount} workouts`)
      if (metricSummaries.steps) highlights.push(`Averaged ${Math.round(metricSummaries.steps.avg)} steps per day`)
      if (avgHealthScore) highlights.push(`Average health score: ${avgHealthScore}`)
      if (metricSummaries.resting_heart_rate) highlights.push(`Average resting HR: ${metricSummaries.resting_heart_rate.avg} bpm`)

      // Generate recommendations
      const recommendations: string[] = []
      if (metricSummaries.steps && metricSummaries.steps.avg < 8000)
        recommendations.push("Try to increase daily steps to at least 8,000 for optimal health benefits.")
      if (metricSummaries.sleep_score && metricSummaries.sleep_score.avg < 70)
        recommendations.push("Focus on sleep hygiene: consistent bedtime, reduced screen time before bed.")
      if (metricSummaries.resting_heart_rate && metricSummaries.resting_heart_rate.avg > 75)
        recommendations.push("Consider increasing aerobic exercise to improve resting heart rate.")
      if (!workoutStats?.workoutCount || Number(workoutStats.workoutCount) < 3)
        recommendations.push("Aim for at least 3 workouts per week for cardiovascular health.")
      recommendations.push("Stay hydrated and maintain consistent meal timing for optimal recovery.")

      const content = {
        summary: {
          periodDays: Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)),
          totalMetrics: metrics.length,
          avgHealthScore,
        },
        workout: {
          count: workoutStats?.workoutCount ?? 0,
          totalDurationMinutes: workoutStats?.totalDuration ? Math.round(Number(workoutStats.totalDuration) / 60) : 0,
          totalCalories: workoutStats?.totalCalories ? Math.round(Number(workoutStats.totalCalories)) : 0,
          totalDistanceKm: workoutStats?.totalDistance ? Math.round(Number(workoutStats.totalDistance) / 100) / 10 : 0,
        },
        metrics: metricSummaries,
        healthScores: {
          average: avgHealthScore,
          best: scores.length > 0 ? Math.max(...scores.map((s) => s.overallScore)) : null,
          worst: scores.length > 0 ? Math.min(...scores.map((s) => s.overallScore)) : null,
        },
      }

      const [updated] = await this.db
        .update(healthReports)
        .set({
          status: "ready",
          content,
          highlights,
          recommendations,
        })
        .where(eq(healthReports.id, report!.id))
        .returning()

      return updated!
    } catch (error) {
      await this.db
        .update(healthReports)
        .set({ status: "failed" })
        .where(eq(healthReports.id, report!.id))
      throw error
    }
  }
}
