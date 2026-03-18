import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { NotificationService } from "../../services/notification.service.js"
import { UserService } from "../../services/user.service.js"

const notificationService = new NotificationService()
const userService = new UserService()

const notificationsRoutes: FastifyPluginAsync = async (app) => {
  // ─── Channel CRUD ───────────────────────────────────────────────

  // GET /v1/users/:userId/notifications/channels
  app.get("/:userId/notifications/channels", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const channels = await notificationService.listChannels(userId)
    return reply.send({ data: channels })
  })

  // POST /v1/users/:userId/notifications/channels
  app.post("/:userId/notifications/channels", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        channelType: z.enum(["discord", "slack", "teams", "email", "push", "ntfy", "webhook"]),
        label: z.string().min(1).max(100),
        config: z.record(z.unknown()),
        enabled: z.boolean().default(true),
      })
      .parse(request.body)

    const channel = await notificationService.createChannel({ ...body, userId })
    return reply.status(201).send({ data: channel })
  })

  // PUT /v1/users/:userId/notifications/channels/:channelId
  app.put("/:userId/notifications/channels/:channelId", async (request, reply) => {
    const { userId, channelId } = z
      .object({ userId: z.string().uuid(), channelId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        label: z.string().min(1).max(100).optional(),
        config: z.record(z.unknown()).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(request.body)

    const channel = await notificationService.updateChannel(channelId, userId, body)
    if (!channel) return reply.status(404).send({ code: "NOT_FOUND", message: "Channel not found" })
    return reply.send({ data: channel })
  })

  // DELETE /v1/users/:userId/notifications/channels/:channelId
  app.delete("/:userId/notifications/channels/:channelId", async (request, reply) => {
    const { userId, channelId } = z
      .object({ userId: z.string().uuid(), channelId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await notificationService.deleteChannel(channelId, userId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Channel not found" })
    return reply.status(204).send()
  })

  // POST /v1/users/:userId/notifications/channels/:channelId/test
  app.post("/:userId/notifications/channels/:channelId/test", async (request, reply) => {
    const { userId, channelId } = z
      .object({ userId: z.string().uuid(), channelId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const channel = await notificationService.getChannel(channelId, userId)
    if (!channel) return reply.status(404).send({ code: "NOT_FOUND", message: "Channel not found" })

    // Enqueue a test notification through the worker
    await request.server.notificationQueue.add("test-notification", {
      userId,
      workspaceId: request.workspaceId,
      channelId,
      title: "Test Notification",
      body: "This is a test notification from VitaSync.",
      severity: "info",
      category: "system",
    })

    return reply.send({ message: "Test notification queued" })
  })

  // ─── Rule CRUD ──────────────────────────────────────────────────

  // GET /v1/users/:userId/notifications/rules
  app.get("/:userId/notifications/rules", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const rules = await notificationService.listRules(userId)
    return reply.send({ data: rules })
  })

  // POST /v1/users/:userId/notifications/rules
  app.post("/:userId/notifications/rules", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        name: z.string().min(1).max(100),
        categories: z.array(z.enum(["anomaly", "goal", "achievement", "sync", "report", "system", "insight"])),
        minSeverity: z.enum(["info", "warning", "critical"]).default("info"),
        channelIds: z.array(z.string().uuid()),
        enabled: z.boolean().default(true),
      })
      .parse(request.body)

    const rule = await notificationService.createRule({ ...body, userId })
    return reply.status(201).send({ data: rule })
  })

  // PUT /v1/users/:userId/notifications/rules/:ruleId
  app.put("/:userId/notifications/rules/:ruleId", async (request, reply) => {
    const { userId, ruleId } = z
      .object({ userId: z.string().uuid(), ruleId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        categories: z.array(z.string()).optional(),
        minSeverity: z.enum(["info", "warning", "critical"]).optional(),
        channelIds: z.array(z.string().uuid()).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(request.body)

    const rule = await notificationService.updateRule(ruleId, userId, body)
    if (!rule) return reply.status(404).send({ code: "NOT_FOUND", message: "Rule not found" })
    return reply.send({ data: rule })
  })

  // DELETE /v1/users/:userId/notifications/rules/:ruleId
  app.delete("/:userId/notifications/rules/:ruleId", async (request, reply) => {
    const { userId, ruleId } = z
      .object({ userId: z.string().uuid(), ruleId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await notificationService.deleteRule(ruleId, userId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Rule not found" })
    return reply.status(204).send()
  })

  // ─── Delivery Logs ─────────────────────────────────────────────

  // GET /v1/users/:userId/notifications/logs
  app.get("/:userId/notifications/logs", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({ limit: z.coerce.number().min(1).max(200).default(50) })
      .parse(request.query)

    const logs = await notificationService.listLogs(userId, query)
    return reply.send({ data: logs })
  })
}

export default notificationsRoutes
