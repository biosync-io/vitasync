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
 * Notification channel configurations per user.
 *
 * Each row represents a user's configured notification channel (Discord,
 * Slack, Teams, Email, Push, ntfy, Webhook). The `config` JSONB column
 * stores channel-specific settings (webhook URL, SMTP details, etc.).
 */
export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Channel type: discord, slack, teams, email, push, ntfy, webhook */
    channelType: varchar("channel_type", { length: 30 }).notNull(),
    /** Human-readable label, e.g. "Work Slack" */
    label: varchar("label", { length: 100 }).notNull(),
    /** Channel-specific configuration (webhook URL, SMTP, etc.) */
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    /** Whether this channel is currently active */
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_notification_channels_user").on(t.userId),
    index("idx_notification_channels_type").on(t.userId, t.channelType),
  ],
)

export type NotificationChannelRow = typeof notificationChannels.$inferSelect
export type NotificationChannelInsert = typeof notificationChannels.$inferInsert
