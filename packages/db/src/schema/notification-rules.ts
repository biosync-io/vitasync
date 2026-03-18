import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Notification rules — determines which events trigger which channels.
 *
 * A rule links event categories (anomaly, goal, achievement, etc.) and
 * minimum severity to one or more notification channels.
 */
export const notificationRules = pgTable(
  "notification_rules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Human-readable name, e.g. "Critical anomalies to Discord" */
    name: varchar("name", { length: 100 }).notNull(),
    /** Notification categories that trigger this rule */
    categories: jsonb("categories").$type<string[]>().notNull(),
    /** Minimum severity: info, warning, critical */
    minSeverity: varchar("min_severity", { length: 20 }).notNull().default("info"),
    /** Channel IDs to deliver to when this rule matches */
    channelIds: jsonb("channel_ids").$type<string[]>().notNull(),
    /** Whether the rule is active */
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_notification_rules_user").on(t.userId),
  ],
)

export type NotificationRuleRow = typeof notificationRules.$inferSelect
export type NotificationRuleInsert = typeof notificationRules.$inferInsert
