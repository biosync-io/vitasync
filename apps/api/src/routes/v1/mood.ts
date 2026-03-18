import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { MoodService } from "../../services/mood.service.js"
import { UserService } from "../../services/user.service.js"

const moodService = new MoodService()
const userService = new UserService()

const moodRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/mood
  app.get("/:userId/mood", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        mood: z.string().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(request.query)

    const logs = await moodService.list(userId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      mood: query.mood,
      limit: query.limit,
    })
    return reply.send({ data: logs })
  })

  // POST /v1/users/:userId/mood
  app.post("/:userId/mood", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        mood: z.string().max(30),
        score: z.number().min(1).max(10),
        energy: z.number().min(1).max(10).optional(),
        stress: z.number().min(1).max(10).optional(),
        notes: z.string().max(2000).optional(),
        tags: z.array(z.string().max(50)).max(10).optional(),
        factors: z.array(z.string().max(100)).max(10).optional(),
        recordedAt: z.string().datetime().optional(),
      })
      .parse(request.body)

    const log = await moodService.create({
      userId,
      ...body,
      recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
    })
    return reply.status(201).send(log)
  })

  // GET /v1/users/:userId/mood/stats
  app.get("/:userId/mood/stats", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({ days: z.coerce.number().min(7).max(365).default(30) })
      .parse(request.query)

    const stats = await moodService.getStats(userId, query.days)
    return reply.send(stats)
  })
}

export default moodRoutes
