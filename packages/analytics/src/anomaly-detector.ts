import { getDb, healthMetrics, biometricBaselines, anomalyAlerts } from "@biosync-io/db"
import type { AnomalyAlertInsert } from "@biosync-io/db"
import { and, eq, gte, lte, asc } from "drizzle-orm"

// ── Types ───────────────────────────────────────────────────────

export interface AnomalyResult {
  metricType: string
  severity: string
  observedValue: number
  expectedValue: number
  zScore: number
  title: string
  description: string
  detectedAt: string
}

export interface AnomalyThreshold {
  metricType: string
  /** Absolute lower bound — values below this trigger an alert */
  lowerBound?: number
  /** Absolute upper bound — values above this trigger an alert */
  upperBound?: number
  severity: string
}

// Built-in clinical thresholds
const CLINICAL_THRESHOLDS: AnomalyThreshold[] = [
  { metricType: "blood_oxygen", lowerBound: 92, severity: "critical" },
  { metricType: "blood_oxygen", lowerBound: 95, severity: "warning" },
  { metricType: "resting_heart_rate", upperBound: 120, severity: "critical" },
  { metricType: "resting_heart_rate", upperBound: 100, severity: "high" },
  { metricType: "heart_rate", upperBound: 200, severity: "critical" },
  { metricType: "respiratory_rate", lowerBound: 8, severity: "critical" },
  { metricType: "respiratory_rate", upperBound: 30, severity: "high" },
  { metricType: "body_temperature", upperBound: 39.5, severity: "critical" },
  { metricType: "body_temperature", lowerBound: 35, severity: "critical" },
  { metricType: "stress", upperBound: 90, severity: "high" },
]

// ── Statistical Helpers ─────────────────────────────────────────

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length)
}

function iqrBounds(values: number[]): { lower: number; upper: number } {
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]!
  const q3 = sorted[Math.floor(sorted.length * 0.75)]!
  const iqr = q3 - q1
  return { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr }
}

// ── Anomaly Detector ────────────────────────────────────────────

/**
 * Multi-method anomaly detection:
 * 1. Z-score analysis (values > 2.5σ from 30-day mean)
 * 2. IQR-based outlier detection
 * 3. Clinical threshold checks (SpO2, HR, respiratory, temperature)
 */
export async function detectAnomalies(
  userId: string,
  opts: { lookbackDays?: number } = {},
): Promise<AnomalyResult[]> {
  const db = getDb()
  const lookback = opts.lookbackDays ?? 1
  const now = new Date()
  const since = new Date(now.getTime() - lookback * 24 * 60 * 60 * 1000)
  const baselineStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Get recent readings
  const recent = await db
    .select({
      metricType: healthMetrics.metricType,
      value: healthMetrics.value,
      recordedAt: healthMetrics.recordedAt,
    })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, since)))
    .orderBy(asc(healthMetrics.recordedAt))

  const metricsToCheck = [...new Set(recent.map((r) => r.metricType))]
  const alerts: AnomalyResult[] = []
  const seen = new Set<string>()

  for (const metricType of metricsToCheck) {
    // Get 30-day baseline
    const baseline = await db
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
    const recentValues = recent.filter((r) => r.metricType === metricType && r.value != null)

    // Method 1: Z-score analysis
    if (values.length >= 7) {
      const m = mean(values)
      const s = stddev(values)
      if (s > 0) {
        for (const reading of recentValues) {
          const z = (reading.value! - m) / s
          const absZ = Math.abs(z)
          if (absZ < 2.5) continue

          const key = `zscore:${metricType}:${new Date(reading.recordedAt).toISOString().slice(0, 10)}`
          if (seen.has(key)) continue
          seen.add(key)

          const severity = absZ >= 4 ? "critical" : absZ >= 3.5 ? "high" : absZ >= 3 ? "medium" : "low"
          const direction = z > 0 ? "above" : "below"
          const label = metricType.replace(/_/g, " ")

          alerts.push({
            metricType,
            severity,
            observedValue: reading.value!,
            expectedValue: Math.round(m * 100) / 100,
            zScore: Math.round(z * 100) / 100,
            title: `Unusual ${label} reading`,
            description: `Your ${label} of ${reading.value} is ${Math.abs(Math.round(z * 10) / 10)} standard deviations ${direction} your 30-day average of ${Math.round(m * 10) / 10}.`,
            detectedAt: new Date(reading.recordedAt).toISOString(),
          })
        }
      }

      // Method 2: IQR outlier detection
      const bounds = iqrBounds(values)
      for (const reading of recentValues) {
        if (reading.value! >= bounds.lower && reading.value! <= bounds.upper) continue
        const key = `iqr:${metricType}:${new Date(reading.recordedAt).toISOString().slice(0, 10)}`
        if (seen.has(key)) continue
        seen.add(key)

        const direction = reading.value! < bounds.lower ? "below" : "above"
        const label = metricType.replace(/_/g, " ")

        alerts.push({
          metricType,
          severity: "medium",
          observedValue: reading.value!,
          expectedValue: Math.round(m * 100) / 100,
          zScore: s > 0 ? Math.round(((reading.value! - m) / s) * 100) / 100 : 0,
          title: `${label} outside expected range`,
          description: `Your ${label} of ${reading.value} is ${direction} the interquartile range (${Math.round(bounds.lower * 10) / 10}–${Math.round(bounds.upper * 10) / 10}).`,
          detectedAt: new Date(reading.recordedAt).toISOString(),
        })
      }
    }

    // Method 3: Clinical thresholds
    const thresholds = CLINICAL_THRESHOLDS.filter((t) => t.metricType === metricType)
    for (const threshold of thresholds) {
      for (const reading of recentValues) {
        const val = reading.value!
        let triggered = false
        let direction = ""
        if (threshold.lowerBound !== undefined && val < threshold.lowerBound) {
          triggered = true
          direction = "below"
        }
        if (threshold.upperBound !== undefined && val > threshold.upperBound) {
          triggered = true
          direction = "above"
        }
        if (!triggered) continue

        const key = `threshold:${metricType}:${direction}:${new Date(reading.recordedAt).toISOString().slice(0, 10)}`
        if (seen.has(key)) continue
        seen.add(key)

        const label = metricType.replace(/_/g, " ")
        const bound = direction === "below" ? threshold.lowerBound! : threshold.upperBound!

        alerts.push({
          metricType,
          severity: threshold.severity,
          observedValue: val,
          expectedValue: bound,
          zScore: 0,
          title: `${label} ${direction} clinical threshold`,
          description: `Your ${label} of ${val} is ${direction} the clinical threshold of ${bound}. This may require attention.`,
          detectedAt: new Date(reading.recordedAt).toISOString(),
        })
      }
    }
  }

  // Persist to DB
  if (alerts.length > 0) {
    const rows: AnomalyAlertInsert[] = alerts.map((a) => ({
      userId,
      metricType: a.metricType,
      severity: a.severity,
      detectionMethod: a.zScore !== 0 ? "zscore" : "threshold",
      observedValue: a.observedValue,
      expectedValue: a.expectedValue,
      zScore: a.zScore,
      title: a.title,
      description: a.description,
      status: "new",
      detectedAt: new Date(a.detectedAt),
    }))

    await db.insert(anomalyAlerts).values(rows)
  }

  return alerts
}
