import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { ReadinessService } from "../../services/readiness.service.js"
import { UserService } from "../../services/user.service.js"

const readinessService = new ReadinessService()
const userService = new UserService()

const readinessRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/readiness — current readiness state
  app.get("/:userId/readiness", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ date: z.string().datetime().optional() }).parse(request.query)
    const date = query.date ? new Date(query.date) : undefined

    const readiness = await readinessService.getReadiness(userId, date)
    return reply.send(readiness)
  })

  // GET /v1/users/:userId/training-load — current training load (ATL/CTL/TSB)
  app.get("/:userId/training-load", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ date: z.string().datetime().optional() }).parse(request.query)
    const date = query.date ? new Date(query.date) : undefined

    const load = await readinessService.getTrainingLoad(userId, date)
    return reply.send(load)
  })

  // GET /v1/users/:userId/training-load/history — historical training load
  app.get("/:userId/training-load/history", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ days: z.coerce.number().min(1).max(365).default(30) }).parse(request.query)
    const history = await readinessService.getTrainingLoadHistory(userId, { days: query.days })
    return reply.send({ data: history })
  })
}

export default readinessRoutes
