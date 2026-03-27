import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { defined } from "../../lib/strip-undefined.js"
import { SmartReminderService } from "../../services/smart-reminder.service.js"
import { UserService } from "../../services/user.service.js"

const reminderService = new SmartReminderService()
const userService = new UserService()

const remindersRoutes: FastifyPluginAsync = async (app) => {
  // ─── CRUD ──────────────────────────────────────────────────────

  // GET /v1/users/:userId/reminders
  app.get("/:userId/reminders", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({ active: z.enum(["true", "false"]).optional() })
      .parse(request.query)

    const reminders = await reminderService.list(userId, {
      ...(query.active !== undefined && { active: query.active === "true" }),
    })
    return reply.send({ data: reminders })
  })

  // POST /v1/users/:userId/reminders
  app.post("/:userId/reminders", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        name: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
        reminderType: z.enum(["goal", "habit", "custom", "suggestion"]).default("custom"),
        frequency: z.enum(["daily", "weekly", "monthly"]).default("daily"),
        timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
        dayOfWeek: z.number().int().min(0).max(6).optional(),
        dayOfMonth: z.number().int().min(1).max(28).optional(),
        timezone: z.string().max(100).default("UTC"),
        goalId: z.string().uuid().optional(),
        channelIds: z.array(z.string().uuid()).default([]),
        config: z.record(z.unknown()).optional(),
      })
      .parse(request.body)

    const reminder = await reminderService.create({ ...body, userId })
    return reply.status(201).send({ data: reminder })
  })

  // GET /v1/users/:userId/reminders/:reminderId
  app.get("/:userId/reminders/:reminderId", async (request, reply) => {
    const { userId, reminderId } = z
      .object({ userId: z.string().uuid(), reminderId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const reminder = await reminderService.findById(reminderId, userId)
    if (!reminder) return reply.status(404).send({ code: "NOT_FOUND", message: "Reminder not found" })
    return reply.send({ data: reminder })
  })

  // PUT /v1/users/:userId/reminders/:reminderId
  app.put("/:userId/reminders/:reminderId", async (request, reply) => {
    const { userId, reminderId } = z
      .object({ userId: z.string().uuid(), reminderId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(1000).optional(),
        frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
        timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        dayOfWeek: z.number().int().min(0).max(6).optional(),
        dayOfMonth: z.number().int().min(1).max(28).optional(),
        timezone: z.string().max(100).optional(),
        goalId: z.string().uuid().nullable().optional(),
        channelIds: z.array(z.string().uuid()).optional(),
        config: z.record(z.unknown()).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(request.body)

    const reminder = await reminderService.update(reminderId, userId, defined(body))
    if (!reminder) return reply.status(404).send({ code: "NOT_FOUND", message: "Reminder not found" })
    return reply.send({ data: reminder })
  })

  // DELETE /v1/users/:userId/reminders/:reminderId
  app.delete("/:userId/reminders/:reminderId", async (request, reply) => {
    const { userId, reminderId } = z
      .object({ userId: z.string().uuid(), reminderId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await reminderService.delete(reminderId, userId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Reminder not found" })
    return reply.status(204).send()
  })

  // ─── Actions ───────────────────────────────────────────────────

  // POST /v1/users/:userId/reminders/:reminderId/snooze
  app.post("/:userId/reminders/:reminderId/snooze", async (request, reply) => {
    const { userId, reminderId } = z
      .object({ userId: z.string().uuid(), reminderId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({ durationMinutes: z.number().int().min(5).max(10080).default(60) })
      .parse(request.body)

    const reminder = await reminderService.snooze(reminderId, userId, body.durationMinutes)
    if (!reminder) return reply.status(404).send({ code: "NOT_FOUND", message: "Reminder not found" })
    return reply.send({ data: reminder, message: `Snoozed for ${body.durationMinutes} minutes` })
  })

  // POST /v1/users/:userId/reminders/:reminderId/dismiss
  app.post("/:userId/reminders/:reminderId/dismiss", async (request, reply) => {
    const { userId, reminderId } = z
      .object({ userId: z.string().uuid(), reminderId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const reminder = await reminderService.dismiss(reminderId, userId)
    if (!reminder) return reply.status(404).send({ code: "NOT_FOUND", message: "Reminder not found" })
    return reply.send({ data: reminder, message: "Reminder dismissed" })
  })

  // ─── Logs & Suggestions ────────────────────────────────────────

  // GET /v1/users/:userId/reminders/logs
  app.get("/:userId/reminders/logs", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        reminderId: z.string().uuid().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(request.query)

    const logs = await reminderService.getLogs(userId, query)
    return reply.send({ data: logs })
  })

  // GET /v1/users/:userId/reminders/suggestions
  app.get("/:userId/reminders/suggestions", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const suggestions = await reminderService.getSuggestions(userId)
    return reply.send({ data: suggestions })
  })
}

export default remindersRoutes
