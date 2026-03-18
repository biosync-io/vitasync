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
 * Generated health reports (weekly, monthly, annual summaries).
 *
 * Reports are created by the report-generation processor and contain
 * rich summaries, trend analysis, and actionable recommendations.
 */
export const healthReports = pgTable(
  "health_reports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Report type: weekly, monthly, quarterly, annual, custom */
    reportType: varchar("report_type", { length: 20 }).notNull(),
    /** Report title */
    title: varchar("title", { length: 255 }).notNull(),
    /** Period this report covers */
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** Status: generating, ready, failed */
    status: varchar("status", { length: 20 }).notNull().default("generating"),
    /** Structured report data (sections, charts, recommendations) */
    content: jsonb("content").$type<Record<string, unknown>>(),
    /** Summary highlights */
    highlights: jsonb("highlights").$type<string[]>(),
    /** Actionable recommendations */
    recommendations: jsonb("recommendations").$type<string[]>(),
    /** Report format: json, markdown */
    format: varchar("format", { length: 20 }).notNull().default("json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_health_reports_user").on(t.userId),
    index("idx_health_reports_user_type").on(t.userId, t.reportType),
  ],
)

export type HealthReportRow = typeof healthReports.$inferSelect
export type HealthReportInsert = typeof healthReports.$inferInsert
