import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { createCommand, createQuery } from "@biosync-io/cqrs"
import { HealthCommands } from "../../cqrs/commands/health.commands.js"
import { HealthQueries } from "../../cqrs/queries/health.queries.js"
import { requireScope, requireSelf } from "../../plugins/auth.js"

/**
 * CQRS-powered health endpoints.
 *
 * These run alongside the existing health-data routes to allow gradual
 * migration. Reads hit the denormalized projection tables; writes go
 * through the command bus → event-sourced service pipeline.
 */
const healthCqrsRoutes: FastifyPluginAsync = async (app) => {
  // ── Commands ───────────────────────────────────────────────────

  // POST /v1/cqrs/health/metrics — record a single metric via command bus
  app.post(
    "/health/metrics",
    { preHandler: [requireScope("write")] },
    async (request, reply) => {
      const body = z
        .object({
          connectionId: z.string().uuid(),
          providerId: z.string(),
          metricType: z.string(),
          recordedAt: z.string().datetime(),
          value: z.number(),
          unit: z.string().optional(),
          source: z.string().optional(),
        })
        .parse(request.body)

      const command = createCommand(
        HealthCommands.RECORD_METRIC,
        {
          ...body,
          recordedAt: new Date(body.recordedAt),
        },
        {
          userId: request.authenticatedUserId ?? "",
          workspaceId: request.workspaceId,
          requestId: request.id,
          timestamp: new Date().toISOString(),
        },
      )

      const result = await app.commandBus.dispatch(command)
      return reply.status(201).send(result)
    },
  )

  // ── Queries ────────────────────────────────────────────────────

  // GET /v1/cqrs/health/score/:userId — latest health score from projection
  app.get(
    "/health/score/:userId",
    { preHandler: [requireSelf()] },
    async (request, reply) => {
      const { userId } = z
        .object({ userId: z.string().uuid() })
        .parse(request.params)

      const query = createQuery(
        HealthQueries.GET_LATEST_SCORE,
        { userId },
        {
          userId: request.authenticatedUserId ?? userId,
          workspaceId: request.workspaceId,
          requestId: request.id,
        },
      )

      const result = await app.queryBus.dispatch(query)

      if (!result) {
        return reply
          .status(404)
          .send({ code: "NOT_FOUND", message: "No health score found" })
      }

      return reply.send(result)
    },
  )

  // GET /v1/cqrs/health/summary/:userId — daily summary from projection
  app.get(
    "/health/summary/:userId",
    { preHandler: [requireSelf()] },
    async (request, reply) => {
      const { userId } = z
        .object({ userId: z.string().uuid() })
        .parse(request.params)

      const queryParams = z
        .object({ date: z.string().date().optional() })
        .parse(request.query)

      const date = queryParams.date ?? new Date().toISOString().slice(0, 10)

      const query = createQuery(
        HealthQueries.GET_DAILY_SUMMARY,
        { userId, date },
        {
          userId: request.authenticatedUserId ?? userId,
          workspaceId: request.workspaceId,
          requestId: request.id,
        },
      )

      const result = await app.queryBus.dispatch(query)

      if (!result) {
        return reply
          .status(404)
          .send({ code: "NOT_FOUND", message: "No daily summary found" })
      }

      return reply.send(result)
    },
  )

  // GET /v1/cqrs/health/readiness/:userId — current readiness from projection
  app.get(
    "/health/readiness/:userId",
    { preHandler: [requireSelf()] },
    async (request, reply) => {
      const { userId } = z
        .object({ userId: z.string().uuid() })
        .parse(request.params)

      const query = createQuery(
        HealthQueries.GET_READINESS,
        { userId },
        {
          userId: request.authenticatedUserId ?? userId,
          workspaceId: request.workspaceId,
          requestId: request.id,
        },
      )

      const result = await app.queryBus.dispatch(query)

      if (!result) {
        return reply
          .status(404)
          .send({ code: "NOT_FOUND", message: "No readiness data found" })
      }

      return reply.send(result)
    },
  )
}

export default healthCqrsRoutes
