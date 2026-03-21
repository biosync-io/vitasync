import { getDb, healthMetrics, events } from "@biosync-io/db"
import { and, eq, gte, lte, asc } from "drizzle-orm"
import type { Insight, MetricRecord, WorkoutRecord } from "./types.js"
import { ALGORITHMS } from "./algorithms.js"
import { createContext, runAlgorithm } from "./runner.js"

export { ALGORITHMS } from "./algorithms.js"
export type { Insight, InsightAlgorithm, InsightSeverity, InsightCategory } from "./types.js"

// ── Service ─────────────────────────────────────────────────────

export class InsightsService {
  private get db() {
    return getDb()
  }

  /** Return available algorithm definitions. */
  listAlgorithms() {
    return ALGORITHMS
  }

  /** Run all applicable algorithms for a user and return insights. */
  async generateInsights(
    userId: string,
    opts: { from?: Date; to?: Date } = {},
  ): Promise<Insight[]> {
    const to = opts.to ?? new Date()
    const from = opts.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Fetch all metrics in the range in one query
    const rows = await this.db
      .select({
        metricType: healthMetrics.metricType,
        recordedAt: healthMetrics.recordedAt,
        value: healthMetrics.value,
        data: healthMetrics.data,
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

    // Group by metric type
    const byType = new Map<string, MetricRecord[]>()
    for (const r of rows) {
      const arr = byType.get(r.metricType) ?? []
      arr.push({
        recordedAt: new Date(r.recordedAt),
        value: r.value,
        data: r.data as Record<string, unknown> | null,
      })
      byType.set(r.metricType, arr)
    }

    // Fetch workout events
    const workoutRows: WorkoutRecord[] = (
      await this.db
        .select({
          startedAt: events.startedAt,
          endedAt: events.endedAt,
          durationSeconds: events.durationSeconds,
          avgHeartRate: events.avgHeartRate,
          maxHeartRate: events.maxHeartRate,
          caloriesKcal: events.caloriesKcal,
          distanceMeters: events.distanceMeters,
          data: events.data,
        })
        .from(events)
        .where(
          and(
            eq(events.userId, userId),
            eq(events.eventType, "workout"),
            gte(events.startedAt, from),
            lte(events.startedAt, to),
          ),
        )
        .orderBy(asc(events.startedAt))
    ).map((r) => ({
      ...r,
      startedAt: new Date(r.startedAt),
      endedAt: r.endedAt ? new Date(r.endedAt) : null,
    }))

    const ctx = createContext(byType, workoutRows)
    const insights: Insight[] = []

    for (const alg of ALGORITHMS) {
      try {
        const insight = runAlgorithm(alg, ctx)
        if (insight) insights.push(insight)
      } catch {
        // Skip algorithm if it fails
      }
    }

    return insights
  }
}
