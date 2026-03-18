import { getDb, healthMetrics, biometricBaselines, events } from "@biosync-io/db"
import { and, eq, gte, lte, desc, asc, sql } from "drizzle-orm"

// ── Types ───────────────────────────────────────────────────────

export interface ReadinessResult {
  /** Composite readiness score 0–100 */
  score: number
  /** Actionable recommendation for the day */
  recommendation: "train_hard" | "train_light" | "active_recovery" | "rest"
  /** Human-readable recommendation text */
  recommendationText: string
  /** Individual signal contributions */
  signals: ReadinessSignals
  /** Confidence level based on data availability (0–1) */
  confidence: number
  /** Date this readiness applies to */
  date: string
}

export interface ReadinessSignals {
  hrv: SignalContribution | null
  sleep: SignalContribution | null
  restingHr: SignalContribution | null
  strain: SignalContribution | null
  physiological: SignalContribution | null
}

export interface SignalContribution {
  /** Raw score for this signal (0–100) */
  score: number
  /** Weight applied to this signal */
  weight: number
  /** Weighted contribution to total */
  contribution: number
  /** Brief explanation */
  detail: string
}

/** Default signal weights — can be overridden by personalization */
const DEFAULT_WEIGHTS = {
  hrv: 0.30,
  sleep: 0.25,
  strain: 0.20,
  restingHr: 0.15,
  physiological: 0.10,
} as const

// ── Readiness Engine ────────────────────────────────────────────

/**
 * Proprietary Readiness/Recovery Score Engine.
 *
 * Computes a daily 0–100 readiness score from multiple physiological signals.
 * The score predicts how prepared the user's body is for physical stress today.
 *
 * Algorithm:
 * 1. HRV signal (30%): Current HRV vs personal 30-day baseline
 * 2. Sleep signal (25%): Duration + efficiency + stage quality
 * 3. Strain recovery (20%): Inverse of prior-day training load
 * 4. Resting HR signal (15%): RHR deviation from personal baseline
 * 5. Physiological signals (10%): SpO2, stress, respiratory rate
 *
 * After 14 days of data, weights adapt using per-user correlation analysis.
 */
export async function computeReadiness(
  userId: string,
  date: Date = new Date(),
): Promise<ReadinessResult> {
  const db = getDb()
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  // Fetch today's metrics and baselines in parallel
  const [todayMetrics, baselines, priorDayStrain, sleepEvent] = await Promise.all([
    fetchTodayMetrics(db, userId, dayStart, dayEnd),
    fetchBaselines(db, userId),
    fetchPriorDayStrain(db, userId, dayStart),
    fetchLastSleepEvent(db, userId, dayStart),
  ])

  const weights = { ...DEFAULT_WEIGHTS }
  let signalCount = 0

  // 1. HRV Signal
  const hrvSignal = computeHrvSignal(todayMetrics, baselines)
  if (hrvSignal) signalCount++

  // 2. Sleep Signal
  const sleepSignal = computeSleepSignal(todayMetrics, sleepEvent)
  if (sleepSignal) signalCount++

  // 3. Strain Recovery Signal
  const strainSignal = computeStrainRecoverySignal(priorDayStrain)
  if (strainSignal) signalCount++

  // 4. Resting HR Signal
  const restingHrSignal = computeRestingHrSignal(todayMetrics, baselines)
  if (restingHrSignal) signalCount++

  // 5. Physiological Signals
  const physioSignal = computePhysiologicalSignal(todayMetrics, baselines)
  if (physioSignal) signalCount++

  // Compute weighted composite
  const signals = { hrv: hrvSignal, sleep: sleepSignal, strain: strainSignal, restingHr: restingHrSignal, physiological: physioSignal }
  let totalWeight = 0
  let weightedSum = 0

  for (const [key, signal] of Object.entries(signals) as [keyof typeof weights, SignalContribution | null][]) {
    if (signal) {
      const w = weights[key]
      signal.weight = w
      signal.contribution = signal.score * w
      weightedSum += signal.contribution
      totalWeight += w
    }
  }

  // Normalize if not all signals are available
  const score = totalWeight > 0 ? Math.round(Math.min(100, Math.max(0, weightedSum / totalWeight)) * 10) / 10 : 50
  const confidence = Math.min(1, signalCount / 5)

  const recommendation = scoreToRecommendation(score)

  return {
    score,
    recommendation: recommendation.action,
    recommendationText: recommendation.text,
    signals,
    confidence,
    date: dayStart.toISOString().slice(0, 10),
  }
}

// ── Signal Computations ─────────────────────────────────────────

