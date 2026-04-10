import { sql } from "drizzle-orm"
import { boolean, index, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core"
import { workspaces } from "./workspaces"

/**
 * Configurable data retention policies per workspace.
 *
 * Each policy specifies how long a particular data type should be
 * retained.  A daily BullMQ worker job purges expired rows.
 * `retentionDays = 0` means retain forever (disabled).
 */
export const dataRetentionPolicies = pgTable(
  "data_retention_policies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Target table / data type: 'health_metrics', 'mood_logs', 'audit_log', etc. */
    dataType: varchar("data_type", { length: 50 }).notNull(),
    /** Days to retain data (0 = forever) */
    retentionDays: integer("retention_days").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_retention_workspace").on(t.workspaceId)],
)

export type DataRetentionPolicy = typeof dataRetentionPolicies.$inferSelect
export type DataRetentionPolicyInsert = typeof dataRetentionPolicies.$inferInsert
