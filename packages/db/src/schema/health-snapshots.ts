import { sql } from "drizzle-orm"
import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Periodic health snapshots (weekly/monthly wellness summaries).
 *
 * Captures a point-in-time state of all key health dimensions:
 * a user's "health photograph" for comparison over time.
 */
export const healthSnapshots = pgTable(
  "health_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Snapshot period: weekly, monthly */
    periodType: varchar("period_type", { length: 20 }).notNull(),
    /** Start of the period */
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** Overall composite score for this period */
    overallScore: doublePrecision("overall_score"),
    /** Key metric averages for the period */
    avgSteps: doublePrecision("avg_steps"),
    avgSleepMinutes: doublePrecision("avg_sleep_minutes"),
    avgRestingHr: doublePrecision("avg_resting_hr"),
    avgHrv: doublePrecision("avg_hrv"),
    avgCalories: doublePrecision("avg_calories"),
    avgActiveMinutes: doublePrecision("avg_active_minutes"),
    avgWeight: doublePrecision("avg_weight"),
    avgStress: doublePrecision("avg_stress"),
    avgRecovery: doublePrecision("avg_recovery"),
    /** Number of workouts in the period */
    workoutCount: doublePrecision("workout_count"),
    /** Total active distance */
    totalDistanceMeters: doublePrecision("total_distance_meters"),
    /** Goals met percentage */
    goalCompletionRate: doublePrecision("goal_completion_rate"),
    /** Average mood score for the period */
    avgMoodScore: doublePrecision("avg_mood_score"),
    /** Comparison with previous period (percent change per metric) */
    periodComparison: jsonb("period_comparison").$type<Record<string, number>>(),
    /** Notable achievements during this period */
    achievements: jsonb("achievements").$type<string[]>(),
    /** Key observations and trends */
    observations: jsonb("observations").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_health_snapshots_user").on(t.userId),
    unique("uq_health_snapshots_user_period").on(t.userId, t.periodType, t.periodStart),
  ],
)

export type HealthSnapshotRow = typeof healthSnapshots.$inferSelect
export type HealthSnapshotInsert = typeof healthSnapshots.$inferInsert
