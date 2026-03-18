import { getDb, healthMetrics, events } from "@biosync-io/db"
import { and, eq, gte, lte, sql, desc, asc } from "drizzle-orm"

// ── Types ───────────────────────────────────────────────────────

export type InsightSeverity = "info" | "positive" | "warning" | "critical"
export type InsightCategory =
  | "cardio"
  | "sleep"
  | "activity"
  | "body"
  | "recovery"
  | "respiratory"
  | "metabolic"
  | "workout"
  | "trend"
  | "anomaly"

export interface Insight {
  id: string
  algorithmId: string
  title: string
  description: string
  category: InsightCategory
  severity: InsightSeverity
  value: number | null
  unit: string | null
  referenceRange: { low: number; high: number } | null
  metadata: Record<string, unknown>
}

export interface InsightAlgorithm {
  id: string
  name: string
  description: string
  category: InsightCategory
  requiredMetrics: string[]
}

interface DayStat {
  date: string
  avg: number | null
  min: number | null
  max: number | null
  sum: number | null
  count: number
}

// ── Helpers ─────────────────────────────────────────────────────

function makeInsight(
  alg: InsightAlgorithm,
  severity: InsightSeverity,
  description: string,
  value: number | null,
  unit: string | null,
  referenceRange: { low: number; high: number } | null,
  metadata: Record<string, unknown> = {},
): Insight {
  return {
    id: `insight-${alg.id}-${Date.now()}`,
    algorithmId: alg.id,
    title: alg.name,
    description,
    category: alg.category,
    severity,
    value,
    unit,
    referenceRange,
    metadata,
  }
}

function trend(values: number[]): "rising" | "falling" | "stable" {
  if (values.length < 3) return "stable"
  const half = Math.floor(values.length / 2)
  const firstHalf = values.slice(0, half)
  const secondHalf = values.slice(half)
  const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
  const diff = ((avg2 - avg1) / (avg1 || 1)) * 100
  if (diff > 5) return "rising"
  if (diff < -5) return "falling"
  return "stable"
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

function movingAverage(values: number[], window: number): number[] {
  const result: number[] = []
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1)
    const slice = values.slice(start, i + 1)
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length)
  }
  return result
}

function coefficientOfVariation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  return (stddev(values) / mean) * 100
}

function linearSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i]! - yMean)
    den += (i - xMean) ** 2
  }
  return den === 0 ? 0 : num / den
}

// ── Algorithm Definitions ───────────────────────────────────────

