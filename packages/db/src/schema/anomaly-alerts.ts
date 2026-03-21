import { sql } from "drizzle-orm"
import {
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
 * AI-detected health anomalies.
 *
 * Populated by the anomaly-detection processor which runs Z-score and
 * IQR-based outlier detection across all metric types. Each alert
 * represents a statistically significant deviation from the user's baseline.
 */
export const anomalyAlerts = pgTable(
  "anomaly_alerts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The metric type with the anomaly */
    metricType: varchar("metric_type", { length: 50 }).notNull(),
    /** Severity: low, medium, high, critical */
    severity: varchar("severity", { length: 20 }).notNull(),
    /** Detection method: zscore, iqr, trend_break, threshold */
    detectionMethod: varchar("detection_method", { length: 30 }).notNull(),
    /** The anomalous value */
    observedValue: doublePrecision("observed_value").notNull(),
    /** Expected value (baseline) */
    expectedValue: doublePrecision("expected_value").notNull(),
    /** Standard deviations from baseline */
    zScore: doublePrecision("z_score"),
    /** Human-readable description */
    title: varchar("title", { length: 255 }).notNull(),
    description: varchar("description", { length: 2000 }).notNull(),
    /** Status: new, acknowledged, dismissed, resolved */
    status: varchar("status", { length: 20 }).notNull().default("new"),
    /** When the anomalous reading occurred */
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    /** Additional context (trend data, peer comparison) */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_anomaly_alerts_user").on(t.userId),
    index("idx_anomaly_alerts_user_severity").on(t.userId, t.severity),
    index("idx_anomaly_alerts_user_status").on(t.userId, t.status),
  ],
)

export type AnomalyAlertRow = typeof anomalyAlerts.$inferSelect
export type AnomalyAlertInsert = typeof anomalyAlerts.$inferInsert
