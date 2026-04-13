import type { EventBus, DomainEvent } from "@biosync-io/event-bus"
import {
  healthScoreProjection,
  dailySummaryProjection,
  readinessProjection,
  type Db,
} from "@biosync-io/db"
import { DomainEventTypes } from "@biosync-io/types"
import type {
  HealthScoreComputedPayload,
  HealthMetricRecordedPayload,
  HealthMetricBatchIngestedPayload,
} from "@biosync-io/types"
import { eq, sql } from "drizzle-orm"

interface ProjectionLogger {
  info: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

const noopLogger: ProjectionLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
}

/**
 * Listens to domain events and updates materialized read-model projections.
 *
 * Each handler performs an upsert so projections stay eventually consistent
 * and are fully idempotent (safe to replay during rebuilds).
 */
export class ProjectionService {
  private logger: ProjectionLogger

  constructor(
    private db: Db,
    private eventBus: EventBus,
    opts?: { logger?: ProjectionLogger },
  ) {
    this.logger = opts?.logger ?? noopLogger
  }

  /** Subscribe to relevant domain events. Call once on startup. */
  registerHandlers(): void {
    this.eventBus.subscribe(
      DomainEventTypes.HEALTH_SCORE_COMPUTED,
      this.handleHealthScoreComputed.bind(this),
    )

    this.eventBus.subscribe(
      DomainEventTypes.HEALTH_METRIC_RECORDED,
      this.handleHealthMetricRecorded.bind(this),
    )

    this.eventBus.subscribe(
      DomainEventTypes.HEALTH_METRIC_BATCH_INGESTED,
      this.handleHealthMetricBatchIngested.bind(this),
    )

    this.logger.info("[projections] Event handlers registered")
  }

  // ── Handlers (also called directly during replay) ──────────────

  async handleHealthScoreComputed(event: DomainEvent): Promise<void> {
    const payload = event.payload as HealthScoreComputedPayload
    const workspaceId = event.metadata.workspaceId ?? ""
    const now = new Date()

    try {
      await this.db
        .insert(healthScoreProjection)
        .values({
          userId: payload.userId,
          workspaceId,
          overallScore: payload.overallScore,
          computedAt: new Date(payload.date),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: healthScoreProjection.userId,
          set: {
            overallScore: payload.overallScore,
            computedAt: new Date(payload.date),
            workspaceId,
            updatedAt: now,
          },
        })

      this.logger.debug(`[projections] Updated health_score_projection for user ${payload.userId}`)
    } catch (err) {
      this.logger.error("[projections] Failed to update health_score_projection", err)
      throw err
    }
  }

  async handleHealthMetricRecorded(event: DomainEvent): Promise<void> {
    const payload = event.payload as HealthMetricRecordedPayload
    const workspaceId = event.metadata.workspaceId ?? ""
    const recordedDate = payload.recordedAt
      ? new Date(payload.recordedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    try {
      const update = this.metricToSummaryFields(payload.metricType, payload.value)
      if (!update) return

      await this.db
        .insert(dailySummaryProjection)
        .values({
          userId: payload.userId,
          workspaceId,
          date: recordedDate,
          ...update,
        })
        .onConflictDoUpdate({
          target: [dailySummaryProjection.userId, dailySummaryProjection.date],
          set: {
            ...update,
            workspaceId,
            updatedAt: new Date(),
          },
        })

      this.logger.debug(
        `[projections] Updated daily_summary_projection for user ${payload.userId} on ${recordedDate}`,
      )
    } catch (err) {
      this.logger.error("[projections] Failed to update daily_summary_projection", err)
      throw err
    }
  }

  async handleHealthMetricBatchIngested(event: DomainEvent): Promise<void> {
    const payload = event.payload as HealthMetricBatchIngestedPayload
    const workspaceId = event.metadata.workspaceId ?? ""

    this.logger.debug(
      `[projections] Batch ingest event for user ${payload.userId}: ${payload.count} metrics (${payload.metricTypes.join(", ")})`,
    )

    // For batch ingests we only know summary info (count + types).
    // Individual metric values were already published as individual events
    // so daily_summary_projection is updated via handleHealthMetricRecorded.
    // No additional projection work needed here.
  }

  // ── Event dispatch for replay ──────────────────────────────────

  /**
   * Route a raw domain event row to the correct handler.
   * Used by the projection rebuilder to replay events without the EventBus.
   */
  async processEvent(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case DomainEventTypes.HEALTH_SCORE_COMPUTED:
        return this.handleHealthScoreComputed(event)
      case DomainEventTypes.HEALTH_METRIC_RECORDED:
        return this.handleHealthMetricRecorded(event)
      case DomainEventTypes.HEALTH_METRIC_BATCH_INGESTED:
        return this.handleHealthMetricBatchIngested(event)
      default:
        // Unknown event type — skip silently during replay
        break
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  /**
   * Map a metric type + value to the corresponding daily summary column.
   * Returns null for metric types that don't map to summary fields.
   */
  private metricToSummaryFields(
    metricType: string,
    value: number,
  ): Partial<typeof dailySummaryProjection.$inferInsert> | null {
    switch (metricType) {
      case "steps":
        return { steps: Math.round(value) }
      case "calories":
        return { caloriesBurned: value }
      case "active_minutes":
        return { activeMinutes: Math.round(value) }
      case "sleep":
        return { sleepHours: value }
      case "sleep_score":
        return { sleepScore: value }
      case "heart_rate":
        return { avgHeartRate: value }
      case "resting_heart_rate":
        return { restingHeartRate: value }
      case "heart_rate_variability":
        return { hrvAvg: value }
      case "readiness_score":
        return { readinessScore: value }
      default:
        return null
    }
  }

  // ── Truncation (used by rebuilder) ─────────────────────────────

  async truncateAll(): Promise<void> {
    await this.db.execute(sql`TRUNCATE TABLE health_score_projection`)
    await this.db.execute(sql`TRUNCATE TABLE daily_summary_projection`)
    await this.db.execute(sql`TRUNCATE TABLE readiness_projection`)
    this.logger.info("[projections] All projection tables truncated")
  }
}
