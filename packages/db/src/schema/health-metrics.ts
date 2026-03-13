import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  doublePrecision,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "./users.js"
import { providerConnections } from "./provider-connections.js"

/**
 * Normalized health metrics — the core data store.
 *
 * Simple scalar metrics (steps, heart rate) use `value` + `unit`.
 * Complex structured metrics (sleep, workouts) use `data` (JSONB).
 *
 * The composite unique index prevents duplicate ingestion across re-syncs.
 */
export const healthMetrics = pgTable(
  "health_metrics",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => providerConnections.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 50 }).notNull(),
    metricType: varchar("metric_type", { length: 50 }).notNull(),
    /** When the measurement was actually taken (not inserted) */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    /** Numeric value for scalar metrics */
    value: doublePrecision("value"),
    /** Full structured data for complex metrics */
    data: jsonb("data"),
    unit: varchar("unit", { length: 20 }),
    /** Device / sub-app that recorded this */
    source: varchar("source", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Primary query pattern: user + type + time range
    index("idx_health_metrics_user_type_time").on(t.userId, t.metricType, t.recordedAt),
    index("idx_health_metrics_connection").on(t.connectionId),
    // Idempotency: skip duplicate data on re-sync
    unique("uq_health_metrics_dedup").on(t.userId, t.providerId, t.metricType, t.recordedAt),
  ],
)

export type HealthMetricRow = typeof healthMetrics.$inferSelect
export type HealthMetricInsert = typeof healthMetrics.$inferInsert
