import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

// ── Materialized Read-Model Projections ─────────────────────────
//
// Denormalized tables optimized for dashboard queries.
// Kept in sync by ProjectionService listening to domain events.

/**
 * Latest health score per user.
 * Avoids expensive joins/aggregations on the hot read path.
 */
export const healthScoreProjection = pgTable(
  "health_score_projection",
  {
    userId: uuid("user_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    overallScore: doublePrecision("overall_score"),
    cardioScore: doublePrecision("cardio_score"),
    sleepScore: doublePrecision("sleep_score"),
    recoveryScore: doublePrecision("recovery_score"),
    activityScore: doublePrecision("activity_score"),
    mentalScore: doublePrecision("mental_score"),
    trend: varchar("trend", { length: 20 }),
    computedAt: timestamp("computed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_health_score_proj_workspace").on(t.workspaceId),
  ],
)

export type HealthScoreProjectionRow = typeof healthScoreProjection.$inferSelect
export type HealthScoreProjectionInsert = typeof healthScoreProjection.$inferInsert

/**
 * Daily health summary per user.
 * Aggregates the day's key metrics into a single row for fast dashboard loading.
 */
export const dailySummaryProjection = pgTable(
  "daily_summary_projection",
  {
    userId: uuid("user_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    date: date("date").notNull(),
    steps: integer("steps"),
    caloriesBurned: doublePrecision("calories_burned"),
    activeMinutes: integer("active_minutes"),
    sleepHours: doublePrecision("sleep_hours"),
    sleepScore: doublePrecision("sleep_score"),
    avgHeartRate: doublePrecision("avg_heart_rate"),
    restingHeartRate: doublePrecision("resting_heart_rate"),
    hrvAvg: doublePrecision("hrv_avg"),
    moodScore: doublePrecision("mood_score"),
    readinessScore: doublePrecision("readiness_score"),
    waterMl: integer("water_ml"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.date] }),
    index("idx_daily_summary_proj_workspace").on(t.workspaceId),
    index("idx_daily_summary_proj_user_date").on(t.userId, t.date),
  ],
)

export type DailySummaryProjectionRow = typeof dailySummaryProjection.$inferSelect
export type DailySummaryProjectionInsert = typeof dailySummaryProjection.$inferInsert

/**
 * Current readiness per user.
 * Pre-computed from HRV, sleep, and recovery events for instant API responses.
 */
export const readinessProjection = pgTable(
  "readiness_projection",
  {
    userId: uuid("user_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    score: doublePrecision("score"),
    hrvStatus: varchar("hrv_status", { length: 20 }),
    sleepStatus: varchar("sleep_status", { length: 20 }),
    recoveryStatus: varchar("recovery_status", { length: 20 }),
    trainingLoad: doublePrecision("training_load"),
    fitness: doublePrecision("fitness"),
    fatigue: doublePrecision("fatigue"),
    recommendation: varchar("recommendation", { length: 100 }),
    computedAt: timestamp("computed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_readiness_proj_workspace").on(t.workspaceId),
  ],
)

export type ReadinessProjectionRow = typeof readinessProjection.$inferSelect
export type ReadinessProjectionInsert = typeof readinessProjection.$inferInsert