export const ALGORITHMS: InsightAlgorithm[] = [
  // ── Cardio (1-10) ──
  { id: "rhr-zone", name: "Resting Heart Rate Zone", description: "Classifies resting HR into clinical zones (athlete/excellent/good/above average/poor)", category: "cardio", requiredMetrics: ["resting_heart_rate"] },
  { id: "rhr-trend", name: "Resting HR Trend", description: "Detects rising/falling RHR trends over the past 14 days", category: "cardio", requiredMetrics: ["resting_heart_rate"] },
  { id: "hr-recovery", name: "Heart Rate Recovery", description: "Estimates cardiac recovery capacity from post-workout HR drop", category: "cardio", requiredMetrics: ["heart_rate", "workout"] },
  { id: "hrv-baseline", name: "HRV Baseline Status", description: "Compares current HRV to 30-day rolling baseline (Bayesian deviation)", category: "cardio", requiredMetrics: ["heart_rate_variability"] },
  { id: "hrv-trend", name: "HRV 14-Day Trend", description: "Tracks autonomic nervous system adaptation via HRV slope", category: "cardio", requiredMetrics: ["heart_rate_variability"] },
  { id: "hrv-coherence", name: "HRV Coherence Score", description: "Measures the coefficient of variation of daily HRV — low CV = high coherence", category: "cardio", requiredMetrics: ["heart_rate_variability"] },
  { id: "max-hr-estimate", name: "Estimated Max HR Utilization", description: "Percentage of age-predicted max HR reached during workouts", category: "cardio", requiredMetrics: ["heart_rate"] },
  { id: "hr-zones-dist", name: "HR Zone Distribution", description: "Breakdown of time spent in fat-burn, cardio, and peak zones", category: "cardio", requiredMetrics: ["heart_rate"] },
  { id: "cardiac-drift", name: "Cardiac Drift Detection", description: "Detects abnormal HR rise during steady-state exercise (decoupling)", category: "cardio", requiredMetrics: ["heart_rate", "workout"] },
  { id: "rhr-anomaly", name: "Resting HR Anomaly", description: "Z-score anomaly detection on daily RHR", category: "cardio", requiredMetrics: ["resting_heart_rate"] },

  // ── Sleep (11-20) ──
  { id: "sleep-duration", name: "Sleep Duration Assessment", description: "Classifies nightly sleep vs CDC/NSF recommendations (7-9h adults)", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-efficiency", name: "Sleep Efficiency", description: "Ratio of actual sleep to time in bed — targets >85%", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "deep-sleep-ratio", name: "Deep Sleep Ratio", description: "Evaluates SWS proportion — optimal is 15-25% of total sleep", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "rem-sleep-ratio", name: "REM Sleep Ratio", description: "Evaluates REM proportion — optimal is 20-25% of total sleep", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-consistency", name: "Sleep Schedule Consistency", description: "Measures bedtime/wake-time variability (social jet lag indicator)", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-debt", name: "Cumulative Sleep Debt", description: "Tracks cumulative sleep deficit over 7 days vs 8h target", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-latency", name: "Sleep Onset Latency", description: "Estimates time to fall asleep — healthy is <20 minutes", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "awakening-freq", name: "Night Awakening Frequency", description: "Counts nocturnal awakenings — frequent awakenings impact restorative sleep", category: "sleep", requiredMetrics: ["sleep"] },
  { id: "sleep-score-trend", name: "Sleep Score Trend", description: "14-day trend analysis of composite sleep score", category: "sleep", requiredMetrics: ["sleep_score"] },
  { id: "sleep-hr-dip", name: "Nocturnal HR Dipping", description: "Evaluates the physiological heart rate dip during sleep (10-20% is normal)", category: "sleep", requiredMetrics: ["sleep", "heart_rate"] },

  // ── Activity (21-30) ──
  { id: "daily-steps-goal", name: "Daily Steps Goal", description: "Progress toward 10,000-step daily target with percentile ranking", category: "activity", requiredMetrics: ["steps"] },
  { id: "steps-trend", name: "Steps 14-Day Trend", description: "Moving-average trend of daily step count", category: "activity", requiredMetrics: ["steps"] },
  { id: "active-minutes-who", name: "WHO Activity Guidelines", description: "Evaluates weekly moderate+vigorous minutes vs WHO 150-min target", category: "activity", requiredMetrics: ["active_minutes"] },
  { id: "sedentary-alert", name: "Sedentary Behavior Alert", description: "Flags days with extremely low step counts (<2000 steps)", category: "activity", requiredMetrics: ["steps"] },
  { id: "calorie-balance", name: "Calorie Expenditure Trend", description: "7-day rolling average of total calorie burn", category: "activity", requiredMetrics: ["calories"] },
  { id: "distance-weekly", name: "Weekly Distance Accumulation", description: "Total distance covered in the past 7 days with trend", category: "activity", requiredMetrics: ["distance"] },
  { id: "activity-consistency", name: "Activity Consistency Index", description: "Coefficient of variation of daily steps — lower = more consistent", category: "activity", requiredMetrics: ["steps"] },
  { id: "peak-activity-time", name: "Peak Activity Time", description: "Identifies the time of day with highest average step count", category: "activity", requiredMetrics: ["steps"] },
  { id: "floors-climbed", name: "Floors Climbed Assessment", description: "Daily floor count vs 10-floor recommendation for cardiovascular benefit", category: "activity", requiredMetrics: ["floors"] },
  { id: "inactivity-streak", name: "Inactivity Streak Detection", description: "Consecutive days below 5000 steps", category: "activity", requiredMetrics: ["steps"] },

  // ── Body Metrics (31-37) ──
  { id: "bmi-classification", name: "BMI Classification", description: "WHO BMI category (underweight/normal/overweight/obese)", category: "body", requiredMetrics: ["bmi"] },
  { id: "weight-trend", name: "Weight 30-Day Trend", description: "Linear regression on daily weight to detect gain/loss trajectory", category: "body", requiredMetrics: ["weight"] },
  { id: "body-fat-zone", name: "Body Fat Percentage Zone", description: "Classifies body fat into athletic/fitness/acceptable/obese ranges", category: "body", requiredMetrics: ["body_fat"] },
  { id: "weight-volatility", name: "Weight Volatility", description: "Day-to-day weight fluctuation — high volatility may indicate fluid retention", category: "body", requiredMetrics: ["weight"] },
  { id: "bp-classification", name: "Blood Pressure Classification", description: "AHA blood pressure category (normal/elevated/stage1/stage2/crisis)", category: "body", requiredMetrics: ["blood_pressure"] },
  { id: "bp-trend", name: "Blood Pressure Trend", description: "14-day systolic/diastolic trend analysis", category: "body", requiredMetrics: ["blood_pressure"] },
  { id: "temp-anomaly", name: "Body Temperature Anomaly", description: "Flags body temperature readings outside 36.1-37.2°C normal range", category: "body", requiredMetrics: ["temperature"] },

  // ── Recovery & Readiness (38-43) ──
  { id: "recovery-status", name: "Recovery Score Status", description: "Categorizes current recovery level (poor/moderate/good/optimal)", category: "recovery", requiredMetrics: ["recovery_score"] },
  { id: "recovery-trend", name: "Recovery Score Trend", description: "7-day recovery trajectory with momentum indicator", category: "recovery", requiredMetrics: ["recovery_score"] },
  { id: "readiness-status", name: "Readiness Score Status", description: "Evaluates physical readiness for intense training", category: "recovery", requiredMetrics: ["readiness_score"] },
  { id: "strain-balance", name: "Strain vs Recovery Balance", description: "Compares cumulative strain against recovery capacity", category: "recovery", requiredMetrics: ["strain_score", "recovery_score"] },
  { id: "stress-level", name: "Stress Level Assessment", description: "Classifies average daily stress score (low/moderate/high/very high)", category: "recovery", requiredMetrics: ["stress"] },
  { id: "stress-trend", name: "Stress 14-Day Trend", description: "Trend analysis of daily stress levels", category: "recovery", requiredMetrics: ["stress"] },

  // ── Respiratory & SpO2 (44-48) ──
  { id: "spo2-status", name: "Blood Oxygen Status", description: "Classifies SpO2 level (normal ≥95%, low 90-94%, critical <90%)", category: "respiratory", requiredMetrics: ["spo2"] },
  { id: "spo2-trend", name: "SpO2 7-Day Trend", description: "Tracks blood oxygen saturation trend", category: "respiratory", requiredMetrics: ["spo2"] },
  { id: "resp-rate-status", name: "Respiratory Rate Status", description: "Classifies breathing rate (normal 12-20 brpm)", category: "respiratory", requiredMetrics: ["respiratory_rate"] },
  { id: "resp-rate-trend", name: "Respiratory Rate Trend", description: "14-day trend analysis of respiration rate", category: "respiratory", requiredMetrics: ["respiratory_rate"] },
  { id: "resp-sleep-corr", name: "Respiratory-Sleep Correlation", description: "Correlates respiratory rate changes with sleep quality", category: "respiratory", requiredMetrics: ["respiratory_rate", "sleep"] },

  // ── Metabolic (49-51) ──
  { id: "glucose-status", name: "Blood Glucose Status", description: "Classifies fasting glucose (normal <100, prediabetic 100-125, diabetic ≥126 mg/dL)", category: "metabolic", requiredMetrics: ["blood_glucose"] },
  { id: "glucose-variability", name: "Glucose Variability Index", description: "Coefficient of variation of blood glucose — high CV suggests poor glycemic control", category: "metabolic", requiredMetrics: ["blood_glucose"] },
  { id: "glucose-trend", name: "Glucose 14-Day Trend", description: "Trend analysis of blood glucose levels", category: "metabolic", requiredMetrics: ["blood_glucose"] },

  // ── Workout Performance (52-55) ──
  { id: "training-load", name: "Acute Training Load", description: "7-day cumulative workout duration weighted by intensity (TRIMP-like)", category: "workout", requiredMetrics: ["workout"] },
  { id: "training-monotony", name: "Training Monotony", description: "Variability of daily training load — high monotony increases overtraining risk", category: "workout", requiredMetrics: ["workout"] },
  { id: "workout-frequency", name: "Workout Frequency", description: "Weekly workout count with consistency analysis", category: "workout", requiredMetrics: ["workout"] },
  { id: "vo2max-estimate", name: "Estimated VO2max Proxy", description: "Estimates aerobic fitness from resting HR and activity level (Cooper/Uth formula proxy)", category: "workout", requiredMetrics: ["resting_heart_rate", "workout"] },
]

// ── Service ─────────────────────────────────────────────────────

export class InsightsService {
  private get db() {
    return getDb()
  }

  /** Return available algorithm definitions. */
  listAlgorithms(): InsightAlgorithm[] {
    return ALGORITHMS
  }

