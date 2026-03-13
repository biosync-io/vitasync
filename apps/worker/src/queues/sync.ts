import { Queue } from "bullmq"
import IORedis from "ioredis"
import { getConfig } from "../config.js"

let _connection: IORedis | null = null
let _syncQueue: Queue | null = null

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(getConfig().REDIS_URL, {
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
