import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { WaterIntakeService } from "../../services/water-intake.service.js"
import { UserService } from "../../services/user.service.js"

const waterService = new WaterIntakeService()
const userService = new UserService()

const waterRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/water
  app.get("/:userId/water", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(request.query)

    const logs = await waterService.list(userId, {
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      limit: query.limit,
    })
    return reply.send({ data: logs })
  })

  // POST /v1/users/:userId/water
  app.post("/:userId/water", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        amountMl: z.number().int().min(1).max(5000),
        beverageType: z.string().max(30).default("water"),
        note: z.string().max(200).optional(),
        dailyGoalMl: z.number().int().min(500).max(10000).default(2500),
        loggedAt: z.string().datetime().optional(),
      })
      .parse(request.body)

    const log = await waterService.create({
      userId,
      ...body,
      loggedAt: body.loggedAt ? new Date(body.loggedAt) : new Date(),
    })
    return reply.status(201).send(log)
  })

  // DELETE /v1/users/:userId/water/:logId
  app.delete("/:userId/water/:logId", async (request, reply) => {
    const params = z.object({ userId: z.string().uuid(), logId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(params.userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await waterService.delete(params.logId, params.userId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Log not found" })
    return reply.status(204).send()
  })

  // GET /v1/users/:userId/water/today
  app.get("/:userId/water/today", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const summary = await waterService.getDailySummary(userId)
    return reply.send(summary)
  })

  // GET /v1/users/:userId/water/weekly
  app.get("/:userId/water/weekly", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const stats = await waterService.getWeeklyStats(userId)
    return reply.send(stats)
  })
}

export default waterRoutes
