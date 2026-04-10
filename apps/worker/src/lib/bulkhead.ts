import { Queue, Worker, type Processor } from "bullmq"
import type { Redis } from "ioredis"

export interface BulkheadConfig {
  provider: string
  concurrency: number
  rateLimitMax?: number
  rateLimitWindow?: number
  priority?: number
}

const PROVIDER_CONFIGS: BulkheadConfig[] = [
  { provider: "fitbit", concurrency: 5, rateLimitMax: 150, rateLimitWindow: 3_600_000 },
  { provider: "garmin", concurrency: 3, rateLimitMax: 100, rateLimitWindow: 3_600_000 },
  { provider: "strava", concurrency: 3, rateLimitMax: 100, rateLimitWindow: 900_000 },
  { provider: "whoop", concurrency: 3, rateLimitMax: 100, rateLimitWindow: 3_600_000 },
  { provider: "withings", concurrency: 3, rateLimitMax: 60, rateLimitWindow: 3_600_000 },
]

const providerQueues = new Map<string, Queue>()
const providerWorkers = new Map<string, Worker>()

/** Create per-provider queues for bulkhead isolation. */
export function createProviderQueues(redis: Redis): Map<string, Queue> {
  for (const cfg of PROVIDER_CONFIGS) {
    const queueName = `sync-${cfg.provider}`
    if (providerQueues.has(cfg.provider)) continue

    const limiter =
      cfg.rateLimitMax && cfg.rateLimitWindow
        ? { max: cfg.rateLimitMax, duration: cfg.rateLimitWindow }
        : undefined

    const queue = new Queue(queueName, {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
        ...(cfg.priority != null ? { priority: cfg.priority } : {}),
      },
      ...(limiter ? { limiter } : {}),
    })
    providerQueues.set(cfg.provider, queue)
  }
  return new Map(providerQueues)
}

/**
 * Create per-provider workers, each with its own concurrency limit.
 * The `processor` receives the same BullMQ Job as the generic sync worker.
 */
export function createProviderWorkers(
  redis: Redis,
  processor: Processor,
): Map<string, Worker> {
  for (const cfg of PROVIDER_CONFIGS) {
    const queueName = `sync-${cfg.provider}`
    if (providerWorkers.has(cfg.provider)) continue

    const worker = new Worker(queueName, processor, {
      connection: redis,
      concurrency: cfg.concurrency,
    })
    providerWorkers.set(cfg.provider, worker)
  }
  return new Map(providerWorkers)
}

/**
 * Route a sync job to the correct provider queue.
 * Falls back to `null` if the provider has no dedicated bulkhead queue,
 * allowing the caller to fall back to the shared sync queue.
 */
export function getProviderQueue(provider: string): Queue | null {
  return providerQueues.get(provider) ?? null
}

/** Return all provider configs (useful for admin dashboards or metrics). */
export function getProviderConfigs(): readonly BulkheadConfig[] {
  return PROVIDER_CONFIGS
}

/** Gracefully close all bulkhead queues and workers. */
export async function closeBulkheadResources(): Promise<void> {
  await Promise.all([
    ...[...providerWorkers.values()].map((w) => w.close()),
    ...[...providerQueues.values()].map((q) => q.close()),
  ])
  providerWorkers.clear()
  providerQueues.clear()
}
