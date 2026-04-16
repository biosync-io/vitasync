---
description: "BullMQ sync processor — decrypt tokens, fetch, normalize, store, update status with progress tracking and DLQ"
phase: 1
feature: "sync-worker"
depends_on: ["provider-core", "oauth-flow", "normalization-pipeline", "data-type-registry"]
---

# Sync Worker — BullMQ Data Ingestion Processor

## Context

The sync worker is the core data ingestion engine in VitaSync. When a sync job is enqueued (either by the API on user request, by a scheduled cron, or by an incoming webhook), the worker:

1. **Decrypts** the provider's OAuth tokens from the database (AES-256-GCM).
2. **Refreshes** the token if expired (5-minute buffer), re-encrypts and persists the new token.
3. **Resolves** the provider from the registry and calls `syncData()`.
4. **Normalizes** each yielded `SyncDataPoint` through the 6-step pipeline.
5. **Batch-inserts** canonical records into the database with deduplication.
6. **Updates** the connection's `lastSyncedAt` and sync job status.

The worker lives in `apps/worker/` and uses BullMQ for job processing with the existing patterns in `apps/worker/src/processors/sync.processor.ts`.

## Engineering Rules

- **Typed job data** — `SyncJobData` interface with `connectionId`, `workspaceId`, `userId`, `providerId`, `options`.
- **Progress tracking** — call `job.updateProgress()` at meaningful milestones (10%, 50%, 90%, 100%).
- **Structured logging** — use the worker's Pino logger; never `console.log`.
- **Idempotent** — use `onConflictDoNothing()` on the deduplication key composite index.
- **Drizzle ORM** — use `getDb()` from `@biosync-io/db` for all database access.
- **Circuit breaker** — wrap the provider's `syncData()` call with `getProviderCircuitBreaker()` from `apps/worker/src/lib/circuit-breakers.ts`.
- **Token handling** — `decrypt()` / `encrypt()` from `apps/worker/src/lib/crypto.ts`. Re-encrypt after refresh.
- **Batch size** — flush inserts every 500 records (configurable).
- **Retry** — BullMQ handles retries with exponential backoff (3 attempts, 5s base).
- **Dead Letter Queue** — after max retries, persist failed job data to `dead_letter_jobs` table for manual review.
- **Sync status tracking** — create/update a `sync_jobs` table record with status, progress, error, timestamps.

## What to Build

### 1. Sync Job Data Type

```typescript
// apps/worker/src/processors/sync.processor.ts
export interface SyncJobData {
  connectionId: string
  workspaceId: string
  userId: string
  providerId: string
  options?: {
    startDate?: string // ISO 8601
    endDate?: string   // ISO 8601
    dataTypes?: string[]
    force?: boolean
  }
}
```

### 2. Sync Processor

