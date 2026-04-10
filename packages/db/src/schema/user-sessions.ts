import { sql } from "drizzle-orm"
import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core"
import { users } from "./users"
import { workspaces } from "./workspaces"

/**
 * Refresh-token sessions for dashboard (JWT) authentication.
 *
 * Each row represents one active refresh token.  Tokens are stored as
 * SHA-256 hashes — the raw token is only ever sent to the client.
 *
 * `familyId` groups all tokens that descend from a single login.
 * If a previously-rotated token is replayed the entire family is
 * revoked, preventing stolen-token reuse.
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** SHA-256 hash of the refresh token */
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull(),
    /** Rotation family — all tokens from a single login share this ID */
    familyId: uuid("family_id").notNull(),
    /** Device fingerprint hash for anomalous session detection */
    deviceFingerprint: varchar("device_fingerprint", { length: 64 }),
    /** ISO 3166-1 alpha-2 country code from IP geolocation */
    geoCountry: varchar("geo_country", { length: 3 }),
    geoCity: varchar("geo_city", { length: 100 }),
    /** Risk score computed at session creation (0–100) */
    riskScore: varchar("risk_score", { length: 3 }),
    userAgent: varchar("user_agent", { length: 512 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_user_sessions_token").on(t.refreshTokenHash),
    index("idx_user_sessions_family").on(t.familyId),
    index("idx_user_sessions_user").on(t.userId),
  ],
)

export type UserSession = typeof userSessions.$inferSelect
export type UserSessionInsert = typeof userSessions.$inferInsert
