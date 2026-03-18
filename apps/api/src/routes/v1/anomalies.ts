import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { AnomalyDetectionService } from "../../services/anomaly-detection.service.js"
import { UserService } from "../../services/user.service.js"

const anomalyService = new AnomalyDetectionService()
const userService = new UserService()

const anomaliesRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/anomalies
  app.get("/:userId/anomalies", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        severity: z.string().optional(),
        status: z.string().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(request.query)

    const anomalies = await anomalyService.list(userId, query)
    return reply.send({ data: anomalies })
  })

  // POST /v1/users/:userId/anomalies/detect — trigger anomaly detection
  app.post("/:userId/anomalies/detect", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const anomalies = await anomalyService.detectAnomalies(userId)
    return reply.send({ data: anomalies, count: anomalies.length })
  })

  // POST /v1/users/:userId/anomalies/:anomalyId/acknowledge
  app.post("/:userId/anomalies/:anomalyId/acknowledge", async (request, reply) => {
    const { userId, anomalyId } = z
      .object({ userId: z.string().uuid(), anomalyId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const anomaly = await anomalyService.acknowledge(anomalyId, userId)
    if (!anomaly) return reply.status(404).send({ code: "NOT_FOUND", message: "Anomaly not found" })
    return reply.send(anomaly)
  })

  // POST /v1/users/:userId/anomalies/:anomalyId/dismiss
  app.post("/:userId/anomalies/:anomalyId/dismiss", async (request, reply) => {
    const { userId, anomalyId } = z
      .object({ userId: z.string().uuid(), anomalyId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const anomaly = await anomalyService.dismiss(anomalyId, userId)
    if (!anomaly) return reply.status(404).send({ code: "NOT_FOUND", message: "Anomaly not found" })
    return reply.send(anomaly)
  })
}

export default anomaliesRoutes
