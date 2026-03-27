import { sql } from "drizzle-orm"
import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core"
import { providerConnections } from "./provider-connections"

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => providerConnections.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    metricsSynced: integer("metrics_synced").notNull().default(0),
    /** Number of structured events (workout, sleep) upserted */
    eventsSynced: integer("events_synced").notNull().default(0),
    /** Provider ID denormalized for easy filtering */
    providerId: varchar("provider_id", { length: 50 }),
    /** Wall-clock duration of the sync in milliseconds */
    durationMs: integer("duration_ms"),
    /** Outbound provider API call summary */
    providerCallStats: jsonb("provider_call_stats").$type<{
      totalCalls: number
      totalErrors: number
      endpoints: Array<{ endpoint: string; calls: number; success: number; errors: number }>
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_sync_jobs_connection").on(t.connectionId),
    index("idx_sync_jobs_status").on(t.status),
    index("idx_sync_jobs_provider").on(t.providerId),
  ],
)

export type SyncJob = typeof syncJobs.$inferSelect
export type SyncJobInsert = typeof syncJobs.$inferInsert
