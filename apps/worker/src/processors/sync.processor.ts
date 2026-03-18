import { getDb, healthMetrics, providerConnections, syncJobs, events } from "@biosync-io/db"
import type { EventInsert } from "@biosync-io/db"
import { providerRegistry } from "@biosync-io/provider-core"
import type { OAuthTokens, ProviderTokens, SyncDataPoint } from "@biosync-io/types"
import type { Job } from "bullmq"
import { eq } from "drizzle-orm"
import { getConfig } from "../config.js"
import { decrypt } from "../lib/crypto.js"
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

  const jobId = syncJob?.id

  try {
    // Decrypt and parse tokens
    let tokens: ProviderTokens = JSON.parse(
      decrypt(connection.encryptedTokens, config.ENCRYPTION_KEY),
    )

    // Get the provider instance
    const provider = providerRegistry.resolve(connection.providerId)

    // Refresh token if expired (OAuth2 providers)
    if ("refreshTokens" in provider && "accessToken" in tokens) {
      const oauth2Tokens = tokens as {
        accessToken: string
        refreshToken?: string
        // After JSON round-trip, expiresAt is an ISO string, not a Date or number
        expiresAt?: string | number | Date
      }
      const bufferMs = 5 * 60 * 1000 // refresh 5 minutes before expiry
      const expiresAtMs = oauth2Tokens.expiresAt
        ? new Date(oauth2Tokens.expiresAt as string | number | Date).getTime()
        : undefined
      if (expiresAtMs && expiresAtMs - bufferMs < Date.now()) {
        if (!oauth2Tokens.refreshToken)
          throw new Error("Token expired and no refresh token available")
        tokens = await provider.refreshTokens(oauth2Tokens as OAuthTokens)
        // Re-encrypt and persist refreshed tokens
        const { encrypt } = await import("../lib/crypto.js")
        await db
          .update(providerConnections)
          .set({
            encryptedTokens: encrypt(JSON.stringify(tokens), config.ENCRYPTION_KEY),
            updatedAt: new Date(),
          })
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

    const eventBatch: EventInsert[] = []

    const BATCH_SIZE = 500
    let totalInserted = 0

    const flush = async () => {
      if (batch.length === 0) return
      const result = await db
        .insert(healthMetrics)
        .values(batch)
        .onConflictDoNothing()
        .returning({ id: healthMetrics.id })
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

      const event = extractEvent(p, userId, connectionId)
      if (event) eventBatch.push(event)

      if (batch.length >= BATCH_SIZE) await flush()
    }

    await flush()

    // Bulk-upsert structured events (workout, sleep) — deduped via unique constraint
    if (eventBatch.length > 0) {
      await db
        .insert(events)
        .values(eventBatch)
        .onConflictDoNothing({ target: [events.userId, events.providerId, events.providerEventId] })
    }

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

    job.log(`Sync complete: ${totalInserted} metrics inserted, ${eventBatch.length} events upserted for connection ${connectionId}`)
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

/**
 * Map a workout or sleep SyncDataPoint to an EventInsert row.
 * Returns null for all other metric types.
 *
 * Uses `providerId::recordedAt` as a stable providerEventId for deduplication across
 * re-syncs. Providers emit one workout/sleep record per start timestamp per user,
 * so this composite key is unique within a (userId, providerId) pair.
 */
function extractEvent(
  p: SyncDataPoint,
  userId: string,
  connectionId: string,
): EventInsert | null {
  if (p.metricType !== "workout" && p.metricType !== "sleep") return null

  const data = (p.data ?? {}) as Record<string, unknown>
  const startedAt = new Date(p.recordedAt)
  const providerEventId = `${p.providerId}::${startedAt.toISOString()}`

  if (p.metricType === "workout") {
    const durationSeconds =
      typeof data.durationSeconds === "number" ? Math.round(data.durationSeconds) : null
    const endedAt = durationSeconds ? new Date(startedAt.getTime() + durationSeconds * 1000) : null
    const activityName = typeof data.type === "string" ? data.type : null

    return {
      userId,
      connectionId,
      providerId: p.providerId,
      providerEventId,
      eventType: "workout",
      activityType: activityName
        ? activityName.toLowerCase().replace(/\s+/g, "_")
        : null,
      title: activityName,
      startedAt,
      endedAt: endedAt ?? undefined,
      durationSeconds,
      distanceMeters:
        typeof data.distanceMeters === "number" ? data.distanceMeters : null,
      avgHeartRate:
        typeof data.avgHeartRate === "number" ? Math.round(data.avgHeartRate) : null,
      maxHeartRate:
        typeof data.maxHeartRate === "number" ? Math.round(data.maxHeartRate) : null,
      elevationGainMeters:
        typeof data.altitudeGainMeters === "number" ? data.altitudeGainMeters : null,
      data: p.data as Record<string, unknown>,
    }
  }

  // sleep
  const sleepStart =
    typeof data.startTime === "string" ? new Date(data.startTime) : startedAt
  const sleepEnd =
    typeof data.endTime === "string" ? new Date(data.endTime) : null
  const durationMinutes =
    typeof data.durationMinutes === "number" ? data.durationMinutes : null
  const isNap = typeof data.nap === "boolean" ? data.nap : false

  return {
    userId,
    connectionId,
    providerId: p.providerId,
    providerEventId,
    eventType: "sleep",
    activityType: isNap ? "nap" : "sleep",
    title: isNap ? "Nap" : "Sleep",
    startedAt: sleepStart,
    endedAt: sleepEnd ?? undefined,
    durationSeconds: durationMinutes != null ? Math.round(durationMinutes * 60) : null,
    data: p.data as Record<string, unknown>,
  }
}
