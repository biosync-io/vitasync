import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { GoalService } from "../../services/goal.service.js"
import { UserService } from "../../services/user.service.js"

const goalService = new GoalService()
const userService = new UserService()

const goalsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/goals
  app.get("/:userId/goals", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        status: z.enum(["active", "completed", "abandoned"]).optional(),
        category: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
      })
      .parse(request.query)

    const goals = await goalService.list(userId, query)
    return reply.send({ data: goals })
  })

  // POST /v1/users/:userId/goals
  app.post("/:userId/goals", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        category: z.string().max(50),
        metricType: z.string().max(100),
        targetValue: z.number(),
        targetUnit: z.string().max(50),
        cadence: z.string().max(30),
        startDate: z.string().datetime(),
        endDate: z.string().datetime().optional(),
      })
      .parse(request.body)

    const goal = await goalService.create({
      userId,
      ...body,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
    })
    return reply.status(201).send(goal)
  })

  // GET /v1/users/:userId/goals/:goalId
  app.get("/:userId/goals/:goalId", async (request, reply) => {
    const { userId, goalId } = z
      .object({ userId: z.string().uuid(), goalId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const goal = await goalService.findById(goalId, userId)
    if (!goal) return reply.status(404).send({ code: "NOT_FOUND", message: "Goal not found" })
    return reply.send(goal)
  })

  // PUT /v1/users/:userId/goals/:goalId
  app.put("/:userId/goals/:goalId", async (request, reply) => {
    const { userId, goalId } = z
      .object({ userId: z.string().uuid(), goalId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        targetValue: z.number().optional(),
        status: z.enum(["active", "completed", "abandoned"]).optional(),
      })
      .parse(request.body)

    const goal = await goalService.update(goalId, userId, body)
    if (!goal) return reply.status(404).send({ code: "NOT_FOUND", message: "Goal not found" })
    return reply.send(goal)
  })

  // DELETE /v1/users/:userId/goals/:goalId
  app.delete("/:userId/goals/:goalId", async (request, reply) => {
    const { userId, goalId } = z
      .object({ userId: z.string().uuid(), goalId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await goalService.delete(goalId, userId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Goal not found" })
    return reply.status(204).send()
  })

  // POST /v1/users/:userId/goals/:goalId/evaluate — manual progress check
  app.post("/:userId/goals/:goalId/evaluate", async (request, reply) => {
    const { userId, goalId } = z
      .object({ userId: z.string().uuid(), goalId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const progress = await goalService.evaluateProgress(goalId, userId)
    if (!progress) return reply.status(404).send({ code: "NOT_FOUND", message: "Goal not found" })
    return reply.send(progress)
  })
}

export default goalsRoutes
