import { getDb, healthSnapshots, healthMetrics, events, healthScores } from "@biosync-io/db"
import type { HealthSnapshotRow } from "@biosync-io/db"
import { and, avg, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm"

export class HealthSnapshotService {
  private get db() {
    return getDb()
  }

  async list(userId: string, opts: { periodType?: string; limit?: number } = {}): Promise<HealthSnapshotRow[]> {
    const conditions = [eq(healthSnapshots.userId, userId)]
    if (opts.periodType) conditions.push(eq(healthSnapshots.periodType, opts.periodType))

    return this.db
      .select()
      .from(healthSnapshots)
      .where(and(...conditions))
      .orderBy(desc(healthSnapshots.periodStart))
      .limit(opts.limit ?? 20)
  }

  async findById(id: string, userId: string): Promise<HealthSnapshotRow | null> {
    const [row] = await this.db
      .select()
      .from(healthSnapshots)
      .where(and(eq(healthSnapshots.id, id), eq(healthSnapshots.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async generateWeeklySnapshot(userId: string, weekStart?: Date): Promise<HealthSnapshotRow> {
    const start = weekStart ?? (() => {
      const d = new Date()
      d.setDate(d.getDate() - 7)
      d.setHours(0, 0, 0, 0)
      return d
    })()
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    end.setHours(23, 59, 59, 999)

    return this.generateSnapshot(userId, "weekly", start, end)
  }

  async generateMonthlySnapshot(userId: string, monthStart?: Date): Promise<HealthSnapshotRow> {
    const start = monthStart ?? (() => {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      d.setDate(1)
      d.setHours(0, 0, 0, 0)
      return d
    })()
    const end = new Date(start)
    end.setMonth(end.getMonth() + 1)
    end.setDate(0) // last day of month
    end.setHours(23, 59, 59, 999)

    return this.generateSnapshot(userId, "monthly", start, end)
  }

  private async generateSnapshot(userId: string, periodType: string, periodStart: Date, periodEnd: Date): Promise<HealthSnapshotRow> {
    // Aggregate health metrics
    const metricAggregates = await this.db
      .select({
        metricType: healthMetrics.metricType,
        avgValue: avg(healthMetrics.value),
        minValue: sql<number>`min(${healthMetrics.value})`,
        maxValue: sql<number>`max(${healthMetrics.value})`,
        count: count(),
      })
      .from(healthMetrics)
      .where(
        and(
          eq(healthMetrics.userId, userId),
          gte(healthMetrics.recordedAt, periodStart),
          lte(healthMetrics.recordedAt, periodEnd),
        ),
      )
      .groupBy(healthMetrics.metricType)

    // Extract key averages
    const findAvg = (type: string) => {
      const m = metricAggregates.find((a) => a.metricType === type)
      return m ? Math.round(Number(m.avgValue ?? 0) * 10) / 10 : null
    }

    // Workout stats
    const [workoutStats] = await this.db
      .select({
        workoutCount: count(),
        totalDuration: sum(events.durationSeconds),
        totalCalories: sum(events.caloriesKcal),
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

    // Health score average
    const [scoreAvg] = await this.db
      .select({ avgScore: avg(healthScores.overallScore) })
      .from(healthScores)
      .where(
        and(
          eq(healthScores.userId, userId),
          gte(healthScores.date, periodStart),
          lte(healthScores.date, periodEnd),
        ),
      )

    // Previous period comparison
    const periodLength = periodEnd.getTime() - periodStart.getTime()
    const prevStart = new Date(periodStart.getTime() - periodLength)
    const prevEnd = new Date(periodStart.getTime() - 1)

    const [prevScoreAvg] = await this.db
      .select({ avgScore: avg(healthScores.overallScore) })
      .from(healthScores)
      .where(
        and(
          eq(healthScores.userId, userId),
          gte(healthScores.date, prevStart),
          lte(healthScores.date, prevEnd),
        ),
      )

    const currentAvgScore = Number(scoreAvg?.avgScore ?? 0)
    const previousAvgScore = Number(prevScoreAvg?.avgScore ?? 0)
    const periodComparison = previousAvgScore > 0
      ? Math.round(((currentAvgScore - previousAvgScore) / previousAvgScore) * 100)
      : null

    const [snapshot] = await this.db
      .insert(healthSnapshots)
      .values({
        userId,
        periodType,
        periodStart,
        periodEnd,
        avgHealthScore: currentAvgScore > 0 ? Math.round(currentAvgScore) : null,
        avgRestingHr: findAvg("resting_heart_rate"),
        avgHrv: findAvg("heart_rate_variability"),
        avgSteps: findAvg("steps") ? Math.round(findAvg("steps")!) : null,
        avgSleepScore: findAvg("sleep_score"),
        avgActiveCalories: findAvg("active_calories") ? Math.round(findAvg("active_calories")!) : null,
        workoutCount: Number(workoutStats?.workoutCount ?? 0),
        totalWorkoutMinutes: workoutStats?.totalDuration ? Math.round(Number(workoutStats.totalDuration) / 60) : 0,
        periodComparison,
        metricBreakdown: Object.fromEntries(
          metricAggregates.map((a) => [a.metricType, {
            avg: Math.round(Number(a.avgValue ?? 0) * 10) / 10,
            min: a.minValue,
            max: a.maxValue,
            count: Number(a.count),
          }]),
        ),
      })
      .returning()

    return snapshot!
  }
}
