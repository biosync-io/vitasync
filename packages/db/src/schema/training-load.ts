import { sql } from "drizzle-orm"
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Daily training load metrics (one row per user per day).
 *
 * Tracks acute (ATL) and chronic (CTL) training load using exponentially
 * weighted moving averages, plus the Training Stress Balance (TSB).
 * Computed by the analytics processor after each sync.
 */
export const trainingLoad = pgTable(
  "training_load",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The date this load applies to (one entry per day) */
    date: timestamp("date", { withTimezone: true }).notNull(),
    /** Daily strain score (TRIMP-like: workout duration × intensity²) */
    dailyStrain: doublePrecision("daily_strain").notNull().default(0),
    /** Acute Training Load — 7-day EWMA of daily strain */
    atl: doublePrecision("atl").notNull().default(0),
    /** Chronic Training Load — 42-day EWMA of daily strain */
    ctl: doublePrecision("ctl").notNull().default(0),
    /** Training Stress Balance: CTL - ATL */
    tsb: doublePrecision("tsb").notNull().default(0),
    /** Training status: peaked, fresh, neutral, fatigued, overreached */
    status: varchar("status", { length: 20 }).notNull().default("neutral"),
    /** Number of workouts on this day */
    workoutCount: integer("workout_count").notNull().default(0),
    /** Total workout duration in minutes */
    totalDurationMin: integer("total_duration_min").notNull().default(0),
    /** Total calories burned */
    totalCalories: integer("total_calories").notNull().default(0),
    /** Extra breakdown data */
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_training_load_user_date").on(t.userId, t.date),
    unique("uq_training_load_user_date").on(t.userId, t.date),
  ],
)

export type TrainingLoadRow = typeof trainingLoad.$inferSelect
export type TrainingLoadInsert = typeof trainingLoad.$inferInsert
