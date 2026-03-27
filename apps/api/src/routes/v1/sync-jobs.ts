import type { FastifyPluginAsync } from "fastify"
import { getSyncQueue } from "../../queues/sync.js"

const syncJobsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/sync-jobs
   * Returns recent sync jobs from the BullMQ queue (waiting, active, completed, failed, delayed).
   */
  app.get("/", async (_request, reply) => {
    const queue = getSyncQueue()

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getJobs(["waiting"], 0, 49),
      queue.getJobs(["active"], 0, 49),
      queue.getJobs(["completed"], 0, 49),
      queue.getJobs(["failed"], 0, 49),
      queue.getJobs(["delayed"], 0, 49),
    ])

    const format = (jobs: Awaited<ReturnType<typeof queue.getJobs>>, state: string) =>
      jobs.map((j) => ({
        id: j.id,
        state,
        name: j.name,
        data: j.data,
        progress: j.progress,
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason ?? null,
        processedOn: j.processedOn ?? null,
        finishedOn: j.finishedOn ?? null,
        timestamp: j.timestamp,
      }))

    const jobs = [
      ...format(active, "active"),
      ...format(waiting, "waiting"),
      ...format(delayed, "delayed"),
      ...format(completed, "completed"),
      ...format(failed, "failed"),
    ]

    // Sort by timestamp descending (newest first)
    jobs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

    return reply.send({ jobs: jobs.slice(0, 100) })
  })

  /**
   * POST /v1/sync-jobs/sweep
   * Manually trigger a sync sweep — enqueues sync jobs for every connected provider.
   * Use this to recover when the worker scheduler failed to auto-create sync jobs.
   */
  app.post("/sweep", async (_request, reply) => {
    const queue = getSyncQueue()
    const { getDb, providerConnections } = await import("@biosync-io/db")
    const { eq } = await import("drizzle-orm")

    const db = getDb()
    const connections = await db
      .select({
        id: providerConnections.id,
        userId: providerConnections.userId,
        providerId: providerConnections.providerId,
      })
      .from(providerConnections)
      .where(eq(providerConnections.status, "connected"))

    const SYNC_INTERVAL_MS = 900_000
    let enqueued = 0

    const results = await Promise.allSettled(
      connections.map((conn) =>
        queue.add(
          "sync",
          {
            connectionId: conn.id,
            userId: conn.userId,
            providerId: conn.providerId,
          },
          {
            jobId: `sync-${conn.id}-${Math.floor(Date.now() / SYNC_INTERVAL_MS)}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 30_000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
          },
        ),
      ),
    )

    for (const r of results) {
      if (r.status === "fulfilled") enqueued++
    }

    return reply.send({
      message: `Sweep complete: enqueued ${enqueued} of ${connections.length} connected provider(s)`,
      total: connections.length,
      enqueued,
    })
  })
}

export default syncJobsRoutes
