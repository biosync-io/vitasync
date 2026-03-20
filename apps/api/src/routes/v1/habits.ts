import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { HabitsService } from "../../services/habits.service.js"
import { UserService } from "../../services/user.service.js"

const habitsService = new HabitsService()
const userService = new UserService()

const habitsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/habits
  app.get("/:userId/habits", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ active: z.coerce.boolean().optional() }).parse(request.query)
    const list = await habitsService.listHabits(userId, query.active !== undefined ? { active: query.active } : {})
    return reply.send({ data: list })
  })

  // POST /v1/users/:userId/habits
  app.post("/:userId/habits", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        name: z.string().min(1).max(100),
        icon: z.string().max(10).default("✅"),
        color: z.string().max(20).default("blue"),
        frequency: z.enum(["daily", "weekdays", "custom"]).default("daily"),
        targetDays: z.array(z.number().min(0).max(6)).max(7).optional(),
      })
      .parse(request.body)

    const habit = await habitsService.createHabit({ userId, ...body })
    return reply.status(201).send(habit)
  })

  // PATCH /v1/users/:userId/habits/:habitId
  app.patch("/:userId/habits/:habitId", async (request, reply) => {
    const params = z.object({ userId: z.string().uuid(), habitId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(params.userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        icon: z.string().max(10).optional(),
        color: z.string().max(20).optional(),
        frequency: z.enum(["daily", "weekdays", "custom"]).optional(),
        targetDays: z.array(z.number().min(0).max(6)).max(7).optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body)

    const updated = await habitsService.updateHabit(params.habitId, params.userId, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)))
    if (!updated) return reply.status(404).send({ code: "NOT_FOUND", message: "Habit not found" })
    return reply.send(updated)
  })

  // DELETE /v1/users/:userId/habits/:habitId
  app.delete("/:userId/habits/:habitId", async (request, reply) => {
    const params = z.object({ userId: z.string().uuid(), habitId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(params.userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await habitsService.deleteHabit(params.habitId, params.userId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Habit not found" })
    return reply.status(204).send()
  })

  // POST /v1/users/:userId/habits/:habitId/complete
  app.post("/:userId/habits/:habitId/complete", async (request, reply) => {
    const params = z.object({ userId: z.string().uuid(), habitId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(params.userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        note: z.string().max(200).optional(),
      })
      .parse(request.body)

    const log = await habitsService.logCompletion({
      habitId: params.habitId,
      userId: params.userId,
      completedDate: body.date ?? new Date().toISOString().slice(0, 10),
      note: body.note,
    })
    return reply.status(201).send(log)
  })

  // DELETE /v1/users/:userId/habits/:habitId/complete/:date
  app.delete("/:userId/habits/:habitId/complete/:date", async (request, reply) => {
    const params = z.object({
      userId: z.string().uuid(),
      habitId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.params)
    const owner = await userService.findById(params.userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await habitsService.removeCompletion(params.habitId, params.userId, params.date)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Completion not found" })
    return reply.status(204).send()
  })

  // GET /v1/users/:userId/habits/summary
  app.get("/:userId/habits/summary", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(request.query)
    const summary = await habitsService.getDailySummary(userId, query.date)
    return reply.send(summary)
  })
}

export default habitsRoutes
