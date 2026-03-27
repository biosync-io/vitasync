import { apiLogs, getDb } from "@biosync-io/db"
import { and, avg, count, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm"
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"

const apiLogsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/api-logs
   * Returns paginated API request logs with optional filters.
   */
  app.get("/", async (request, reply) => {
    const query = z
      .object({
        method: z.string().optional(),
        status: z.coerce.number().int().optional(),
        endpoint: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(25),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const db = getDb()
    const conditions: SQL[] = []

    if (query.method) conditions.push(eq(apiLogs.method, query.method.toUpperCase()))
    if (query.status) conditions.push(eq(apiLogs.statusCode, query.status))
    if (query.endpoint) conditions.push(sql`${apiLogs.endpoint} LIKE ${"%" + query.endpoint + "%"}`)
    if (query.from) conditions.push(gte(apiLogs.createdAt, new Date(query.from)))
    if (query.to) conditions.push(lte(apiLogs.createdAt, new Date(query.to)))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(apiLogs)
        .where(where)
        .orderBy(desc(apiLogs.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ total: count() })
        .from(apiLogs)
        .where(where),
    ])

    return reply.send({ data: rows, total: countRows[0]?.total ?? 0 })
  })

  /**
   * GET /v1/api-logs/stats
   * Returns aggregate statistics for the API logs.
   */
  app.get("/stats", async (_request, reply) => {
    const db = getDb()
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [totals, last24h, errorCount, avgDuration] = await Promise.all([
      db.select({ total: count() }).from(apiLogs),
      db
        .select({ total: count() })
        .from(apiLogs)
        .where(gte(apiLogs.createdAt, since24h)),
      db
        .select({ total: count() })
        .from(apiLogs)
        .where(gte(apiLogs.statusCode, 400)),
      db
        .select({ avg: avg(apiLogs.durationMs) })
        .from(apiLogs),
    ])

    const totalCalls = totals[0]?.total ?? 0
    const errors = errorCount[0]?.total ?? 0
    const errorRate = totalCalls > 0 ? ((errors / totalCalls) * 100).toFixed(1) : "0.0"

    return reply.send({
      totalCalls,
      errorRate: `${errorRate}%`,
      errorCount: errors,
      avgDurationMs: Math.round(Number(avgDuration[0]?.avg ?? 0)),
      last24h: last24h[0]?.total ?? 0,
    })
  })
}

export default apiLogsRoutes
