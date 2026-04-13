import type { EventBus } from "@biosync-io/event-bus"
import { DomainEventTypes } from "@biosync-io/types"
import type { EventStoreService } from "./event-store.service.js"
import type { HealthDataService } from "./health-data.service.js"

// ── Input types ───────────────────────────────────────────────────

export interface HealthMetricInput {
  connectionId: string
  providerId: string
  metricType: string
  recordedAt: Date
  value: number
  unit?: string
  data?: Record<string, unknown>
  source?: string
}

// ── Service ───────────────────────────────────────────────────────

/**
 * Event-sourced wrapper around the existing `HealthDataService`.
 *
 * Every mutation is additionally persisted as a domain event and
 * published to the event bus — enabling projections, audit trails,
 * and temporal queries without changing the original service.
 */
export class HealthDataEventSourcedService {
  constructor(
    private healthService: HealthDataService,
    private eventStore: EventStoreService,
    private eventBus: EventBus,
  ) {}

  /**
   * Record a single health metric.
   *
   * 1. Persist via existing service (health_metrics table).
   * 2. Append domain event to event store.
   * 3. Publish to EventBus for downstream consumers.
   */
  async recordMetric(userId: string, workspaceId: string, data: HealthMetricInput) {
    // 1. Write to health_metrics table (existing behaviour)
    const count = await this.healthService.bulkInsert([
      {
        userId,
        connectionId: data.connectionId,
        providerId: data.providerId,
        metricType: data.metricType,
        recordedAt: data.recordedAt,
        value: data.value,
        ...(data.unit != null ? { unit: data.unit } : {}),
        ...(data.source != null ? { source: data.source } : {}),
      },
    ])

    // Derive a stable aggregate id from the insert context
    const aggregateId = crypto.randomUUID()

    const eventPayload = {
      userId,
      metricType: data.metricType,
      value: data.value,
      unit: data.unit ?? "",
      source: data.source ?? "",
      recordedAt: data.recordedAt.toISOString(),
    }

    // 2. Append event to event store
    await this.eventStore.append([
      {
        aggregateType: "health-metric",
        aggregateId,
        eventType: DomainEventTypes.HEALTH_METRIC_RECORDED,
        payload: eventPayload,
        metadata: { userId, workspaceId },
      },
    ])

    // 3. Publish domain event on the bus
    await this.eventBus.publish({
      type: DomainEventTypes.HEALTH_METRIC_RECORDED,
      aggregateType: "health-metric",
      aggregateId,
      payload: eventPayload,
      metadata: {
        userId,
        workspaceId,
        timestamp: new Date().toISOString(),
        version: 1,
      },
    })

    return { count, aggregateId }
  }

  /**
   * Batch-ingest multiple health metrics.
   *
   * Uses the existing `bulkInsert` for the write path, then appends
   * a single summary event to the event store and publishes it.
   */
  async batchIngest(
    userId: string,
    workspaceId: string,
    metrics: HealthMetricInput[],
  ): Promise<{ count: number }> {
    if (metrics.length === 0) return { count: 0 }

    // 1. Write to health_metrics table
    const count = await this.healthService.bulkInsert(
      metrics.map((m) => ({
        userId,
        connectionId: m.connectionId,
        providerId: m.providerId,
        metricType: m.metricType,
        recordedAt: m.recordedAt,
        value: m.value,
        ...(m.unit != null ? { unit: m.unit } : {}),
        ...(m.source != null ? { source: m.source } : {}),
      })),
    )

    const aggregateId = crypto.randomUUID()

    const metricTypes = [...new Set(metrics.map((m) => m.metricType))]
    const firstMetric = metrics[0]
    const source = firstMetric?.source ?? ""

    const eventPayload = {
      userId,
      count,
      source,
      metricTypes,
    }

    // 2. Append event to event store
    await this.eventStore.append([
      {
        aggregateType: "health-metric",
        aggregateId,
        eventType: DomainEventTypes.HEALTH_METRIC_BATCH_INGESTED,
        payload: eventPayload,
        metadata: { userId, workspaceId },
      },
    ])

    // 3. Publish domain event
    await this.eventBus.publish({
      type: DomainEventTypes.HEALTH_METRIC_BATCH_INGESTED,
      aggregateType: "health-metric",
      aggregateId,
      payload: eventPayload,
      metadata: {
        userId,
        workspaceId,
        timestamp: new Date().toISOString(),
        version: 1,
      },
    })

    return { count }
  }
}
