import { Queue } from "bullmq"
import IORedis from "ioredis"
import { getConfig } from "../config.js"

let _connection: IORedis | null = null
let _syncQueue: Queue | null = null
let _webhookQueue: Queue | null = null

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(getConfig().REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    })
  }
  return _connection
}

/**
 * Queue for scheduled and on-demand provider sync jobs.
 * Workers pull from this queue to run data synchronization.
 */
export function getSyncQueue(): Queue {
  if (!_syncQueue) {
    _syncQueue = new Queue("sync", { connection: getConnection() })
  }
  return _syncQueue
}

/**
 * Queue for outbound webhook deliveries.
 * Workers pull from this queue to dispatch HTTP notifications.
 */
export function getWebhookQueue(): Queue {
  if (!_webhookQueue) {
    _webhookQueue = new Queue("webhooks", { connection: getConnection() })
  }
  return _webhookQueue
}

// Named export used by connections route
export const syncQueue = {
  add: (...args: Parameters<Queue["add"]>) => getSyncQueue().add(...args),
}

export const webhookQueue = {
  add: (...args: Parameters<Queue["add"]>) => getWebhookQueue().add(...args),
}

export async function closeQueues(): Promise<void> {
  await Promise.all([_syncQueue?.close(), _webhookQueue?.close(), _connection?.quit()])
}
