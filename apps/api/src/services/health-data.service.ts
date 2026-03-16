import { getDb, healthMetrics } from "@biosync-io/db"
import type { HealthMetric, HealthMetricType, SyncDataPoint } from "@biosync-io/types"
import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm"
import { decodeCursor, encodeCursor } from "../lib/cursor.js"

export type TimeseriesBucket = "minute" | "hour" | "day" | "week" | "month"

export interface TimeseriesPoint {
  bucket: string
  avg: number | null
  min: number | null
  max: number | null
  sum: number | null
  count: number
}

export interface DailySummaryRow {
  date: string
  metricType: string
  total: number | null
  avg: number | null
  min: number | null
  max: number | null
  count: number
}

export interface HealthDataQuery {
  userId: string
  workspaceId: string
  metricType?: HealthMetricType
  from?: Date
  to?: Date
  limit?: number
  offset?: number
}

export interface HealthDataSummary {
  metricType: string
  count: number
  earliest: string
  latest: string
}

export class HealthDataService {
  private get db() {
    return getDb()
  }

  async query(
    params: HealthDataQuery,
  ): Promise<{ data: HealthMetric[]; nextCursor?: string; hasMore: boolean }> {
    const { userId, metricType, from, to, limit = 100, offset = 0 } = params

    const conditions = [eq(healthMetrics.userId, userId)]
    if (metricType) conditions.push(eq(healthMetrics.metricType, metricType))
    if (from) conditions.push(gte(healthMetrics.recordedAt, from))
    if (to) conditions.push(lte(healthMetrics.recordedAt, to))

    // Cursor-based pagination: decode cursor to get the last-seen (ts, id)
    if (params.cursor) {
      const { id: cursorId, ts: cursorTs } = decodeCursor(params.cursor)
      conditions.push(
        sql`(${healthMetrics.recordedAt}, ${healthMetrics.id}) < (${new Date(cursorTs).toISOString()}::timestamptz, ${cursorId}::uuid)`,
      )
    }

    const fetchLimit = Math.min(limit, 1000) + 1 // fetch one extra to detect hasMore

    const rows = await this.db
      .select()
      .from(healthMetrics)
      .where(and(...conditions))
      .orderBy(desc(healthMetrics.recordedAt))
      .offset(params.cursor ? 0 : offset) // cursor mode ignores offset
      .limit(fetchLimit)

    const hasMore = rows.length > Math.min(limit, 1000)
    const data = rows.slice(0, Math.min(limit, 1000)) as HealthMetric[]

    let nextCursor: string | undefined
    const last = data.at(-1)
    if (hasMore && last) {
      nextCursor = encodeCursor(last.id, new Date(last.recordedAt))
    }

    return { data, nextCursor, hasMore }
  }

  async summary(userId: string): Promise<HealthDataSummary[]> {
    const rows = await this.db
      .select({
        metricType: healthMetrics.metricType,
        count: sql<number>`cast(count(*) as int)`,
        earliest: sql<string>`min(${healthMetrics.recordedAt})::text`,
        latest: sql<string>`max(${healthMetrics.recordedAt})::text`,
      })
      .from(healthMetrics)
      .where(eq(healthMetrics.userId, userId))
      .groupBy(healthMetrics.metricType)

    return rows
  }

  /**
   * Bulk insert metrics from a sync job with idempotency.
   * Uses ON CONFLICT DO NOTHING on the (userId, providerId, metricType, recordedAt) unique index.
   */
  async bulkInsert(
    metrics: Array<{
      userId: string
      connectionId: string
      providerId: string
      metricType: string
      recordedAt: Date
      value: number
      unit?: string
      data?: Record<string, unknown>
      source?: string
    }>,
  ): Promise<number> {
    if (metrics.length === 0) return 0

    // Insert in batches of 500 to avoid query size limits
    const BATCH_SIZE = 500
    let inserted = 0

    for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
      const batch = metrics.slice(i, i + BATCH_SIZE)
      const result = await this.db
        .insert(healthMetrics)
        .values(batch)
        .onConflictDoNothing()
        .returning({ id: healthMetrics.id })

      inserted += result.length
    }

