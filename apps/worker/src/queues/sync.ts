import { Queue } from "bullmq"
import { Redis } from "ioredis"
import { getConfig } from "../config.js"

let _connection: Redis | null = null
let _syncQueue: Queue | null = null

function getConnection(): Redis {
  if (!_connection) {
    _connection = new Redis(getConfig().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  }
  return _connection
}

export function getSyncQueue(): Queue {
  if (!_syncQueue) {
    _syncQueue = new Queue("sync", { connection: getConnection() })
  }
  return _syncQueue
}
