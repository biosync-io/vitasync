import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { defined } from "../../lib/strip-undefined.js"
import { TrainingPlanService } from "../../services/training-plan.service.js"
import { UserService } from "../../services/user.service.js"

const planService = new TrainingPlanService()
const userService = new UserService()

const trainingPlansRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/training-plans
  app.get("/:userId/training-plans", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        status: z.string().optional(),
        limit: z.coerce.number().min(1).max(50).default(10),
      })
      .parse(request.query)

    const plans = await planService.list(userId, defined(query))
    return reply.send({ data: plans })
  })

  // GET /v1/users/:userId/training-plans/:planId
  app.get("/:userId/training-plans/:planId", async (request, reply) => {
    const { userId, planId } = z
      .object({ userId: z.string().uuid(), planId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const plan = await planService.findById(planId, userId)
    if (!plan) return reply.status(404).send({ code: "NOT_FOUND", message: "Training plan not found" })
    return reply.send(plan)
  })

  // POST /v1/users/:userId/training-plans/generate — AI plan generation
  app.post("/:userId/training-plans/generate", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        goal: z.enum(["endurance", "strength", "weight_loss", "general_fitness", "flexibility"]),
        difficulty: z.enum(["beginner", "intermediate", "advanced"]),
        durationWeeks: z.number().int().min(1).max(52),
        daysPerWeek: z.number().int().min(1).max(7),
        focusAreas: z.array(z.string().max(50)).max(5).optional(),
      })
      .parse(request.body)

    const plan = await planService.generate(userId, defined(body))
    return reply.status(201).send(plan)
  })

  // POST /v1/users/:userId/training-plans/:planId/progress — update progress
  app.post("/:userId/training-plans/:planId/progress", async (request, reply) => {
    const { userId, planId } = z
      .object({ userId: z.string().uuid(), planId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const plan = await planService.updateProgress(planId, userId)
    if (!plan) return reply.status(404).send({ code: "NOT_FOUND", message: "Training plan not found" })
    return reply.send(plan)
  })
}

export default trainingPlansRoutes
