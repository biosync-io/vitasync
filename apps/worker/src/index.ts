import { closeDb, initDb } from "@biosync-io/db"
import { registerFitbitProvider } from "@biosync-io/provider-fitbit"
import { registerGarminProvider } from "@biosync-io/provider-garmin"
import { registerStravaProvider } from "@biosync-io/provider-strava"
import { registerWhoopProvider } from "@biosync-io/provider-whoop"
import { registerWithingsProvider } from "@biosync-io/provider-withings"
import { registerDiscordChannel } from "@biosync-io/notification-discord"
import { registerSlackChannel } from "@biosync-io/notification-slack"
import { registerTeamsChannel } from "@biosync-io/notification-teams"
import { registerEmailChannel } from "@biosync-io/notification-email"
import { registerPushChannel } from "@biosync-io/notification-push"
import { registerNtfyChannel } from "@biosync-io/notification-ntfy"
import { registerWebhookNotificationChannel } from "@biosync-io/notification-webhook"
import { Queue, Worker } from "bullmq"
import { Redis } from "ioredis"
import { getConfig } from "./config.js"
import { processAnalyticsJob } from "./processors/analytics.processor.js"
import { processNotificationJob } from "./processors/notification.processor.js"
import { processReportJob } from "./processors/report.processor.js"
import { processSyncJob } from "./processors/sync.processor.js"
import { processWebhookJob } from "./processors/webhook.processor.js"
import { startPeriodicScheduler } from "./schedulers/periodic-sync.js"

type QueueName = "sync" | "analytics" | "webhooks" | "notifications" | "reports"

async function main() {
  const config = getConfig()
  const enabledQueues = new Set(
    config.WORKER_QUEUES.split(",").map((q) => q.trim().toLowerCase()) as QueueName[],
  )

  // Register data providers (needed by sync + analytics workers)
  if (enabledQueues.has("sync") || enabledQueues.has("analytics")) {
    registerFitbitProvider()
    registerGarminProvider()
    registerStravaProvider()
    registerWhoopProvider()
    registerWithingsProvider()
  }

  // Register notification channels (needed by notification worker)
  if (enabledQueues.has("notifications")) {
    registerDiscordChannel()
    registerSlackChannel()
    registerTeamsChannel()
    registerEmailChannel()
    registerPushChannel()
    registerNtfyChannel()
    registerWebhookNotificationChannel()
  }

  // Connect to the database
  await initDb(config.DATABASE_URL)

  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const workers: Worker[] = []
  let stopScheduler: (() => Promise<void>) | null = null

  // Notification queue — used to enqueue failure alerts from sync worker
  const notificationQueue = new Queue("notifications", { connection })

  // ── Sync worker ────────────────────────────────────────────────
  if (enabledQueues.has("sync")) {
    const syncWorker = new Worker("sync", processSyncJob, {
      connection,
      concurrency: 5,
    })
    workers.push(syncWorker)

    syncWorker.on("completed", (job) => {
      console.info(`[sync] Job ${job.id} completed`)
    })

    syncWorker.on("failed", (job, err) => {
      const providerId = job?.data?.providerId ?? "unknown"
      console.error(`[sync] Job ${job?.id} failed (${providerId}): ${err.message}`)
      if (job?.data?.userId) {
        const providerLabel = providerId.charAt(0).toUpperCase() + providerId.slice(1)
        notificationQueue.add("sync-failure", {
          userId: job.data.userId,
          workspaceId: job.data.workspaceId ?? "",
          title: `${providerLabel} Sync Failed`,
          body: `${providerLabel} sync failed: ${err.message.slice(0, 200)}`,
          severity: "warning",
          category: "sync",
        }).catch((e) => console.error("[sync] Failed to enqueue failure notification:", e))
      }
    })

    // Start periodic sync scheduler
    const syncQueue = new Queue("sync", {
      connection,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    })
    stopScheduler = await startPeriodicScheduler(syncQueue, connection)
    console.info("[worker] Sync queue enabled (concurrency: 5)")
  }

  // ── Webhook worker ─────────────────────────────────────────────
  if (enabledQueues.has("webhooks")) {
    const webhookWorker = new Worker("webhooks", processWebhookJob, {
      connection,
      concurrency: 10,
    })
    workers.push(webhookWorker)

    webhookWorker.on("completed", (job) => {
      console.info(`[webhook] Job ${job.id} delivered`)
    })
    webhookWorker.on("failed", (job, err) => {
      console.error(`[webhook] Job ${job?.id} failed: ${err.message}`)
    })
    console.info("[worker] Webhooks queue enabled (concurrency: 10)")
  }

  // ── Analytics worker ───────────────────────────────────────────
  if (enabledQueues.has("analytics")) {
    const analyticsWorker = new Worker("analytics", processAnalyticsJob, {
      connection,
      concurrency: 3,
    })
    workers.push(analyticsWorker)

    analyticsWorker.on("completed", (job) => {
      console.info(`[analytics] Job ${job.id} completed`)
    })
    analyticsWorker.on("failed", (job, err) => {
      console.error(`[analytics] Job ${job?.id} failed: ${err.message}`)
    })
    console.info("[worker] Analytics queue enabled (concurrency: 3)")
  }

  // ── Report worker ──────────────────────────────────────────────
  if (enabledQueues.has("reports")) {
    const reportWorker = new Worker("reports", processReportJob, {
      connection,
      concurrency: 2,
    })
    workers.push(reportWorker)

    reportWorker.on("completed", (job) => {
      console.info(`[report] Job ${job.id} completed`)
      // Notify user that report is ready
      if (job?.data?.userId) {
        const reportType = (job.data.reportType as string)?.charAt(0).toUpperCase() + (job.data.reportType as string)?.slice(1)
        notificationQueue.add("report-ready", {
          userId: job.data.userId,
          workspaceId: job.data.workspaceId ?? "",
          title: `${reportType || "Health"} Report Ready`,
          body: `Your ${(reportType || "health").toLowerCase()} report has been generated and is ready to view.`,
          severity: "info",
          category: "report",
          metadata: { reportId: job.data.reportId },
        }).catch((e) => console.error("[report] Failed to enqueue ready notification:", e))
      }
    })
    reportWorker.on("failed", (job, err) => {
      console.error(`[report] Job ${job?.id} failed: ${err.message}`)
    })
    console.info("[worker] Reports queue enabled (concurrency: 2)")
  }

  // ── Notification worker ────────────────────────────────────────
  if (enabledQueues.has("notifications")) {
    const notificationWorker = new Worker("notifications", processNotificationJob, {
      connection,
      concurrency: 8,
    })
    workers.push(notificationWorker)

    notificationWorker.on("completed", (job) => {
      console.info(`[notification] Job ${job.id} delivered`)
    })
    notificationWorker.on("failed", (job, err) => {
      console.error(`[notification] Job ${job?.id} failed: ${err.message}`)
    })
    console.info("[worker] Notifications queue enabled (concurrency: 8)")
  }

  console.info(`VitaSync Worker started. Queues: [${[...enabledQueues].join(", ")}]`)

  // Graceful shutdown
  async function shutdown(signal: string) {
    console.info(`Received ${signal}. Draining workers...`)
    if (stopScheduler) await stopScheduler()
    await Promise.all([
      ...workers.map((w) => w.close()),
      notificationQueue.close(),
    ])
    await connection.quit()
    await closeDb()
    console.info("Worker shut down cleanly.")
    process.exit(0)
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

main().catch((err) => {
  console.error("Worker failed to start:", err)
  process.exit(1)
})
