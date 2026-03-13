import { Queue } from "bullmq"
import type IORedis from "ioredis"
import { getDb, providerConnections, users } from "@biosync-io/db"
import { eq } from "drizzle-orm"

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

const SYNC_INTERVAL_MS = parseInt(process.env["SYNC_INTERVAL_MS"] ?? "900000", 10) // default 15 minutes

export async function startPeriodicScheduler(syncQueue: Queue, connection: IORedis): Promise<() => Promise<void>> {
  // Also set up a BullMQ repeatable job as a fallback scheduler
  // This ensures scheduling continues even if the worker restarts
  await syncQueue.add(
    "schedule-all-syncs",
    { type: "scheduled_sweep" },
    {
      repeat: { every: SYNC_INTERVAL_MS },
      jobId: "periodic-sync-sweep", // stable ID prevents duplicate repeatable jobs
    },
  )

  console.info(`[scheduler] Periodic sync enabled — interval: ${SYNC_INTERVAL_MS / 1000}s`)

  // Also run an immediate sweep on startup to avoid waiting a full interval
  await scheduleSweep(syncQueue)

  // In-process interval as a belt-and-suspenders approach
  const timer = setInterval(() => {
    scheduleSweep(syncQueue).catch((err) => {
      console.error("[scheduler] Sweep error:", err)
    })
  }, SYNC_INTERVAL_MS)

  return async () => {
    clearInterval(timer)
    // Remove the repeatable job on shutdown
    await syncQueue.removeRepeatable("schedule-all-syncs", { every: SYNC_INTERVAL_MS }, "periodic-sync-sweep")
  }
}

/**
 * Query all active connections and enqueue a sync job for each.
 * Uses a per-connection jobId to deduplicate — BullMQ will skip if already queued.
 */
async function scheduleSweep(syncQueue: Queue): Promise<void> {
  const db = getDb()

  const activeConnections = await db
    .select({
      id: providerConnections.id,
      userId: providerConnections.userId,
      providerId: providerConnections.providerId,
    })
    .from(providerConnections)
    .where(eq(providerConnections.status, "active"))

  if (activeConnections.length === 0) return

  console.info(`[scheduler] Sweep: scheduling sync for ${activeConnections.length} connection(s)`)

  // Batch add all jobs — deduplication is handled by BullMQ jobId
  await Promise.allSettled(
    activeConnections.map((conn) =>
      syncQueue
        .add(
          "sync",
          {
            connectionId: conn.id,
            userId: conn.userId,
            providerId: conn.providerId,
          },
          {
            // Unique per connection: if job already exists in queue, skip
            jobId: `sync-${conn.id}-${Math.floor(Date.now() / SYNC_INTERVAL_MS)}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 30_000 },
          },
        )
        .catch((err) => console.error(`[scheduler] Failed to enqueue ${conn.id}:`, err)),
    ),
  )
}
