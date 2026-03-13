import type { Job } from "bullmq"
import { getDb, providerConnections, syncJobs, healthMetrics } from "@biosync-io/db"
import { eq } from "drizzle-orm"
import { providerRegistry } from "@biosync-io/provider-core"
import { decrypt } from "../lib/crypto.js"
import { getConfig } from "../config.js"
import type { ProviderTokens, SyncDataPoint } from "@biosync-io/types"
import { enqueueAllActiveConnections } from "../schedulers/periodic-sync.js"

export interface SyncJobData {
  connectionId?: string
  userId?: string
  workspaceId?: string
  from?: string
  to?: string
  /** Set to true when this job is the scheduler sweep */
  type?: "scheduled_sweep"
}

/**
 * BullMQ job processor for provider data synchronization.
 *
 * For each job:
 * 1. Load the provider connection + decrypt tokens
 * 2. Refresh tokens if needed (via provider.refreshTokens)
 * 3. Stream sync data using provider.syncData (AsyncGenerator)
 * 4. Batch-insert health metrics with ON CONFLICT DO NOTHING (idempotent)
 * 5. Update sync_jobs record with results
 */
export async function processSyncJob(job: Job<SyncJobData>): Promise<void> {
  // Handle the scheduler sweep job — just enqueue individual sync jobs
  if (job.data.type === "scheduled_sweep") {
    const { getSyncQueue } = await import("../queues/sync.js")
    await enqueueAllActiveConnections(getSyncQueue())
    return
  }

  const { connectionId, userId, workspaceId } = job.data as Required<
    Pick<SyncJobData, "connectionId" | "userId" | "workspaceId">
  >
  const db = getDb()
  const config = getConfig()

  // Load connection
  const [connection] = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, connectionId))
    .limit(1)

  if (!connection) {
    throw new Error(`Connection '${connectionId}' not found`)
  }

  if (connection.status === "disconnected") {
    job.log(`Skipping disconnected connection ${connectionId}`)
    return
  }

  // Create sync job record
  const [syncJob] = await db
    .insert(syncJobs)
    .values({ connectionId, status: "running", startedAt: new Date() })
    .returning()

  const jobId = syncJob!.id

  try {
    // Decrypt and parse tokens
    let tokens: ProviderTokens = JSON.parse(decrypt(connection.encryptedTokens, config.ENCRYPTION_KEY))

    // Get the provider instance
    const provider = providerRegistry.resolve(connection.providerId)

    // Refresh token if expired (OAuth2 providers)
    if ("refreshTokens" in provider && "accessToken" in tokens) {
      const oauth2Tokens = tokens as { accessToken: string; refreshToken?: string; expiresAt?: number }
      const bufferMs = 5 * 60 * 1000 // refresh 5 minutes before expiry
      if (oauth2Tokens.expiresAt && oauth2Tokens.expiresAt - bufferMs < Date.now()) {
        if (!oauth2Tokens.refreshToken) throw new Error("Token expired and no refresh token available")
        tokens = await provider.refreshTokens(oauth2Tokens.refreshToken)
        // Re-encrypt and persist refreshed tokens
        const { encrypt } = await import("../lib/crypto.js")
        await db
          .update(providerConnections)
          .set({ encryptedTokens: encrypt(JSON.stringify(tokens), config.ENCRYPTION_KEY), updatedAt: new Date() })
          .where(eq(providerConnections.id, connectionId))
      }
    }

    // Determine sync window
    const from = job.data.from
      ? new Date(job.data.from)
      : connection.lastSyncedAt
        ? new Date(connection.lastSyncedAt.getTime() - 60 * 60 * 1000) // 1hr overlap
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // default: last 7 days

    const to = job.data.to ? new Date(job.data.to) : new Date()

    // Stream data from provider
    const batch: Array<{
      userId: string
      connectionId: string
      providerId: string
      metricType: string
      recordedAt: Date
      value: number
      unit?: string
      data?: Record<string, unknown>
      source?: string
    }> = []

    const BATCH_SIZE = 500
    let totalInserted = 0

    const flush = async () => {
      if (batch.length === 0) return
      const result = await db.insert(healthMetrics).values(batch).onConflictDoNothing().returning({ id: healthMetrics.id })
      totalInserted += result.length
      batch.length = 0
      await job.updateProgress(totalInserted)
    }

    for await (const point of provider.syncData(tokens, { from, to })) {
      const p = point as SyncDataPoint
      batch.push({
        userId,
        connectionId,
        providerId: connection.providerId,
        metricType: p.metricType,
        recordedAt: p.recordedAt,
        value: p.value,
        unit: p.unit,
        data: p.data,
        source: connection.providerId,
      })

      if (batch.length >= BATCH_SIZE) await flush()
    }

    await flush()

    // Update connection lastSyncedAt
    await db
      .update(providerConnections)
      .set({ lastSyncedAt: new Date(), status: "connected", updatedAt: new Date() })
      .where(eq(providerConnections.id, connectionId))

    // Mark sync job complete
    await db
      .update(syncJobs)
      .set({ status: "completed", completedAt: new Date(), metricsSynced: totalInserted })
      .where(eq(syncJobs.id, jobId))

    job.log(`Sync complete: ${totalInserted} metrics inserted for connection ${connectionId}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Mark connection as error if auth failure
    if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
      await db
        .update(providerConnections)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(providerConnections.id, connectionId))
    }

    await db
      .update(syncJobs)
      .set({ status: "failed", completedAt: new Date(), error: message })
      .where(eq(syncJobs.id, jobId))

    throw err // Re-throw so BullMQ records the failure and retries
  }
}
