import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { FastifyAdapter } from "@bull-board/fastify"
import type { FastifyInstance } from "fastify"
import fp from "fastify-plugin"
import { getNotificationQueue, getSyncQueue, getWebhookQueue } from "../queues/sync.js"

/**
 * Bull Board queue monitoring UI.
 * Accessible at /admin/queues (requires admin API key scope).
 *
 * Bull Board provides a real-time dashboard for inspecting BullMQ queues:
 * - Job counts (waiting, active, completed, failed, delayed)
 * - Job details and payloads
 * - Retry / clean failed jobs
 */
export const bullBoardPlugin = fp(async (app: FastifyInstance) => {
  const serverAdapter = new FastifyAdapter()
  serverAdapter.setBasePath("/admin/queues")

  createBullBoard({
    queues: [
      new BullMQAdapter(getSyncQueue()),
      new BullMQAdapter(getWebhookQueue()),
      new BullMQAdapter(getNotificationQueue()),
    ],
    serverAdapter,
  })

  // Protect with admin scope check
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/admin/queues")) return

    if (!request.apiKeyScopes?.includes("admin")) {
      return reply.code(403).send({
        code: "FORBIDDEN",
        message: "Admin scope required to access queue dashboard",
      })
    }
  })

  await app.register(serverAdapter.registerPlugin(), { prefix: "/admin/queues", logLevel: "warn" })

  app.log.info("Bull Board queue dashboard available at /admin/queues")
})
