import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { HealthScoreService } from "../../services/health-score.service.js"
import { UserService } from "../../services/user.service.js"

const healthScoreService = new HealthScoreService()
const userService = new UserService()

const healthScoresRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/health-scores — latest score
  app.get("/:userId/health-scores/latest", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const score = await healthScoreService.getLatest(userId)
    if (!score) return reply.status(404).send({ code: "NOT_FOUND", message: "No health scores yet" })
    return reply.send(score)
  })

  // GET /v1/users/:userId/health-scores — history
  app.get("/:userId/health-scores", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.coerce.number().min(1).max(365).default(30),
      })
      .parse(request.query)

    const scores = await healthScoreService.getHistory(userId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
    })
    return reply.send({ data: scores })
  })

  // POST /v1/users/:userId/health-scores/compute — trigger computation
  app.post("/:userId/health-scores/compute", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z.object({ date: z.string().datetime().optional() }).parse(request.body)
    const date = body.date ? new Date(body.date) : new Date()
    const score = await healthScoreService.computeForDate(userId, date)
    return reply.status(201).send(score)
  })
}

export default healthScoresRoutes