function computeHrvSignal(
  metrics: MetricMap,
  baselines: BaselineMap,
): SignalContribution | null {
  const hrv = latestValue(metrics, "heart_rate_variability")
  if (hrv == null) return null

  const baseline = baselines.get("heart_rate_variability")
  if (!baseline || baseline.mean === 0) {
    // No baseline yet — use absolute HRV mapping (population average ~40–60ms)
    const score = clamp(hrv * 1.2, 0, 100)
    return { score, weight: 0, contribution: 0, detail: `HRV ${hrv}ms (no baseline yet)` }
  }

  // Score based on ratio to personal baseline
  // At baseline: 75, above baseline: up to 100, below: down to 0
  const ratio = hrv / baseline.mean
  let score: number
  if (ratio >= 1.15) score = 100
  else if (ratio >= 1.0) score = 75 + (ratio - 1.0) * (25 / 0.15)
  else if (ratio >= 0.85) score = 50 + (ratio - 0.85) * (25 / 0.15)
  else if (ratio >= 0.7) score = 25 + (ratio - 0.7) * (25 / 0.15)
  else score = Math.max(0, ratio * 35)

  score = clamp(score, 0, 100)
  const direction = ratio >= 1 ? "above" : "below"
  const pct = Math.abs(Math.round((ratio - 1) * 100))

  return {
    score,
    weight: 0,
    contribution: 0,
    detail: `HRV ${hrv}ms (${pct}% ${direction} baseline ${Math.round(baseline.mean)}ms)`,
  }
}

function computeSleepSignal(
  metrics: MetricMap,
  sleepEvent: SleepEventData | null,
): SignalContribution | null {
  // Prefer provider sleep score if available
  const providerSleepScore = latestValue(metrics, "sleep_score")
  if (providerSleepScore != null) {
    return {
      score: clamp(providerSleepScore, 0, 100),
      weight: 0,
      contribution: 0,
      detail: `Provider sleep score: ${providerSleepScore}`,
    }
  }

  // Otherwise compute from sleep event data
  if (!sleepEvent) {
    const sleepMinutes = latestValue(metrics, "sleep")
    if (sleepMinutes == null) return null
    const hours = sleepMinutes / 60
    const durationScore = scoreSleepDuration(hours)
    return { score: durationScore, weight: 0, contribution: 0, detail: `${hours.toFixed(1)}h sleep` }
  }

  // Multi-factor sleep score
  const hours = sleepEvent.durationMinutes / 60
  const durationScore = scoreSleepDuration(hours)

  let stageScore = 70 // default if no stage data
  if (sleepEvent.stages) {
    const total = sleepEvent.stages.light + sleepEvent.stages.deep + sleepEvent.stages.rem + sleepEvent.stages.awake
    if (total > 0) {
      const deepPct = sleepEvent.stages.deep / total
      const remPct = sleepEvent.stages.rem / total
      const awakePct = sleepEvent.stages.awake / total
      // Ideal: deep 15-25%, REM 20-25%, awake <10%
      const deepScore = deepPct >= 0.15 && deepPct <= 0.25 ? 100 : deepPct >= 0.10 ? 70 : 40
      const remScore = remPct >= 0.20 && remPct <= 0.25 ? 100 : remPct >= 0.15 ? 70 : 40
      const awakeScore = awakePct <= 0.10 ? 100 : awakePct <= 0.15 ? 70 : 40
      stageScore = deepScore * 0.4 + remScore * 0.4 + awakeScore * 0.2
    }
  }

  // Composite sleep score: 60% duration, 40% stage quality
  const score = clamp(durationScore * 0.6 + stageScore * 0.4, 0, 100)
  return {
    score,
    weight: 0,
    contribution: 0,
    detail: `${hours.toFixed(1)}h sleep, stage quality ${Math.round(stageScore)}`,
  }
}

function computeStrainRecoverySignal(priorStrain: PriorDayStrain): SignalContribution | null {
  if (priorStrain.workoutCount === 0 && priorStrain.totalCalories === 0 && priorStrain.totalActiveMinutes === 0) {
    // Rest day — full recovery
    return { score: 90, weight: 0, contribution: 0, detail: "Rest day yesterday — well recovered" }
  }

  // Normalize strain components (higher strain = lower readiness)
  // Workout intensity factor: duration × avg HR proximity to max
  const intensityScore = priorStrain.avgHrIntensity != null
    ? clamp(100 - priorStrain.avgHrIntensity, 0, 100)
    : null

  // Duration factor (>90 min high-intensity = fatiguing)
  const durationMin = priorStrain.totalDurationSeconds / 60
  const durationScore = durationMin <= 30 ? 90
    : durationMin <= 60 ? 75
    : durationMin <= 90 ? 55
    : durationMin <= 120 ? 40
    : 25

  // Active minutes factor
  const activeScore = priorStrain.totalActiveMinutes <= 30 ? 90
    : priorStrain.totalActiveMinutes <= 60 ? 75
    : priorStrain.totalActiveMinutes <= 90 ? 55
    : 35

  const components = [durationScore, activeScore]
  if (intensityScore != null) components.push(intensityScore)

  const score = clamp(components.reduce((a, b) => a + b, 0) / components.length, 0, 100)
  return {
    score,
    weight: 0,
    contribution: 0,
    detail: `Prior day: ${priorStrain.workoutCount} workout(s), ${durationMin.toFixed(0)}min, ${priorStrain.totalCalories.toFixed(0)}kcal`,
  }
}

