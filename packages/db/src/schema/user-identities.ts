import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core"
import { identityProviders } from "./identity-providers"
import { users } from "./users"

/**
 * Links a VitaSync user to an external identity from an SSO provider.
 *
 * A user can have multiple identities (one per IdP) and an IdP subject
 * maps to exactly one user within the workspace.
 */
export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => identityProviders.id, { onDelete: "cascade" }),
    /** IdP subject / nameID — unique per provider */
    subject: varchar("subject", { length: 512 }).notNull(),
    email: varchar("email", { length: 255 }),
    /** Full claim set from the last login */
    rawAttributes: jsonb("raw_attributes").$type<Record<string, unknown>>().default({}),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_identity_provider_subject").on(t.providerId, t.subject),
    index("idx_identity_user").on(t.userId),
  ],
)

export type UserIdentity = typeof userIdentities.$inferSelect
export type UserIdentityInsert = typeof userIdentities.$inferInsert
