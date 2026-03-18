import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * AI-generated training plans.
 *
 * Created based on user's current fitness level, goals, available metrics,
 * and recovery patterns. Plans contain weekly schedules with workout
 * recommendations, rest days, and progression guidance.
 */
export const trainingPlans = pgTable(
  "training_plans",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    /** Plan goal: general_fitness, weight_loss, endurance, strength, marathon, 5k, recovery */
    goal: varchar("goal", { length: 50 }).notNull(),
    /** Difficulty: beginner, intermediate, advanced, elite */
    difficulty: varchar("difficulty", { length: 20 }).notNull(),
    /** Duration in weeks */
    durationWeeks: integer("duration_weeks").notNull(),
    /** Current week (1-based) */
    currentWeek: integer("current_week").notNull().default(1),
    /** Status: active, paused, completed, abandoned */
    status: varchar("status", { length: 20 }).notNull().default("active"),
    /** Weekly workout schedule with workout types, durations, intensities */
    schedule: jsonb("schedule").$type<Record<string, unknown>[]>(),
    /** Weekly target metrics (steps, distance, active minutes per week) */
    weeklyTargets: jsonb("weekly_targets").$type<Record<string, number>>(),
    /** Adherence percentage (workouts completed / scheduled) */
    adherenceRate: doublePrecision("adherence_rate").default(0),
    /** AI-generated progression notes */
    progressionNotes: jsonb("progression_notes").$type<string[]>(),
    /** Whether the plan auto-adjusts based on performance */
    adaptive: boolean("adaptive").notNull().default(true),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_training_plans_user").on(t.userId),
    index("idx_training_plans_user_status").on(t.userId, t.status),
  ],
)

export type TrainingPlanRow = typeof trainingPlans.$inferSelect
export type TrainingPlanInsert = typeof trainingPlans.$inferInsert
