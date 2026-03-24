import { getDb, inboundWebhookLogs } from "@biosync-io/db"
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm"
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"

const inboundWebhookLogsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/inbound-webhook-logs
  app.get("/", async (request, reply) => {
    const query = z
      .object({
        providerId: z.string().optional(),
        status: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(25),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const db = getDb()
    const conditions: SQL[] = []

    if (query.providerId) conditions.push(eq(inboundWebhookLogs.providerId, query.providerId))
    if (query.status) conditions.push(eq(inboundWebhookLogs.status, query.status))
    if (query.from) conditions.push(gte(inboundWebhookLogs.createdAt, new Date(query.from)))
    if (query.to) conditions.push(lte(inboundWebhookLogs.createdAt, new Date(query.to)))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(inboundWebhookLogs)
        .where(where)
        .orderBy(desc(inboundWebhookLogs.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ total: count() })
        .from(inboundWebhookLogs)
        .where(where),
    ])

    return reply.send({ data: rows, total: countRows[0]?.total ?? 0 })
  })
}

export default inboundWebhookLogsRoutes
