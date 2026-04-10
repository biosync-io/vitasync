import { sql } from "drizzle-orm"
import { boolean, index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * GDPR consent tracking.
 *
 * Each row records a user's consent (or withdrawal) for a specific
 * processing purpose.  The `version` field tracks which version of
 * the consent policy was presented to the user.
 */
export const userConsents = pgTable(
  "user_consents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Consent purpose: 'data_processing', 'health_data_sharing', 'analytics', 'marketing' */
    consentType: varchar("consent_type", { length: 100 }).notNull(),
    granted: boolean("granted").notNull(),
    /** Version of the consent policy that was presented */
    version: varchar("version", { length: 20 }).notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ipAddress: varchar("ip_address", { length: 45 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_consent_user").on(t.userId),
    index("idx_consent_type").on(t.userId, t.consentType),
  ],
)

export type UserConsent = typeof userConsents.$inferSelect
export type UserConsentInsert = typeof userConsents.$inferInsert