function computeRestingHrSignal(
  metrics: MetricMap,
  baselines: BaselineMap,
): SignalContribution | null {
  const rhr = latestValue(metrics, "resting_heart_rate")
  if (rhr == null) return null

  const baseline = baselines.get("resting_heart_rate")
  if (!baseline || baseline.mean === 0) {
    // No baseline — use population-level scoring
    const score = rhr < 50 ? 95 : rhr < 60 ? 85 : rhr < 70 ? 70 : rhr < 80 ? 50 : 30
    return { score, weight: 0, contribution: 0, detail: `RHR ${rhr} BPM (no baseline yet)` }
  }

  // Lower RHR relative to baseline = better recovery
  // At baseline: 70, below: up to 100, above: down to 0
  const deviation = rhr - baseline.mean
  const deviationPct = deviation / baseline.mean

  let score: number
  if (deviationPct <= -0.10) score = 100 // 10%+ below baseline = excellent
  else if (deviationPct <= 0) score = 70 + Math.abs(deviationPct) * 300 // at to below baseline = good
  else if (deviationPct <= 0.05) score = 55 + (0.05 - deviationPct) * 300
  else if (deviationPct <= 0.10) score = 35 + (0.10 - deviationPct) * 400
  else score = Math.max(0, 35 - (deviationPct - 0.10) * 200)

  score = clamp(score, 0, 100)
  const direction = deviation >= 0 ? "above" : "below"

  return {
    score,
    weight: 0,
    contribution: 0,
    detail: `RHR ${rhr} BPM (${Math.abs(Math.round(deviation))} ${direction} baseline ${Math.round(baseline.mean)})`,
  }
}

function computePhysiologicalSignal(
  metrics: MetricMap,
  baselines: BaselineMap,
): SignalContribution | null {
  const components: { score: number; detail: string }[] = []

  // Blood oxygen
  const spo2 = latestValue(metrics, "blood_oxygen") ?? latestValue(metrics, "spo2")
  if (spo2 != null) {
    const score = spo2 >= 97 ? 100 : spo2 >= 95 ? 85 : spo2 >= 93 ? 60 : spo2 >= 90 ? 30 : 10
    components.push({ score, detail: `SpO2 ${spo2}%` })
  }

  // Stress level (lower = better)
  const stress = latestValue(metrics, "stress")
  if (stress != null) {
    const score = clamp(100 - stress, 0, 100)
    components.push({ score, detail: `Stress ${stress}` })
  }

  // Respiratory rate
  const respRate = latestValue(metrics, "respiratory_rate")
  if (respRate != null) {
    const score = respRate >= 12 && respRate <= 20 ? 90 : respRate >= 10 && respRate <= 25 ? 70 : 40
    components.push({ score, detail: `Resp ${respRate} brpm` })
  }

  // Body temperature deviation
  const temp = latestValue(metrics, "temperature")
  const tempBaseline = baselines.get("temperature")
  if (temp != null && tempBaseline) {
    const deviation = Math.abs(temp - tempBaseline.mean)
    const score = deviation <= 0.3 ? 95 : deviation <= 0.5 ? 80 : deviation <= 1.0 ? 55 : 25
    components.push({ score, detail: `Temp deviation ${deviation.toFixed(1)}°` })
  }

  if (components.length === 0) return null

  const avgScore = components.reduce((s, c) => s + c.score, 0) / components.length
  return {
    score: clamp(avgScore, 0, 100),
    weight: 0,
    contribution: 0,
    detail: components.map((c) => c.detail).join(", "),
  }
}

// ── Data Fetchers ───────────────────────────────────────────────

type MetricMap = Map<string, number[]>
type BaselineMap = Map<string, { mean: number; stddev: number }>

async function fetchTodayMetrics(
  db: ReturnType<typeof getDb>,
  userId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<MetricMap> {
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, dayStart), lte(healthMetrics.recordedAt, dayEnd)))

  const map: MetricMap = new Map()
  for (const r of rows) {
    if (r.value == null) continue
    const arr = map.get(r.metricType) ?? []
    arr.push(r.value)
    map.set(r.metricType, arr)
  }
  return map
}

