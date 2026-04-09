import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { Redis } from "ioredis"
import { config } from "../../config.js"
import { UserService } from "../../services/user.service.js"
import { requireSelf } from "../../plugins/auth.js"

const userService = new UserService()

/**
 * SSE endpoint for real-time in-app notification delivery.
 *
 * Uses Redis Pub/Sub: the notification worker publishes to
 * `notifications:{userId}` after creating an in-app notification.
 * This route subscribes and streams events to connected clients.
 */
const notificationStreamRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/notifications/stream
  app.get("/:userId/notifications/stream", { preHandler: [requireSelf()] }, async (request, reply) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
    })

    // Send initial connection event
    reply.raw.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`)

    // Subscribe to Redis channel for this user
    const subscriber = new Redis(config.REDIS_URL, {
      enableReadyCheck: false,
      lazyConnect: true,
    })
    await subscriber.connect()

    const channel = `notifications:${userId}`
    await subscriber.subscribe(channel)

    subscriber.on("message", (_ch: string, message: string) => {
      reply.raw.write(`data: ${message}\n\n`)
    })

    // Heartbeat to detect broken connections
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n")
    }, 30_000)

    // Cleanup on disconnect
    const cleanup = async () => {
      clearInterval(heartbeat)
      try {
        await subscriber.unsubscribe(channel)
        await subscriber.quit()
      } catch {
        // Connection may already be closed
      }
    }

    request.raw.on("close", cleanup)
    request.raw.on("error", cleanup)

    // Prevent Fastify from closing the response
    await reply.hijack()
  })
}

export default notificationStreamRoutes
