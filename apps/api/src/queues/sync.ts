import { Queue } from "bullmq"
import { Redis } from "ioredis"
import { config } from "../config.js"

let _connection: Redis | null = null
let _syncQueue: Queue | null = null
let _webhookQueue: Queue | null = null
let _notificationQueue: Queue | null = null
let _analyticsQueue: Queue | null = null
let _reportsQueue: Queue | null = null

function getConnection(): Redis {
  if (!_connection) {
    _connection = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    })
  }
  return _connection
}

/** Expose the raw Redis connection for health checks */
export function getRedisConnection(): Redis {
  return getConnection()
}

export function getSyncQueue(): Queue {
  if (!_syncQueue) {
    _syncQueue = new Queue("sync", { connection: getConnection() as never })
  }
  return _syncQueue
}

export function getWebhookQueue(): Queue {
  if (!_webhookQueue) {
    _webhookQueue = new Queue("webhooks", { connection: getConnection() as never })
  }
  return _webhookQueue
}

export function getNotificationQueue(): Queue {
  if (!_notificationQueue) {
    _notificationQueue = new Queue("notifications", { connection: getConnection() as never })
  }
  return _notificationQueue
}

export function getAnalyticsQueue(): Queue {
  if (!_analyticsQueue) {
    _analyticsQueue = new Queue("analytics", { connection: getConnection() as never })
  }
  return _analyticsQueue
}

export function getReportsQueue(): Queue {
  if (!_reportsQueue) {
    _reportsQueue = new Queue("reports", { connection: getConnection() as never })
  }
  return _reportsQueue
}

// Named export used by connections route
export const syncQueue = {
  add: (...args: Parameters<Queue["add"]>) => getSyncQueue().add(...args),
}

export const webhookQueue = {
  add: (...args: Parameters<Queue["add"]>) => getWebhookQueue().add(...args),
}

export async function closeQueues(): Promise<void> {
  await Promise.all([
    _syncQueue?.close(),
    _webhookQueue?.close(),
    _notificationQueue?.close(),
    _analyticsQueue?.close(),
    _reportsQueue?.close(),
    _connection?.quit(),
  ])
}
