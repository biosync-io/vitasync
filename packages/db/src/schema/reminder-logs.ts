import { sql } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"
import { smartReminders } from "./smart-reminders"

/**
 * Audit log for smart reminder actions.
 *
 * Tracks every reminder sent, snoozed, dismissed, or completed.
 * Includes a snapshot of goal progress at the time of the reminder
 * for historical analysis and feedback.
 */
export const reminderLogs = pgTable(
  "reminder_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reminderId: uuid("reminder_id")
      .notNull()
      .references(() => smartReminders.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Action: sent, snoozed, dismissed, completed */
    action: varchar("action", { length: 30 }).notNull(),
    /** Snooze duration in minutes (only for "snoozed" action) */
    snoozeDuration: integer("snooze_duration"),
    /** Snapshot of related goal progress at the time of this log */
    progressSnapshot: jsonb("progress_snapshot").$type<Record<string, unknown>>(),
    /** Optional feedback message attached to this action */
    feedback: varchar("feedback", { length: 1000 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_reminder_logs_reminder").on(t.reminderId),
    index("idx_reminder_logs_user").on(t.userId),
    index("idx_reminder_logs_user_action").on(t.userId, t.action),
  ],
)

export type ReminderLogRow = typeof reminderLogs.$inferSelect
export type ReminderLogInsert = typeof reminderLogs.$inferInsert
