import { Worker, Queue } from "bullmq"
import { Redis } from "ioredis"
import { getConfig } from "./config.js"
import { initDb, closeDb } from "@biosync-io/db"
import { registerFitbitProvider } from "@biosync-io/provider-fitbit"
import { registerGarminProvider } from "@biosync-io/provider-garmin"
import { processSyncJob } from "./processors/sync.processor.js"
import { processWebhookJob } from "./processors/webhook.processor.js"
import { startPeriodicScheduler } from "./schedulers/periodic-sync.js"

async function main() {
  const config = getConfig()

  // Register data providers
  registerFitbitProvider()
  registerGarminProvider()

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

  syncWorker.on("completed", (job) => {
    console.info(`[sync] Job ${job.id} completed`)
  })

  syncWorker.on("failed", (job, err) => {
    console.error(`[sync] Job ${job?.id} failed: ${err.message}`)
  })

  webhookWorker.on("completed", (job) => {
    console.info(`[webhook] Job ${job.id} delivered`)
  })

  webhookWorker.on("failed", (job, err) => {
    console.error(`[webhook] Job ${job?.id} failed: ${err.message}`)
  })

  console.info("VitaSync Worker started. Listening for jobs...")

  // Start periodic sync scheduler
  const syncQueue = new Queue("sync", { connection })
  const stopScheduler = await startPeriodicScheduler(syncQueue, connection)

  // Graceful shutdown
  async function shutdown(signal: string) {
    console.info(`Received ${signal}. Draining workers...`)
    await stopScheduler()
    await Promise.all([syncWorker.close(), webhookWorker.close(), syncQueue.close()])
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
