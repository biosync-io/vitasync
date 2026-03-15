import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { requireScope } from "../../plugins/auth.js"
import { WebhookService } from "../../services/webhook.service.js"

const webhookService = new WebhookService()

const WebhookEventEnum = z.enum([
  "sync.completed",
  "sync.failed",
  "connection.created",
  "connection.disconnected",
  "user.created",
  "user.deleted",
])

const webhooksRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/webhooks
  app.post("/", { preHandler: [requireScope("admin")] }, async (request, reply) => {
    const body = z
      .object({
        url: z.string().url(),
        secret: z.string().min(16, "Secret must be at least 16 characters"),
        events: z.array(WebhookEventEnum).min(1),
        description: z.string().max(255).optional(),
      })
      .parse(request.body)

    const webhook = await webhookService.create({
      workspaceId: request.workspaceId,
      ...body,
    })
    return reply.status(201).send(webhook)
  })

  // GET /v1/webhooks
  app.get("/", async (request, reply) => {
    const list = await webhookService.list(request.workspaceId)
    return reply.send(list)
  })

  // GET /v1/webhooks/:webhookId
  app.get("/:webhookId", async (request, reply) => {
    const { webhookId } = z.object({ webhookId: z.string().uuid() }).parse(request.params)
    const webhook = await webhookService.getById(webhookId, request.workspaceId)
    if (!webhook) return reply.status(404).send({ code: "NOT_FOUND", message: "Webhook not found" })
    return reply.send(webhook)
  })

  // PATCH /v1/webhooks/:webhookId
  app.patch("/:webhookId", { preHandler: [requireScope("admin")] }, async (request, reply) => {
    const { webhookId } = z.object({ webhookId: z.string().uuid() }).parse(request.params)
    const body = z
      .object({
        url: z.string().url().optional(),
        events: z.array(WebhookEventEnum).optional(),
        isActive: z.boolean().optional(),
        description: z.string().max(255).optional(),
      })
      .parse(request.body)

    const webhook = await webhookService.update(webhookId, request.workspaceId, body as never)
    if (!webhook) return reply.status(404).send({ code: "NOT_FOUND", message: "Webhook not found" })
    return reply.send(webhook)
  })

  // DELETE /v1/webhooks/:webhookId
  app.delete("/:webhookId", { preHandler: [requireScope("admin")] }, async (request, reply) => {
    const { webhookId } = z.object({ webhookId: z.string().uuid() }).parse(request.params)
    const ok = await webhookService.delete(webhookId, request.workspaceId)
    if (!ok) return reply.status(404).send({ code: "NOT_FOUND", message: "Webhook not found" })
    return reply.status(204).send()
  })

  // GET /v1/webhooks/:webhookId/deliveries
  app.get("/:webhookId/deliveries", async (request, reply) => {
    const { webhookId } = z.object({ webhookId: z.string().uuid() }).parse(request.params)
    const deliveries = await webhookService.listDeliveries(webhookId, request.workspaceId)
    return reply.send(deliveries)
  })
}

export default webhooksRoutes
