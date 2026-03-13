import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { providerRegistry } from "@biosync-io/provider-core"
import { ConnectionService } from "../../services/connection.service.js"
import { requireScope } from "../../plugins/auth.js"

const connectionService = new ConnectionService()

const connectionsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/connections
  app.get("/:userId/connections", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const connections = await connectionService.list(userId, request.workspaceId)
    return reply.send(connections)
  })

  // DELETE /v1/users/:userId/connections/:connectionId
  app.delete(
    "/:userId/connections/:connectionId",
    { preHandler: [requireScope("write")] },
    async (request, reply) => {
      const { connectionId } = z
        .object({ userId: z.string().uuid(), connectionId: z.string().uuid() })
        .parse(request.params)
      const ok = await connectionService.disconnect(connectionId, request.workspaceId)
      if (!ok) return reply.status(404).send({ code: "NOT_FOUND", message: "Connection not found" })
      return reply.status(204).send()
    },
  )

  // POST /v1/users/:userId/connections/:connectionId/sync
  // Enqueues an immediate sync job for a connection
  app.post(
    "/:userId/connections/:connectionId/sync",
    { preHandler: [requireScope("write")] },
    async (request, reply) => {
      const { userId, connectionId } = z
        .object({ userId: z.string().uuid(), connectionId: z.string().uuid() })
        .parse(request.params)

      // Late import to avoid circular deps - worker queue publish
      const { syncQueue } = await import("../../queues/sync.js")
      await syncQueue.add("sync", { connectionId, userId, workspaceId: request.workspaceId }, {
        jobId: `sync:${connectionId}:${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      })

      return reply.status(202).send({ message: "Sync job enqueued", connectionId })
    },
  )
}

export default connectionsRoutes
