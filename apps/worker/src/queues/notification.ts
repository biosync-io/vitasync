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
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 10_000, // 10s → 20s → 40s
        },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 1000 },
      },
    })
  }
  return _notificationQueue
}
