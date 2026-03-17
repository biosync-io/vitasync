import { getDb, providerConnections } from "@biosync-io/db"
import type { Queue } from "bullmq"
import { and, eq, gt } from "drizzle-orm"
import type { Redis } from "ioredis"

/**
 * Periodic sync scheduler — enqueues sync jobs for all active connections.
 *
 * Replaces the Celery Beat equivalent from open-wearables.
 * Uses BullMQ's built-in scheduler (QueueScheduler is not needed in BullMQ v5+).
 *
 * Strategy:
 * - Every `SYNC_INTERVAL_MS` milliseconds, query all active provider connections
 * - For each connection, add a sync job if one isn't already queued or running
 * - Jobs are deduplicated via `jobId` based on connectionId to avoid pile-up
 */

const SYNC_INTERVAL_MS = Number.parseInt(process.env.SYNC_INTERVAL_MS ?? "900000", 10) // default 15 minutes

export async function startPeriodicScheduler(
  syncQueue: Queue,
  connection: Redis,
): Promise<() => Promise<void>> {
  // Also set up a BullMQ repeatable job as a fallback scheduler
  // This ensures scheduling continues even if the worker restarts
  await syncQueue.add(
    "schedule-all-syncs",
    { type: "scheduled_sweep" },
    {
      repeat: { every: SYNC_INTERVAL_MS },
      jobId: "periodic-sync-sweep", // stable ID prevents duplicate repeatable jobs
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  )

  console.info(`[scheduler] Periodic sync enabled — interval: ${SYNC_INTERVAL_MS / 1000}s`)

  // Also run an immediate sweep on startup to avoid waiting a full interval
  await enqueueAllActiveConnections(syncQueue)

  // In-process interval as a belt-and-suspenders approach
  const timer = setInterval(() => {
    enqueueAllActiveConnections(syncQueue).catch((err) => {
      console.error("[scheduler] Sweep error:", err)
    })
  }, SYNC_INTERVAL_MS)

  return async () => {
    clearInterval(timer)
    // Remove the repeatable job on shutdown
    await syncQueue.removeRepeatable(
      "schedule-all-syncs",
      { every: SYNC_INTERVAL_MS },
      "periodic-sync-sweep",
    )
  }
}

/**
 * Query all active connections and enqueue a sync job for each.
 * Uses a per-connection jobId to deduplicate — BullMQ will skip if already queued.
 * Paginates through the DB in batches to avoid loading all connections into memory.
 */
export async function enqueueAllActiveConnections(syncQueue: Queue): Promise<void> {
  const db = getDb()
  const PAGE_SIZE = 100
  let lastId = ""
  let total = 0

  for (;;) {
    const page = await db
      .select({
        id: providerConnections.id,
        userId: providerConnections.userId,
        providerId: providerConnections.providerId,
      })
      .from(providerConnections)
      .where(
        and(
          eq(providerConnections.status, "active"),
          lastId ? gt(providerConnections.id, lastId) : undefined,
        ),
      )
      .orderBy(providerConnections.id)
      .limit(PAGE_SIZE)

    if (page.length === 0) break

    total += page.length

    await Promise.allSettled(
      page.map((conn) =>
        syncQueue
          .add(
            "sync",
            {
              connectionId: conn.id,
              userId: conn.userId,
              providerId: conn.providerId,
            },
            {
              // Unique per connection: if job already exists in queue, skip.
              // Time-bucket ensures one sync per connection per interval window.
              jobId: `sync-${conn.id}-${Math.floor(Date.now() / SYNC_INTERVAL_MS)}`,
              attempts: 3,
              backoff: { type: "exponential", delay: 30_000 },
              // Must remove completed jobs so the jobId is freed each interval.
              // Without this, completed jobs permanently block re-addition.
              removeOnComplete: { count: 100 },
              removeOnFail: { count: 500 },
            },
          )
          .catch((err) => console.error(`[scheduler] Failed to enqueue ${conn.id}:`, err)),
      ),
    )

    if (page.length < PAGE_SIZE) break
    lastId = page[page.length - 1]!.id
  }

  if (total > 0) {
    console.info(`[scheduler] Sweep: enqueued sync for ${total} connection(s)`)
  }
}
