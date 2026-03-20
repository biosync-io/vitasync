import { sql } from "drizzle-orm"
import {
  doublePrecision,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Water intake tracking.
 *
 * Each row represents a single water intake log (e.g., one glass, one bottle).
 * Users can track their daily hydration against a configurable goal.
 */
export const waterIntake = pgTable(
  "water_intake",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Amount in milliliters */
    amountMl: integer("amount_ml").notNull(),
    /** Type of beverage: water, tea, coffee, juice, other */
    beverageType: varchar("beverage_type", { length: 30 }).notNull().default("water"),
    /** Optional note (e.g., "post-workout", "with lunch") */
    note: varchar("note", { length: 200 }),
    /** Daily goal in milliliters (snapshot at log time for historical accuracy) */
    dailyGoalMl: integer("daily_goal_ml").default(2500),
    /** When the intake was logged */
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_water_intake_user_time").on(t.userId, t.loggedAt),
  ],
)

export type WaterIntakeRow = typeof waterIntake.$inferSelect
export type WaterIntakeInsert = typeof waterIntake.$inferInsert
