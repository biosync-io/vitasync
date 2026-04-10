import type { QueryBus } from "@biosync-io/cqrs"
import {
  healthScoreProjection,
  dailySummaryProjection,
  readinessProjection,
  type Db,
} from "@biosync-io/db"
import { eq, and } from "drizzle-orm"
import { HealthQueries } from "./health.queries.js"

/**
 * Register query handlers for the health domain.
 *
 * All reads come from the denormalized projection tables —
 * no expensive aggregations or joins at query time.
 */
export function registerHealthQueryHandlers(bus: QueryBus, db: Db): void {
  bus.register(HealthQueries.GET_LATEST_SCORE, async (query) => {
    const params = query.params as { userId: string }
    const rows = await db
      .select()
      .from(healthScoreProjection)
      .where(eq(healthScoreProjection.userId, params.userId))
      .limit(1)

    return rows[0] ?? null
  })

  bus.register(HealthQueries.GET_DAILY_SUMMARY, async (query) => {
    const params = query.params as { userId: string; date: string }
    const rows = await db
      .select()
      .from(dailySummaryProjection)
      .where(
        and(
          eq(dailySummaryProjection.userId, params.userId),
          eq(dailySummaryProjection.date, params.date),
        ),
      )
      .limit(1)

    return rows[0] ?? null
  })

  bus.register(HealthQueries.GET_READINESS, async (query) => {
    const params = query.params as { userId: string }
    const rows = await db
      .select()
      .from(readinessProjection)
      .where(eq(readinessProjection.userId, params.userId))
      .limit(1)

    return rows[0] ?? null
  })

  bus.register(HealthQueries.GET_METRICS, async (query) => {
    const params = query.params as { userId: string; date?: string }

    // Return both the latest score and daily summary in one query
    const [score, summary] = await Promise.all([
      db
        .select()
        .from(healthScoreProjection)
        .where(eq(healthScoreProjection.userId, params.userId))
        .limit(1),
      params.date
        ? db
            .select()
            .from(dailySummaryProjection)
            .where(
              and(
                eq(dailySummaryProjection.userId, params.userId),
                eq(dailySummaryProjection.date, params.date),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
    ])

    return {
      score: score[0] ?? null,
      summary: summary[0] ?? null,
    }
  })
}
