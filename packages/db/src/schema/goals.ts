import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * User-defined health goals (e.g., "Walk 10K steps daily", "Sleep 8 hours").
 *
 * Goals can be metric-based (auto-tracked from health data) or custom
 * (manually updated). Supports daily, weekly, and monthly cadences.
 */
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Display name, e.g. "Daily Steps Goal" */
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 1000 }),
    /** Goal category: activity, sleep, heart, body, nutrition, custom */
    category: varchar("category", { length: 50 }).notNull(),
    /** Linked metric type for auto-tracking (null for manual goals) */
    metricType: varchar("metric_type", { length: 50 }),
    /** Target value */
    targetValue: doublePrecision("target_value").notNull(),
    /** Unit of target */
    unit: varchar("unit", { length: 20 }),
    /** Cadence: daily, weekly, monthly */
    cadence: varchar("cadence", { length: 20 }).notNull(),
    /** Current progress value (updated on each sync) */
    currentValue: doublePrecision("current_value").default(0),
    /** Best achieved value */
    bestValue: doublePrecision("best_value"),
    /** Consecutive periods meeting goal */
    currentStreak: doublePrecision("current_streak").default(0),
    /** Longest ever streak */
    longestStreak: doublePrecision("longest_streak").default(0),
    isActive: boolean("is_active").notNull().default(true),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    /** Extra configuration (thresholds, custom rules) */
    config: jsonb("config").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_goals_user").on(t.userId),
    index("idx_goals_user_category").on(t.userId, t.category),
  ],
)

export type GoalRow = typeof goals.$inferSelect
export type GoalInsert = typeof goals.$inferInsert

/**
 * Daily goal progress snapshots.
 *
 * One row per (goal, date) tracking that day's progress.
 */
export const goalProgress = pgTable(
  "goal_progress",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    value: doublePrecision("value").notNull(),
    /** Percentage of target achieved */
    percentComplete: doublePrecision("percent_complete").notNull(),
    /** Whether goal was met for this period */
    met: boolean("met").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_goal_progress_goal_date").on(t.goalId, t.date),
    index("idx_goal_progress_user_date").on(t.userId, t.date),
  ],
)

export type GoalProgressRow = typeof goalProgress.$inferSelect
export type GoalProgressInsert = typeof goalProgress.$inferInsert
