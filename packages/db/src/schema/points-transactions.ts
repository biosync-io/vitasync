import { sql } from "drizzle-orm"
import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Points transaction ledger for the gamification system.
 *
 * Every point award or deduction is recorded here. The user's running
 * total is denormalised on the `users.totalPoints` column for fast reads;
 * this table is the source of truth for history and leaderboard queries.
 */
export const pointsTransactions = pgTable(
  "points_transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Point delta (positive = earned, negative = spent/deducted) */
    points: integer("points").notNull(),
    /** Reason category: goal_completed, achievement_unlocked, challenge_won, streak_milestone, daily_check_in */
    reason: varchar("reason", { length: 50 }).notNull(),
    /** Human-readable description */
    description: varchar("description", { length: 500 }).notNull(),
    /** Optional related entity type: goal, achievement, challenge */
    relatedType: varchar("related_type", { length: 30 }),
    /** Optional related entity ID */
    relatedId: uuid("related_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_points_transactions_user").on(t.userId),
    index("idx_points_transactions_user_reason").on(t.userId, t.reason),
    index("idx_points_transactions_created").on(t.createdAt),
  ],
)

export type PointsTransactionRow = typeof pointsTransactions.$inferSelect
export type PointsTransactionInsert = typeof pointsTransactions.$inferInsert
