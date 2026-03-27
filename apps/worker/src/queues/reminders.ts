import { Queue } from "bullmq"
import { Redis } from "ioredis"
import { getConfig } from "../config.js"

let _connection: Redis | null = null
let _remindersQueue: Queue | null = null

function getConnection(): Redis {
  if (!_connection) {
    _connection = new Redis(getConfig().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  }
  return _connection
}

export function getRemindersQueue(): Queue {
  if (!_remindersQueue) {
    _remindersQueue = new Queue("reminders", {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    })
  }
  return _remindersQueue
}
