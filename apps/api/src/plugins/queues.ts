import type { Queue } from "bullmq"
import type { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import { getNotificationQueue } from "../queues/sync.js"

declare module "fastify" {
  interface FastifyInstance {
    notificationQueue: Queue
  }
}

/**
 * Exposes BullMQ queues on the Fastify instance so route handlers
 * can enqueue jobs via `request.server.notificationQueue`.
 */
const queuesPlugin: FastifyPluginAsync = async (app) => {
  app.decorate("notificationQueue", getNotificationQueue())
}

export default fp(queuesPlugin)
