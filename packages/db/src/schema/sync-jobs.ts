import { pgTable, uuid, varchar, text, timestamp, integer, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { providerConnections } from "./provider-connections"

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => providerConnections.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    metricsSynced: integer("metrics_synced").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_sync_jobs_connection").on(t.connectionId),
    index("idx_sync_jobs_status").on(t.status),
  ],
)

export type SyncJob = typeof syncJobs.$inferSelect
export type SyncJobInsert = typeof syncJobs.$inferInsert
