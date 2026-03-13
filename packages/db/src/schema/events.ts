import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  index,
  text,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "./users.js"
import { providerConnections } from "./provider-connections.js"

/**
 * Event records — structured events such as workouts, runs, yoga sessions, sleep cycles.
 *
 * Unlike raw health_metrics, events have a start/end time and richly typed data
 * (laps, HR zones, route waypoints etc.) stored in the `data` JSONB column.
 */
export const events = pgTable(
  "events",
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
    /** Stable ID from the provider — used for deduplication */
    providerEventId: varchar("provider_event_id", { length: 255 }),
    /**
     * Broad event category.
     * - workout: any active workout session (run, cycle, swim…)
     * - sleep: full sleep session
     * - activity: passive activity (daily steps summary, commute)
     */
    eventType: varchar("event_type", { length: 50 }).notNull(), // workout | sleep | activity
    /**
     * Provider-specific sub-type code, e.g. "running", "yoga", "pool_swimming".
     * Normalized by each provider into lowercase_underscore.
     */
    activityType: varchar("activity_type", { length: 100 }),
    /** Human-readable name set by the provider or user */
    title: varchar("title", { length: 255 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Duration in seconds (may differ from endedAt - startedAt due to pauses) */
    durationSeconds: integer("duration_seconds"),
    /** Distance in meters */
    distanceMeters: doublePrecision("distance_meters"),
    /** Total energy expenditure in kcal */
    caloriesKcal: doublePrecision("calories_kcal"),
    /** Average heart rate in bpm */
    avgHeartRate: integer("avg_heart_rate"),
    /** Max heart rate in bpm */
    maxHeartRate: integer("max_heart_rate"),
    /** Average speed in m/s */
    avgSpeedMps: doublePrecision("avg_speed_mps"),
    /** Elevation gain in meters */
    elevationGainMeters: doublePrecision("elevation_gain_meters"),
    /**
     * Full structured data: laps, HR zones, route GPS, sleep stages, etc.
     * Schema varies by eventType and provider.
     */
    data: jsonb("data"),
    /** Raw title or notes from the user in the provider app */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_events_user_type_time").on(t.userId, t.eventType, t.startedAt),
    index("idx_events_connection").on(t.connectionId),
    index("idx_events_provider_dedup").on(t.userId, t.providerId, t.providerEventId),
  ],
)

export type EventRow = typeof events.$inferSelect
export type EventInsert = typeof events.$inferInsert
