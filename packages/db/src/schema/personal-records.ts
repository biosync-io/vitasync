import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  doublePrecision,
  index,
  unique,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "./users.js"

/**
 * Personal records — best-ever value per (user, metric type).
 *
 * Automatically updated after each sync when a new value surpasses the stored record.
 * Examples: longest distance run, highest VO2max, heaviest weight logged.
 */
export const personalRecords = pgTable(
  "personal_records",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The metric type this record tracks (e.g., "steps", "distance") */
    metricType: varchar("metric_type", { length: 50 }).notNull(),
    /** Optional sub-category (e.g., activityType "running" for a distance PR) */
    category: varchar("category", { length: 100 }),
    /** The record-breaking value */
    value: doublePrecision("value").notNull(),
    unit: varchar("unit", { length: 20 }),
    /** When this measurement was taken (not when it was stored) */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    /** Which provider/connection produced this value */
    providerId: varchar("provider_id", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_personal_records_user").on(t.userId),
    // One record per (user, metricType, category) — upsert-friendly
    unique("uq_personal_records_user_metric_category").on(t.userId, t.metricType, t.category),
  ],
)

export type PersonalRecordRow = typeof personalRecords.$inferSelect
export type PersonalRecordInsert = typeof personalRecords.$inferInsert
