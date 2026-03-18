import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { HealthSnapshotService } from "../../services/health-snapshot.service.js"
import { UserService } from "../../services/user.service.js"

const snapshotService = new HealthSnapshotService()
const userService = new UserService()

const snapshotsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/snapshots
  app.get("/:userId/snapshots", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        periodType: z.enum(["weekly", "monthly"]).optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
      })
      .parse(request.query)

    const snapshots = await snapshotService.list(userId, query)
    return reply.send({ data: snapshots })
  })

  // GET /v1/users/:userId/snapshots/:snapshotId
  app.get("/:userId/snapshots/:snapshotId", async (request, reply) => {
    const { userId, snapshotId } = z
      .object({ userId: z.string().uuid(), snapshotId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const snapshot = await snapshotService.findById(snapshotId, userId)
    if (!snapshot) return reply.status(404).send({ code: "NOT_FOUND", message: "Snapshot not found" })
    return reply.send(snapshot)
  })

  // POST /v1/users/:userId/snapshots/generate/weekly
  app.post("/:userId/snapshots/generate/weekly", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const snapshot = await snapshotService.generateWeeklySnapshot(userId)
    return reply.status(201).send(snapshot)
  })

  // POST /v1/users/:userId/snapshots/generate/monthly
  app.post("/:userId/snapshots/generate/monthly", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const snapshot = await snapshotService.generateMonthlySnapshot(userId)
    return reply.status(201).send(snapshot)
  })
}

export default snapshotsRoutes
