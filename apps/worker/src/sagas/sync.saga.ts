import { getDb, healthMetrics, providerConnections, syncJobs, events } from "@biosync-io/db"
import type { EventInsert } from "@biosync-io/db"
import { providerRegistry } from "@biosync-io/provider-core"
import { SagaBuilder } from "@biosync-io/saga"
import type { OAuthTokens, ProviderTokens, SyncDataPoint } from "@biosync-io/types"
import { eq } from "drizzle-orm"
import { getProviderCircuitBreaker } from "../lib/circuit-breakers.js"
import { decrypt, encrypt } from "../lib/crypto.js"
import { getNotificationQueue } from "../queues/notification.js"

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface SyncSagaContext {
  /** Injected by caller */
  syncJobId: string
  connectionId: string
  userId: string
  workspaceId: string
  encryptionKey: string
  from?: Date
  to?: Date

  /** Populated during execution */
  provider?: string
  tokens?: ProviderTokens
  metricsCount?: number
  eventsCount?: number
  durationMs?: number
  error?: string
}

// ---------------------------------------------------------------------------
// Saga definition
// ---------------------------------------------------------------------------

export const syncSaga = new SagaBuilder<SyncSagaContext>("provider-sync")

  // ── 1. Load connection from DB and decrypt tokens ─────────────
  .step("load-connection", {
    execute: async (ctx) => {
      const db = getDb()
      const [connection] = await db
        .select()
        .from(providerConnections)
        .where(eq(providerConnections.id, ctx.connectionId))
        .limit(1)

      if (!connection) {
        throw new Error(`Connection '${ctx.connectionId}' not found`)
      }
      if (connection.status === "disconnected") {
        throw new Error(`Connection '${ctx.connectionId}' is disconnected`)
      }
      if (!connection.encryptedTokens) {
        throw new Error(`Connection '${ctx.connectionId}' has no encrypted tokens`)
      }

      const tokens: ProviderTokens = JSON.parse(
        decrypt(connection.encryptedTokens, ctx.encryptionKey),
      )

      return {
        ...ctx,
        provider: connection.providerId,
        tokens,
      }
    },
  })

  // ── 2. Refresh OAuth token if expired ─────────────────────────
  .step("refresh-token", {
    execute: async (ctx) => {
      if (!ctx.provider || !ctx.tokens) throw new Error("Missing provider context")

      const provider = providerRegistry.resolve(ctx.provider)
      const tokens = ctx.tokens

      if (!("refreshTokens" in provider) || !("accessToken" in tokens)) {
        return ctx
      }

      const oauth2Tokens = tokens as {
        accessToken: string
        refreshToken?: string
        expiresAt?: string | number | Date
      }
      const bufferMs = 5 * 60 * 1000
      const expiresAtMs = oauth2Tokens.expiresAt
        ? new Date(oauth2Tokens.expiresAt as string | number | Date).getTime()
        : undefined

      if (expiresAtMs && expiresAtMs - bufferMs < Date.now()) {
        if (!oauth2Tokens.refreshToken) {
          throw new Error("Token expired and no refresh token available")
        }
        const refreshed = await provider.refreshTokens(oauth2Tokens as OAuthTokens)

        // Persist refreshed tokens
        const db = getDb()
        await db
          .update(providerConnections)
          .set({
            encryptedTokens: encrypt(JSON.stringify(refreshed), ctx.encryptionKey),
            updatedAt: new Date(),
          })
          .where(eq(providerConnections.id, ctx.connectionId))

        return { ...ctx, tokens: refreshed as ProviderTokens }
      }

      return ctx
    },
    compensate: async (ctx) => {
      // If token refresh partially failed, mark the connection as error
      if (ctx.connectionId) {
        const db = getDb()
        await db
          .update(providerConnections)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(providerConnections.id, ctx.connectionId))
      }
      return ctx
    },
    retries: 2,
  })

  // ── 3. Fetch data from provider via circuit breaker ───────────
  .step("fetch-provider-data", {
    execute: async (ctx) => {
      if (!ctx.provider || !ctx.tokens) throw new Error("Missing provider context")

      const provider = providerRegistry.resolve(ctx.provider)
      const breaker = getProviderCircuitBreaker(ctx.provider)

      const from = ctx.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const to = ctx.to ?? new Date()

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
      const db = getDb()

      const flush = async () => {
        if (batch.length === 0) return
        const result = await db
          .insert(healthMetrics)
          .values(batch)
          .onConflictDoNothing()
          .returning({ id: healthMetrics.id })
        totalInserted += result.length
        batch.length = 0
      }

      await breaker.execute(async () => {
        // biome-ignore lint: provider tokens type variance
        for await (const point of (provider as any).syncData(ctx.tokens, { from, to })) {
          const p = point as SyncDataPoint
          batch.push({
            userId: ctx.userId,
            connectionId: ctx.connectionId,
            providerId: ctx.provider!,
            metricType: p.metricType,
            recordedAt: p.recordedAt,
            value: p.value ?? 0,
            ...(p.unit !== undefined && { unit: p.unit }),
            ...(p.data !== undefined && { data: p.data }),
            source: ctx.provider!,
          })

          // Extract structured events (workout/sleep)
          if (p.metricType === "workout" || p.metricType === "sleep") {
            const event = buildEventInsert(p, ctx.userId, ctx.connectionId)
            if (event) eventBatch.push(event)
          }

          if (batch.length >= BATCH_SIZE) await flush()
        }
      })

      await flush()

      return {
        ...ctx,
        metricsCount: totalInserted,
        eventsCount: eventBatch.length,
        _eventBatch: eventBatch,
      } as SyncSagaContext & { _eventBatch: EventInsert[] }
    },
    timeout: 60_000,
  })

  // ── 4. Store metrics and events ───────────────────────────────
  .step("store-metrics", {
    execute: async (ctx) => {
      const db = getDb()
      const extended = ctx as SyncSagaContext & { _eventBatch?: EventInsert[] }
      const eventBatch = extended._eventBatch ?? []

      if (eventBatch.length > 0) {
        await db
          .insert(events)
          .values(eventBatch)
          .onConflictDoNothing({
            target: [events.userId, events.providerId, events.providerEventId],
          })
      }

      return ctx
    },
    compensate: async (ctx) => {
      // In the event of a downstream failure after metrics were partially
      // inserted, the idempotent ON CONFLICT DO NOTHING makes re-sync safe.
      // No explicit rollback needed — a future sync re-run is self-healing.
      return ctx
    },
  })

  // ── 5. Update sync status ─────────────────────────────────────
  .step("update-sync-status", {
    execute: async (ctx) => {
      const db = getDb()
      const durationMs = ctx.durationMs ?? 0

      // Update connection lastSyncedAt
      await db
        .update(providerConnections)
        .set({ lastSyncedAt: new Date(), status: "connected", updatedAt: new Date() })
        .where(eq(providerConnections.id, ctx.connectionId))

      // Mark sync job as completed
      await db
        .update(syncJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          metricsSynced: ctx.metricsCount ?? 0,
          eventsSynced: ctx.eventsCount ?? 0,
          durationMs,
        })
        .where(eq(syncJobs.id, ctx.syncJobId))

      return ctx
    },
  })

  // ── Lifecycle hooks ───────────────────────────────────────────
  .onComplete(async (ctx) => {
    if ((ctx.metricsCount ?? 0) > 0 && ctx.provider) {
      const label = ctx.provider.charAt(0).toUpperCase() + ctx.provider.slice(1)
      getNotificationQueue()
        .add("sync-success", {
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          title: `${label} Sync Complete`,
          body: `Synced ${ctx.metricsCount} metrics${(ctx.eventsCount ?? 0) > 0 ? ` and ${ctx.eventsCount} events` : ""} from ${label}.`,
          severity: "info",
          category: "sync",
        })
        .catch((e) => console.error("[sync-saga] notification error:", e))
    }
  })

  .onFailed(async (ctx, _err, step) => {
    console.error(
      `[sync-saga] failed at step "${step}" for connection ${ctx.connectionId}: ${_err.message}`,
    )

    // Mark sync job as failed if we got far enough to have one
    if (ctx.syncJobId) {
      const db = getDb()
      await db
        .update(syncJobs)
        .set({
          status: "failed",
          completedAt: new Date(),
          error: _err.message,
        })
        .where(eq(syncJobs.id, ctx.syncJobId))
        .catch(() => {})
    }
  })

  .build()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEventInsert(
  p: SyncDataPoint,
  userId: string,
  connectionId: string,
): EventInsert | null {
  const data = (p.data ?? {}) as Record<string, unknown>
  const startedAt = new Date(p.recordedAt)
  const providerEventId = `${p.providerId}::${startedAt.toISOString()}`

  if (p.metricType === "workout") {
    const durationSeconds =
      typeof data.durationSeconds === "number" ? Math.round(data.durationSeconds) : null
    const endedAt = durationSeconds
      ? new Date(startedAt.getTime() + durationSeconds * 1000)
      : null
    const activityName = typeof data.type === "string" ? data.type : null

    return {
      userId,
      connectionId,
      providerId: p.providerId,
      providerEventId,
      eventType: "workout",
      activityType: activityName ? activityName.toLowerCase().replace(/\s+/g, "_") : null,
      title: activityName,
      startedAt,
      endedAt: endedAt ?? undefined,
      durationSeconds,
      distanceMeters: typeof data.distanceMeters === "number" ? data.distanceMeters : null,
      avgHeartRate: typeof data.avgHeartRate === "number" ? Math.round(data.avgHeartRate) : null,
      maxHeartRate: typeof data.maxHeartRate === "number" ? Math.round(data.maxHeartRate) : null,
      elevationGainMeters: typeof data.altitudeGainMeters === "number" ? data.altitudeGainMeters : null,
      data: p.data as Record<string, unknown>,
    }
  }

  // sleep
  const sleepStart = typeof data.startTime === "string" ? new Date(data.startTime) : startedAt
  const sleepEnd = typeof data.endTime === "string" ? new Date(data.endTime) : null
  const durationMinutes = typeof data.durationMinutes === "number" ? data.durationMinutes : null
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
