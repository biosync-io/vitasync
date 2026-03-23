import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * In-app notifications shown in the dashboard notification bell.
 *
 * Created by the notification worker alongside external channel delivery.
 * Users can mark them as read; unread count powers the badge indicator.
 */
export const inAppNotifications = pgTable(
  "in_app_notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    body: varchar("body", { length: 2000 }).notNull(),
    category: varchar("category", { length: 30 }).notNull().default("system"),
    severity: varchar("severity", { length: 20 }).notNull().default("info"),
    /** Optional deep-link path (e.g. /dashboard/reports) */
    link: varchar("link", { length: 500 }),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_in_app_notifications_user").on(t.userId),
    index("idx_in_app_notifications_unread").on(t.userId, t.read),
  ],
)

export type InAppNotificationRow = typeof inAppNotifications.$inferSelect
export type InAppNotificationInsert = typeof inAppNotifications.$inferInsert