    return inserted
  }

  async deleteForUser(userId: string, _workspaceId: string): Promise<number> {
    const result = await this.db
      .delete(healthMetrics)
      .where(eq(healthMetrics.userId, userId))
      .returning({ id: healthMetrics.id })

    return result.length
  }

  /**
   * Time-bucketed aggregation (timeseries).
   * Returns avg/min/max/sum per bucket for scalar metrics.
   */
  async timeseries(params: {
    userId: string
    metricType: HealthMetricType
    from: Date
    to: Date
    bucket: TimeseriesBucket
  }): Promise<TimeseriesPoint[]> {
    const { userId, metricType, from, to, bucket } = params

    const rows = await this.db
      .select({
        bucket: sql<string>`date_trunc(${bucket}, ${healthMetrics.recordedAt})::text`,
        avg: sql<number | null>`avg(${healthMetrics.value})`,
        min: sql<number | null>`min(${healthMetrics.value})`,
        max: sql<number | null>`max(${healthMetrics.value})`,
        sum: sql<number | null>`sum(${healthMetrics.value})`,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(healthMetrics)
      .where(
        and(
          eq(healthMetrics.userId, userId),
          eq(healthMetrics.metricType, metricType),
          gte(healthMetrics.recordedAt, from),
          lte(healthMetrics.recordedAt, to),
        ),
      )
      .groupBy(sql`date_trunc(${bucket}, ${healthMetrics.recordedAt})`)
      .orderBy(sql`date_trunc(${bucket}, ${healthMetrics.recordedAt})`)

    return rows
  }

  /**
   * Daily-level summaries per metric type.
   * Useful for dashboards showing per-day totals.
   */
  async dailySummaries(params: {
    userId: string
    metricTypes?: HealthMetricType[]
    from: Date
    to: Date
  }): Promise<DailySummaryRow[]> {
    const { userId, metricTypes, from, to } = params

    const conditions = [
      eq(healthMetrics.userId, userId),
      gte(healthMetrics.recordedAt, from),
      lte(healthMetrics.recordedAt, to),
    ]
    if (metricTypes && metricTypes.length > 0) {
      conditions.push(
        sql`${healthMetrics.metricType} = ANY(ARRAY[${sql.join(
          metricTypes.map((t) => sql`${t}`),
          sql`, `,
        )}]::text[])`,
      )
    }

    const rows = await this.db
      .select({
        date: sql<string>`date_trunc('day', ${healthMetrics.recordedAt})::date::text`,
        metricType: healthMetrics.metricType,
        total: sql<number | null>`sum(${healthMetrics.value})`,
        avg: sql<number | null>`avg(${healthMetrics.value})`,
        min: sql<number | null>`min(${healthMetrics.value})`,
        max: sql<number | null>`max(${healthMetrics.value})`,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(healthMetrics)
      .where(and(...conditions))
      .groupBy(sql`date_trunc('day', ${healthMetrics.recordedAt})::date`, healthMetrics.metricType)
      .orderBy(sql`date_trunc('day', ${healthMetrics.recordedAt})::date`)

    return rows
  }

  /**
   * Ingests normalized data points from an inbound provider webhook.
   * Wraps bulkInsert with the session context (userId, connectionId).
   */
  async ingest(params: {
    userId: string
    connectionId: string
    dataPoints: SyncDataPoint[]
  }): Promise<number> {
    return this.bulkInsert(
      params.dataPoints.map((dp) => ({
        userId: params.userId,
        connectionId: params.connectionId,
        providerId: dp.providerId,
        metricType: dp.metricType,
        recordedAt: dp.recordedAt,
        value: dp.value ?? 0,
        unit: dp.unit,
        data: dp.data,
      })),
    )
  }
}
