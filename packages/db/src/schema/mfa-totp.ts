import { sql } from "drizzle-orm"
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * TOTP (Time-Based One-Time Password) MFA configuration.
 *
 * Each user has at most one TOTP enrollment.  The `secret` is
 * encrypted with AES-256-GCM using the ENCRYPTION_KEY.  Recovery
 * codes are one-time-use bcrypt hashes — consumed codes are removed
 * from the array.
 */
export const mfaTotp = pgTable("mfa_totp", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** TOTP shared secret — encrypted with AES-256-GCM */
  secret: text("secret").notNull(),
  /** True once the user has confirmed enrollment with a valid code */
  verified: boolean("verified").notNull().default(false),
  /** Encrypted one-time recovery codes (consumed codes are removed) */
  recoveryCodes: text("recovery_codes").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type MfaTotp = typeof mfaTotp.$inferSelect
export type MfaTotpInsert = typeof mfaTotp.$inferInsert
