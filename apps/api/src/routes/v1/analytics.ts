import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { UserService } from "../../services/user.service.js"
import {
  buildLLMContext,
  computeCorrelations,
  detectAnomalies,
  predictRecovery,
  analyzeCircadianRhythm,
  computeMetabolicEfficiency,
  computeStressResilience,
} from "@biosync-io/analytics"

const userService = new UserService()

/**
 * Analytics routes — LLM-Ready Context, Correlations, Anomalies, and
 * proprietary engines (Recovery, Circadian, Metabolic, Stress Resilience).
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

  // GET /v1/users/:userId/analytics/recovery — recovery prediction
  app.get("/:userId/analytics/recovery", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const prediction = await predictRecovery(userId)
    return reply.send({ data: prediction })
  })

  // GET /v1/users/:userId/analytics/circadian — circadian rhythm analysis
  app.get("/:userId/analytics/circadian", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const analysis = await analyzeCircadianRhythm(userId)
    return reply.send({ data: analysis })
  })

  // GET /v1/users/:userId/analytics/metabolic — metabolic efficiency score
  app.get("/:userId/analytics/metabolic", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const result = await computeMetabolicEfficiency(userId, undefined, owner.gender)
    return reply.send({ data: result })
  })

  // GET /v1/users/:userId/analytics/resilience — stress resilience index
  app.get("/:userId/analytics/resilience", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const result = await computeStressResilience(userId)
    return reply.send({ data: result })
  })
}

export default analyticsRoutes
