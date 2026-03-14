import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "./users"

/**
 * A user's OAuth connection to a wearable provider.
 * Tokens are stored encrypted (AES-256-GCM) in the application layer.
 */
export const providerConnections = pgTable(
  "provider_connections",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stable provider ID matching ProviderDefinition.id (e.g., "garmin") */
    providerId: varchar("provider_id", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    /** AES-256-GCM encrypted JSON containing OAuthTokens */
    encryptedTokens: text("encrypted_tokens"),
    /** Provider's own user/account ID */
    providerUserId: varchar("provider_user_id", { length: 255 }),
    scopes: text("scopes").array(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_connections_user").on(t.userId),
    index("idx_connections_provider").on(t.providerId),
    index("idx_connections_status").on(t.status),
    unique("uq_connections_user_provider").on(t.userId, t.providerId),
  ],
)

export type ProviderConnection = typeof providerConnections.$inferSelect
export type ProviderConnectionInsert = typeof providerConnections.$inferInsert
