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
 * - Every `SYNC_INTERVAL_MS` milliseconds, query all connected provider connections
 * - For each connection, add a sync job if one isn't already queued or running
 * - Jobs are deduplicated via `jobId` based on connectionId to avoid pile-up
 *
 * Resilience:
 * - On Redis reconnection, the repeatable job is re-registered and an immediate sweep runs
 * - Old repeatable jobs are cleaned before re-creation to avoid stale metadata blocking
 * - The immediate startup sweep is non-fatal so Redis latency doesn't crash the worker
 */

const SYNC_INTERVAL_MS = Number.parseInt(process.env.SYNC_INTERVAL_MS ?? "900000", 10) // default 15 minutes

/**
 * Register (or re-register) the BullMQ repeatable sweep job.
 * Removes any stale repeatable entry first so a fresh Redis won't reject the add.
 */
async function ensureRepeatableJob(syncQueue: Queue): Promise<void> {
  try {
    await syncQueue.removeRepeatable(
      "schedule-all-syncs",
      { every: SYNC_INTERVAL_MS },
      "periodic-sync-sweep",
    )
  } catch {
    // No existing repeatable to remove — safe to continue
  }

  await syncQueue.add(
    "schedule-all-syncs",
    { type: "scheduled_sweep" },
    {
      repeat: { every: SYNC_INTERVAL_MS },
      jobId: "periodic-sync-sweep",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  )
}

export async function startPeriodicScheduler(
  syncQueue: Queue,
  connection: Redis,
): Promise<() => Promise<void>> {
  // Register the BullMQ repeatable job (cleans stale entry first)
  await ensureRepeatableJob(syncQueue)

  console.info(`[scheduler] Periodic sync enabled — interval: ${SYNC_INTERVAL_MS / 1000}s`)

  // Run an immediate sweep on startup — non-fatal so Redis lag doesn't crash the worker
  enqueueAllActiveConnections(syncQueue).catch((err) => {
    console.error("[scheduler] Initial sweep failed (will retry on next interval):", err)
  })

  // In-process interval as a belt-and-suspenders approach
  const timer = setInterval(() => {
    enqueueAllActiveConnections(syncQueue).catch((err) => {
      console.error("[scheduler] Sweep error:", err)
    })
  }, SYNC_INTERVAL_MS)

  // Re-register repeatable job and run a catch-up sweep whenever Redis reconnects.
  // After a Redis cluster upgrade/failover the repeatable job metadata is lost;
  // this handler ensures sync jobs resume automatically.
  const onReconnect = () => {
    console.info("[scheduler] Redis reconnected — re-registering repeatable job and running catch-up sweep")
    ensureRepeatableJob(syncQueue).catch((err) => {
      console.error("[scheduler] Failed to re-register repeatable job after reconnect:", err)
    })
    enqueueAllActiveConnections(syncQueue).catch((err) => {
      console.error("[scheduler] Catch-up sweep after reconnect failed:", err)
    })
  }

  connection.on("ready", onReconnect)

  return async () => {
    clearInterval(timer)
    connection.off("ready", onReconnect)
    try {
      await syncQueue.removeRepeatable(
        "schedule-all-syncs",
        { every: SYNC_INTERVAL_MS },
        "periodic-sync-sweep",
      )
    } catch {
      // Queue may already be closed
    }
  }
}

/**
 * Query all connected connections and enqueue a sync job for each.
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
          eq(providerConnections.status, "connected"),
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
