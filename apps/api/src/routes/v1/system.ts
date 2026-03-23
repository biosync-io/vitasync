import { getDb } from "@biosync-io/db"
import { providerRegistry } from "@biosync-io/provider-core"
import type { FastifyPluginAsync } from "fastify"
import { sql } from "drizzle-orm"
import {
  getSyncQueue,
  getWebhookQueue,
  getNotificationQueue,
  getAnalyticsQueue,
  getReportsQueue,
  getRedisConnection,
} from "../../queues/sync.js"

interface ComponentStatus {
  name: string
  status: "healthy" | "degraded" | "down"
  latencyMs?: number
  details?: Record<string, unknown>
}

interface QueueStatus {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: boolean
}

const systemRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/system/status
   * Returns health status of all infrastructure components.
   */
  app.get("/status", async (_request, reply) => {
    const components: ComponentStatus[] = []
    const queues: QueueStatus[] = []

    // ── Database check ─────────────────────────────────────────
    try {
      const start = Date.now()
      const db = getDb()
      await db.execute(sql`SELECT 1`)
      components.push({
        name: "PostgreSQL",
        status: "healthy",
        latencyMs: Date.now() - start,
        details: { type: "database" },
      })
    } catch (err) {
      components.push({
        name: "PostgreSQL",
        status: "down",
        details: { type: "database", error: err instanceof Error ? err.message : String(err) },
      })
    }

    // ── Redis check ────────────────────────────────────────────
    try {
      const start = Date.now()
      const redis = getRedisConnection()
      const pong = await redis.ping()
      const info = await redis.info("memory")
      const usedMemory = info.match(/used_memory_human:(.+)/)?.[1]?.trim()
      components.push({
        name: "Redis",
        status: pong === "PONG" ? "healthy" : "degraded",
        latencyMs: Date.now() - start,
        details: { type: "cache", usedMemory },
      })
    } catch (err) {
      components.push({
        name: "Redis",
        status: "down",
        details: { type: "cache", error: err instanceof Error ? err.message : String(err) },
      })
    }

    // ── BullMQ queue stats ─────────────────────────────────────
    const queueMap = {
      sync: getSyncQueue,
      webhooks: getWebhookQueue,
      notifications: getNotificationQueue,
      analytics: getAnalyticsQueue,
      reports: getReportsQueue,
    }

    for (const [name, getQueue] of Object.entries(queueMap)) {
      try {
        const q = getQueue()
        const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
          q.getWaitingCount(),
          q.getActiveCount(),
          q.getCompletedCount(),
          q.getFailedCount(),
          q.getDelayedCount(),
          q.isPaused(),
        ])
        queues.push({ name, waiting, active, completed, failed, delayed, paused })
      } catch {
        queues.push({ name, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: false })
      }
    }

    // Determine overall BullMQ status
    const totalFailed = queues.reduce((s, q) => s + q.failed, 0)
    const anyPaused = queues.some((q) => q.paused)
    components.push({
      name: "BullMQ",
      status: anyPaused ? "degraded" : "healthy",
      details: {
        type: "queue",
        totalQueues: queues.length,
        totalWaiting: queues.reduce((s, q) => s + q.waiting, 0),
        totalActive: queues.reduce((s, q) => s + q.active, 0),
        totalFailed,
      },
    })

    // ── Registered providers ───────────────────────────────────
    const providerDefs = providerRegistry.listDefinitions()
    components.push({
      name: "Providers",
      status: providerDefs.length > 0 ? "healthy" : "degraded",
      details: {
        type: "providers",
        count: providerDefs.length,
        registered: providerDefs.map((d) => d.id),
      },
    })

    // ── Overall status ─────────────────────────────────────────
    const overallStatus = components.some((c) => c.status === "down")
      ? "down"
      : components.some((c) => c.status === "degraded")
        ? "degraded"
        : "healthy"

    return reply.send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.0",
      components,
      queues,
    })
  })
}

export default systemRoutes
