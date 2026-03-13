import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { HealthDataService } from "../../services/health-data.service.js"
import type { TimeseriesBucket } from "../../services/health-data.service.js"

const healthDataService = new HealthDataService()

const healthDataRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/health — query health data with cursor-based pagination
  app.get("/:userId/health", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)

    const query = z
      .object({
        metricType: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.coerce.number().min(1).max(1000).default(100),
        offset: z.coerce.number().min(0).default(0),
        cursor: z.string().optional(),
      })
      .parse(request.query)

    const result = await healthDataService.query({
      userId,
      workspaceId: request.workspaceId,
      metricType: query.metricType as never,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      offset: query.cursor ? 0 : query.offset,
      cursor: query.cursor,
    })

    return reply.send(result)
  })

  // GET /v1/users/:userId/health/summary — counts per metric type
  app.get("/:userId/health/summary", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const summary = await healthDataService.summary(userId)
    return reply.send(summary)
  })

  // GET /v1/users/:userId/health/timeseries — time-bucketed aggregation
  app.get("/:userId/health/timeseries", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)

    const query = z
      .object({
        metricType: z.string(),
        from: z.string().datetime(),
        to: z.string().datetime(),
        bucket: z.enum(["minute", "hour", "day", "week", "month"]).default("day"),
      })
      .parse(request.query)

    const points = await healthDataService.timeseries({
      userId,
      metricType: query.metricType as never,
      from: new Date(query.from),
      to: new Date(query.to),
      bucket: query.bucket as TimeseriesBucket,
    })

    return reply.send({ data: points, bucket: query.bucket })
  })

  // GET /v1/users/:userId/health/daily-summaries — per-day totals per metric
  app.get("/:userId/health/daily-summaries", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)

    const query = z
      .object({
        from: z.string().datetime(),
        to: z.string().datetime(),
        metricTypes: z
          .string()
          .optional()
          .transform((v) => (v ? v.split(",") : undefined)),
      })
      .parse(request.query)

    const summaries = await healthDataService.dailySummaries({
      userId,
      metricTypes: query.metricTypes as never,
      from: new Date(query.from),
      to: new Date(query.to),
    })

    return reply.send({ data: summaries })
  })

  // DELETE /v1/users/:userId/health — GDPR right-to-erasure
  app.delete("/:userId/health", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const count = await healthDataService.deleteForUser(userId, request.workspaceId)
    return reply.send({ deleted: count })
  })
}

export default healthDataRoutes

