import { sql } from "drizzle-orm"
import { index, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core"

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type Workspace = typeof workspaces.$inferSelect
export type WorkspaceInsert = typeof workspaces.$inferInsert
