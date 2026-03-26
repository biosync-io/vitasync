import { Queue } from "bullmq"
import { Redis } from "ioredis"
import { getConfig } from "../config.js"

let _connection: Redis | null = null
let _notificationQueue: Queue | null = null

function getConnection(): Redis {
  if (!_connection) {
    _connection = new Redis(getConfig().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  }
  return _connection
}

export function getNotificationQueue(): Queue {
  if (!_notificationQueue) {
    _notificationQueue = new Queue("notifications", {
      connection: getConnection(),
    })
  }
  return _notificationQueue
}
