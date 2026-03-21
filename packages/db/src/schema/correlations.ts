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
 * Discovered correlations between health metrics.
 *
 * The correlation engine periodically computes Pearson/Spearman correlations
 * between metric pairs for each user. Only statistically significant
 * correlations (|r| > 0.3, p < 0.05) are stored.
 */
export const correlations = pgTable(
  "correlations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** First metric in the pair */
    metricA: varchar("metric_a", { length: 50 }).notNull(),
    /** Second metric in the pair */
    metricB: varchar("metric_b", { length: 50 }).notNull(),
    /** Pearson correlation coefficient (-1 to 1) */
    pearsonR: doublePrecision("pearson_r").notNull(),
    /** Spearman rank correlation */
    spearmanRho: doublePrecision("spearman_rho"),
    /** P-value for statistical significance */
    pValue: doublePrecision("p_value"),
    /** Number of data point pairs used */
    sampleSize: doublePrecision("sample_size").notNull(),
    /** Strength classification: weak, moderate, strong, very_strong */
    strength: varchar("strength", { length: 20 }).notNull(),
    /** Direction: positive, negative */
    direction: varchar("direction", { length: 10 }).notNull(),
    /** Human-readable insight about this correlation */
    description: varchar("description", { length: 2000 }),
    /** Time lag in days (if lagged correlation) */
    lagDays: doublePrecision("lag_days").default(0),
    /** Analysis period */
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** Extra analysis data */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_correlations_user").on(t.userId),
    unique("uq_correlations_user_metrics_period").on(t.userId, t.metricA, t.metricB, t.periodEnd),
  ],
)

export type CorrelationRow = typeof correlations.$inferSelect
export type CorrelationInsert = typeof correlations.$inferInsert
