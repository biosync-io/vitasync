import { Queue } from "bullmq"
import { Redis } from "ioredis"
import { config } from "../config.js"

let _connection: Redis | null = null
let _syncQueue: Queue | null = null
let _webhookQueue: Queue | null = null
let _notificationQueue: Queue | null = null

function getConnection(): Redis {
  if (!_connection) {
    _connection = new Redis(config.REDIS_URL, {
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
    _syncQueue = new Queue("sync", { connection: getConnection() as never })
  }
  return _syncQueue
}

/**
 * Queue for outbound webhook deliveries.
 * Workers pull from this queue to dispatch HTTP notifications.
 */
export function getWebhookQueue(): Queue {
  if (!_webhookQueue) {
    _webhookQueue = new Queue("webhooks", { connection: getConnection() as never })
  }
  return _webhookQueue
}

/**
 * Queue for notification deliveries (Discord, Slack, Teams, Email, etc.).
 * Workers pull from this queue to dispatch user-configured alerts.
 */
export function getNotificationQueue(): Queue {
  if (!_notificationQueue) {
    _notificationQueue = new Queue("notifications", { connection: getConnection() as never })
  }
  return _notificationQueue
}

// Named export used by connections route
export const syncQueue = {
  add: (...args: Parameters<Queue["add"]>) => getSyncQueue().add(...args),
}

export const webhookQueue = {
  add: (...args: Parameters<Queue["add"]>) => getWebhookQueue().add(...args),
}

export async function closeQueues(): Promise<void> {
  await Promise.all([_syncQueue?.close(), _webhookQueue?.close(), _notificationQueue?.close(), _connection?.quit()])
}
