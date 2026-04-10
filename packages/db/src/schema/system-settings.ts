import { jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core"

export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})