  /** Run all applicable algorithms for a user and return insights. */
  async generateInsights(
    userId: string,
    opts: { from?: Date; to?: Date } = {},
  ): Promise<Insight[]> {
    const to = opts.to ?? new Date()
    const from = opts.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Fetch all metrics in the range in one query
    const rows = await this.db
      .select({
        metricType: healthMetrics.metricType,
        recordedAt: healthMetrics.recordedAt,
        value: healthMetrics.value,
        data: healthMetrics.data,
      })
      .from(healthMetrics)
      .where(
        and(
          eq(healthMetrics.userId, userId),
          gte(healthMetrics.recordedAt, from),
          lte(healthMetrics.recordedAt, to),
        ),
      )
      .orderBy(asc(healthMetrics.recordedAt))

    // Group by metric type
    const byType = new Map<string, Array<{ recordedAt: Date; value: number | null; data: Record<string, unknown> | null }>>()
    for (const r of rows) {
      const arr = byType.get(r.metricType) ?? []
      arr.push({ recordedAt: new Date(r.recordedAt), value: r.value, data: r.data as Record<string, unknown> | null })
      byType.set(r.metricType, arr)
    }

    // Fetch workout events
    const workoutRows = await this.db
      .select({
        startedAt: events.startedAt,
        endedAt: events.endedAt,
        durationSeconds: events.durationSeconds,
        avgHeartRate: events.avgHeartRate,
        maxHeartRate: events.maxHeartRate,
        caloriesKcal: events.caloriesKcal,
        distanceMeters: events.distanceMeters,
        data: events.data,
      })
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          eq(events.eventType, "workout"),
          gte(events.startedAt, from),
          lte(events.startedAt, to),
        ),
      )
      .orderBy(asc(events.startedAt))

    const insights: Insight[] = []

    for (const alg of ALGORITHMS) {
      try {
        const insight = this.runAlgorithm(alg, byType, workoutRows)
        if (insight) insights.push(insight)
      } catch {
        // Skip algorithm if it fails
      }
    }

    return insights
  }

  private runAlgorithm(
    alg: InsightAlgorithm,
    byType: Map<string, Array<{ recordedAt: Date; value: number | null; data: Record<string, unknown> | null }>>,
    workouts: Array<{ startedAt: Date; endedAt: Date | null; durationSeconds: number | null; avgHeartRate: number | null; maxHeartRate: number | null; caloriesKcal: number | null; distanceMeters: number | null; data: unknown }>,
  ): Insight | null {
    const vals = (type: string) => (byType.get(type) ?? []).filter((r) => r.value != null).map((r) => r.value!)
    const recs = (type: string) => byType.get(type) ?? []
    const sorted = (v: number[]) => [...v].sort((a, b) => a - b)

    switch (alg.id) {
      // ── Cardio ──────────────────────────────────────────────
      case "rhr-zone": {
        const v = vals("resting_heart_rate")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        let zone: string
        let sev: InsightSeverity
        if (avg < 50) { zone = "Athlete"; sev = "positive" }
        else if (avg < 60) { zone = "Excellent"; sev = "positive" }
        else if (avg < 70) { zone = "Good"; sev = "info" }
        else if (avg < 80) { zone = "Above Average"; sev = "warning" }
        else { zone = "Poor"; sev = "critical" }
        return makeInsight(alg, sev, `Your average resting HR is ${Math.round(avg)} bpm — classified as "${zone}".`, Math.round(avg), "bpm", { low: 50, high: 80 }, { zone, samples: v.length })
      }

      case "rhr-trend": {
        const v = vals("resting_heart_rate")
        if (v.length < 5) return null
        const last14 = v.slice(-14)
        const t = trend(last14)
        const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
        return makeInsight(alg, sev, `Resting HR is ${t} over the past ${last14.length} days. ${t === "rising" ? "Rising RHR may indicate fatigue or stress." : t === "falling" ? "Falling RHR suggests improving cardiovascular fitness." : "RHR is stable."}`, Math.round(last14[last14.length - 1]!), "bpm", null, { trend: t, dataPoints: last14.length })
      }

      case "hr-recovery": {
        if (workouts.length === 0) return null
        const maxHRs = workouts.filter((w) => w.maxHeartRate).map((w) => w.maxHeartRate!)
        const avgMaxHR = maxHRs.length > 0 ? maxHRs.reduce((a, b) => a + b, 0) / maxHRs.length : null
        const rhr = vals("resting_heart_rate")
        const avgRHR = rhr.length > 0 ? rhr.reduce((a, b) => a + b, 0) / rhr.length : null
        if (!avgMaxHR || !avgRHR) return null
        const recovery = avgMaxHR - avgRHR
        const sev: InsightSeverity = recovery > 60 ? "positive" : recovery > 40 ? "info" : "warning"
        return makeInsight(alg, sev, `Estimated HR recovery capacity: ${Math.round(recovery)} bpm. ${recovery > 60 ? "Excellent cardiac recovery." : recovery > 40 ? "Good recovery capacity." : "Consider improving aerobic base."}`, Math.round(recovery), "bpm", { low: 40, high: 70 }, { avgMaxHR: Math.round(avgMaxHR), avgRHR: Math.round(avgRHR) })
      }

      case "hrv-baseline": {
        const v = vals("heart_rate_variability")
        if (v.length < 7) return null
        const baseline = v.slice(0, -7)
        const recent = v.slice(-7)
        const bMean = baseline.length > 0 ? baseline.reduce((a, b) => a + b, 0) / baseline.length : recent.reduce((a, b) => a + b, 0) / recent.length
        const rMean = recent.reduce((a, b) => a + b, 0) / recent.length
        const deviationPct = ((rMean - bMean) / (bMean || 1)) * 100
        const sev: InsightSeverity = deviationPct < -15 ? "warning" : deviationPct > 10 ? "positive" : "info"
        return makeInsight(alg, sev, `HRV is ${deviationPct > 0 ? "+" : ""}${Math.round(deviationPct)}% vs your 30-day baseline (${Math.round(bMean)} ms). ${deviationPct < -15 ? "Significant drop — consider rest." : deviationPct > 10 ? "Above baseline — great recovery." : "Within normal range."}`, Math.round(rMean), "ms", null, { baseline: Math.round(bMean), deviation: Math.round(deviationPct) })
      }

      case "hrv-trend": {
        const v = vals("heart_rate_variability")
        if (v.length < 5) return null
        const last14 = v.slice(-14)
        const t = trend(last14)
        const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
        return makeInsight(alg, sev, `HRV trend is ${t} over ${last14.length} days. ${t === "rising" ? "Improving autonomic balance." : t === "falling" ? "Declining HRV may reflect stress accumulation." : "Stable autonomic function."}`, Math.round(last14[last14.length - 1]!), "ms", null, { trend: t })
      }

      case "hrv-coherence": {
        const v = vals("heart_rate_variability")
        if (v.length < 7) return null
        const cv = coefficientOfVariation(v)
        const sev: InsightSeverity = cv < 10 ? "positive" : cv < 20 ? "info" : "warning"
        return makeInsight(alg, sev, `HRV coherence: CV=${Math.round(cv)}%. ${cv < 10 ? "High coherence — consistent autonomic function." : cv < 20 ? "Moderate coherence." : "High variability — erratic recovery patterns."}`, Math.round(cv), "%", { low: 0, high: 20 }, { samples: v.length })
      }

      case "max-hr-estimate": {
        const hrVals = vals("heart_rate")
        if (hrVals.length === 0) return null
        const maxObserved = Math.max(...hrVals)
        const sev: InsightSeverity = maxObserved > 180 ? "warning" : maxObserved > 150 ? "positive" : "info"
        return makeInsight(alg, sev, `Peak recorded HR: ${maxObserved} bpm. ${maxObserved > 180 ? "High-intensity peaks detected." : "Moderate intensity levels observed."}`, maxObserved, "bpm", null, { maxObserved })
      }

      case "hr-zones-dist": {
        const hrVals = vals("heart_rate")
        if (hrVals.length < 10) return null
        const zones = { rest: 0, fatBurn: 0, cardio: 0, peak: 0 }
        for (const hr of hrVals) {
          if (hr < 100) zones.rest++
          else if (hr < 140) zones.fatBurn++
          else if (hr < 170) zones.cardio++
          else zones.peak++
        }
        const total = hrVals.length
        const pcts = { rest: Math.round((zones.rest / total) * 100), fatBurn: Math.round((zones.fatBurn / total) * 100), cardio: Math.round((zones.cardio / total) * 100), peak: Math.round((zones.peak / total) * 100) }
        return makeInsight(alg, "info", `HR zone distribution: ${pcts.rest}% rest, ${pcts.fatBurn}% fat-burn, ${pcts.cardio}% cardio, ${pcts.peak}% peak.`, pcts.cardio + pcts.peak, "%", null, pcts)
      }

      case "cardiac-drift": {
        if (workouts.length < 3) return null
        const longWorkouts = workouts.filter((w) => (w.durationSeconds ?? 0) > 1800 && w.avgHeartRate && w.maxHeartRate)
        if (longWorkouts.length === 0) return null
        const drifts = longWorkouts.map((w) => ((w.maxHeartRate! - w.avgHeartRate!) / w.avgHeartRate!) * 100)
        const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length
        const sev: InsightSeverity = avgDrift > 15 ? "warning" : avgDrift > 8 ? "info" : "positive"
        return makeInsight(alg, sev, `Average cardiac drift: ${Math.round(avgDrift)}% in long sessions. ${avgDrift > 15 ? "Significant decoupling — dehydration or insufficient base fitness." : "Normal drift range."}`, Math.round(avgDrift), "%", { low: 0, high: 15 }, { workoutsAnalyzed: longWorkouts.length })
      }

      case "rhr-anomaly": {
        const v = vals("resting_heart_rate")
        if (v.length < 10) return null
        const mean = v.reduce((a, b) => a + b, 0) / v.length
        const sd = stddev(v)
        const latest = v[v.length - 1]!
        const zScore = sd > 0 ? (latest - mean) / sd : 0
        const sev: InsightSeverity = Math.abs(zScore) > 2 ? "critical" : Math.abs(zScore) > 1.5 ? "warning" : "info"
        return makeInsight(alg, sev, `Latest RHR z-score: ${zScore.toFixed(1)} (${latest} bpm vs mean ${Math.round(mean)}). ${Math.abs(zScore) > 2 ? "Significant anomaly detected!" : "Within expected range."}`, latest, "bpm", { low: Math.round(mean - 2 * sd), high: Math.round(mean + 2 * sd) }, { zScore: Number(zScore.toFixed(2)), mean: Math.round(mean), stddev: Math.round(sd) })
      }

      // ── Sleep ───────────────────────────────────────────────
      case "sleep-duration": {
        const sleepRecs = recs("sleep")
        if (sleepRecs.length === 0) return null
        const durations = sleepRecs.map((r) => (r.data as { durationMinutes?: number } | null)?.durationMinutes ?? (r.value ?? 0)).filter((d) => d > 0)
        if (durations.length === 0) return null
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length
        const hours = avg / 60
        const sev: InsightSeverity = hours >= 7 && hours <= 9 ? "positive" : hours >= 6 ? "warning" : "critical"
        return makeInsight(alg, sev, `Average sleep: ${hours.toFixed(1)}h/night. ${hours >= 7 ? "Meeting CDC recommendation of 7-9 hours." : hours >= 6 ? "Slightly below recommendation." : "Significantly below recommended 7-9 hours."}`, Math.round(avg), "min", { low: 420, high: 540 }, { avgHours: Number(hours.toFixed(1)), nights: durations.length })
      }

      case "sleep-efficiency": {
        const sleepRecs = recs("sleep")
        if (sleepRecs.length === 0) return null
        const efficiencies = sleepRecs.map((r) => {
          const d = r.data as { durationMinutes?: number; startTime?: string; endTime?: string; stages?: { awake?: number } } | null
          if (!d?.durationMinutes) return null
          const awake = d.stages?.awake ?? 0
          const totalTime = d.durationMinutes + awake
          return totalTime > 0 ? (d.durationMinutes / totalTime) * 100 : null
        }).filter((e): e is number => e != null)
        if (efficiencies.length === 0) return null
        const avg = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length
        const sev: InsightSeverity = avg >= 85 ? "positive" : avg >= 75 ? "info" : "warning"
        return makeInsight(alg, sev, `Sleep efficiency: ${Math.round(avg)}%. ${avg >= 85 ? "Excellent — minimal wakefulness." : "Below 85% target — fragmented sleep."}`, Math.round(avg), "%", { low: 85, high: 100 }, { nights: efficiencies.length })
      }

      case "deep-sleep-ratio": {
        const sleepRecs = recs("sleep")
        const ratios = sleepRecs.map((r) => {
          const d = r.data as { durationMinutes?: number; stages?: { deep?: number } } | null
          if (!d?.stages?.deep || !d.durationMinutes) return null
          return (d.stages.deep / d.durationMinutes) * 100
        }).filter((r): r is number => r != null)
        if (ratios.length === 0) return null
        const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
        const sev: InsightSeverity = avg >= 15 && avg <= 25 ? "positive" : avg >= 10 ? "info" : "warning"
        return makeInsight(alg, sev, `Deep sleep: ${Math.round(avg)}% of total. ${avg >= 15 && avg <= 25 ? "Optimal range for physical restoration." : avg < 15 ? "Below optimal — may impact recovery." : "Above typical range."}`, Math.round(avg), "%", { low: 15, high: 25 }, { nights: ratios.length })
      }

      case "rem-sleep-ratio": {
        const sleepRecs = recs("sleep")
        const ratios = sleepRecs.map((r) => {
          const d = r.data as { durationMinutes?: number; stages?: { rem?: number } } | null
          if (!d?.stages?.rem || !d.durationMinutes) return null
          return (d.stages.rem / d.durationMinutes) * 100
        }).filter((r): r is number => r != null)
        if (ratios.length === 0) return null
        const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
        const sev: InsightSeverity = avg >= 20 && avg <= 25 ? "positive" : avg >= 15 ? "info" : "warning"
        return makeInsight(alg, sev, `REM sleep: ${Math.round(avg)}% of total. ${avg >= 20 ? "Good for memory consolidation and learning." : "Below optimal — may impact cognitive recovery."}`, Math.round(avg), "%", { low: 20, high: 25 }, { nights: ratios.length })
      }

      case "sleep-consistency": {
        const sleepRecs = recs("sleep")
        const bedtimes = sleepRecs.map((r) => {
          const d = r.data as { startTime?: string } | null
          if (!d?.startTime) return null
          const dt = new Date(d.startTime)
          return dt.getHours() * 60 + dt.getMinutes()
        }).filter((t): t is number => t != null)
        if (bedtimes.length < 5) return null
        const sd = stddev(bedtimes)
        const sev: InsightSeverity = sd < 30 ? "positive" : sd < 60 ? "info" : "warning"
        return makeInsight(alg, sev, `Bedtime variability: ±${Math.round(sd)} min. ${sd < 30 ? "Very consistent sleep schedule." : sd < 60 ? "Moderate consistency." : "Highly irregular — social jet lag risk."}`, Math.round(sd), "min", { low: 0, high: 30 }, { nights: bedtimes.length })
      }

      case "sleep-debt": {
        const sleepRecs = recs("sleep")
        const last7 = sleepRecs.slice(-7)
        const durations = last7.map((r) => (r.data as { durationMinutes?: number } | null)?.durationMinutes ?? (r.value ?? 0))
        if (durations.length === 0) return null
        const totalSleep = durations.reduce((a, b) => a + b, 0)
        const target = durations.length * 480
        const debt = target - totalSleep
        const sev: InsightSeverity = debt <= 0 ? "positive" : debt < 120 ? "info" : debt < 300 ? "warning" : "critical"
        return makeInsight(alg, sev, `Sleep debt: ${debt > 0 ? Math.round(debt) : 0} min over ${durations.length} days. ${debt <= 0 ? "No sleep debt — well rested." : `Deficit of ${(debt / 60).toFixed(1)}h vs 8h/night target.`}`, Math.max(0, Math.round(debt)), "min", null, { totalSleep: Math.round(totalSleep), target, days: durations.length })
      }

      case "sleep-latency": {
        const sleepRecs = recs("sleep")
        const latencies = sleepRecs.map((r) => {
          const d = r.data as { startTime?: string; stages?: { awake?: number } } | null
          return d?.stages?.awake != null ? Math.min(d.stages.awake, 60) : null
        }).filter((l): l is number => l != null)
        if (latencies.length === 0) return null
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
        const sev: InsightSeverity = avg <= 15 ? "positive" : avg <= 30 ? "info" : "warning"
        return makeInsight(alg, sev, `Average sleep onset: ~${Math.round(avg)} min. ${avg <= 15 ? "Healthy — falling asleep quickly." : avg <= 30 ? "Within normal range." : "Prolonged latency — consider sleep hygiene improvements."}`, Math.round(avg), "min", { low: 0, high: 20 }, { nights: latencies.length })
      }

      case "awakening-freq": {
        const sleepRecs = recs("sleep")
        const awakenings = sleepRecs.map((r) => (r.data as { awakenings?: number } | null)?.awakenings).filter((a): a is number => a != null)
        if (awakenings.length === 0) return null
        const avg = awakenings.reduce((a, b) => a + b, 0) / awakenings.length
        const sev: InsightSeverity = avg <= 2 ? "positive" : avg <= 5 ? "info" : "warning"
        return makeInsight(alg, sev, `Average ${Math.round(avg)} awakenings/night. ${avg <= 2 ? "Minimal disruption." : avg <= 5 ? "Moderate — common range." : "Frequent awakenings may impair deep sleep."}`, Math.round(avg), "count", { low: 0, high: 3 }, { nights: awakenings.length })
      }

      case "sleep-score-trend": {
        const v = vals("sleep_score")
        if (v.length < 5) return null
        const last14 = v.slice(-14)
        const t = trend(last14)
        const avg = last14.reduce((a, b) => a + b, 0) / last14.length
        const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
        return makeInsight(alg, sev, `Sleep score trend: ${t} (avg ${Math.round(avg)}). ${t === "rising" ? "Improving sleep quality." : t === "falling" ? "Declining — review sleep habits." : "Stable sleep quality."}`, Math.round(avg), "score", { low: 70, high: 100 }, { trend: t })
      }

      case "sleep-hr-dip": {
        const sleepRecs = recs("sleep")
        const hrVals = vals("heart_rate")
        const rhrVals = vals("resting_heart_rate")
        if (sleepRecs.length === 0 || (hrVals.length === 0 && rhrVals.length === 0)) return null
        const sleepHRs = sleepRecs.map((r) => (r.data as { heartRateAvg?: number } | null)?.heartRateAvg).filter((h): h is number => h != null)
        if (sleepHRs.length === 0) return null
        const avgSleepHR = sleepHRs.reduce((a, b) => a + b, 0) / sleepHRs.length
        const dayHR = rhrVals.length > 0 ? rhrVals.reduce((a, b) => a + b, 0) / rhrVals.length : hrVals.reduce((a, b) => a + b, 0) / hrVals.length
        const dipPct = ((dayHR - avgSleepHR) / dayHR) * 100
        const sev: InsightSeverity = dipPct >= 10 && dipPct <= 20 ? "positive" : dipPct < 10 ? "warning" : "info"
        return makeInsight(alg, sev, `Nocturnal HR dip: ${Math.round(dipPct)}%. ${dipPct >= 10 && dipPct <= 20 ? "Normal physiological dipping pattern." : dipPct < 10 ? "Non-dipping pattern — may indicate autonomic dysfunction." : "Enhanced dipping."}`, Math.round(dipPct), "%", { low: 10, high: 20 }, { avgSleepHR: Math.round(avgSleepHR), dayHR: Math.round(dayHR) })
      }

      // ── Activity ────────────────────────────────────────────
      case "daily-steps-goal": {
        const v = vals("steps")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        const pct = (avg / 10000) * 100
        const sev: InsightSeverity = pct >= 100 ? "positive" : pct >= 70 ? "info" : "warning"
        return makeInsight(alg, sev, `Average ${Math.round(avg).toLocaleString()} steps/day (${Math.round(pct)}% of 10K goal). ${pct >= 100 ? "Consistently hitting target!" : "Room for improvement."}`, Math.round(avg), "steps", { low: 7000, high: 10000 }, { goalPct: Math.round(pct), days: v.length })
      }

      case "steps-trend": {
        const v = vals("steps")
        if (v.length < 5) return null
        const last14 = v.slice(-14)
        const t = trend(last14)
        const ma = movingAverage(last14, 7)
        const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
        return makeInsight(alg, sev, `Steps trend: ${t}. 7-day moving avg: ${Math.round(ma[ma.length - 1]!).toLocaleString()} steps.`, Math.round(ma[ma.length - 1]!), "steps", null, { trend: t })
      }

      case "active-minutes-who": {
        const v = vals("active_minutes")
        if (v.length === 0) return null
        const weekly = v.slice(-7).reduce((a, b) => a + b, 0)
        const pct = (weekly / 150) * 100
        const sev: InsightSeverity = pct >= 100 ? "positive" : pct >= 60 ? "info" : "warning"
        return makeInsight(alg, sev, `Weekly active minutes: ${Math.round(weekly)} (${Math.round(pct)}% of WHO 150-min target). ${pct >= 100 ? "Meeting guidelines!" : "Below recommended level."}`, Math.round(weekly), "min", { low: 150, high: 300 }, { target: 150, pct: Math.round(pct) })
      }

      case "sedentary-alert": {
        const v = vals("steps")
        if (v.length === 0) return null
        const sedentaryDays = v.filter((s) => s < 2000).length
        const pct = (sedentaryDays / v.length) * 100
        const sev: InsightSeverity = pct === 0 ? "positive" : pct < 20 ? "info" : "warning"
        return makeInsight(alg, sev, `${sedentaryDays} of ${v.length} days were sedentary (<2K steps). ${pct === 0 ? "No sedentary days detected!" : `${Math.round(pct)}% sedentary rate.`}`, sedentaryDays, "days", null, { sedentaryPct: Math.round(pct) })
      }

      case "calorie-balance": {
        const v = vals("calories")
        if (v.length < 3) return null
        const last7 = v.slice(-7)
        const avg = last7.reduce((a, b) => a + b, 0) / last7.length
        const t = trend(v.slice(-14))
        return makeInsight(alg, "info", `7-day avg calorie burn: ${Math.round(avg).toLocaleString()} kcal/day. Trend: ${t}.`, Math.round(avg), "kcal", null, { trend: t })
      }

      case "distance-weekly": {
        const v = vals("distance")
        if (v.length === 0) return null
        const last7 = v.slice(-7)
        const total = last7.reduce((a, b) => a + b, 0)
        const km = total / 1000
        return makeInsight(alg, km > 35 ? "positive" : km > 15 ? "info" : "warning", `Weekly distance: ${km.toFixed(1)} km. ${km > 35 ? "Excellent coverage." : km > 15 ? "Good activity level." : "Consider increasing movement."}`, Number(km.toFixed(1)), "km", null, { days: last7.length })
      }

      case "activity-consistency": {
        const v = vals("steps")
        if (v.length < 7) return null
        const cv = coefficientOfVariation(v)
        const sev: InsightSeverity = cv < 25 ? "positive" : cv < 50 ? "info" : "warning"
        return makeInsight(alg, sev, `Activity consistency index: CV=${Math.round(cv)}%. ${cv < 25 ? "Very consistent — great habit." : cv < 50 ? "Moderate consistency." : "Highly variable — try establishing a routine."}`, Math.round(cv), "%", { low: 0, high: 25 }, { days: v.length })
      }

      case "peak-activity-time": {
        const stepRecs = recs("steps")
        if (stepRecs.length < 5) return null
        const hourBuckets = new Map<number, number[]>()
        for (const r of stepRecs) {
          const h = r.recordedAt.getHours()
          const arr = hourBuckets.get(h) ?? []
          arr.push(r.value ?? 0)
          hourBuckets.set(h, arr)
        }
        let peakHour = 0
        let peakAvg = 0
        for (const [h, vals] of hourBuckets) {
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length
          if (avg > peakAvg) { peakHour = h; peakAvg = avg }
        }
        const timeStr = `${peakHour.toString().padStart(2, "0")}:00`
        return makeInsight(alg, "info", `Peak activity typically occurs around ${timeStr} with avg ${Math.round(peakAvg).toLocaleString()} steps.`, peakHour, "hour", null, { peakAvg: Math.round(peakAvg) })
      }

      case "floors-climbed": {
        const v = vals("floors")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        const sev: InsightSeverity = avg >= 10 ? "positive" : avg >= 5 ? "info" : "warning"
        return makeInsight(alg, sev, `Average ${Math.round(avg)} floors/day. ${avg >= 10 ? "Meeting cardiovascular benefit target." : "Below 10-floor daily recommendation."}`, Math.round(avg), "floors", { low: 10, high: 20 }, { days: v.length })
      }

      case "inactivity-streak": {
        const v = vals("steps")
        if (v.length === 0) return null
        let maxStreak = 0
        let currentStreak = 0
        for (const s of v) {
          if (s < 5000) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak) }
          else currentStreak = 0
        }
        const sev: InsightSeverity = maxStreak === 0 ? "positive" : maxStreak <= 2 ? "info" : "warning"
        return makeInsight(alg, sev, `Longest inactivity streak: ${maxStreak} consecutive days below 5K steps. ${maxStreak === 0 ? "No inactivity streaks!" : maxStreak <= 2 ? "Brief dips are normal." : "Extended low activity — prioritize movement."}`, maxStreak, "days", null, {})
      }

      // ── Body ────────────────────────────────────────────────
      case "bmi-classification": {
        const v = vals("bmi")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        let cat: string
        let sev: InsightSeverity
        if (latest < 18.5) { cat = "Underweight"; sev = "warning" }
        else if (latest < 25) { cat = "Normal"; sev = "positive" }
        else if (latest < 30) { cat = "Overweight"; sev = "warning" }
        else { cat = "Obese"; sev = "critical" }
        return makeInsight(alg, sev, `BMI: ${latest.toFixed(1)} — ${cat}.`, Number(latest.toFixed(1)), "kg/m²", { low: 18.5, high: 25 }, { category: cat })
      }

      case "weight-trend": {
        const v = vals("weight")
        if (v.length < 5) return null
        const slope = linearSlope(v)
        const weeklyChange = slope * 7
        const sev: InsightSeverity = Math.abs(weeklyChange) < 0.2 ? "info" : Math.abs(weeklyChange) < 0.5 ? "info" : "warning"
        return makeInsight(alg, sev, `Weight trend: ${weeklyChange > 0 ? "+" : ""}${weeklyChange.toFixed(2)} kg/week. ${Math.abs(weeklyChange) < 0.2 ? "Stable weight." : weeklyChange > 0 ? "Gaining trend." : "Losing trend."}`, Number(weeklyChange.toFixed(2)), "kg/week", null, { slope: Number(slope.toFixed(4)), samples: v.length, latest: v[v.length - 1] })
      }

      case "body-fat-zone": {
        const v = vals("body_fat")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        let zone: string
        let sev: InsightSeverity
        if (latest < 14) { zone = "Athletic"; sev = "positive" }
        else if (latest < 21) { zone = "Fitness"; sev = "positive" }
        else if (latest < 25) { zone = "Acceptable"; sev = "info" }
        else { zone = "Above recommended"; sev = "warning" }
        return makeInsight(alg, sev, `Body fat: ${latest.toFixed(1)}% — ${zone} range.`, Number(latest.toFixed(1)), "%", { low: 10, high: 25 }, { zone })
      }

      case "weight-volatility": {
        const v = vals("weight")
        if (v.length < 5) return null
        const diffs = []
        for (let i = 1; i < v.length; i++) diffs.push(Math.abs(v[i]! - v[i - 1]!))
        const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
        const sev: InsightSeverity = avg < 0.5 ? "positive" : avg < 1.0 ? "info" : "warning"
        return makeInsight(alg, sev, `Day-to-day weight fluctuation: ±${avg.toFixed(2)} kg. ${avg < 0.5 ? "Very stable." : avg < 1.0 ? "Normal fluctuation." : "High volatility — may indicate fluid retention."}`, Number(avg.toFixed(2)), "kg", { low: 0, high: 0.5 }, {})
      }

      case "bp-classification": {
        const bpRecs = recs("blood_pressure")
        if (bpRecs.length === 0) return null
        const systolics = bpRecs.map((r) => (r.data as { systolic?: number } | null)?.systolic ?? r.value).filter((v): v is number => v != null)
        const diastolics = bpRecs.map((r) => (r.data as { diastolic?: number } | null)?.diastolic).filter((v): v is number => v != null)
        if (systolics.length === 0) return null
        const avgSys = systolics.reduce((a, b) => a + b, 0) / systolics.length
        const avgDia = diastolics.length > 0 ? diastolics.reduce((a, b) => a + b, 0) / diastolics.length : 0
        let cat: string
        let sev: InsightSeverity
        if (avgSys < 120 && avgDia < 80) { cat = "Normal"; sev = "positive" }
        else if (avgSys < 130) { cat = "Elevated"; sev = "info" }
        else if (avgSys < 140) { cat = "Stage 1 Hypertension"; sev = "warning" }
        else if (avgSys < 180) { cat = "Stage 2 Hypertension"; sev = "critical" }
        else { cat = "Hypertensive Crisis"; sev = "critical" }
        return makeInsight(alg, sev, `Blood pressure: ${Math.round(avgSys)}/${Math.round(avgDia)} mmHg — ${cat} (AHA classification).`, Math.round(avgSys), "mmHg", { low: 90, high: 120 }, { category: cat, systolic: Math.round(avgSys), diastolic: Math.round(avgDia) })
      }

      case "bp-trend": {
        const bpRecs = recs("blood_pressure")
        const systolics = bpRecs.map((r) => (r.data as { systolic?: number } | null)?.systolic ?? r.value).filter((v): v is number => v != null)
        if (systolics.length < 5) return null
        const t = trend(systolics.slice(-14))
        const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
        return makeInsight(alg, sev, `Blood pressure trend: ${t}. ${t === "rising" ? "Monitor closely — consult physician if persistent." : "Stable or improving."}`, systolics[systolics.length - 1]!, "mmHg", null, { trend: t })
      }

      case "temp-anomaly": {
        const v = vals("temperature")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        const sev: InsightSeverity = latest >= 36.1 && latest <= 37.2 ? "positive" : latest < 38.0 ? "warning" : "critical"
        return makeInsight(alg, sev, `Body temperature: ${latest.toFixed(1)}°C. ${latest >= 36.1 && latest <= 37.2 ? "Normal range." : latest < 36.1 ? "Below normal — monitor for hypothermia." : "Elevated — possible fever."}`, Number(latest.toFixed(1)), "°C", { low: 36.1, high: 37.2 }, {})
      }

      // ── Recovery ────────────────────────────────────────────
      case "recovery-status": {
        const v = vals("recovery_score")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        let cat: string
        let sev: InsightSeverity
        if (latest >= 80) { cat = "Optimal"; sev = "positive" }
        else if (latest >= 60) { cat = "Good"; sev = "info" }
        else if (latest >= 40) { cat = "Moderate"; sev = "warning" }
        else { cat = "Poor"; sev = "critical" }
        return makeInsight(alg, sev, `Recovery: ${Math.round(latest)}/100 — ${cat}. ${latest >= 60 ? "Ready for training." : "Consider lighter activity."}`, Math.round(latest), "score", { low: 60, high: 100 }, { category: cat })
      }

      case "recovery-trend": {
        const v = vals("recovery_score")
        if (v.length < 3) return null
        const last7 = v.slice(-7)
        const t = trend(last7)
        const sev: InsightSeverity = t === "rising" ? "positive" : t === "falling" ? "warning" : "info"
        return makeInsight(alg, sev, `Recovery trend: ${t} over ${last7.length} days.`, Math.round(last7[last7.length - 1]!), "score", null, { trend: t })
      }

      case "readiness-status": {
        const v = vals("readiness_score")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        const sev: InsightSeverity = latest >= 75 ? "positive" : latest >= 50 ? "info" : "warning"
        return makeInsight(alg, sev, `Readiness: ${Math.round(latest)}/100. ${latest >= 75 ? "Primed for high-intensity training." : latest >= 50 ? "Moderate readiness — standard training OK." : "Low readiness — prioritize recovery."}`, Math.round(latest), "score", { low: 50, high: 100 }, {})
      }

      case "strain-balance": {
        const strainV = vals("strain_score")
        const recoveryV = vals("recovery_score")
        if (strainV.length === 0 || recoveryV.length === 0) return null
        const avgStrain = strainV.slice(-7).reduce((a, b) => a + b, 0) / Math.min(strainV.length, 7)
        const avgRecovery = recoveryV.slice(-7).reduce((a, b) => a + b, 0) / Math.min(recoveryV.length, 7)
        const ratio = avgRecovery > 0 ? avgStrain / avgRecovery : 0
        const sev: InsightSeverity = ratio < 0.8 ? "positive" : ratio < 1.2 ? "info" : "warning"
        return makeInsight(alg, sev, `Strain/Recovery ratio: ${ratio.toFixed(2)}. ${ratio < 0.8 ? "Well recovered — capacity for more." : ratio < 1.2 ? "Balanced load." : "Strain exceeding recovery — overtraining risk."}`, Number(ratio.toFixed(2)), "ratio", { low: 0.5, high: 1.0 }, { avgStrain: Math.round(avgStrain), avgRecovery: Math.round(avgRecovery) })
      }

      case "stress-level": {
        const v = vals("stress")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        let cat: string
        let sev: InsightSeverity
        if (avg < 25) { cat = "Low"; sev = "positive" }
        else if (avg < 50) { cat = "Moderate"; sev = "info" }
        else if (avg < 75) { cat = "High"; sev = "warning" }
        else { cat = "Very High"; sev = "critical" }
        return makeInsight(alg, sev, `Average stress: ${Math.round(avg)}/100 — ${cat}. ${avg >= 50 ? "Consider stress management techniques." : "Stress levels well managed."}`, Math.round(avg), "score", { low: 0, high: 50 }, { category: cat })
      }

      case "stress-trend": {
        const v = vals("stress")
        if (v.length < 5) return null
        const t = trend(v.slice(-14))
        const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
        return makeInsight(alg, sev, `Stress trend: ${t}. ${t === "rising" ? "Increasing stress — monitor closely." : t === "falling" ? "Decreasing stress — good progress." : "Stable stress levels."}`, Math.round(v[v.length - 1]!), "score", null, { trend: t })
      }

      // ── Respiratory ─────────────────────────────────────────
      case "spo2-status": {
        const v = vals("spo2")
        if (v.length === 0) return null
        const latest = v[v.length - 1]!
        const sev: InsightSeverity = latest >= 95 ? "positive" : latest >= 90 ? "warning" : "critical"
        return makeInsight(alg, sev, `SpO2: ${Math.round(latest)}%. ${latest >= 95 ? "Normal blood oxygen." : latest >= 90 ? "Below normal — monitor for respiratory issues." : "Critically low — seek medical attention."}`, Math.round(latest), "%", { low: 95, high: 100 }, {})
      }

      case "spo2-trend": {
        const v = vals("spo2")
        if (v.length < 3) return null
        const t = trend(v.slice(-7))
        const sev: InsightSeverity = t === "falling" ? "warning" : "info"
        return makeInsight(alg, sev, `SpO2 trend: ${t}. ${t === "falling" ? "Declining — watch for respiratory symptoms." : "Stable oxygen levels."}`, Math.round(v[v.length - 1]!), "%", null, { trend: t })
      }

      case "resp-rate-status": {
        const v = vals("respiratory_rate")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        const sev: InsightSeverity = avg >= 12 && avg <= 20 ? "positive" : avg >= 10 && avg <= 24 ? "info" : "warning"
        return makeInsight(alg, sev, `Respiratory rate: ${avg.toFixed(1)} brpm. ${avg >= 12 && avg <= 20 ? "Normal adult range." : "Outside normal 12-20 brpm range."}`, Number(avg.toFixed(1)), "brpm", { low: 12, high: 20 }, {})
      }

      case "resp-rate-trend": {
        const v = vals("respiratory_rate")
        if (v.length < 5) return null
        const t = trend(v.slice(-14))
        const sev: InsightSeverity = t === "rising" ? "warning" : "info"
        return makeInsight(alg, sev, `Respiratory rate trend: ${t}. ${t === "rising" ? "Increasing — may indicate stress or illness." : "Stable breathing patterns."}`, Number(v[v.length - 1]!.toFixed(1)), "brpm", null, { trend: t })
      }

      case "resp-sleep-corr": {
        const respV = vals("respiratory_rate")
        const sleepRecs = recs("sleep")
        if (respV.length < 5 || sleepRecs.length < 5) return null
        const sleepScores = sleepRecs.map((r) => (r.data as { score?: number } | null)?.score).filter((s): s is number => s != null)
        if (sleepScores.length < 3) return null
        const respTrend = trend(respV.slice(-7))
        const sleepTrend = trend(sleepScores.slice(-7))
        const correlated = (respTrend === "rising" && sleepTrend === "falling") || (respTrend === "falling" && sleepTrend === "rising")
        return makeInsight(alg, correlated ? "warning" : "info", `Respiratory rate is ${respTrend}, sleep quality is ${sleepTrend}. ${correlated ? "Inverse correlation detected — elevated breathing may impair sleep." : "No significant correlation."}`, null, null, null, { respTrend, sleepTrend, correlated })
      }

      // ── Metabolic ───────────────────────────────────────────
      case "glucose-status": {
        const v = vals("blood_glucose")
        if (v.length === 0) return null
        const avg = v.reduce((a, b) => a + b, 0) / v.length
        let cat: string
        let sev: InsightSeverity
        if (avg < 100) { cat = "Normal"; sev = "positive" }
        else if (avg < 126) { cat = "Prediabetic"; sev = "warning" }
        else { cat = "Diabetic range"; sev = "critical" }
        return makeInsight(alg, sev, `Avg blood glucose: ${Math.round(avg)} mg/dL — ${cat}. ${avg >= 100 ? "Consult healthcare provider." : "Within healthy range."}`, Math.round(avg), "mg/dL", { low: 70, high: 100 }, { category: cat })
      }

      case "glucose-variability": {
        const v = vals("blood_glucose")
        if (v.length < 5) return null
        const cv = coefficientOfVariation(v)
        const sev: InsightSeverity = cv < 20 ? "positive" : cv < 36 ? "info" : "warning"
        return makeInsight(alg, sev, `Glucose variability: CV=${Math.round(cv)}%. ${cv < 20 ? "Excellent glycemic control." : cv < 36 ? "Moderate variability." : "High variability — poor glycemic control."}`, Math.round(cv), "%", { low: 0, high: 36 }, {})
      }

      case "glucose-trend": {
        const v = vals("blood_glucose")
        if (v.length < 5) return null
        const t = trend(v.slice(-14))
        const sev: InsightSeverity = t === "rising" ? "warning" : t === "falling" ? "positive" : "info"
        return makeInsight(alg, sev, `Blood glucose trend: ${t}. ${t === "rising" ? "Rising levels — review dietary patterns." : "Stable or improving."}`, Math.round(v[v.length - 1]!), "mg/dL", null, { trend: t })
      }

      // ── Workout Performance ─────────────────────────────────
      case "training-load": {
        if (workouts.length === 0) return null
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const recent = workouts.filter((w) => new Date(w.startedAt) >= weekAgo)
        let trimp = 0
        for (const w of recent) {
          const dur = (w.durationSeconds ?? 0) / 60
          const hr = w.avgHeartRate ?? 120
          const intensity = hr / 180
          trimp += dur * intensity
        }
        const sev: InsightSeverity = trimp > 500 ? "warning" : trimp > 200 ? "positive" : "info"
        return makeInsight(alg, sev, `7-day training load (TRIMP proxy): ${Math.round(trimp)}. ${trimp > 500 ? "High load — ensure adequate recovery." : trimp > 200 ? "Good training stimulus." : "Light training week."}`, Math.round(trimp), "TRIMP", null, { workouts: recent.length })
      }

      case "training-monotony": {
        if (workouts.length < 5) return null
        const dailyLoads: number[] = []
        const dayMap = new Map<string, number>()
        for (const w of workouts) {
          const day = new Date(w.startedAt).toISOString().slice(0, 10)
          dayMap.set(day, (dayMap.get(day) ?? 0) + ((w.durationSeconds ?? 0) / 60))
        }
        for (const v of dayMap.values()) dailyLoads.push(v)
        if (dailyLoads.length < 3) return null
        const mean = dailyLoads.reduce((a, b) => a + b, 0) / dailyLoads.length
        const sd = stddev(dailyLoads)
        const monotony = sd > 0 ? mean / sd : 0
        const sev: InsightSeverity = monotony > 2 ? "warning" : "info"
        return makeInsight(alg, sev, `Training monotony: ${monotony.toFixed(1)}. ${monotony > 2 ? "High monotony increases overtraining/illness risk — vary sessions." : "Good training variety."}`, Number(monotony.toFixed(1)), "index", null, { days: dailyLoads.length })
      }

      case "workout-frequency": {
        if (workouts.length === 0) return null
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const recent = workouts.filter((w) => new Date(w.startedAt) >= weekAgo)
        const count = recent.length
        const sev: InsightSeverity = count >= 4 ? "positive" : count >= 2 ? "info" : "warning"
        return makeInsight(alg, sev, `${count} workouts this week. ${count >= 4 ? "Great consistency!" : count >= 2 ? "Moderate frequency." : "Low frequency — aim for 3-5 sessions/week."}`, count, "sessions", { low: 3, high: 5 }, { totalPeriod: workouts.length })
      }

      case "vo2max-estimate": {
        const rhr = vals("resting_heart_rate")
        if (rhr.length === 0 || workouts.length === 0) return null
        const avgRHR = rhr.reduce((a, b) => a + b, 0) / rhr.length
        // Uth et al. formula: VO2max ≈ 15.3 × (MHR / RHR)
        // Using estimated MHR from workout max HRs
        const maxHRs = workouts.filter((w) => w.maxHeartRate).map((w) => w.maxHeartRate!)
        if (maxHRs.length === 0) return null
        const estMaxHR = Math.max(...maxHRs)
        const vo2max = 15.3 * (estMaxHR / avgRHR)
        let cat: string
        let sev: InsightSeverity
        if (vo2max >= 50) { cat = "Excellent"; sev = "positive" }
        else if (vo2max >= 40) { cat = "Good"; sev = "info" }
        else if (vo2max >= 30) { cat = "Fair"; sev = "info" }
        else { cat = "Poor"; sev = "warning" }
        return makeInsight(alg, sev, `Estimated VO2max: ${vo2max.toFixed(1)} mL/kg/min — ${cat}. ${vo2max >= 50 ? "Elite aerobic fitness." : "Room for cardiovascular improvement."}`, Number(vo2max.toFixed(1)), "mL/kg/min", { low: 30, high: 50 }, { category: cat, estMaxHR, avgRHR: Math.round(avgRHR) })
      }

      default:
        return null
    }
  }
}
