import type { QueryBus } from "@biosync-io/cqrs"
import { eq, desc, and, count } from "drizzle-orm"
import { SyncQueries } from "./sync.queries.js"

/**
 * Register query handlers for the provider-sync domain.
 */
export function registerSyncQueryHandlers(
  bus: QueryBus,
  db: ReturnType<typeof import("@biosync-io/db").getDb>,
): void {
  bus.register(SyncQueries.GET_SYNC_HISTORY, async (query) => {
    const { syncJobs } = await import("@biosync-io/db")
    const {
      connectionId,
      limit = 50,
      offset = 0,
    } = query.payload as {
      connectionId?: string
      limit?: number
      offset?: number
    }

    const conditions = connectionId ? eq(syncJobs.connectionId, connectionId) : undefined

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(syncJobs)
        .where(conditions)
        .orderBy(desc(syncJobs.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(syncJobs).where(conditions),
    ])

    return { data: rows, total: countRows[0]?.total ?? 0 }
  })

  bus.register(SyncQueries.GET_SYNC_STATUS, async (query) => {
    const { syncJobs } = await import("@biosync-io/db")
    const { connectionId } = query.payload as { connectionId: string }

    const [latest] = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.connectionId, connectionId))
      .orderBy(desc(syncJobs.createdAt))
      .limit(1)

    return latest ?? null
  })

  bus.register(SyncQueries.GET_CONNECTION_HEALTH, async (query) => {
    const { syncJobs } = await import("@biosync-io/db")
    const { connectionId } = query.payload as { connectionId: string }

    const recentJobs = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.connectionId, connectionId))
      .orderBy(desc(syncJobs.createdAt))
      .limit(10)

    const failedCount = recentJobs.filter((j) => j.status === "failed").length
    const successCount = recentJobs.filter((j) => j.status === "completed").length

    return {
      connectionId,
      recentJobs: recentJobs.length,
      successRate: recentJobs.length > 0 ? successCount / recentJobs.length : 0,
      lastFailure: recentJobs.find((j) => j.status === "failed") ?? null,
      healthy: failedCount < 3,
    }
  })
}
