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
 * Rolling biometric baselines for each user.
 *
 * Computed daily by the baseline processor: 30-day rolling averages,
 * standard deviations, and percentile distributions for each metric type.
 * Used by anomaly detection, insights, and health scoring.
 */
export const biometricBaselines = pgTable(
  "biometric_baselines",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metricType: varchar("metric_type", { length: 50 }).notNull(),
    /** Baseline date (one entry per metric per day) */
    date: timestamp("date", { withTimezone: true }).notNull(),
    /** 30-day rolling mean */
    mean: doublePrecision("mean").notNull(),
    /** 30-day rolling standard deviation */
    stddev: doublePrecision("stddev"),
    /** Minimum in the window */
    min: doublePrecision("min"),
    /** Maximum in the window */
    max: doublePrecision("max"),
    /** Median (P50) */
    median: doublePrecision("median"),
    /** 25th and 75th percentiles */
    p25: doublePrecision("p25"),
    p75: doublePrecision("p75"),
    /** Number of data points in the window */
    sampleSize: doublePrecision("sample_size"),
    /** Trend direction: rising, falling, stable */
    trend: varchar("trend", { length: 10 }),
    /** Slope of linear regression over the window */
    trendSlope: doublePrecision("trend_slope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_biometric_baselines_user_metric").on(t.userId, t.metricType, t.date),
    unique("uq_biometric_baselines_user_metric_date").on(t.userId, t.metricType, t.date),
  ],
)

export type BiometricBaselineRow = typeof biometricBaselines.$inferSelect
export type BiometricBaselineInsert = typeof biometricBaselines.$inferInsert
