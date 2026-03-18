import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { defined } from "../../lib/strip-undefined.js"
import { NutritionService } from "../../services/nutrition.service.js"
import { UserService } from "../../services/user.service.js"

const nutritionService = new NutritionService()
const userService = new UserService()

const nutritionRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/nutrition
  app.get("/:userId/nutrition", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        mealType: z.string().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(request.query)

    const logs = await nutritionService.list(userId, {
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      ...(query.mealType !== undefined ? { mealType: query.mealType } : {}),
      limit: query.limit,
    })
    return reply.send({ data: logs })
  })

  // POST /v1/users/:userId/nutrition
  app.post("/:userId/nutrition", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        mealType: z.string().max(30),
        description: z.string().max(500).optional(),
        calories: z.number().min(0).optional(),
        proteinG: z.number().min(0).optional(),
        carbsG: z.number().min(0).optional(),
        fatG: z.number().min(0).optional(),
        fiberG: z.number().min(0).optional(),
        sugarG: z.number().min(0).optional(),
        sodiumMg: z.number().min(0).optional(),
        waterMl: z.number().min(0).optional(),
        loggedAt: z.string().datetime().optional(),
      })
      .parse(request.body)

    const log = await nutritionService.create({
      userId,
      mealType: body.mealType,
      consumedAt: body.loggedAt ? new Date(body.loggedAt) : new Date(),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.calories !== undefined && { calories: body.calories }),
      ...(body.proteinG !== undefined && { proteinG: body.proteinG }),
      ...(body.carbsG !== undefined && { carbsG: body.carbsG }),
      ...(body.fatG !== undefined && { fatG: body.fatG }),
      ...(body.fiberG !== undefined && { fiberG: body.fiberG }),
      ...(body.sugarG !== undefined && { sugarG: body.sugarG }),
      ...(body.sodiumMg !== undefined && { sodiumMg: body.sodiumMg }),
      ...(body.waterMl !== undefined && { waterMl: body.waterMl }),
    })
    return reply.status(201).send(log)
  })

  // GET /v1/users/:userId/nutrition/:logId
  app.get("/:userId/nutrition/:logId", async (request, reply) => {
    const { userId, logId } = z
      .object({ userId: z.string().uuid(), logId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const log = await nutritionService.findById(logId, userId)
    if (!log) return reply.status(404).send({ code: "NOT_FOUND", message: "Nutrition log not found" })
    return reply.send(log)
  })

  // PUT /v1/users/:userId/nutrition/:logId
  app.put("/:userId/nutrition/:logId", async (request, reply) => {
    const { userId, logId } = z
      .object({ userId: z.string().uuid(), logId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        mealType: z.string().max(30).optional(),
        description: z.string().max(500).optional(),
        calories: z.number().min(0).optional(),
        proteinG: z.number().min(0).optional(),
        carbsG: z.number().min(0).optional(),
        fatG: z.number().min(0).optional(),
      })
      .parse(request.body)

    const log = await nutritionService.update(logId, userId, defined(body))
    if (!log) return reply.status(404).send({ code: "NOT_FOUND", message: "Nutrition log not found" })
    return reply.send(log)
  })

  // DELETE /v1/users/:userId/nutrition/:logId
  app.delete("/:userId/nutrition/:logId", async (request, reply) => {
    const { userId, logId } = z
      .object({ userId: z.string().uuid(), logId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await nutritionService.delete(logId, userId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Nutrition log not found" })
    return reply.status(204).send()
  })

  // GET /v1/users/:userId/nutrition/summary/daily
  app.get("/:userId/nutrition/summary/daily", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({ date: z.string().datetime().optional() })
      .parse(request.query)

    const date = query.date ? new Date(query.date) : new Date()
    const summary = await nutritionService.getDailySummary(userId, date)
    return reply.send(summary)
  })

  // GET /v1/users/:userId/nutrition/summary/weekly
  app.get("/:userId/nutrition/summary/weekly", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const avg = await nutritionService.getWeeklyAverage(userId)
    return reply.send(avg)
  })
}

export default nutritionRoutes