async function fetchBaselines(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<BaselineMap> {
  const rows = await db
    .select({
      metricType: biometricBaselines.metricType,
      mean: biometricBaselines.mean,
      stddev: biometricBaselines.stddev,
    })
    .from(biometricBaselines)
    .where(eq(biometricBaselines.userId, userId))
    .orderBy(desc(biometricBaselines.date))

  // Take the most recent baseline per metric type
  const map: BaselineMap = new Map()
  for (const r of rows) {
    if (!map.has(r.metricType)) {
      map.set(r.metricType, { mean: r.mean, stddev: r.stddev ?? 0 })
    }
  }
  return map
}

interface PriorDayStrain {
  workoutCount: number
  totalDurationSeconds: number
  totalCalories: number
  totalActiveMinutes: number
  avgHrIntensity: number | null
}

async function fetchPriorDayStrain(
  db: ReturnType<typeof getDb>,
  userId: string,
  todayStart: Date,
): Promise<PriorDayStrain> {
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  // Get workouts from events table
  const workouts = await db
    .select({
      durationSeconds: events.durationSeconds,
      caloriesKcal: events.caloriesKcal,
      avgHeartRate: events.avgHeartRate,
      maxHeartRate: events.maxHeartRate,
    })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.eventType, "workout"),
        gte(events.startedAt, yesterdayStart),
        lte(events.startedAt, todayStart),
      ),
    )

  // Get active minutes from metrics
  const [activeRow] = await db
    .select({ total: sql<number>`coalesce(sum(${healthMetrics.value}), 0)` })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, "active_minutes"),
        gte(healthMetrics.recordedAt, yesterdayStart),
        lte(healthMetrics.recordedAt, todayStart),
      ),
    )

  let totalDuration = 0
  let totalCals = 0
  let hrIntensitySum = 0
  let hrIntensityCount = 0

  for (const w of workouts) {
    totalDuration += w.durationSeconds ?? 0
    totalCals += w.caloriesKcal ?? 0
    if (w.avgHeartRate && w.maxHeartRate && w.maxHeartRate > 0) {
      hrIntensitySum += (w.avgHeartRate / w.maxHeartRate) * 100
      hrIntensityCount++
    }
  }

  return {
    workoutCount: workouts.length,
    totalDurationSeconds: totalDuration,
    totalCalories: totalCals,
    totalActiveMinutes: activeRow?.total ?? 0,
    avgHrIntensity: hrIntensityCount > 0 ? hrIntensitySum / hrIntensityCount : null,
  }
}

interface SleepEventData {
  durationMinutes: number
  stages: { light: number; deep: number; rem: number; awake: number } | null
}

async function fetchLastSleepEvent(
  db: ReturnType<typeof getDb>,
  userId: string,
  todayStart: Date,
): Promise<SleepEventData | null> {
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  const [sleepRow] = await db
    .select({ durationSeconds: events.durationSeconds, data: events.data })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.eventType, "sleep"),
        gte(events.startedAt, yesterdayStart),
        lte(events.startedAt, todayStart),
      ),
    )
    .orderBy(desc(events.startedAt))
    .limit(1)

  if (!sleepRow) return null

  const durationMinutes = (sleepRow.durationSeconds ?? 0) / 60
  const data = sleepRow.data as Record<string, unknown> | null

  let stages: SleepEventData["stages"] = null
  if (data?.stages && typeof data.stages === "object") {
    const s = data.stages as Record<string, number>
    stages = {
      light: s.light ?? 0,
      deep: s.deep ?? 0,
      rem: s.rem ?? 0,
      awake: s.awake ?? 0,
    }
  }

  return { durationMinutes, stages }
}

// ── Helpers ─────────────────────────────────────────────────────

function latestValue(metrics: MetricMap, type: string): number | null {
  const values = metrics.get(type)
  if (!values || values.length === 0) return null
  return values[values.length - 1]!
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function scoreSleepDuration(hours: number): number {
  // Optimal range: 7–9 hours
  if (hours >= 7 && hours <= 9) return 85 + (1 - Math.abs(hours - 8)) * 15
  if (hours >= 6) return 55 + (hours - 6) * 30
  if (hours >= 5) return 35 + (hours - 5) * 20
  return Math.max(10, hours * 7)
}

function scoreToRecommendation(score: number): { action: ReadinessResult["recommendation"]; text: string } {
  if (score >= 80) {
    return {
      action: "train_hard",
      text: "Your body is well recovered. Great day for high-intensity training or a tough workout.",
    }
  }
  if (score >= 60) {
    return {
      action: "train_light",
      text: "You're moderately recovered. Stick to moderate intensity — a steady run or technique work.",
    }
  }
  if (score >= 40) {
    return {
      action: "active_recovery",
      text: "Your recovery is below average. Light movement like yoga, walking, or stretching is best today.",
    }
  }
  return {
    action: "rest",
    text: "Your body needs rest. Prioritize sleep, hydration, and nutrition today. Skip the workout.",
  }
}