```typescript
export async function processSyncJob(
  job: Job<SyncJobData>,
  logger: Logger,
): Promise<void> {
  const { connectionId, workspaceId, userId, providerId, options } = job.data
  const db = getDb()
  const config = getConfig()

  logger.info({ jobId: job.id, connectionId, providerId }, "Starting sync job")

  // ── Step 1: Create sync job record ───────────────────────
  const [syncJob] = await db
    .insert(syncJobs)
    .values({
      connectionId,
      workspaceId,
      providerId,
      status: "running",
      startedAt: new Date(),
    })
    .returning()

  try {
    // ── Step 2: Load connection and decrypt tokens ─────────
    const [connection] = await db
      .select()
      .from(providerConnections)
      .where(
        and(
          eq(providerConnections.id, connectionId),
          eq(providerConnections.workspaceId, workspaceId),
        ),
      )
      .limit(1)

    if (!connection) throw new Error(`Connection '${connectionId}' not found`)
    if (connection.status !== "active") throw new Error(`Connection status is '${connection.status}'`)

    let tokens = JSON.parse(decrypt(connection.encryptedTokens, config.ENCRYPTION_KEY))
    await job.updateProgress(10)

    // ── Step 3: Refresh token if expired ───────────────────
    const provider = providerRegistry.resolve(providerId)
    const bufferMs = 5 * 60 * 1000

    if (tokens.expiresAt && new Date(tokens.expiresAt).getTime() - bufferMs < Date.now()) {
      logger.info({ connectionId }, "Refreshing expired token")
      tokens = await (provider as OAuth2Provider).refreshTokens(tokens)

      await db
        .update(providerConnections)
        .set({
          encryptedTokens: encrypt(JSON.stringify(tokens), config.ENCRYPTION_KEY),
          updatedAt: new Date(),
        })
        .where(eq(providerConnections.id, connectionId))
    }

    await job.updateProgress(20)

    // ── Step 4: Stream data through normalization pipeline ──
    const pipeline = createNormalizationPipeline(
      dataTypeRegistry,
      { connectionId, userId },
    )

    const breaker = getProviderCircuitBreaker(providerId)
    const syncOptions: SyncOptions = {
      startDate: options?.startDate ? new Date(options.startDate) : undefined,
      endDate: options?.endDate ? new Date(options.endDate) : undefined,
      dataTypes: options?.dataTypes as HealthMetricType[] | undefined,
      force: options?.force,
    }

    const BATCH_SIZE = 500
    let batch: typeof healthMetrics.$inferInsert[] = []
    let totalProcessed = 0
    let totalSkipped = 0

    await breaker.execute(async () => {
      for await (const point of provider.syncData(tokens, syncOptions)) {
        const canonical = pipeline(point)

        if (!canonical) {
          totalSkipped++
          continue
        }

        batch.push({
          userId: canonical.userId,
          connectionId: canonical.connectionId,
          providerId: canonical.providerId,
          metricType: canonical.metricType,
          value: canonical.value,
          data: canonical.data,
          unit: canonical.unit,
          recordedAt: canonical.recordedAt,
          source: canonical.source,
        })

        if (batch.length >= BATCH_SIZE) {
          await db.insert(healthMetrics).values(batch).onConflictDoNothing()
          totalProcessed += batch.length
          batch = []
          await job.updateProgress(20 + Math.floor((totalProcessed / (totalProcessed + 100)) * 60))
        }
      }
    })

    // Flush remaining
    if (batch.length > 0) {
      await db.insert(healthMetrics).values(batch).onConflictDoNothing()
      totalProcessed += batch.length
    }

    await job.updateProgress(90)

    // ── Step 5: Update connection and sync job ─────────────
    await db
      .update(providerConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(providerConnections.id, connectionId))

    await db
      .update(syncJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        itemsProcessed: totalProcessed,
        itemsSkipped: totalSkipped,
      })
      .where(eq(syncJobs.id, syncJob.id))

    await job.updateProgress(100)
    logger.info({ jobId: job.id, totalProcessed, totalSkipped }, "Sync job completed")

  } catch (error) {
    // ── Persist failure state ──────────────────────────────
    await db
      .update(syncJobs)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: (error as Error).message,
      })
      .where(eq(syncJobs.id, syncJob.id))

    // Update connection status if auth error
    if ((error as Error).message.includes("401") || (error as Error).message.includes("Token")) {
      await db
        .update(providerConnections)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(providerConnections.id, connectionId))
    }

    logger.error({ jobId: job.id, err: error }, "Sync job failed")
    throw error // BullMQ handles retry
  }
}
```

### 3. Queue Definition

```typescript
// apps/worker/src/queues/sync.queue.ts
import { Queue } from "bullmq"

export const syncQueue = new Queue<SyncJobData>("sync", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
})
```

### 4. Dead Letter Queue Handler

```typescript
worker.on("failed", async (job, error) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    logger.error({ jobId: job.id, err: error }, "Sync job permanently failed — moved to DLQ")
    await db.insert(deadLetterJobs).values({
      queue: "sync",
      jobId: job.id ?? "unknown",
      data: JSON.stringify(job.data),
      error: error.message,
      failedAt: new Date(),
    })
  }
})
```

### 5. API Route to Trigger Sync

```typescript
// apps/api/src/routes/v1/connections.ts — add to existing
app.post("/:connectionId/sync", async (request) => {
  const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(request.params)
  const connection = await connectionService.getById(connectionId, request.workspaceId)

  await syncQueue.add("sync", {
    connectionId: connection.id,
    workspaceId: request.workspaceId,
    userId: connection.userId,
    providerId: connection.providerId,
  })

  return { data: { queued: true } }
})
```

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `apps/worker/src/processors/sync.processor.ts` | Create/Edit | Main sync job processor |
| `apps/worker/src/queues/sync.queue.ts` | Create/Verify | Sync queue definition |
| `apps/worker/src/index.ts` | Edit | Register sync processor + DLQ handler |
| `apps/worker/src/lib/crypto.ts` | Verify | `encrypt()` / `decrypt()` available |
| `apps/worker/src/lib/circuit-breakers.ts` | Verify | `getProviderCircuitBreaker()` available |
| `apps/api/src/routes/v1/connections.ts` | Edit | Add `POST /:connectionId/sync` route |
| `packages/db/src/schema/sync-jobs.ts` | Create/Verify | `sync_jobs` table schema |
| `packages/db/src/schema/dead-letter-jobs.ts` | Create/Verify | `dead_letter_jobs` table schema |

## Verification Checklist

```bash
# 1. TypeScript compiles
pnpm typecheck

# 2. Biome linting passes
pnpm exec biome ci .

# 3. Tests pass
pnpm --filter @biosync-io/worker test

# 4. Audit for violations
audit_code apps/worker/src/processors/sync.processor.ts

# 5. Verify no plaintext tokens are logged
grep -r "accessToken\|refreshToken\|encryptedTokens" apps/worker/src/ --include="*.ts" | grep -i "log\|console"

# 6. Verify batch insert uses onConflictDoNothing for idempotency

# 7. Verify DLQ handler persists failed job data
```
