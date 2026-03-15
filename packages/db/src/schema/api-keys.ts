import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { workspaces } from "./workspaces"

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    /** SHA-256 hash of the full API key — never store the raw key */
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
    /** First 8 chars of the raw key for display/identification */
    keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
    /** e.g., ["read", "write"] */
    scopes: text("scopes").array().notNull().default(sql`ARRAY['read']::text[]`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_api_keys_workspace").on(t.workspaceId)],
)

export type ApiKey = typeof apiKeys.$inferSelect
export type ApiKeyInsert = typeof apiKeys.$inferInsert
