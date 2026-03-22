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

async function main() {
  const config = getConfig()

  // Register data providers
  registerFitbitProvider()
  registerGarminProvider()
  registerStravaProvider()
  registerWhoopProvider()
  registerWithingsProvider()

  // Register notification channels
  registerDiscordChannel()
  registerSlackChannel()
  registerTeamsChannel()
  registerEmailChannel()
  registerPushChannel()
  registerNtfyChannel()
  registerWebhookNotificationChannel()

  // Connect to the database
  await initDb(config.DATABASE_URL)

  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  // Sync worker — concurrency 5: process up to 5 connections in parallel
  const syncWorker = new Worker("sync", processSyncJob, {
    connection,
    concurrency: 5,
  })

  // Webhook worker — concurrency 10: webhooks are fast HTTP calls
  const webhookWorker = new Worker("webhooks", processWebhookJob, {
    connection,
    concurrency: 10,
  })

  // Analytics worker — runs post-sync analytics (health scores, anomalies, achievements)
  const analyticsWorker = new Worker("analytics", processAnalyticsJob, {
    connection,
    concurrency: 3,
  })

  // Report worker — generates periodic health reports and snapshots
  const reportWorker = new Worker("reports", processReportJob, {
    connection,
    concurrency: 2,
  })

  // Notification worker — delivers alerts to Discord, Slack, Teams, Email, etc.
  const notificationWorker = new Worker("notifications", processNotificationJob, {
    connection,
    concurrency: 8,
  })

  // Notification queue — used to enqueue failure alerts from other workers
  const notificationQueue = new Queue("notifications", { connection })

  syncWorker.on("completed", (job) => {
    console.info(`[sync] Job ${job.id} completed`)
  })

  syncWorker.on("failed", (job, err) => {
    const providerId = job?.data?.providerId ?? "unknown"
    console.error(`[sync] Job ${job?.id} failed (${providerId}): ${err.message}`)
    // Enqueue a notification so the user knows about the failure
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

  webhookWorker.on("completed", (job) => {
    console.info(`[webhook] Job ${job.id} delivered`)
  })

  webhookWorker.on("failed", (job, err) => {
    console.error(`[webhook] Job ${job?.id} failed: ${err.message}`)
  })

  analyticsWorker.on("completed", (job) => {
    console.info(`[analytics] Job ${job.id} completed`)
  })

  analyticsWorker.on("failed", (job, err) => {
    console.error(`[analytics] Job ${job?.id} failed: ${err.message}`)
  })

  reportWorker.on("completed", (job) => {
    console.info(`[report] Job ${job.id} completed`)
  })

  reportWorker.on("failed", (job, err) => {
    console.error(`[report] Job ${job?.id} failed: ${err.message}`)
  })

  notificationWorker.on("completed", (job) => {
    console.info(`[notification] Job ${job.id} delivered`)
  })

  notificationWorker.on("failed", (job, err) => {
    console.error(`[notification] Job ${job?.id} failed: ${err.message}`)
  })

  console.info("VitaSync Worker started. Listening for jobs...")

  // Start periodic sync scheduler
  const syncQueue = new Queue("sync", {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  })
  const stopScheduler = await startPeriodicScheduler(syncQueue, connection)

  // Graceful shutdown
  async function shutdown(signal: string) {
    console.info(`Received ${signal}. Draining workers...`)
    await stopScheduler()
    await Promise.all([syncWorker.close(), webhookWorker.close(), analyticsWorker.close(), reportWorker.close(), notificationWorker.close(), syncQueue.close()])
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
