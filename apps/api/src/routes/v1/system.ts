import type { FastifyPluginAsync } from "fastify"
import { Redis } from "ioredis"
import { config } from "../../config.js"
import { getSyncQueue, getWebhookQueue, getNotificationQueue } from "../../queues/sync.js"

interface ComponentHealth {
  name: string
  type: string
  status: "healthy" | "degraded" | "down"
  latencyMs: number | null
  error: string | null
  details?: Record<string, unknown>
}

interface DeploymentInfo {
  name: string
  replicas: number
  readyReplicas: number
  unavailableReplicas: number
}

const startedAt = Date.now()

/**
 * Query the in-cluster Kubernetes API for deployment replica counts.
 * Returns null when not running in K8s (Docker Compose, local dev).
 */
async function getK8sDeployments(): Promise<DeploymentInfo[] | null> {
  try {
    const { readFileSync } = await import("node:fs")
    const token = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8")
    const namespace = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/namespace", "utf8").trim()
    const ca = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt", "utf8")

    const res = await fetch(
      `https://kubernetes.default.svc/apis/apps/v1/namespaces/${namespace}/deployments`,
      {
        headers: { Authorization: `Bearer ${token}` },
        // Node 18+ fetch doesn't support custom CA directly;
        // the K8s API cert is trusted via the mounted ca.crt in most clusters.
        // @ts-expect-error — Node fetch dispatcher option
        dispatcher: undefined,
      },
    )
    if (!res.ok) return null

    const data = (await res.json()) as {
      items: Array<{
        metadata: { name: string }
        status: {
          replicas?: number
          readyReplicas?: number
          unavailableReplicas?: number
        }
      }>
    }

    return data.items.map((d) => ({
      name: d.metadata.name,
      replicas: d.status.replicas ?? 0,
      readyReplicas: d.status.readyReplicas ?? 0,
      unavailableReplicas: d.status.unavailableReplicas ?? 0,
    }))
  } catch {
    // Not running in K8s or no permissions — return null
    return null
  }
}

const systemRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/system/status
   * Returns health status of all system components:
   * PostgreSQL, Redis, BullMQ queues, and general system info.
   */
  app.get("/status", async (_request, reply) => {
    const components: ComponentHealth[] = []

    // ── PostgreSQL ──────────────────────────────────────────────
    const pgStart = Date.now()
    try {
      const { getDb } = await import("@biosync-io/db")
      const { sql: rawSql } = await import("drizzle-orm")
      const db = getDb()
      await db.execute(rawSql`SELECT 1`)
      components.push({
        name: "PostgreSQL",
        type: "database",
        status: "healthy",
        latencyMs: Date.now() - pgStart,
        error: null,
      })
    } catch (err) {
      components.push({
        name: "PostgreSQL",
        type: "database",
        status: "down",
        latencyMs: Date.now() - pgStart,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // ── Redis ───────────────────────────────────────────────────
    const redisStart = Date.now()
    let redisConnection: Redis | null = null
    try {
      redisConnection = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
      })
      await redisConnection.connect()
      const pong = await redisConnection.ping()
      const info = await redisConnection.info("server")
      const versionMatch = info.match(/redis_version:(\S+)/)
      components.push({
        name: "Redis",
        type: "cache",
        status: pong === "PONG" ? "healthy" : "degraded",
        latencyMs: Date.now() - redisStart,
        error: null,
        details: {
          version: versionMatch?.[1] ?? "unknown",
        },
      })
    } catch (err) {
      components.push({
        name: "Redis",
        type: "cache",
        status: "down",
        latencyMs: Date.now() - redisStart,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      if (redisConnection) {
        redisConnection.disconnect()
      }
    }

    // ── BullMQ Queues ───────────────────────────────────────────
    const queueChecks = [
      { name: "sync", getQueue: getSyncQueue },
      { name: "webhooks", getQueue: getWebhookQueue },
      { name: "notifications", getQueue: getNotificationQueue },
    ]

    for (const { name, getQueue } of queueChecks) {
      try {
        const queue = getQueue()
        const [waiting, active, completed, failed, delayed, repeatableJobs] =
          await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
            queue.getRepeatableJobs(),
          ])

        components.push({
          name: `Queue: ${name}`,
          type: "queue",
          status: "healthy",
          latencyMs: null,
          error: null,
          details: {
            waiting,
            active,
            completed,
            failed,
            delayed,
            repeatableJobs: repeatableJobs.length,
          },
        })
      } catch (err) {
        components.push({
          name: `Queue: ${name}`,
          type: "queue",
          status: "down",
          latencyMs: null,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // ── Aggregate status ────────────────────────────────────────
    const healthy = components.filter((c) => c.status === "healthy").length
    const degraded = components.filter((c) => c.status === "degraded").length
    const down = components.filter((c) => c.status === "down").length
    const total = components.length

    const overallStatus =
      down > 0 ? "degraded" : degraded > 0 ? "degraded" : "operational"

    const uptimeMs = Date.now() - startedAt
    const uptimeSeconds = Math.floor(uptimeMs / 1000)
    const hours = Math.floor(uptimeSeconds / 3600)
    const minutes = Math.floor((uptimeSeconds % 3600) / 60)

    // ── Kubernetes deployment info (if running in K8s) ─────────
    const deployments = await getK8sDeployments()

    return reply.send({
      status: overallStatus,
      version: process.env.APP_VERSION || "0.2.0",
      environment: config.NODE_ENV,
      uptime: `${hours}h ${minutes}m`,
      uptimeMs,
      timestamp: new Date().toISOString(),
      hostname: process.env.HOSTNAME ?? null,
      summary: { healthy, degraded, down, total },
      components,
      deployments,
    })
  })
}

export default systemRoutes
