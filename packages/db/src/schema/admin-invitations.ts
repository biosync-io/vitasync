import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core"
import { users } from "./users"

export const adminInvitations = pgTable("admin_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => users.id),
  role: varchar("role", { length: 50 }).notNull().default("admin"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export type AdminInvitation = typeof adminInvitations.$inferSelect
export type AdminInvitationInsert = typeof adminInvitations.$inferInsert
