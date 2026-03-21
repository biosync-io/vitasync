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
import { notificationChannels } from "./notification-channels"

/**
 * Delivery audit log for notifications.
 *
 * Every dispatch attempt is logged here for debugging and analytics.
 */
export const notificationLogs = pgTable(
  "notification_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => notificationChannels.id, { onDelete: "cascade" }),
    /** Channel type at time of delivery (denormalized for fast querying) */
    channelType: varchar("channel_type", { length: 30 }).notNull(),
    /** Notification title */
    title: varchar("title", { length: 255 }).notNull(),
    /** full payload sent */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Delivery status: pending, delivered, failed */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    /** Number of attempts made */
    attempts: integer("attempts").notNull().default(0),
    /** Error message if delivery failed */
    error: varchar("error", { length: 2000 }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_notification_logs_user").on(t.userId),
    index("idx_notification_logs_channel").on(t.channelId),
    index("idx_notification_logs_status").on(t.status),
  ],
)

export type NotificationLogRow = typeof notificationLogs.$inferSelect
export type NotificationLogInsert = typeof notificationLogs.$inferInsert
