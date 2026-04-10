import { EventBus } from "@biosync-io/event-bus"
import type { EventBus as EventBusType } from "@biosync-io/event-bus"
import { getConfig } from "../config.js"

let _instance: EventBusType | null = null

/**
 * Returns a singleton EventBus instance for the worker process.
 * Initialised lazily with the Redis URL from worker config.
 */
export function getWorkerEventBus(): EventBusType {
  if (!_instance) {
    const config = getConfig()
    _instance = new EventBus({
      redis: config.REDIS_URL,
      channelPrefix: "vitasync",
      logger: {
        info: (...args) => console.info("[event-bus]", ...args),
        error: (...args) => console.error("[event-bus]", ...args),
        warn: (...args) => console.warn("[event-bus]", ...args),
        debug: (...args) => console.debug("[event-bus]", ...args),
      },
    })
  }
  return _instance
}

/**
 * Close the worker event bus (call during graceful shutdown).
 */
export async function closeWorkerEventBus(): Promise<void> {
  if (_instance) {
    await _instance.close()
    _instance = null
  }
}
