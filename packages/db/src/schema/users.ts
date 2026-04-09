import { sql } from "drizzle-orm"
import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core"
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
    /** Gender – used to gate gender-specific insights (e.g. womens_health) */
    gender: varchar("gender", { length: 10 }),
    /** Argon2id password hash — null for API-only / SSO-only users */
    passwordHash: varchar("password_hash", { length: 255 }),
    /** User role: 'user' (own data only) or 'admin' (full workspace access) */
    role: varchar("role", { length: 20 }).notNull().default("user"),
    /** Consecutive failed login attempts — for account lockout */
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    /** Account locked until this timestamp (null = not locked) */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    /** Last successful login timestamp */
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Whether the user's email address has been verified */
    emailVerified: boolean("email_verified").notNull().default(false),
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
