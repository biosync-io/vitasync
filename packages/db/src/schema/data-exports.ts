import { sql } from "drizzle-orm"
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Data export jobs — supports FHIR R4, CSV, and JSON bulk exports.
 *
 * Users or API consumers can request a full data export which is
 * processed asynchronously by the worker. Exports comply with
 * interoperability standards (FHIR for clinical use, CSV for research).
 */
export const dataExports = pgTable(
  "data_exports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Export format: fhir_r4, csv, json, pdf */
    format: varchar("format", { length: 20 }).notNull(),
    /** Status: pending, processing, completed, failed, expired */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    /** Which metric types to include (null = all) */
    metricTypes: jsonb("metric_types").$type<string[]>(),
    /** Date range filter */
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    /** Number of records exported */
    recordCount: jsonb("record_count").$type<number>(),
    /** Signed download URL (set when export is ready) */
    downloadUrl: varchar("download_url", { length: 2000 }),
    /** URL expiration */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Error message if failed */
    error: varchar("error", { length: 2000 }),
    /** FHIR Bundle metadata or export details */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_data_exports_user").on(t.userId),
    index("idx_data_exports_status").on(t.status),
  ],
)

export type DataExportRow = typeof dataExports.$inferSelect
export type DataExportInsert = typeof dataExports.$inferInsert
