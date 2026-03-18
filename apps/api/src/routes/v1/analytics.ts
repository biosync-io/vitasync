import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { UserService } from "../../services/user.service.js"
import { buildLLMContext, computeCorrelations, detectAnomalies } from "@biosync-io/analytics"

const userService = new UserService()

/**
 * Analytics routes — LLM-Ready Context + Enhanced Correlation + Anomaly Detection.
 * These complement the existing /anomalies and /correlations routes with
 * higher-level, AI-optimized endpoints.
 */
const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/analytics/context — LLM-ready biological context
  app.get("/:userId/analytics/context", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const context = await buildLLMContext(userId)
    return reply.send({ data: context })
  })

  // POST /v1/users/:userId/analytics/correlations — auto-discover correlations
  app.post("/:userId/analytics/correlations", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z.object({ days: z.coerce.number().min(7).max(365).default(90) }).parse(request.body ?? {})
    const results = await computeCorrelations(userId, body.days)
    return reply.send({ data: results, count: results.length })
  })

  // POST /v1/users/:userId/analytics/anomalies — enhanced anomaly detection
  app.post("/:userId/analytics/anomalies", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z.object({ lookbackDays: z.coerce.number().min(1).max(30).default(1) }).parse(request.body ?? {})
    const results = await detectAnomalies(userId, body)
    return reply.send({ data: results, count: results.length })
  })
}

export default analyticsRoutes
