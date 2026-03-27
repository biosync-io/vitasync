import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"
import { goals } from "./goals"

/**
 * Smart reminder configurations per user.
 *
 * Each row defines a scheduled reminder that can be linked to a goal or
 * stand alone. Supports daily/weekly/monthly frequencies with customisable
 * delivery time, timezone, and notification channel preferences.
 */
export const smartReminders = pgTable(
  "smart_reminders",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Display name, e.g. "Morning Workout Reminder" */
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 1000 }),
    /** Reminder type: goal, habit, custom, suggestion */
    reminderType: varchar("reminder_type", { length: 30 }).notNull().default("custom"),
    /** Frequency: daily, weekly, monthly */
    frequency: varchar("frequency", { length: 20 }).notNull().default("daily"),
    /** Time of day in HH:MM format, e.g. "07:00" */
    timeOfDay: varchar("time_of_day", { length: 10 }).notNull().default("09:00"),
    /** Day of week for weekly reminders (0=Sun, 1=Mon, …6=Sat) */
    dayOfWeek: integer("day_of_week"),
    /** Day of month for monthly reminders (1–28) */
    dayOfMonth: integer("day_of_month"),
    /** IANA timezone, e.g. "America/New_York" */
    timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
    /** Linked goal (optional — null for custom reminders) */
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    /** Notification channel IDs to deliver to (empty = in-app only) */
    channelIds: jsonb("channel_ids").$type<string[]>().notNull().default([]),
    /** Extra configuration (snooze default, message template, etc.) */
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
    isActive: boolean("is_active").notNull().default(true),
    /** Timestamp of last sent reminder */
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    /** Computed next trigger time (for efficient scheduling queries) */
    nextTriggerAt: timestamp("next_trigger_at", { withTimezone: true }),
    /** If snoozed, reminder is suppressed until this time */
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_smart_reminders_user").on(t.userId),
    index("idx_smart_reminders_active").on(t.userId, t.isActive),
    index("idx_smart_reminders_next").on(t.nextTriggerAt, t.isActive),
  ],
)

export type SmartReminderRow = typeof smartReminders.$inferSelect
export type SmartReminderInsert = typeof smartReminders.$inferInsert
