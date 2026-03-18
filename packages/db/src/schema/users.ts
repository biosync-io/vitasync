import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core"
import { workspaces } from "./workspaces"

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Stable ID from the caller's own system */
    externalId: varchar("external_id", { length: 255 }),
    email: varchar("email", { length: 255 }),
    displayName: varchar("display_name", { length: 255 }),
    /** Biological sex – used to gate sex-specific insights (e.g. womens_health) */
    sex: varchar("sex", { length: 10 }),
    /** Arbitrary key-value data from the caller */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_users_workspace").on(t.workspaceId),
    index("idx_users_email").on(t.email),
    unique("uq_users_workspace_external").on(t.workspaceId, t.externalId),
  ],
)

export type User = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert
