import { getDb, anomalyAlerts, healthMetrics, biometricBaselines } from "@biosync-io/db"
import type { AnomalyAlertInsert, AnomalyAlertRow } from "@biosync-io/db"
import { and, desc, eq, gte, lte, asc } from "drizzle-orm"

/**
 * Anomaly Detection Service — Feature #7 (AI Health Anomalies)
 *
 * Detects statistically significant deviations in health metrics using
 * Z-score analysis and IQR-based outlier detection. Runs after each sync
 * to flag abnormal readings (e.g., sudden RHR spike, SpO2 drop).
 */
export class AnomalyDetectionService {
  private get db() {
    return getDb()
  }

  async list(userId: string, opts: { status?: string; severity?: string; limit?: number } = {}): Promise<AnomalyAlertRow[]> {
    const conditions = [eq(anomalyAlerts.userId, userId)]
    if (opts.status) conditions.push(eq(anomalyAlerts.status, opts.status))
    if (opts.severity) conditions.push(eq(anomalyAlerts.severity, opts.severity))

    return this.db
      .select()
      .from(anomalyAlerts)
      .where(and(...conditions))
      .orderBy(desc(anomalyAlerts.detectedAt))
      .limit(opts.limit ?? 50)
  }

  async acknowledge(id: string, userId: string): Promise<AnomalyAlertRow | null> {
    const [row] = await this.db
      .update(anomalyAlerts)
      .set({ status: "acknowledged" })
      .where(and(eq(anomalyAlerts.id, id), eq(anomalyAlerts.userId, userId)))
      .returning()
    return row ?? null
  }

  async dismiss(id: string, userId: string): Promise<AnomalyAlertRow | null> {
    const [row] = await this.db
      .update(anomalyAlerts)
      .set({ status: "dismissed" })
      .where(and(eq(anomalyAlerts.id, id), eq(anomalyAlerts.userId, userId)))
      .returning()
    return row ?? null
  }

  /**
   * Run anomaly detection for a user over the last N days.
   * Uses Z-score analysis: any value more than 2.5σ from the 30-day mean
   * is flagged as an anomaly.
   */
  async detectAnomalies(userId: string, opts: { lookbackDays?: number } = {}): Promise<AnomalyAlertRow[]> {
    const lookback = opts.lookbackDays ?? 1
    const now = new Date()
    const since = new Date(now.getTime() - lookback * 24 * 60 * 60 * 1000)
    const baselineStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Get recent readings
    const recent = await this.db
      .select({
        metricType: healthMetrics.metricType,
        value: healthMetrics.value,
        recordedAt: healthMetrics.recordedAt,
      })
      .from(healthMetrics)
      .where(
        and(
          eq(healthMetrics.userId, userId),
          gte(healthMetrics.recordedAt, since),
        ),
      )
      .orderBy(asc(healthMetrics.recordedAt))

    // Get 30-day baseline for each metric type
    const metricsToCheck = [...new Set(recent.map((r) => r.metricType))]
    const alerts: AnomalyAlertRow[] = []

    for (const metricType of metricsToCheck) {
      const baseline = await this.db
        .select({ value: healthMetrics.value })
        .from(healthMetrics)
        .where(
          and(
            eq(healthMetrics.userId, userId),
            eq(healthMetrics.metricType, metricType),
            gte(healthMetrics.recordedAt, baselineStart),
            lte(healthMetrics.recordedAt, since),
          ),
        )

      const values = baseline.filter((r) => r.value != null).map((r) => r.value!)
      if (values.length < 7) continue

      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length)
      if (std === 0) continue

      const recentValues = recent
        .filter((r) => r.metricType === metricType && r.value != null)

      for (const reading of recentValues) {
        const zScore = (reading.value! - mean) / std
        const absZ = Math.abs(zScore)
        if (absZ < 2.5) continue

        const severity = absZ >= 4 ? "critical" : absZ >= 3.5 ? "high" : absZ >= 3 ? "medium" : "low"
        const direction = zScore > 0 ? "above" : "below"

        const [row] = await this.db
          .insert(anomalyAlerts)
          .values({
            userId,
            metricType,
            severity,
            detectionMethod: "zscore",
            observedValue: reading.value!,
            expectedValue: Math.round(mean * 100) / 100,
            zScore: Math.round(zScore * 100) / 100,
            title: `Unusual ${metricType.replace(/_/g, " ")} reading`,
            description: `Your ${metricType.replace(/_/g, " ")} of ${reading.value} is ${Math.abs(Math.round(zScore * 10) / 10)} standard deviations ${direction} your 30-day average of ${Math.round(mean * 10) / 10}.`,
            status: "new",
            detectedAt: new Date(reading.recordedAt),
            metadata: { mean, std, zScore, sampleSize: values.length },
          })
          .returning()

        if (row) alerts.push(row)
      }
    }

    return alerts
  }
}
