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
}

export default syncJobsRoutes
