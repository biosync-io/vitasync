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
 * Daily composite health score (0–100).
 *
 * Computed by the health-score processor from weighted sub-scores across
 * sleep, activity, cardio, recovery, and body metrics.
 */
export const healthScores = pgTable(
  "health_scores",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The date this score applies to (one score per day) */
    date: timestamp("date", { withTimezone: true }).notNull(),
    /** Composite score 0–100 */
    overallScore: doublePrecision("overall_score").notNull(),
    /** Sub-score breakdowns */
    sleepScore: doublePrecision("sleep_score"),
    activityScore: doublePrecision("activity_score"),
    cardioScore: doublePrecision("cardio_score"),
    recoveryScore: doublePrecision("recovery_score"),
    bodyScore: doublePrecision("body_score"),
    /** Change from previous day's score */
    deltaFromPrevious: doublePrecision("delta_from_previous"),
    /** 7-day rolling average */
    weeklyAverage: doublePrecision("weekly_average"),
    /** Percentile rank among all platform users */
    percentileRank: doublePrecision("percentile_rank"),
    /** Grade classification: A+, A, B+, B, C+, C, D, F */
    grade: varchar("grade", { length: 5 }),
    /** Detailed breakdown and contributing factors */
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_health_scores_user_date").on(t.userId, t.date),
    unique("uq_health_scores_user_date").on(t.userId, t.date),
  ],
)

export type HealthScoreRow = typeof healthScores.$inferSelect
export type HealthScoreInsert = typeof healthScores.$inferInsert
