import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, asc, sql } from "drizzle-orm"

// ─── Helper Utilities ───────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(variance)
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

function weightedAverage(values: number[], weights: number[]): number {
  let totalWeight = 0
  let weightedSum = 0
  for (let i = 0; i < values.length; i++) {
    weightedSum += values[i] * weights[i]
    totalWeight += weights[i]
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0
}

function linearRegressionSlope(values: number[]): number {
  if (values.length < 2) return 0
  const n = values.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }
  const denom = n * sumX2 - sumX * sumX
  return denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function coefficientOfVariation(arr: number[]): number {
  const m = mean(arr)
  return m !== 0 ? stdDev(arr) / m : 0
}

function exponentialMovingAverage(arr: number[], alpha: number): number[] {
  if (arr.length === 0) return []
  const result = [arr[0]]
  for (let i = 1; i < arr.length; i++) {
    result.push(alpha * arr[i] + (1 - alpha) * result[i - 1])
  }
  return result
}

type MetricMap = Map<string, Array<{ value: number; recordedAt: Date }>>

async function queryMetrics(userId: string, days: number, targetDate: Date) {
  const db = getDb()
  const start = new Date(targetDate.getTime() - days * 86400000)
  const rows = await db
    .select({
      metricType: healthMetrics.metricType,
      value: healthMetrics.value,
      recordedAt: healthMetrics.recordedAt,
    })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        gte(healthMetrics.recordedAt, start),
        lte(healthMetrics.recordedAt, targetDate)
      )
    )
    .orderBy(asc(healthMetrics.recordedAt))
  return rows
}

function groupByType(rows: Array<{ metricType: string; value: number | null; recordedAt: Date }>): MetricMap {
  const byType: MetricMap = new Map()
  for (const r of rows) {
    if (r.value == null) continue
    const arr = byType.get(r.metricType) ?? []
    arr.push({ value: r.value, recordedAt: new Date(r.recordedAt) })
    byType.set(r.metricType, arr)
  }
  return byType
}

function getValues(byType: MetricMap, key: string): number[] {
  return (byType.get(key) ?? []).map((e) => e.value)
}

function getLatest(byType: MetricMap, key: string): number | null {
  const arr = byType.get(key)
  if (!arr || arr.length === 0) return null
  return arr[arr.length - 1].value
}

// ─── 1. computeVO2MaxDetailed ───────────────────────────────────────────────

interface VO2MaxDetailedResult {
  score: number
  uthMethod: number | null
  activityMethod: number | null
  hrvMethod: number | null
  methodsUsed: string[]
  confidence: number
  date: string
}

export async function computeVO2MaxDetailed(
  userId: string,
  date?: Date
): Promise<VO2MaxDetailedResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const restHRValues = getValues(byType, "resting_heart_rate")
  const hrvValues = getValues(byType, "hrv")
  const activeMinValues = getValues(byType, "active_minutes")
  const stepsValues = getValues(byType, "steps")
  const weightValues = getValues(byType, "weight")
  const methodsUsed: string[] = []
  let uthMethod: number | null = null
  let activityMethod: number | null = null
  let hrvMethod: number | null = null
  const estimates: number[] = []
  const weights: number[] = []
  if (restHRValues.length > 0) {
    const avgRestHR = mean(restHRValues)
    const maxHR = 220 - 30
    uthMethod = round1(15.3 * (maxHR / avgRestHR))
    methodsUsed.push("uth")
    estimates.push(uthMethod)
    weights.push(0.4)
  }
  if (activeMinValues.length > 0 && stepsValues.length > 0) {
    const avgActive = mean(activeMinValues)
    const avgSteps = mean(stepsValues)
    const w = weightValues.length > 0 ? mean(weightValues) : 70
    const activityFactor = (avgActive * 0.1 + avgSteps * 0.001) / w * 10
    activityMethod = round1(clamp(20 + activityFactor * 5, 15, 80))
    methodsUsed.push("activity")
    estimates.push(activityMethod)
    weights.push(0.3)
  }
  if (hrvValues.length > 0) {
    const avgHRV = mean(hrvValues)
    hrvMethod = round1(clamp(avgHRV * 0.65 + 10, 15, 85))
    methodsUsed.push("hrv")
    estimates.push(hrvMethod)
    weights.push(0.3)
  }
  const score = estimates.length > 0 ? round1(weightedAverage(estimates, weights)) : 0
  const confidence = round1(clamp(methodsUsed.length / 3, 0, 1))
  return { score, uthMethod, activityMethod, hrvMethod, methodsUsed, confidence, date: targetDate.toISOString() }
}

// ─── 2. computeAnaerobicThreshold ───────────────────────────────────────────

interface AnaerobicThresholdResult {
  thresholdBPM: number
  percentOfMax: number
  zone: string
  maxHR: number
  confidence: number
  date: string
}

export async function computeAnaerobicThreshold(
  userId: string,
  date?: Date
): Promise<AnaerobicThresholdResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const hrvValues = getValues(byType, "hrv")
  const maxObservedHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const maxHR = Math.max(maxObservedHR, 220 - 30)
  const fitnessAdjust = hrvValues.length > 0 ? clamp((mean(hrvValues) - 40) * 0.1, -3, 3) : 0
  const atPercent = clamp(0.85 + fitnessAdjust / 100, 0.78, 0.92)
  const thresholdBPM = round1(maxHR * atPercent)
  const percentOfMax = round1(atPercent * 100)
  let zone = "zone4"
  if (atPercent < 0.82) zone = "zone3"
  else if (atPercent > 0.88) zone = "zone5"
  const confidence = round1(clamp(hrValues.length / 50, 0.1, 1))
  return { thresholdBPM, percentOfMax, zone, maxHR, confidence, date: targetDate.toISOString() }
}

// ─── 3. computeLactateThresholdProxy ────────────────────────────────────────

interface LactateThresholdProxyResult {
  thresholdHR: number
  estimatedPace: number
  deflectionPoint: number
  confidence: number
  date: string
}

export async function computeLactateThresholdProxy(
  userId: string,
  date?: Date
): Promise<LactateThresholdProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const activeMin = getValues(byType, "active_minutes")
  const caloriesValues = getValues(byType, "calories")
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const p75HR = hrValues.length > 0 ? percentile(hrValues, 75) : maxHR * 0.8
  const avgCalPerMin = caloriesValues.length > 0 && activeMin.length > 0
    ? mean(caloriesValues) / Math.max(mean(activeMin), 1)
    : 8
  const deflectionPoint = round1(p75HR + (avgCalPerMin - 8) * 0.5)
  const thresholdHR = round1(clamp(deflectionPoint, maxHR * 0.72, maxHR * 0.88))
  const estimatedPace = round1(clamp(12 - (thresholdHR / maxHR) * 6, 3.5, 10))
  const confidence = round1(clamp(hrValues.length / 60, 0.1, 1))
  return { thresholdHR, estimatedPace, deflectionPoint, confidence, date: targetDate.toISOString() }
}
// ─── 4. analyzePowerOutputEstimate ──────────────────────────────────────────

interface PowerOutputEstimateResult {
  estimatedWatts: number
  wattsPerKg: number
  powerZone: string
  avgCaloriesPerMin: number
  confidence: number
  date: string
}

export async function analyzePowerOutputEstimate(
  userId: string,
  date?: Date
): Promise<PowerOutputEstimateResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const weightVals = getValues(byType, "weight")
  const steps = getValues(byType, "steps")
  const avgCal = calories.length > 0 ? mean(calories) : 2000
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const avgSteps = steps.length > 0 ? mean(steps) : 5000
  const calPerMin = avgActive > 0 ? avgCal * 0.3 / avgActive : 5
  const estimatedWatts = round1(calPerMin * 69.78 / 60 + avgSteps * 0.001)
  const wattsPerKg = round1(estimatedWatts / w)
  let powerZone = "recreational"
  if (wattsPerKg > 5) powerZone = "elite"
  else if (wattsPerKg > 4) powerZone = "advanced"
  else if (wattsPerKg > 3) powerZone = "intermediate"
  else if (wattsPerKg > 2) powerZone = "moderate"
  const confidence = round1(clamp((calories.length + activeMin.length) / 30, 0.1, 1))
  return { estimatedWatts, wattsPerKg, powerZone, avgCaloriesPerMin: round1(calPerMin), confidence, date: targetDate.toISOString() }
}

// ─── 5. computeEnduranceIndex ───────────────────────────────────────────────

interface EnduranceIndexResult {
  score: number
  components: { vo2maxComponent: number; hrvComponent: number; activityComponent: number; restHRComponent: number }
  trend: string
  confidence: number
  date: string
}

export async function computeEnduranceIndex(
  userId: string,
  date?: Date
): Promise<EnduranceIndexResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const hrv = getValues(byType, "hrv")
  const activeMin = getValues(byType, "active_minutes")
  const restHR = getValues(byType, "resting_heart_rate")
  let totalWeight = 0
  let weightedSum = 0
  const vo2maxComponent = vo2.length > 0 ? clamp(mean(vo2) / 60 * 100, 0, 100) : 50
  weightedSum += vo2maxComponent * 0.3; totalWeight += 0.3
  const hrvComponent = hrv.length > 0 ? clamp(mean(hrv) / 80 * 100, 0, 100) : 50
  weightedSum += hrvComponent * 0.25; totalWeight += 0.25
  const activityComponent = activeMin.length > 0 ? clamp(mean(activeMin) / 60 * 100, 0, 100) : 50
  weightedSum += activityComponent * 0.25; totalWeight += 0.25
  const restHRComponent = restHR.length > 0 ? clamp((100 - mean(restHR)) / 40 * 100, 0, 100) : 50
  weightedSum += restHRComponent * 0.2; totalWeight += 0.2
  const score = round1(totalWeight > 0 ? weightedSum / totalWeight : 50)
  const activeSlope = linearRegressionSlope(activeMin)
  const trend = activeSlope > 0.5 ? "improving" : activeSlope < -0.5 ? "declining" : "stable"
  const confidence = round1(clamp((vo2.length + hrv.length + activeMin.length + restHR.length) / 60, 0.1, 1))
  return { score, components: { vo2maxComponent: round1(vo2maxComponent), hrvComponent: round1(hrvComponent), activityComponent: round1(activityComponent), restHRComponent: round1(restHRComponent) }, trend, confidence, date: targetDate.toISOString() }
}

// ─── 6. assessSprintCapacity ────────────────────────────────────────────────

interface SprintCapacityResult {
  score: number
  anaerobicPower: number
  recoveryRate: number
  peakHR: number
  confidence: number
  date: string
}

export async function assessSprintCapacity(
  userId: string,
  date?: Date
): Promise<SprintCapacityResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const restHR = getValues(byType, "resting_heart_rate")
  const peakHR = hrValues.length > 0 ? Math.max(...hrValues) : 180
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const hrRange = peakHR - avgRestHR
  const calRate = calories.length > 0 && activeMin.length > 0
    ? mean(calories) / Math.max(mean(activeMin), 1)
    : 8
  const anaerobicPower = round1(clamp((calRate * 10 + hrRange * 0.3) / 2, 0, 100))
  const recoveryRate = round1(clamp((hrRange / peakHR) * 100, 0, 100))
  const score = round1(clamp(anaerobicPower * 0.6 + recoveryRate * 0.4, 0, 100))
  const confidence = round1(clamp(hrValues.length / 30, 0.1, 1))
  return { score, anaerobicPower, recoveryRate, peakHR, confidence, date: targetDate.toISOString() }
}

// ─── 7. computeTrainingReadiness ────────────────────────────────────────────

interface TrainingReadinessResult {
  score: number
  recommendation: string
  signals: {
    hrvSignal: number
    restHRSignal: number
    sleepSignal: number
    stressSignal: number
    loadSignal: number
  }
  confidence: number
  date: string
}

export async function computeTrainingReadiness(
  userId: string,
  date?: Date
): Promise<TrainingReadinessResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 7 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrv = getValues(byType, "hrv")
  const restHR = getValues(byType, "resting_heart_rate")
  const sleepDur = getValues(byType, "sleep_duration")
  const deepSleep = getValues(byType, "deep_sleep")
  const stress = getValues(byType, "stress")
  const activeMin = getValues(byType, "active_minutes")
  const hrvSignal = hrv.length > 0 ? clamp(mean(hrv) / 80 * 100, 0, 100) : 50
  const restHRSignal = restHR.length > 0 ? clamp((80 - mean(restHR)) / 30 * 100, 0, 100) : 50
  const sleepAvg = sleepDur.length > 0 ? mean(sleepDur) : 7
  const deepAvg = deepSleep.length > 0 ? mean(deepSleep) : 1.5
  const sleepSignal = clamp((sleepAvg / 8 * 70 + deepAvg / 2 * 30), 0, 100)
  const stressAvg = stress.length > 0 ? mean(stress) : 50
  const stressSignal = clamp(100 - stressAvg, 0, 100)
  const loadAvg = activeMin.length > 0 ? mean(activeMin) : 30
  const loadSignal = clamp(100 - Math.abs(loadAvg - 45) * 2, 0, 100)
  const score = round1(hrvSignal * 0.25 + restHRSignal * 0.2 + sleepSignal * 0.25 + stressSignal * 0.15 + loadSignal * 0.15)
  let recommendation = "moderate training"
  if (score > 80) recommendation = "high intensity training recommended"
  else if (score > 60) recommendation = "moderate training recommended"
  else if (score > 40) recommendation = "light training or active recovery"
  else recommendation = "rest day recommended"
  const confidence = round1(clamp((hrv.length + restHR.length + sleepDur.length) / 15, 0.1, 1))
  return { score, recommendation, signals: { hrvSignal: round1(hrvSignal), restHRSignal: round1(restHRSignal), sleepSignal: round1(sleepSignal), stressSignal: round1(stressSignal), loadSignal: round1(loadSignal) }, confidence, date: targetDate.toISOString() }
}

// ─── 8. analyzePerformanceDecrement ─────────────────────────────────────────

interface PerformanceDecrementResult {
  status: string
  decrementScore: number
  indicators: { hrvDecline: number; restHRIncrease: number; sleepDecline: number }
  confidence: number
  date: string
}

export async function analyzePerformanceDecrement(
  userId: string,
  date?: Date
): Promise<PerformanceDecrementResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start28 = new Date(targetDate.getTime() - 28 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start28), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const midpoint = new Date(targetDate.getTime() - 7 * 86400000)
  const splitByPeriod = (key: string) => {
    const entries = byType.get(key) ?? []
    const recent = entries.filter((e) => e.recordedAt >= midpoint).map((e) => e.value)
    const baseline = entries.filter((e) => e.recordedAt < midpoint).map((e) => e.value)
    return { recent, baseline }
  }
  const hrvSplit = splitByPeriod("hrv")
  const restHRSplit = splitByPeriod("resting_heart_rate")
  const sleepSplit = splitByPeriod("sleep_duration")
  const hrvDecline = hrvSplit.baseline.length > 0 && hrvSplit.recent.length > 0
    ? clamp((mean(hrvSplit.baseline) - mean(hrvSplit.recent)) / mean(hrvSplit.baseline) * 100, -50, 50)
    : 0
  const restHRIncrease = restHRSplit.baseline.length > 0 && restHRSplit.recent.length > 0
    ? clamp((mean(restHRSplit.recent) - mean(restHRSplit.baseline)) / mean(restHRSplit.baseline) * 100, -50, 50)
    : 0
  const sleepDecline = sleepSplit.baseline.length > 0 && sleepSplit.recent.length > 0
    ? clamp((mean(sleepSplit.baseline) - mean(sleepSplit.recent)) / mean(sleepSplit.baseline) * 100, -50, 50)
    : 0
  const decrementScore = round1(clamp(hrvDecline * 0.4 + restHRIncrease * 0.35 + sleepDecline * 0.25, 0, 100))
  let status = "normal"
  if (decrementScore > 30) status = "significant overtraining risk"
  else if (decrementScore > 15) status = "moderate concern"
  else if (decrementScore > 5) status = "mild fatigue"
  const confidence = round1(clamp((hrvSplit.recent.length + restHRSplit.recent.length) / 10, 0.1, 1))
  return { status, decrementScore, indicators: { hrvDecline: round1(hrvDecline), restHRIncrease: round1(restHRIncrease), sleepDecline: round1(sleepDecline) }, confidence, date: targetDate.toISOString() }
}

// ─── 9. computeFatigueResistance ────────────────────────────────────────────

interface FatigueResistanceResult {
  score: number
  enduranceFactor: number
  recoveryFactor: number
  consistencyFactor: number
  confidence: number
  date: string
}

export async function computeFatigueResistance(
  userId: string,
  date?: Date
): Promise<FatigueResistanceResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrv = getValues(byType, "hrv")
  const activeMin = getValues(byType, "active_minutes")
  const sleepDur = getValues(byType, "sleep_duration")
  const hrvCV = hrv.length > 2 ? coefficientOfVariation(hrv) : 0.5
  const enduranceFactor = round1(clamp((1 - hrvCV) * 100, 0, 100))
  const activeCV = activeMin.length > 2 ? coefficientOfVariation(activeMin) : 0.5
  const consistencyFactor = round1(clamp((1 - activeCV) * 100, 0, 100))
  const avgSleep = sleepDur.length > 0 ? mean(sleepDur) : 7
  const recoveryFactor = round1(clamp(avgSleep / 8 * 100, 0, 100))
  const score = round1(enduranceFactor * 0.4 + recoveryFactor * 0.35 + consistencyFactor * 0.25)
  const confidence = round1(clamp((hrv.length + activeMin.length + sleepDur.length) / 45, 0.1, 1))
  return { score, enduranceFactor, recoveryFactor, consistencyFactor, confidence, date: targetDate.toISOString() }
}

// ─── 10. assessInjuryRisk ───────────────────────────────────────────────────

interface InjuryRiskResult {
  riskScore: number
  riskLevel: string
  factors: { acuteChronicRatio: number; sleepDeficit: number; stressLevel: number; loadSpike: number }
  confidence: number
  date: string
}

export async function assessInjuryRisk(
  userId: string,
  date?: Date
): Promise<InjuryRiskResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 28 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const midpoint = new Date(targetDate.getTime() - 7 * 86400000)
  const getRecent = (key: string) => (byType.get(key) ?? []).filter((e) => e.recordedAt >= midpoint).map((e) => e.value)
  const getChronic = (key: string) => (byType.get(key) ?? []).filter((e) => e.recordedAt < midpoint).map((e) => e.value)
  const compositeLoad = (vals: number[], sVals: number[], cVals: number[]) =>
    mean(vals) * 0.4 + mean(sVals) * 0.3 + mean(cVals) * 0.3
  const acuteSteps = getRecent("steps"), chronicSteps = getChronic("steps")
  const acuteActive = getRecent("active_minutes"), chronicActive = getChronic("active_minutes")
  const acuteCal = getRecent("calories"), chronicCal = getChronic("calories")
  const acuteLoad = compositeLoad(acuteSteps.length > 0 ? acuteSteps : [5000], acuteActive.length > 0 ? acuteActive : [30], acuteCal.length > 0 ? acuteCal : [2000])
  const chronicLoad = compositeLoad(chronicSteps.length > 0 ? chronicSteps : [5000], chronicActive.length > 0 ? chronicActive : [30], chronicCal.length > 0 ? chronicCal : [2000])
  const acuteChronicRatio = chronicLoad > 0 ? round1(acuteLoad / chronicLoad) : 1
  const sleepVals = getValues(byType, "sleep_duration")
  const sleepDeficit = round1(clamp((8 - (sleepVals.length > 0 ? mean(sleepVals) : 7)) * 15, 0, 50))
  const stressVals = getValues(byType, "stress")
  const stressLevel = round1(stressVals.length > 0 ? mean(stressVals) : 50)
  const loadSpike = round1(clamp(Math.abs(acuteChronicRatio - 1) * 50, 0, 50))
  const riskScore = round1(clamp(loadSpike * 0.35 + sleepDeficit * 0.25 + stressLevel * 0.2 + (acuteChronicRatio > 1.5 ? 20 : 0), 0, 100))
  let riskLevel = "low"
  if (riskScore > 70) riskLevel = "high"
  else if (riskScore > 40) riskLevel = "moderate"
  const confidence = round1(clamp((acuteSteps.length + chronicSteps.length) / 20, 0.1, 1))
  return { riskScore, riskLevel, factors: { acuteChronicRatio, sleepDeficit, stressLevel, loadSpike }, confidence, date: targetDate.toISOString() }
}
// ─── 11. computeAerobicDecoupling ──────────────────────────────────────────

interface AerobicDecouplingResult {
  decouplingPercent: number
  aerobicFitness: string
  trend: string
  firstHalfHR: number
  secondHalfHR: number
  confidence: number
  date: string
}

export async function computeAerobicDecoupling(
  userId: string,
  date?: Date
): Promise<AerobicDecouplingResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrEntries = byType.get("heart_rate") ?? []
  const activeMin = getValues(byType, "active_minutes")
  const mid = Math.floor(hrEntries.length / 2)
  const firstHalf = hrEntries.slice(0, Math.max(mid, 1)).map((e) => e.value)
  const secondHalf = hrEntries.slice(Math.max(mid, 1)).map((e) => e.value)
  const firstHalfHR = round1(mean(firstHalf.length > 0 ? firstHalf : [130]))
  const secondHalfHR = round1(mean(secondHalf.length > 0 ? secondHalf : [135]))
  const decouplingPercent = round1(firstHalfHR > 0 ? ((secondHalfHR - firstHalfHR) / firstHalfHR) * 100 : 0)
  let aerobicFitness = "average"
  if (decouplingPercent < 3) aerobicFitness = "excellent"
  else if (decouplingPercent < 5) aerobicFitness = "good"
  else if (decouplingPercent > 10) aerobicFitness = "needs improvement"
  const hrSlope = linearRegressionSlope(hrEntries.map((e) => e.value))
  const trend = hrSlope < -0.1 ? "improving" : hrSlope > 0.1 ? "worsening" : "stable"
  const confidence = round1(clamp(hrEntries.length / 30, 0.1, 1))
  return { decouplingPercent, aerobicFitness, trend, firstHalfHR, secondHalfHR, confidence, date: targetDate.toISOString() }
}

// ─── 12. analyzeRacePredictor ───────────────────────────────────────────────

interface RacePrediction {
  distance: string
  predictedTimeMinutes: number
  predictedTimeFormatted: string
  pace: string
}

interface RacePredictorResult {
  predictions: RacePrediction[]
  baseVO2max: number
  confidence: number
  date: string
}

export async function analyzeRacePredictor(
  userId: string,
  date?: Date
): Promise<RacePredictorResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const activeMin = getValues(byType, "active_minutes")
  const weightVals = getValues(byType, "weight")
  const baseVO2max = vo2.length > 0 ? mean(vo2) : 40
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const speedAtVO2max = baseVO2max / 3.5
  const riegelExponent = 1.06
  const baseDistance = 1.0
  const baseTime = baseDistance / (speedAtVO2max * 1000 / 60)
  const distances = [
    { name: "5K", meters: 5000 },
    { name: "10K", meters: 10000 },
    { name: "Half Marathon", meters: 21097 },
    { name: "Marathon", meters: 42195 },
  ]
  const predictions: RacePrediction[] = distances.map((d) => {
    const ratio = d.meters / 1000
    const predictedTimeMinutes = round1(baseTime * Math.pow(ratio, riegelExponent) * (70 / w) * 0.9)
    const hours = Math.floor(predictedTimeMinutes / 60)
    const mins = Math.floor(predictedTimeMinutes % 60)
    const secs = Math.round((predictedTimeMinutes % 1) * 60)
    const predictedTimeFormatted = hours > 0 ? `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${mins}:${String(secs).padStart(2, "0")}`
    const paceMin = predictedTimeMinutes / (d.meters / 1000)
    const paceMins = Math.floor(paceMin)
    const paceSecs = Math.round((paceMin % 1) * 60)
    const pace = `${paceMins}:${String(paceSecs).padStart(2, "0")}/km`
    return { distance: d.name, predictedTimeMinutes, predictedTimeFormatted, pace }
  })
  const confidence = round1(clamp((vo2.length + activeMin.length) / 30, 0.1, 1))
  return { predictions, baseVO2max: round1(baseVO2max), confidence, date: targetDate.toISOString() }
}

// ─── 13. computePowerToWeightRatio ──────────────────────────────────────────

interface PowerToWeightRatioResult {
  ratio: number
  category: string
  percentile: number
  estimatedPower: number
  weight: number
  confidence: number
  date: string
}

export async function computePowerToWeightRatio(
  userId: string,
  date?: Date
): Promise<PowerToWeightRatioResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const avgCal = calories.length > 0 ? mean(calories) : 2000
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const calPerMin = avgActive > 0 ? (avgCal * 0.3) / avgActive : 5
  const estimatedPower = round1(calPerMin * 69.78 / 60)
  const ratio = round1(estimatedPower / w)
  let category = "untrained"
  if (ratio > 5) category = "world class"
  else if (ratio > 4) category = "elite"
  else if (ratio > 3) category = "advanced"
  else if (ratio > 2) category = "intermediate"
  else if (ratio > 1) category = "recreational"
  const pctl = round1(clamp(ratio / 6 * 100, 0, 100))
  const confidence = round1(clamp((calories.length + weightVals.length) / 20, 0.1, 1))
  return { ratio, category, percentile: pctl, estimatedPower, weight: round1(w), confidence, date: targetDate.toISOString() }
}

// ─── 14. assessOverreachingState ────────────────────────────────────────────

interface OverreachingStateResult {
  state: string
  severity: number
  recommendations: string[]
  indicators: { hrvTrend: number; restHRTrend: number; sleepDisruption: number; performanceTrend: number }
  confidence: number
  date: string
}

export async function assessOverreachingState(
  userId: string,
  date?: Date
): Promise<OverreachingStateResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 28 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrv = getValues(byType, "hrv")
  const restHR = getValues(byType, "resting_heart_rate")
  const sleepDur = getValues(byType, "sleep_duration")
  const activeMin = getValues(byType, "active_minutes")
  const hrvTrend = round1(linearRegressionSlope(hrv))
  const restHRTrend = round1(linearRegressionSlope(restHR))
  const sleepSlope = linearRegressionSlope(sleepDur)
  const sleepDisruption = round1(clamp(-sleepSlope * 20, 0, 100))
  const performanceTrend = round1(linearRegressionSlope(activeMin))
  const severityComponents = [
    clamp(-hrvTrend * 10, 0, 30),
    clamp(restHRTrend * 10, 0, 30),
    sleepDisruption * 0.3,
    clamp(-performanceTrend * 5, 0, 20),
  ]
  const severity = round1(clamp(severityComponents.reduce((a, b) => a + b, 0), 0, 100))
  let state = "normal"
  const recommendations: string[] = []
  if (severity > 60) {
    state = "non-functional overreaching"
    recommendations.push("take 5-7 days complete rest", "prioritize sleep and nutrition", "consult a coach")
  } else if (severity > 30) {
    state = "functional overreaching"
    recommendations.push("reduce training volume 30-50%", "increase sleep by 1 hour", "add recovery modalities")
  } else {
    state = "normal training"
    recommendations.push("continue current program", "monitor trends")
  }
  const confidence = round1(clamp((hrv.length + restHR.length) / 30, 0.1, 1))
  return { state, severity, recommendations, indicators: { hrvTrend, restHRTrend, sleepDisruption, performanceTrend }, confidence, date: targetDate.toISOString() }
}

// ─── 15. computeTrainingMonotony ────────────────────────────────────────────

interface TrainingMonotonyResult {
  monotony: number
  strain: number
  risk: string
  dailyLoads: number[]
  confidence: number
  date: string
}

export async function computeTrainingMonotony(
  userId: string,
  date?: Date
): Promise<TrainingMonotonyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 7 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeEntries = byType.get("active_minutes") ?? []
  const stressEntries = byType.get("stress") ?? []
  const dailyMap = new Map<string, number>()
  for (const e of activeEntries) {
    const day = e.recordedAt.toISOString().slice(0, 10)
    const stressOnDay = stressEntries.find((s) => s.recordedAt.toISOString().slice(0, 10) === day)
    const stressFactor = stressOnDay ? stressOnDay.value / 50 : 1
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + e.value * stressFactor)
  }
  const dailyLoads = Array.from(dailyMap.values())
  if (dailyLoads.length === 0) dailyLoads.push(30)
  const avgLoad = mean(dailyLoads)
  const sdLoad = stdDev(dailyLoads)
  const monotony = round1(sdLoad > 0 ? avgLoad / sdLoad : 10)
  const weeklyLoad = dailyLoads.reduce((a, b) => a + b, 0)
  const strain = round1(weeklyLoad * monotony)
  let risk = "low"
  if (monotony > 2 && strain > 6000) risk = "high"
  else if (monotony > 1.5 || strain > 4000) risk = "moderate"
  const confidence = round1(clamp(dailyLoads.length / 7, 0.1, 1))
  return { monotony, strain, risk, dailyLoads: dailyLoads.map(round1), confidence, date: targetDate.toISOString() }
}

// ─── 16. analyzeTrainingStrain ──────────────────────────────────────────────

interface TrainingStrainResult {
  strain: number
  load: number
  monotony: number
  riskLevel: string
  confidence: number
  date: string
}

export async function analyzeTrainingStrain(
  userId: string,
  date?: Date
): Promise<TrainingStrainResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 7 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const calories = getValues(byType, "calories")
  const dailyLoad: number[] = []
  const maxLen = Math.max(steps.length, activeMin.length, calories.length, 1)
  for (let i = 0; i < maxLen; i++) {
    const s = steps[i] ?? 5000
    const a = activeMin[i] ?? 30
    const c = calories[i] ?? 2000
    dailyLoad.push(s * 0.01 + a * 2 + c * 0.05)
  }
  const load = round1(dailyLoad.reduce((a, b) => a + b, 0))
  const avgDailyLoad = mean(dailyLoad)
  const sdDailyLoad = stdDev(dailyLoad)
  const monotony = round1(sdDailyLoad > 0 ? avgDailyLoad / sdDailyLoad : 5)
  const strain = round1(load * monotony)
  let riskLevel = "low"
  if (strain > 8000) riskLevel = "very high"
  else if (strain > 5000) riskLevel = "high"
  else if (strain > 3000) riskLevel = "moderate"
  const confidence = round1(clamp(dailyLoad.length / 7, 0.1, 1))
  return { strain, load, monotony, riskLevel, confidence, date: targetDate.toISOString() }
}
// ─── 17. computeAcuteChronicWorkload ────────────────────────────────────────

interface AcuteChronicWorkloadResult {
  ratio: number
  zone: string
  acuteLoad: number
  chronicLoad: number
  trend: string
  confidence: number
  date: string
}

export async function computeAcuteChronicWorkload(
  userId: string,
  date?: Date
): Promise<AcuteChronicWorkloadResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 28 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const acuteCutoff = new Date(targetDate.getTime() - 7 * 86400000)
  const computeLoad = (key: string, period: "acute" | "chronic") => {
    const entries = byType.get(key) ?? []
    const filtered = period === "acute"
      ? entries.filter((e) => e.recordedAt >= acuteCutoff)
      : entries
    return filtered.length > 0 ? mean(filtered.map((e) => e.value)) : 0
  }
  const acuteSteps = computeLoad("steps", "acute")
  const chronicSteps = computeLoad("steps", "chronic")
  const acuteActive = computeLoad("active_minutes", "acute")
  const chronicActive = computeLoad("active_minutes", "chronic")
  const acuteCal = computeLoad("calories", "acute")
  const chronicCal = computeLoad("calories", "chronic")
  const acuteLoad = round1(acuteSteps * 0.01 + acuteActive * 2 + acuteCal * 0.05)
  const chronicLoad = round1(chronicSteps * 0.01 + chronicActive * 2 + chronicCal * 0.05)
  const ratio = round1(chronicLoad > 0 ? acuteLoad / chronicLoad : 1)
  let zone = "sweet spot"
  if (ratio > 1.5) zone = "danger zone"
  else if (ratio > 1.3) zone = "high risk"
  else if (ratio < 0.8) zone = "undertraining"
  const recentLoads = (byType.get("active_minutes") ?? []).filter((e) => e.recordedAt >= acuteCutoff).map((e) => e.value)
  const trend = linearRegressionSlope(recentLoads) > 0.5 ? "increasing" : linearRegressionSlope(recentLoads) < -0.5 ? "decreasing" : "stable"
  const confidence = round1(clamp((byType.get("steps")?.length ?? 0) / 20, 0.1, 1))
  return { ratio, zone, acuteLoad, chronicLoad, trend, confidence, date: targetDate.toISOString() }
}

// ─── 18. assessPerformancePlateau ───────────────────────────────────────────

interface PerformancePlateauResult {
  isPlateaued: boolean
  duration: number
  plateauScore: number
  suggestions: string[]
  metrics: { vo2maxVariation: number; activeMinVariation: number; stepsVariation: number }
  confidence: number
  date: string
}

export async function assessPerformancePlateau(
  userId: string,
  date?: Date
): Promise<PerformancePlateauResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const activeMin = getValues(byType, "active_minutes")
  const steps = getValues(byType, "steps")
  const vo2maxVariation = round1(vo2.length > 2 ? coefficientOfVariation(vo2) * 100 : 10)
  const activeMinVariation = round1(activeMin.length > 2 ? coefficientOfVariation(activeMin) * 100 : 10)
  const stepsVariation = round1(steps.length > 2 ? coefficientOfVariation(steps) * 100 : 10)
  const vo2Slope = Math.abs(linearRegressionSlope(vo2))
  const activeSlopeAbs = Math.abs(linearRegressionSlope(activeMin))
  const plateauScore = round1(clamp(100 - (vo2maxVariation * 2 + vo2Slope * 20 + activeSlopeAbs * 5), 0, 100))
  const isPlateaued = plateauScore > 60
  const duration = isPlateaued ? 30 : 0
  const suggestions: string[] = []
  if (isPlateaued) {
    suggestions.push("introduce interval training", "increase training variety", "consider periodization changes", "add cross-training activities")
  } else {
    suggestions.push("continue current progression")
  }
  const confidence = round1(clamp((vo2.length + activeMin.length) / 30, 0.1, 1))
  return { isPlateaued, duration, plateauScore, suggestions, metrics: { vo2maxVariation, activeMinVariation, stepsVariation }, confidence, date: targetDate.toISOString() }
}

// ─── 19. computeNeuromuscularFatigueProxy ───────────────────────────────────

interface NeuromuscularFatigueResult {
  fatigueScore: number
  indicators: { hrvVariability: number; restHRElevation: number; morningReadiness: number }
  recoveryNeeded: boolean
  confidence: number
  date: string
}

export async function computeNeuromuscularFatigueProxy(
  userId: string,
  date?: Date
): Promise<NeuromuscularFatigueResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 7 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrv = getValues(byType, "hrv")
  const restHR = getValues(byType, "resting_heart_rate")
  const hrvVariability = round1(hrv.length > 2 ? coefficientOfVariation(hrv) * 100 : 20)
  const restHRBaseline = restHR.length > 3 ? mean(restHR.slice(0, Math.floor(restHR.length / 2))) : 65
  const restHRRecent = restHR.length > 0 ? mean(restHR.slice(-3)) : 65
  const restHRElevation = round1(clamp(((restHRRecent - restHRBaseline) / restHRBaseline) * 100, -20, 40))
  const morningReadiness = round1(clamp(100 - hrvVariability * 2 - restHRElevation * 2, 0, 100))
  const fatigueScore = round1(clamp(hrvVariability * 0.4 + restHRElevation * 2 + (100 - morningReadiness) * 0.3, 0, 100))
  const recoveryNeeded = fatigueScore > 50
  const confidence = round1(clamp((hrv.length + restHR.length) / 10, 0.1, 1))
  return { fatigueScore, indicators: { hrvVariability, restHRElevation, morningReadiness }, recoveryNeeded, confidence, date: targetDate.toISOString() }
}

// ─── 20. analyzeRecoveryKinetics ────────────────────────────────────────────

interface RecoveryKineticsResult {
  recoveryRate: number
  halfLife: number
  efficiency: number
  avgRecoveryHours: number
  confidence: number
  date: string
}

export async function analyzeRecoveryKinetics(
  userId: string,
  date?: Date
): Promise<RecoveryKineticsResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrvEntries = byType.get("hrv") ?? []
  const restHREntries = byType.get("resting_heart_rate") ?? []
  const hrvValues = hrvEntries.map((e) => e.value)
  const restHRValues = restHREntries.map((e) => e.value)
  const hrvMean = mean(hrvValues.length > 0 ? hrvValues : [50])
  const hrvMin = hrvValues.length > 0 ? Math.min(...hrvValues) : 30
  const restHRMean = mean(restHRValues.length > 0 ? restHRValues : [65])
  const restHRMax = restHRValues.length > 0 ? Math.max(...restHRValues) : 80
  const hrvRecoveryDepth = hrvMean > 0 ? (hrvMean - hrvMin) / hrvMean : 0.3
  const hrRecoveryDepth = restHRMean > 0 ? (restHRMax - restHRMean) / restHRMean : 0.2
  const recoveryRate = round1(clamp((1 - hrvRecoveryDepth) * 60 + (1 - hrRecoveryDepth) * 40, 0, 100))
  const halfLife = round1(clamp(24 / (recoveryRate / 50), 6, 72))
  const efficiency = round1(clamp(recoveryRate / halfLife * 10, 0, 100))
  const avgRecoveryHours = round1(halfLife * 2)
  const confidence = round1(clamp((hrvEntries.length + restHREntries.length) / 30, 0.1, 1))
  return { recoveryRate, halfLife, efficiency, avgRecoveryHours, confidence, date: targetDate.toISOString() }
}

// ─── 21. computeRunningEconomy ──────────────────────────────────────────────

interface RunningEconomyResult {
  economyScore: number
  caloriesPerKm: number
  efficiency: number
  cadence: number
  confidence: number
  date: string
}

export async function computeRunningEconomy(
  userId: string,
  date?: Date
): Promise<RunningEconomyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const calories = getValues(byType, "calories")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const avgSteps = steps.length > 0 ? mean(steps) : 5000
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const avgCal = calories.length > 0 ? mean(calories) : 2000
  const cadence = round1(avgActive > 0 ? avgSteps / avgActive : 150)
  const strideLength = 0.75
  const distanceKm = (avgSteps * strideLength) / 1000
  const activeCal = avgCal * 0.3
  const caloriesPerKm = round1(distanceKm > 0 ? activeCal / distanceKm : 70)
  const idealCalPerKm = w * 1.0
  const efficiency = round1(clamp((idealCalPerKm / Math.max(caloriesPerKm, 1)) * 100, 0, 100))
  const economyScore = round1(clamp(efficiency * 0.5 + clamp((cadence - 120) / 60 * 50, 0, 50), 0, 100))
  const confidence = round1(clamp((steps.length + calories.length) / 20, 0.1, 1))
  return { economyScore, caloriesPerKm, efficiency, cadence, confidence, date: targetDate.toISOString() }
}

// ─── 22. assessCyclingEfficiency ────────────────────────────────────────────

interface CyclingEfficiencyResult {
  efficiency: number
  powerEstimate: number
  heartRateCost: number
  metabolicEfficiency: number
  confidence: number
  date: string
}

export async function assessCyclingEfficiency(
  userId: string,
  date?: Date
): Promise<CyclingEfficiencyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const avgCal = calories.length > 0 ? mean(calories) : 2000
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const calPerMin = avgActive > 0 ? (avgCal * 0.3) / avgActive : 5
  const powerEstimate = round1(calPerMin * 69.78 / 60)
  const heartRateCost = round1(avgHR > 0 ? powerEstimate / avgHR * 100 : 0)
  const metabolicEfficiency = round1(clamp(powerEstimate / Math.max(calPerMin * 4.184, 1) * 100, 0, 30))
  const efficiency = round1(clamp(heartRateCost * 2 + metabolicEfficiency * 2, 0, 100))
  const confidence = round1(clamp((calories.length + hrValues.length) / 20, 0.1, 1))
  return { efficiency, powerEstimate, heartRateCost, metabolicEfficiency, confidence, date: targetDate.toISOString() }
}

// ─── 23. computeSwimmingEfficiency ──────────────────────────────────────────

interface SwimmingEfficiencyResult {
  strokeEfficiency: number
  metabolicCost: number
  respiratoryEfficiency: number
  overallScore: number
  confidence: number
  date: string
}

export async function computeSwimmingEfficiency(
  userId: string,
  date?: Date
): Promise<SwimmingEfficiencyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const respRate = getValues(byType, "respiratory_rate")
  const activeMin = getValues(byType, "active_minutes")
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const avgCal = calories.length > 0 ? mean(calories) : 2000
  const avgResp = respRate.length > 0 ? mean(respRate) : 18
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const metabolicCost = round1(avgActive > 0 ? (avgCal * 0.3) / avgActive : 8)
  const respiratoryEfficiency = round1(clamp((25 - avgResp) / 10 * 100, 0, 100))
  const hrEfficiency = clamp((180 - avgHR) / 80 * 100, 0, 100)
  const strokeEfficiency = round1(clamp(hrEfficiency * 0.5 + (100 - metabolicCost) * 0.5, 0, 100))
  const overallScore = round1(strokeEfficiency * 0.4 + respiratoryEfficiency * 0.3 + hrEfficiency * 0.3)
  const confidence = round1(clamp((hrValues.length + respRate.length) / 20, 0.1, 1))
  return { strokeEfficiency, metabolicCost, respiratoryEfficiency, overallScore, confidence, date: targetDate.toISOString() }
}
// ─── 24. analyzeStrengthEndurance ───────────────────────────────────────────

interface StrengthEnduranceResult {
  score: number
  muscularEndurance: number
  fatigueIndex: number
  consistency: number
  confidence: number
  date: string
}

export async function analyzeStrengthEndurance(
  userId: string,
  date?: Date
): Promise<StrengthEnduranceResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeMin = getValues(byType, "active_minutes")
  const calories = getValues(byType, "calories")
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const consistency = round1(activeMin.length > 2 ? (1 - coefficientOfVariation(activeMin)) * 100 : 50)
  const avgCalRate = calories.length > 0 && activeMin.length > 0
    ? mean(calories) / Math.max(mean(activeMin), 1)
    : 8
  const muscularEndurance = round1(clamp(consistency * 0.4 + avgCalRate * 3 + (activeMin.length > 0 ? mean(activeMin) / 60 * 30 : 15), 0, 100))
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const hrRecoveryRatio = avgHR > 0 ? avgRestHR / avgHR : 0.5
  const fatigueIndex = round1(clamp((1 - hrRecoveryRatio) * 100, 0, 100))
  const score = round1(clamp(muscularEndurance * 0.5 + consistency * 0.3 + (100 - fatigueIndex) * 0.2, 0, 100))
  const confidence = round1(clamp((activeMin.length + calories.length) / 30, 0.1, 1))
  return { score, muscularEndurance, fatigueIndex, consistency, confidence, date: targetDate.toISOString() }
}

// ─── 25. computeMaximalAerobicSpeed ─────────────────────────────────────────

interface MaximalAerobicSpeedResult {
  masKmH: number
  trainingPaces: { recovery: number; endurance: number; tempo: number; interval: number; repetition: number }
  estimatedVO2max: number
  confidence: number
  date: string
}

export async function computeMaximalAerobicSpeed(
  userId: string,
  date?: Date
): Promise<MaximalAerobicSpeedResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const restHR = getValues(byType, "resting_heart_rate")
  const hrv = getValues(byType, "hrv")
  let estimatedVO2max = 40
  if (vo2.length > 0) {
    estimatedVO2max = mean(vo2)
  } else if (restHR.length > 0) {
    const maxHR = 220 - 30
    estimatedVO2max = 15.3 * (maxHR / mean(restHR))
  } else if (hrv.length > 0) {
    estimatedVO2max = clamp(mean(hrv) * 0.65 + 10, 15, 80)
  }
  const masKmH = round1(estimatedVO2max / 3.5)
  const trainingPaces = {
    recovery: round1(masKmH * 0.6),
    endurance: round1(masKmH * 0.7),
    tempo: round1(masKmH * 0.8),
    interval: round1(masKmH * 0.95),
    repetition: round1(masKmH * 1.05),
  }
  const confidence = round1(clamp((vo2.length + restHR.length + hrv.length) / 20, 0.1, 1))
  return { masKmH, trainingPaces, estimatedVO2max: round1(estimatedVO2max), confidence, date: targetDate.toISOString() }
}

// ─── 26. assessFlexibilityProxy ─────────────────────────────────────────────

interface FlexibilityProxyResult {
  score: number
  mobilityIndex: number
  activityDiversity: number
  movementRange: number
  confidence: number
  date: string
}

export async function assessFlexibilityProxy(
  userId: string,
  date?: Date
): Promise<FlexibilityProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const stepsCV = steps.length > 2 ? coefficientOfVariation(steps) : 0.3
  const activeCV = activeMin.length > 2 ? coefficientOfVariation(activeMin) : 0.3
  const activityDiversity = round1(clamp((stepsCV + activeCV) / 2 * 100, 0, 100))
  const stepsRange = steps.length > 0 ? Math.max(...steps) - Math.min(...steps) : 3000
  const movementRange = round1(clamp(stepsRange / 100, 0, 100))
  const mobilityIndex = round1(clamp(activityDiversity * 0.5 + movementRange * 0.5, 0, 100))
  const score = round1(clamp(mobilityIndex * 0.6 + activityDiversity * 0.4, 0, 100))
  const confidence = round1(clamp((steps.length + activeMin.length) / 20, 0.1, 1))
  return { score, mobilityIndex, activityDiversity, movementRange, confidence, date: targetDate.toISOString() }
}

// ─── 27. computeAgilityIndex ────────────────────────────────────────────────

interface AgilityIndexResult {
  score: number
  reactionComponent: number
  movementComponent: number
  stepVariability: number
  confidence: number
  date: string
}

export async function computeAgilityIndex(
  userId: string,
  date?: Date
): Promise<AgilityIndexResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const hrValues = getValues(byType, "heart_rate")
  const activeMin = getValues(byType, "active_minutes")
  const stepVariability = round1(steps.length > 2 ? stdDev(steps) : 1000)
  const hrResponseSpeed = hrValues.length > 2 ? stdDev(hrValues) : 15
  const reactionComponent = round1(clamp(hrResponseSpeed / 20 * 100, 0, 100))
  const cadence = activeMin.length > 0 && steps.length > 0 ? mean(steps) / Math.max(mean(activeMin), 1) : 150
  const movementComponent = round1(clamp((cadence - 100) / 80 * 100, 0, 100))
  const score = round1(clamp(reactionComponent * 0.4 + movementComponent * 0.4 + clamp(stepVariability / 50, 0, 20), 0, 100))
  const confidence = round1(clamp((steps.length + hrValues.length) / 20, 0.1, 1))
  return { score, reactionComponent, movementComponent, stepVariability, confidence, date: targetDate.toISOString() }
}

// ─── 28. analyzeSpeedEndurance ──────────────────────────────────────────────

interface SpeedEnduranceResult {
  score: number
  anaerobicCapacity: number
  fadeRate: number
  peakIntensity: number
  confidence: number
  date: string
}

export async function analyzeSpeedEndurance(
  userId: string,
  date?: Date
): Promise<SpeedEnduranceResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const peakHR = hrValues.length > 0 ? Math.max(...hrValues) : 180
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const peakIntensity = round1(clamp(peakHR / 200 * 100, 0, 100))
  const firstHalf = hrValues.slice(0, Math.max(Math.floor(hrValues.length / 2), 1))
  const secondHalf = hrValues.slice(Math.max(Math.floor(hrValues.length / 2), 1))
  const fadeRate = round1(Math.abs(mean(firstHalf) - mean(secondHalf.length > 0 ? secondHalf : firstHalf)))
  const calRate = calories.length > 0 && activeMin.length > 0 ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const anaerobicCapacity = round1(clamp(peakIntensity * 0.5 + calRate * 3, 0, 100))
  const score = round1(clamp(anaerobicCapacity * 0.5 + peakIntensity * 0.3 + (20 - fadeRate) * 0.5, 0, 100))
  const confidence = round1(clamp(hrValues.length / 20, 0.1, 1))
  return { score, anaerobicCapacity, fadeRate, peakIntensity, confidence, date: targetDate.toISOString() }
}

// ─── 29. computeWorkCapacity ────────────────────────────────────────────────

interface WorkCapacityResult {
  totalWork: number
  dailyCapacity: number
  trend: string
  totalSteps: number
  totalActiveMinutes: number
  totalCalories: number
  confidence: number
  date: string
}

export async function computeWorkCapacity(
  userId: string,
  date?: Date
): Promise<WorkCapacityResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const calories = getValues(byType, "calories")
  const totalSteps = round1(steps.reduce((a, b) => a + b, 0))
  const totalActiveMinutes = round1(activeMin.reduce((a, b) => a + b, 0))
  const totalCalories = round1(calories.reduce((a, b) => a + b, 0))
  const totalWork = round1(totalSteps * 0.01 + totalActiveMinutes * 2 + totalCalories * 0.05)
  const daysWithData = Math.max(new Set([...steps, ...activeMin, ...calories].map((_, i) => i)).size, 1)
  const dailyCapacity = round1(totalWork / Math.min(daysWithData, 30))
  const slope = linearRegressionSlope(activeMin)
  const trend = slope > 1 ? "increasing" : slope < -1 ? "decreasing" : "stable"
  const confidence = round1(clamp((steps.length + activeMin.length + calories.length) / 45, 0.1, 1))
  return { totalWork, dailyCapacity, trend, totalSteps, totalActiveMinutes, totalCalories, confidence, date: targetDate.toISOString() }
}

// ─── 30. assessMuscularPowerOutput ──────────────────────────────────────────

interface MuscularPowerOutputResult {
  peakPower: number
  avgPower: number
  powerProfile: string
  stepIntensity: number
  confidence: number
  date: string
}

export async function assessMuscularPowerOutput(
  userId: string,
  date?: Date
): Promise<MuscularPowerOutputResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const calories = getValues(byType, "calories")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const stepIntensity = round1(steps.length > 0 && activeMin.length > 0 ? mean(steps) / Math.max(mean(activeMin), 1) : 150)
  const calRates = calories.map((c, i) => c / Math.max(activeMin[i] ?? 30, 1))
  const peakCalRate = calRates.length > 0 ? Math.max(...calRates) : 10
  const avgCalRate = calRates.length > 0 ? mean(calRates) : 8
  const peakPower = round1(peakCalRate * 69.78 / 60)
  const avgPower = round1(avgCalRate * 69.78 / 60)
  let powerProfile = "balanced"
  const ratio = peakPower > 0 ? avgPower / peakPower : 0.5
  if (ratio > 0.8) powerProfile = "endurance-oriented"
  else if (ratio < 0.5) powerProfile = "sprint-oriented"
  const confidence = round1(clamp((steps.length + calories.length) / 20, 0.1, 1))
  return { peakPower, avgPower, powerProfile, stepIntensity, confidence, date: targetDate.toISOString() }
}
// ─── 31. computeTrainingImpulse ─────────────────────────────────────────────

interface TrainingImpulseResult {
  trimp: number
  weeklyTRIMP: number
  load: string
  avgIntensity: number
  totalDuration: number
  confidence: number
  date: string
}

export async function computeTrainingImpulse(
  userId: string,
  date?: Date
): Promise<TrainingImpulseResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 7 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const activeMin = getValues(byType, "active_minutes")
  const restHR = getValues(byType, "resting_heart_rate")
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const hrReserve = maxHR - avgRestHR
  const totalDuration = round1(activeMin.reduce((a, b) => a + b, 0))
  let weeklyTRIMP = 0
  for (let i = 0; i < hrValues.length; i++) {
    const hrFraction = hrReserve > 0 ? (hrValues[i] - avgRestHR) / hrReserve : 0.5
    const clampedFraction = clamp(hrFraction, 0, 1)
    const weight = 0.64 * Math.exp(1.92 * clampedFraction)
    const duration = activeMin[i] ?? (totalDuration / Math.max(hrValues.length, 1))
    weeklyTRIMP += duration * clampedFraction * weight
  }
  weeklyTRIMP = round1(weeklyTRIMP)
  const trimp = round1(weeklyTRIMP / Math.max(hrValues.length, 1))
  const avgIntensity = round1(hrValues.length > 0 ? mean(hrValues) / maxHR * 100 : 60)
  let load = "moderate"
  if (weeklyTRIMP > 500) load = "very high"
  else if (weeklyTRIMP > 300) load = "high"
  else if (weeklyTRIMP < 100) load = "low"
  const confidence = round1(clamp((hrValues.length + activeMin.length) / 15, 0.1, 1))
  return { trimp, weeklyTRIMP, load, avgIntensity, totalDuration, confidence, date: targetDate.toISOString() }
}

// ─── 32. analyzeSessionRPE ──────────────────────────────────────────────────

interface SessionRPEResult {
  sessionLoad: number
  intensity: number
  volumeScore: number
  rpeEstimate: number
  confidence: number
  date: string
}

export async function analyzeSessionRPE(
  userId: string,
  date?: Date
): Promise<SessionRPEResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 7 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const activeMin = getValues(byType, "active_minutes")
  const restHR = getValues(byType, "resting_heart_rate")
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const intensity = round1(clamp((avgHR - avgRestHR) / (maxHR - avgRestHR) * 100, 0, 100))
  const totalActiveMin = activeMin.reduce((a, b) => a + b, 0)
  const volumeScore = round1(clamp(totalActiveMin / 300 * 100, 0, 100))
  const rpeEstimate = round1(clamp(intensity / 10, 1, 10))
  const sessionLoad = round1(rpeEstimate * totalActiveMin)
  const confidence = round1(clamp((hrValues.length + activeMin.length) / 15, 0.1, 1))
  return { sessionLoad, intensity, volumeScore, rpeEstimate, confidence, date: targetDate.toISOString() }
}

// ─── 33. computeEPOC ────────────────────────────────────────────────────────

interface EPOCResult {
  epocML: number
  recoveryDuration: number
  intensity: string
  peakHR: number
  excessO2: number
  confidence: number
  date: string
}

export async function computeEPOC(
  userId: string,
  date?: Date
): Promise<EPOCResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 7 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const vo2 = getValues(byType, "vo2max")
  const activeMin = getValues(byType, "active_minutes")
  const peakHR = hrValues.length > 0 ? Math.max(...hrValues) : 180
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const maxHR = 220 - 30
  const vo2max = vo2.length > 0 ? mean(vo2) : 40
  const intensityFraction = clamp((avgHR - 60) / (maxHR - 60), 0, 1)
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const epocML = round1(clamp(vo2max * intensityFraction * avgActive * 0.1, 0, 500))
  const recoveryDuration = round1(clamp(epocML / 10, 5, 120))
  const excessO2 = round1(epocML * 0.2)
  let intensity = "moderate"
  if (intensityFraction > 0.85) intensity = "very high"
  else if (intensityFraction > 0.7) intensity = "high"
  else if (intensityFraction < 0.4) intensity = "low"
  const confidence = round1(clamp((hrValues.length + vo2.length) / 15, 0.1, 1))
  return { epocML, recoveryDuration, intensity, peakHR, excessO2, confidence, date: targetDate.toISOString() }
}

// ─── 34. assessFunctionalThresholdPower ─────────────────────────────────────

interface FTPResult {
  ftpWatts: number
  ftpWkg: number
  zones: { recovery: number; endurance: number; tempo: number; threshold: number; vo2max: number; anaerobic: number }
  category: string
  confidence: number
  date: string
}

export async function assessFunctionalThresholdPower(
  userId: string,
  date?: Date
): Promise<FTPResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const weightVals = getValues(byType, "weight")
  const vo2 = getValues(byType, "vo2max")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const vo2max = vo2.length > 0 ? mean(vo2) : 40
  const sustainedHR = hrValues.length > 3 ? percentile(hrValues, 80) : 160
  const calRate = calories.length > 0 && activeMin.length > 0 ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const ftpWatts = round1(clamp(vo2max * w * 0.072 * (sustainedHR / 160) * 0.95, 50, 500))
  const ftpWkg = round1(ftpWatts / w)
  const zones = {
    recovery: round1(ftpWatts * 0.55),
    endurance: round1(ftpWatts * 0.75),
    tempo: round1(ftpWatts * 0.9),
    threshold: round1(ftpWatts * 1.0),
    vo2max: round1(ftpWatts * 1.18),
    anaerobic: round1(ftpWatts * 1.5),
  }
  let category = "untrained"
  if (ftpWkg > 5) category = "world class"
  else if (ftpWkg > 4) category = "elite"
  else if (ftpWkg > 3.5) category = "advanced"
  else if (ftpWkg > 2.5) category = "intermediate"
  else if (ftpWkg > 1.5) category = "recreational"
  const confidence = round1(clamp((hrValues.length + vo2.length + calories.length) / 30, 0.1, 1))
  return { ftpWatts, ftpWkg, zones, category, confidence, date: targetDate.toISOString() }
}

// ─── 35. computeVLaMaxProxy ─────────────────────────────────────────────────

interface VLaMaxProxyResult {
  vlamax: number
  glycolyticCapacity: number
  sprintPowerIndex: number
  recoverySpeed: number
  confidence: number
  date: string
}

export async function computeVLaMaxProxy(
  userId: string,
  date?: Date
): Promise<VLaMaxProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const peakHR = hrValues.length > 0 ? Math.max(...hrValues) : 180
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const hrRecoveryRange = peakHR - avgRestHR
  const calRate = calories.length > 0 && activeMin.length > 0 ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const sprintPowerIndex = round1(clamp(calRate * 5 + hrRecoveryRange * 0.2, 0, 100))
  const recoverySpeed = round1(clamp(hrRecoveryRange / peakHR * 200, 0, 100))
  const vlamax = round1(clamp(0.2 + sprintPowerIndex * 0.005 + (100 - recoverySpeed) * 0.003, 0.1, 1.2))
  const glycolyticCapacity = round1(clamp(vlamax * 80, 0, 100))
  const confidence = round1(clamp((hrValues.length + calories.length) / 20, 0.1, 1))
  return { vlamax, glycolyticCapacity, sprintPowerIndex, recoverySpeed, confidence, date: targetDate.toISOString() }
}

// ─── 36. analyzeEfficiencyFactor ────────────────────────────────────────────

interface EfficiencyFactorResult {
  ef: number
  trend: string
  aerobicProgress: string
  normalizedPower: number
  avgHeartRate: number
  confidence: number
  date: string
}

export async function analyzeEfficiencyFactor(
  userId: string,
  date?: Date
): Promise<EfficiencyFactorResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const weightVals = getValues(byType, "weight")
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const calRate = calories.length > 0 && activeMin.length > 0 ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const normalizedPower = round1(calRate * 69.78 / 60 * 1.05)
  const ef = round1(avgHR > 0 ? normalizedPower / avgHR : 0)
  const efValues: number[] = []
  for (let i = 0; i < Math.min(hrValues.length, calories.length); i++) {
    const hrVal = hrValues[i]
    const calVal = calories[i] ?? 2000
    const activeVal = activeMin[i] ?? 30
    const np = (calVal / Math.max(activeVal, 1)) * 69.78 / 60
    if (hrVal > 0) efValues.push(np / hrVal)
  }
  const efSlope = linearRegressionSlope(efValues)
  const trend = efSlope > 0.001 ? "improving" : efSlope < -0.001 ? "declining" : "stable"
  let aerobicProgress = "maintaining"
  if (trend === "improving") aerobicProgress = "building aerobic base"
  else if (trend === "declining") aerobicProgress = "aerobic fitness declining"
  const confidence = round1(clamp((hrValues.length + calories.length) / 30, 0.1, 1))
  return { ef, trend, aerobicProgress, normalizedPower, avgHeartRate: round1(avgHR), confidence, date: targetDate.toISOString() }
}
// ─── 37. computePerformanceModelBanister ────────────────────────────────────

interface BanisterModelResult {
  fitnessEffect: number
  fatigueEffect: number
  predictedPerformance: number
  fitnessDecayDays: number
  fatigueDecayDays: number
  confidence: number
  date: string
}

export async function computePerformanceModelBanister(
  userId: string,
  date?: Date
): Promise<BanisterModelResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 42 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const fitnessDecayDays = 42
  const fatigueDecayDays = 7
  const k1 = 1.0
  const k2 = 2.0
  let fitnessEffect = 0
  let fatigueEffect = 0
  for (let i = 0; i < activeMin.length; i++) {
    const hrFrac = hrValues[i] ? clamp((hrValues[i] - avgRestHR) / (maxHR - avgRestHR), 0, 1) : 0.5
    const load = activeMin[i] * hrFrac
    const daysAgo = activeMin.length - 1 - i
    fitnessEffect += k1 * load * Math.exp(-daysAgo / fitnessDecayDays)
    fatigueEffect += k2 * load * Math.exp(-daysAgo / fatigueDecayDays)
  }
  fitnessEffect = round1(fitnessEffect)
  fatigueEffect = round1(fatigueEffect)
  const predictedPerformance = round1(fitnessEffect - fatigueEffect)
  const confidence = round1(clamp(activeMin.length / 30, 0.1, 1))
  return { fitnessEffect, fatigueEffect, predictedPerformance, fitnessDecayDays, fatigueDecayDays, confidence, date: targetDate.toISOString() }
}

// ─── 38. assessTaperReadiness ───────────────────────────────────────────────

interface TaperReadinessResult {
  taperScore: number
  readiness: string
  daysToOptimal: number
  loadReduction: number
  recoveryMetrics: { hrvTrend: number; sleepQuality: number; fatigueLevel: number }
  confidence: number
  date: string
}

export async function assessTaperReadiness(
  userId: string,
  date?: Date
): Promise<TaperReadinessResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 21 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeMin = getValues(byType, "active_minutes")
  const hrv = getValues(byType, "hrv")
  const sleepDur = getValues(byType, "sleep_duration")
  const deepSleep = getValues(byType, "deep_sleep")
  const stress = getValues(byType, "stress")
  const loadSlope = linearRegressionSlope(activeMin)
  const loadReduction = round1(clamp(-loadSlope * 10, -50, 50))
  const hrvTrend = round1(linearRegressionSlope(hrv))
  const avgSleep = sleepDur.length > 0 ? mean(sleepDur) : 7
  const avgDeep = deepSleep.length > 0 ? mean(deepSleep) : 1.5
  const sleepQuality = round1(clamp(avgSleep / 8 * 60 + avgDeep / 2 * 40, 0, 100))
  const avgStress = stress.length > 0 ? mean(stress) : 50
  const fatigueLevel = round1(clamp(avgStress + (loadReduction < 0 ? -loadReduction : 0), 0, 100))
  const taperScore = round1(clamp(
    (loadReduction > 0 ? loadReduction * 0.3 : 0) +
    (hrvTrend > 0 ? hrvTrend * 10 : 0) +
    sleepQuality * 0.3 +
    (100 - fatigueLevel) * 0.2,
    0, 100
  ))
  let readiness = "not tapering"
  if (taperScore > 70) readiness = "well tapered"
  else if (taperScore > 50) readiness = "tapering in progress"
  else if (taperScore > 30) readiness = "early taper phase"
  const daysToOptimal = round1(clamp(14 - taperScore / 7, 1, 21))
  const confidence = round1(clamp((activeMin.length + hrv.length) / 20, 0.1, 1))
  return { taperScore, readiness, daysToOptimal, loadReduction, recoveryMetrics: { hrvTrend, sleepQuality, fatigueLevel }, confidence, date: targetDate.toISOString() }
}

// ─── 39. computePeakPerformanceWindow ───────────────────────────────────────

interface PeakPerformanceWindowResult {
  windowStart: string
  windowEnd: string
  peakDay: string
  readinessScore: number
  confidence: number
  date: string
}

export async function computePeakPerformanceWindow(
  userId: string,
  date?: Date
): Promise<PeakPerformanceWindowResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 42 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrv = getValues(byType, "hrv")
  const sleepDur = getValues(byType, "sleep_duration")
  const activeMin = getValues(byType, "active_minutes")
  const restHR = getValues(byType, "resting_heart_rate")
  const hrvEMA = exponentialMovingAverage(hrv.length > 0 ? hrv : [50], 0.2)
  const hrvTrend = linearRegressionSlope(hrvEMA)
  const restHRTrend = linearRegressionSlope(restHR)
  const sleepScore = sleepDur.length > 0 ? mean(sleepDur) / 8 : 0.85
  const fitnessSignal = clamp(hrvTrend * 5 - restHRTrend * 5 + sleepScore * 20, -20, 40)
  const daysToFitnessWindow = round1(clamp(Math.abs(fitnessSignal - 30) / 3, 1, 21))
  const windowStart = new Date(targetDate.getTime() + daysToFitnessWindow * 86400000)
  const windowEnd = new Date(windowStart.getTime() + 5 * 86400000)
  const peakDay = new Date(windowStart.getTime() + 2 * 86400000)
  const readinessScore = round1(clamp(50 + fitnessSignal, 0, 100))
  const confidence = round1(clamp((hrv.length + sleepDur.length + restHR.length) / 40, 0.1, 1))
  return {
    windowStart: windowStart.toISOString().slice(0, 10),
    windowEnd: windowEnd.toISOString().slice(0, 10),
    peakDay: peakDay.toISOString().slice(0, 10),
    readinessScore,
    confidence,
    date: targetDate.toISOString(),
  }
}

// ─── 40. analyzeDetraining ──────────────────────────────────────────────────

interface DetrainingResult {
  detrainingRate: number
  fitnessLoss: number
  timeToBaseline: number
  inactivityDays: number
  affectedSystems: string[]
  confidence: number
  date: string
}

export async function analyzeDetraining(
  userId: string,
  date?: Date
): Promise<DetrainingResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeMin = getValues(byType, "active_minutes")
  const vo2 = getValues(byType, "vo2max")
  const hrv = getValues(byType, "hrv")
  const restHR = getValues(byType, "resting_heart_rate")
  const inactiveDays = activeMin.filter((v) => v < 10).length
  const inactivityDays = inactiveDays
  const vo2Slope = linearRegressionSlope(vo2)
  const hrvSlope = linearRegressionSlope(hrv)
  const restHRSlope = linearRegressionSlope(restHR)
  const detrainingRate = round1(clamp(
    (inactivityDays / 30 * 40) +
    (vo2Slope < 0 ? Math.abs(vo2Slope) * 10 : 0) +
    (hrvSlope < 0 ? Math.abs(hrvSlope) * 5 : 0) +
    (restHRSlope > 0 ? restHRSlope * 5 : 0),
    0, 100
  ))
  const fitnessLoss = round1(clamp(detrainingRate * 0.7, 0, 100))
  const timeToBaseline = round1(clamp(inactivityDays * 2.5, 0, 90))
  const affectedSystems: string[] = []
  if (vo2Slope < -0.1) affectedSystems.push("aerobic capacity")
  if (hrvSlope < -0.5) affectedSystems.push("autonomic regulation")
  if (restHRSlope > 0.2) affectedSystems.push("cardiac efficiency")
  if (inactivityDays > 7) affectedSystems.push("muscular endurance")
  if (affectedSystems.length === 0) affectedSystems.push("none detected")
  const confidence = round1(clamp((activeMin.length + vo2.length) / 30, 0.1, 1))
  return { detrainingRate, fitnessLoss, timeToBaseline, inactivityDays, affectedSystems, confidence, date: targetDate.toISOString() }
}

// ─── 41. computePeriodizationPhase ──────────────────────────────────────────

interface PeriodizationPhaseResult {
  phase: string
  weekInPhase: number
  recommendation: string
  loadTrend: string
  intensityTrend: string
  confidence: number
  date: string
}

export async function computePeriodizationPhase(
  userId: string,
  date?: Date
): Promise<PeriodizationPhaseResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 28 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const loadSlope = linearRegressionSlope(activeMin)
  const hrSlope = linearRegressionSlope(hrValues)
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  let phase = "base"
  let weekInPhase = 1
  let recommendation = ""
  if (loadSlope > 1 && avgActive > 40) {
    phase = "build"
    weekInPhase = Math.min(Math.round(loadSlope * 2), 8)
    recommendation = "maintain progressive overload, focus on specific training"
  } else if (loadSlope < -1 && avgActive < 25) {
    phase = "recovery"
    weekInPhase = Math.min(Math.round(Math.abs(loadSlope) * 2), 4)
    recommendation = "focus on rest, light activity, and mobility"
  } else if (avgHR > 150 && loadSlope > 0.5) {
    phase = "peak"
    weekInPhase = Math.min(Math.round(loadSlope + hrSlope * 0.5), 3)
    recommendation = "taper volume, maintain intensity, prepare for competition"
  } else {
    phase = "base"
    weekInPhase = Math.min(Math.round(avgActive / 10), 12)
    recommendation = "build aerobic base with moderate volume and low intensity"
  }
  weekInPhase = Math.max(weekInPhase, 1)
  const loadTrend = loadSlope > 0.5 ? "increasing" : loadSlope < -0.5 ? "decreasing" : "stable"
  const intensityTrend = hrSlope > 0.5 ? "increasing" : hrSlope < -0.5 ? "decreasing" : "stable"
  const confidence = round1(clamp((activeMin.length + hrValues.length) / 30, 0.1, 1))
  return { phase, weekInPhase, recommendation, loadTrend, intensityTrend, confidence, date: targetDate.toISOString() }
}

// ─── 42. analyzeAltitudePerformance ─────────────────────────────────────────

interface AltitudePerformanceResult {
  altitudeReadiness: number
  acclimatizationScore: number
  oxygenSaturation: number
  respiratoryAdaptation: number
  confidence: number
  date: string
}

export async function analyzeAltitudePerformance(
  userId: string,
  date?: Date
): Promise<AltitudePerformanceResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const spO2 = getValues(byType, "blood_oxygen")
  const respRate = getValues(byType, "respiratory_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const hrv = getValues(byType, "hrv")
  const avgSpO2 = spO2.length > 0 ? mean(spO2) : 97
  const avgResp = respRate.length > 0 ? mean(respRate) : 16
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const oxygenSaturation = round1(avgSpO2)
  const respiratoryAdaptation = round1(clamp((20 - avgResp) / 8 * 100, 0, 100))
  const spO2Trend = linearRegressionSlope(spO2)
  const acclimatizationScore = round1(clamp(
    (avgSpO2 - 90) * 8 +
    respiratoryAdaptation * 0.2 +
    (spO2Trend > 0 ? spO2Trend * 20 : 0),
    0, 100
  ))
  const hrvFactor = hrv.length > 0 ? clamp(mean(hrv) / 60, 0.5, 1.5) : 1
  const altitudeReadiness = round1(clamp(acclimatizationScore * 0.5 + oxygenSaturation * 0.3 + respiratoryAdaptation * 0.2 * hrvFactor, 0, 100))
  const confidence = round1(clamp((spO2.length + respRate.length) / 15, 0.1, 1))
  return { altitudeReadiness, acclimatizationScore, oxygenSaturation, respiratoryAdaptation, confidence, date: targetDate.toISOString() }
}

// ─── 43. assessHeatAcclimationPerformance ───────────────────────────────────

interface HeatAcclimationResult {
  acclimationScore: number
  thermoregulationEfficiency: number
  temperatureStability: number
  cardiacStress: number
  confidence: number
  date: string
}

export async function assessHeatAcclimationPerformance(
  userId: string,
  date?: Date
): Promise<HeatAcclimationResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const temp = getValues(byType, "body_temperature")
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const avgTemp = temp.length > 0 ? mean(temp) : 36.8
  const tempCV = temp.length > 2 ? coefficientOfVariation(temp) : 0.01
  const temperatureStability = round1(clamp((1 - tempCV * 50) * 100, 0, 100))
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const cardiacStress = round1(clamp((avgHR - avgRestHR) / avgRestHR * 100, 0, 100))
  const thermoregulationEfficiency = round1(clamp(
    temperatureStability * 0.5 + (100 - cardiacStress) * 0.3 + (37.5 - avgTemp) * 50,
    0, 100
  ))
  const acclimationScore = round1(clamp(
    thermoregulationEfficiency * 0.4 + temperatureStability * 0.3 + (100 - cardiacStress) * 0.3,
    0, 100
  ))
  const confidence = round1(clamp((temp.length + hrValues.length) / 15, 0.1, 1))
  return { acclimationScore, thermoregulationEfficiency, temperatureStability, cardiacStress, confidence, date: targetDate.toISOString() }
}
// ─── 44. computeBiomechanicalEfficiency ─────────────────────────────────────

interface BiomechanicalEfficiencyResult {
  efficiency: number
  cadenceOptimality: number
  energyCost: number
  strideEfficiency: number
  confidence: number
  date: string
}

export async function computeBiomechanicalEfficiency(
  userId: string,
  date?: Date
): Promise<BiomechanicalEfficiencyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const calories = getValues(byType, "calories")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const avgSteps = steps.length > 0 ? mean(steps) : 5000
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const avgCal = calories.length > 0 ? mean(calories) : 2000
  const cadence = avgActive > 0 ? avgSteps / avgActive : 150
  const optimalCadence = 170
  const cadenceOptimality = round1(clamp(100 - Math.abs(cadence - optimalCadence) / optimalCadence * 100, 0, 100))
  const energyCost = round1(avgActive > 0 ? (avgCal * 0.3) / avgActive : 8)
  const idealEnergyCost = w * 0.08
  const strideEfficiency = round1(clamp(idealEnergyCost / Math.max(energyCost, 0.1) * 100, 0, 100))
  const efficiency = round1(clamp(cadenceOptimality * 0.5 + strideEfficiency * 0.5, 0, 100))
  const confidence = round1(clamp((steps.length + calories.length) / 20, 0.1, 1))
  return { efficiency, cadenceOptimality, energyCost, strideEfficiency, confidence, date: targetDate.toISOString() }
}

// ─── 45. assessPlyometricCapacity ───────────────────────────────────────────

interface PlyometricCapacityResult {
  score: number
  reactiveStrength: number
  elasticCapacity: number
  powerDensity: number
  confidence: number
  date: string
}

export async function assessPlyometricCapacity(
  userId: string,
  date?: Date
): Promise<PlyometricCapacityResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const calories = getValues(byType, "calories")
  const hrValues = getValues(byType, "heart_rate")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const stepIntensity = steps.length > 0 && activeMin.length > 0 ? mean(steps) / Math.max(mean(activeMin), 1) : 150
  const calRate = calories.length > 0 && activeMin.length > 0 ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const peakHR = hrValues.length > 0 ? Math.max(...hrValues) : 180
  const reactiveStrength = round1(clamp(stepIntensity / 200 * 100 * (peakHR / 180), 0, 100))
  const elasticCapacity = round1(clamp(calRate / w * 500, 0, 100))
  const powerDensity = round1(clamp((calRate * 69.78 / 60) / w * 100, 0, 100))
  const score = round1(clamp(reactiveStrength * 0.4 + elasticCapacity * 0.3 + powerDensity * 0.3, 0, 100))
  const confidence = round1(clamp((steps.length + calories.length) / 20, 0.1, 1))
  return { score, reactiveStrength, elasticCapacity, powerDensity, confidence, date: targetDate.toISOString() }
}

// ─── 46. computeIsometricStrengthProxy ──────────────────────────────────────

interface IsometricStrengthProxyResult {
  strengthScore: number
  enduranceComponent: number
  sustainedEffort: number
  metabolicStability: number
  confidence: number
  date: string
}

export async function computeIsometricStrengthProxy(
  userId: string,
  date?: Date
): Promise<IsometricStrengthProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const hrCV = hrValues.length > 2 ? coefficientOfVariation(hrValues) : 0.15
  const sustainedEffort = round1(clamp((1 - hrCV) * 100, 0, 100))
  const calPerKg = calories.length > 0 ? mean(calories) / w : 30
  const metabolicStability = round1(clamp(calPerKg / 40 * 100, 0, 100))
  const enduranceComponent = round1(clamp(avgActive / 60 * 100, 0, 100))
  const strengthScore = round1(clamp(sustainedEffort * 0.4 + enduranceComponent * 0.3 + metabolicStability * 0.3, 0, 100))
  const confidence = round1(clamp((activeMin.length + hrValues.length) / 20, 0.1, 1))
  return { strengthScore, enduranceComponent, sustainedEffort, metabolicStability, confidence, date: targetDate.toISOString() }
}

// ─── 47. analyzeConcentricPowerProxy ────────────────────────────────────────

interface ConcentricPowerProxyResult {
  power: number
  rateOfForce: number
  explosiveness: number
  peakCalRate: number
  confidence: number
  date: string
}

export async function analyzeConcentricPowerProxy(
  userId: string,
  date?: Date
): Promise<ConcentricPowerProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const calRates = calories.map((c, i) => c / Math.max(activeMin[i] ?? 30, 1))
  const peakCalRate = round1(calRates.length > 0 ? Math.max(...calRates) : 10)
  const stepAcceleration = steps.length > 2 ? linearRegressionSlope(steps) : 0
  const rateOfForce = round1(clamp(Math.abs(stepAcceleration) * 0.1 + peakCalRate * 3, 0, 100))
  const hrSpike = hrValues.length > 0 ? Math.max(...hrValues) - mean(hrValues) : 20
  const explosiveness = round1(clamp(hrSpike / 50 * 100, 0, 100))
  const power = round1(clamp(peakCalRate * 69.78 / 60 * 1.1, 0, 500))
  const confidence = round1(clamp((steps.length + calories.length) / 20, 0.1, 1))
  return { power, rateOfForce, explosiveness, peakCalRate, confidence, date: targetDate.toISOString() }
}

// ─── 48. assessEccentricControlProxy ────────────────────────────────────────

interface EccentricControlProxyResult {
  controlScore: number
  injuryProtection: number
  decelerationCapacity: number
  muscularControl: number
  confidence: number
  date: string
}

export async function assessEccentricControlProxy(
  userId: string,
  date?: Date
): Promise<EccentricControlProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const stepDecay = steps.length > 2 ? linearRegressionSlope(steps) : 0
  const decelerationCapacity = round1(clamp(50 + stepDecay * -0.01, 0, 100))
  const hrRecovery = hrValues.length > 2 ? hrValues[0] - hrValues[hrValues.length - 1] : 10
  const muscularControl = round1(clamp(50 + hrRecovery * 0.5, 0, 100))
  const activeConsistency = activeMin.length > 2 ? (1 - coefficientOfVariation(activeMin)) * 100 : 50
  const controlScore = round1(clamp(decelerationCapacity * 0.35 + muscularControl * 0.35 + activeConsistency * 0.3, 0, 100))
  const injuryProtection = round1(clamp(controlScore * 0.8 + decelerationCapacity * 0.2, 0, 100))
  const confidence = round1(clamp((steps.length + hrValues.length) / 20, 0.1, 1))
  return { controlScore, injuryProtection, decelerationCapacity, muscularControl, confidence, date: targetDate.toISOString() }
}

// ─── 49. computeAgilityTTestProxy ───────────────────────────────────────────

interface AgilityTTestProxyResult {
  estimatedTime: number
  agilityRating: string
  directionalSpeed: number
  reactionIndex: number
  confidence: number
  date: string
}

export async function computeAgilityTTestProxy(
  userId: string,
  date?: Date
): Promise<AgilityTTestProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const cadence = steps.length > 0 && activeMin.length > 0 ? mean(steps) / Math.max(mean(activeMin), 1) : 150
  const hrResponseVar = hrValues.length > 2 ? stdDev(hrValues) : 15
  const directionalSpeed = round1(clamp(cadence / 180 * 100, 0, 100))
  const reactionIndex = round1(clamp(hrResponseVar / 20 * 100, 0, 100))
  const agilityScore = directionalSpeed * 0.5 + reactionIndex * 0.3 + clamp((90 - w) / 30 * 20, 0, 20)
  const estimatedTime = round1(clamp(15 - agilityScore * 0.06, 8, 15))
  let agilityRating = "average"
  if (estimatedTime < 9.5) agilityRating = "excellent"
  else if (estimatedTime < 10.5) agilityRating = "good"
  else if (estimatedTime > 12) agilityRating = "below average"
  const confidence = round1(clamp((steps.length + hrValues.length) / 20, 0.1, 1))
  return { estimatedTime, agilityRating, directionalSpeed, reactionIndex, confidence, date: targetDate.toISOString() }
}

// ─── 50. estimateVerticalJumpProxy ──────────────────────────────────────────

interface VerticalJumpProxyResult {
  estimatedCm: number
  powerIndex: number
  explosiveStrength: number
  category: string
  confidence: number
  date: string
}

export async function estimateVerticalJumpProxy(
  userId: string,
  date?: Date
): Promise<VerticalJumpProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const weightVals = getValues(byType, "weight")
  const bodyFat = getValues(byType, "body_fat")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const bf = bodyFat.length > 0 ? mean(bodyFat) : 20
  const leanMass = w * (1 - bf / 100)
  const calRate = calories.length > 0 && activeMin.length > 0 ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const powerOutput = calRate * 69.78 / 60
  const powerIndex = round1(clamp(powerOutput / w * 100, 0, 100))
  const explosiveStrength = round1(clamp(leanMass / w * powerIndex, 0, 100))
  const estimatedCm = round1(clamp(20 + explosiveStrength * 0.5 + (leanMass / w - 0.7) * 100, 15, 80))
  let category = "average"
  if (estimatedCm > 60) category = "excellent"
  else if (estimatedCm > 50) category = "good"
  else if (estimatedCm > 40) category = "above average"
  else if (estimatedCm < 30) category = "below average"
  const confidence = round1(clamp((calories.length + weightVals.length) / 15, 0.1, 1))
  return { estimatedCm, powerIndex, explosiveStrength, category, confidence, date: targetDate.toISOString() }
}
// ─── 51. computeWingateProxy ────────────────────────────────────────────────

interface WingateProxyResult {
  peakPower: number
  meanPower: number
  fatigueIndex: number
  anaerobicCapacity: number
  confidence: number
  date: string
}

export async function computeWingateProxy(
  userId: string,
  date?: Date
): Promise<WingateProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const peakHR = hrValues.length > 0 ? Math.max(...hrValues) : 180
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const calRate = calories.length > 0 && activeMin.length > 0 ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const peakPower = round1(w * 0.075 * 9.81 * (peakHR / 180) * 10)
  const meanPower = round1(peakPower * (avgHR / peakHR) * 0.85)
  const fatigueIndex = round1(clamp((peakPower - meanPower) / Math.max(peakPower, 1) * 100, 0, 80))
  const anaerobicCapacity = round1(clamp(meanPower * 30 / 1000, 0, 50))
  const confidence = round1(clamp((hrValues.length + calories.length) / 20, 0.1, 1))
  return { peakPower, meanPower, fatigueIndex, anaerobicCapacity, confidence, date: targetDate.toISOString() }
}

// ─── 52. estimateCooperTestProxy ────────────────────────────────────────────

interface CooperTestProxyResult {
  estimatedDistance: number
  fitnessCategory: string
  vo2maxEstimate: number
  confidence: number
  date: string
}

export async function estimateCooperTestProxy(
  userId: string,
  date?: Date
): Promise<CooperTestProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const restHR = getValues(byType, "resting_heart_rate")
  const activeMin = getValues(byType, "active_minutes")
  let vo2maxEstimate = 40
  if (vo2.length > 0) {
    vo2maxEstimate = mean(vo2)
  } else if (restHR.length > 0) {
    vo2maxEstimate = 15.3 * ((220 - 30) / mean(restHR))
  }
  const estimatedDistance = round1((vo2maxEstimate - 11.288) / 0.023)
  let fitnessCategory = "average"
  if (estimatedDistance > 2800) fitnessCategory = "excellent"
  else if (estimatedDistance > 2400) fitnessCategory = "above average"
  else if (estimatedDistance > 2000) fitnessCategory = "average"
  else if (estimatedDistance > 1600) fitnessCategory = "below average"
  else fitnessCategory = "poor"
  const confidence = round1(clamp((vo2.length + restHR.length + activeMin.length) / 20, 0.1, 1))
  return { estimatedDistance, fitnessCategory, vo2maxEstimate: round1(vo2maxEstimate), confidence, date: targetDate.toISOString() }
}

// ─── 53. computeBeepTestProxy ───────────────────────────────────────────────

interface BeepTestProxyResult {
  estimatedLevel: number
  shuttleCount: number
  vo2maxEquivalent: number
  fitnessRating: string
  confidence: number
  date: string
}

export async function computeBeepTestProxy(
  userId: string,
  date?: Date
): Promise<BeepTestProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const activeMin = getValues(byType, "active_minutes")
  const restHR = getValues(byType, "resting_heart_rate")
  let vo2maxEquivalent = 40
  if (vo2.length > 0) {
    vo2maxEquivalent = mean(vo2)
  } else if (restHR.length > 0) {
    vo2maxEquivalent = 15.3 * ((220 - 30) / mean(restHR))
  }
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const adjustedVO2 = vo2maxEquivalent + clamp((avgActive - 30) * 0.1, -3, 3)
  const estimatedLevel = round1(clamp((adjustedVO2 - 18) / 3.5, 1, 21))
  const shuttleCount = Math.round(estimatedLevel * 7 + 3)
  let fitnessRating = "average"
  if (estimatedLevel > 13) fitnessRating = "excellent"
  else if (estimatedLevel > 10) fitnessRating = "good"
  else if (estimatedLevel > 7) fitnessRating = "average"
  else if (estimatedLevel > 4) fitnessRating = "below average"
  else fitnessRating = "poor"
  const confidence = round1(clamp((vo2.length + activeMin.length + restHR.length) / 20, 0.1, 1))
  return { estimatedLevel, shuttleCount, vo2maxEquivalent: round1(vo2maxEquivalent), fitnessRating, confidence, date: targetDate.toISOString() }
}

// ─── 54. assessFunctionalMovementProxy ──────────────────────────────────────

interface FunctionalMovementProxyResult {
  fmsScore: number
  movementQuality: string
  mobilityScore: number
  stabilityScore: number
  movementPatterns: number
  confidence: number
  date: string
}

export async function assessFunctionalMovementProxy(
  userId: string,
  date?: Date
): Promise<FunctionalMovementProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const calories = getValues(byType, "calories")
  const hrValues = getValues(byType, "heart_rate")
  const activityDiversity = steps.length > 2 ? coefficientOfVariation(steps) : 0.3
  const movementConsistency = activeMin.length > 2 ? (1 - coefficientOfVariation(activeMin)) : 0.5
  const mobilityScore = round1(clamp(activityDiversity * 150, 0, 100))
  const stabilityScore = round1(clamp(movementConsistency * 100, 0, 100))
  const cadence = activeMin.length > 0 && steps.length > 0 ? mean(steps) / Math.max(mean(activeMin), 1) : 150
  const movementPatterns = round1(clamp((cadence - 100) / 100 * 100, 0, 100))
  const rawFMS = (mobilityScore * 0.35 + stabilityScore * 0.35 + movementPatterns * 0.3) / 100 * 21
  const fmsScore = round1(clamp(rawFMS, 0, 21))
  let movementQuality = "average"
  if (fmsScore > 17) movementQuality = "excellent"
  else if (fmsScore > 14) movementQuality = "good"
  else if (fmsScore > 10) movementQuality = "needs improvement"
  else movementQuality = "poor"
  const confidence = round1(clamp((steps.length + activeMin.length) / 20, 0.1, 1))
  return { fmsScore, movementQuality, mobilityScore, stabilityScore, movementPatterns, confidence, date: targetDate.toISOString() }
}

// ─── 55. computeFlexibilityIndex ────────────────────────────────────────────

interface FlexibilityIndexResult {
  index: number
  areaScores: { upperBody: number; lowerBody: number; core: number }
  overallRating: string
  confidence: number
  date: string
}

export async function computeFlexibilityIndex(
  userId: string,
  date?: Date
): Promise<FlexibilityIndexResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const calories = getValues(byType, "calories")
  const bodyFat = getValues(byType, "body_fat")
  const stepsRange = steps.length > 0 ? (Math.max(...steps) - Math.min(...steps)) / Math.max(mean(steps), 1) : 0.3
  const activeRange = activeMin.length > 0 ? (Math.max(...activeMin) - Math.min(...activeMin)) / Math.max(mean(activeMin), 1) : 0.3
  const bf = bodyFat.length > 0 ? mean(bodyFat) : 20
  const bodyCompFactor = clamp((30 - bf) / 20, 0.5, 1.2)
  const upperBody = round1(clamp(activeRange * 100 * bodyCompFactor, 0, 100))
  const lowerBody = round1(clamp(stepsRange * 100 * bodyCompFactor, 0, 100))
  const core = round1(clamp((upperBody + lowerBody) / 2 * bodyCompFactor, 0, 100))
  const index = round1((upperBody * 0.3 + lowerBody * 0.4 + core * 0.3))
  let overallRating = "average"
  if (index > 75) overallRating = "excellent"
  else if (index > 55) overallRating = "good"
  else if (index < 30) overallRating = "poor"
  const confidence = round1(clamp((steps.length + activeMin.length) / 20, 0.1, 1))
  return { index, areaScores: { upperBody, lowerBody, core }, overallRating, confidence, date: targetDate.toISOString() }
}

// ─── 56. assessBalanceScore ─────────────────────────────────────────────────

interface BalanceScoreResult {
  score: number
  stabilityIndex: number
  symmetry: number
  consistency: number
  confidence: number
  date: string
}

export async function assessBalanceScore(
  userId: string,
  date?: Date
): Promise<BalanceScoreResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const stepRegularity = steps.length > 2 ? (1 - coefficientOfVariation(steps)) : 0.5
  const stabilityIndex = round1(clamp(stepRegularity * 100, 0, 100))
  const hrStability = hrValues.length > 2 ? (1 - coefficientOfVariation(hrValues)) : 0.5
  const symmetry = round1(clamp(hrStability * 100, 0, 100))
  const activeConsistency = activeMin.length > 2 ? (1 - coefficientOfVariation(activeMin)) : 0.5
  const consistency = round1(clamp(activeConsistency * 100, 0, 100))
  const score = round1(clamp(stabilityIndex * 0.4 + symmetry * 0.3 + consistency * 0.3, 0, 100))
  const confidence = round1(clamp((steps.length + hrValues.length) / 20, 0.1, 1))
  return { score, stabilityIndex, symmetry, consistency, confidence, date: targetDate.toISOString() }
}
// ─── 57. computeCoordinationIndex ───────────────────────────────────────────

interface CoordinationIndexResult {
  index: number
  motorControl: number
  rhythmicity: number
  synchronization: number
  confidence: number
  date: string
}

export async function computeCoordinationIndex(
  userId: string,
  date?: Date
): Promise<CoordinationIndexResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const steps = getValues(byType, "steps")
  const respRate = getValues(byType, "respiratory_rate")
  const hrRegularity = hrValues.length > 2 ? (1 - coefficientOfVariation(hrValues)) : 0.5
  const stepRegularity = steps.length > 2 ? (1 - coefficientOfVariation(steps)) : 0.5
  const respRegularity = respRate.length > 2 ? (1 - coefficientOfVariation(respRate)) : 0.5
  const motorControl = round1(clamp(stepRegularity * 100, 0, 100))
  const rhythmicity = round1(clamp(hrRegularity * 100, 0, 100))
  const synchronization = round1(clamp((hrRegularity + stepRegularity + respRegularity) / 3 * 100, 0, 100))
  const index = round1(clamp(motorControl * 0.4 + rhythmicity * 0.3 + synchronization * 0.3, 0, 100))
  const confidence = round1(clamp((hrValues.length + steps.length + respRate.length) / 25, 0.1, 1))
  return { index, motorControl, rhythmicity, synchronization, confidence, date: targetDate.toISOString() }
}

// ─── 58. assessProprioceptionProxy ──────────────────────────────────────────

interface ProprioceptionProxyResult {
  score: number
  bodyAwareness: number
  movementSmoothness: number
  balanceIndicator: number
  confidence: number
  date: string
}

export async function assessProprioceptionProxy(
  userId: string,
  date?: Date
): Promise<ProprioceptionProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const steps = getValues(byType, "steps")
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const stepConsistency = steps.length > 2 ? (1 - coefficientOfVariation(steps)) : 0.5
  const activeConsistency = activeMin.length > 2 ? (1 - coefficientOfVariation(activeMin)) : 0.5
  const hrConsistency = hrValues.length > 2 ? (1 - coefficientOfVariation(hrValues)) : 0.5
  const balanceIndicator = round1(clamp(stepConsistency * 100, 0, 100))
  const movementSmoothness = round1(clamp((stepConsistency + activeConsistency) / 2 * 100, 0, 100))
  const bodyAwareness = round1(clamp((movementSmoothness * 0.5 + hrConsistency * 50), 0, 100))
  const score = round1(clamp(bodyAwareness * 0.4 + movementSmoothness * 0.3 + balanceIndicator * 0.3, 0, 100))
  const confidence = round1(clamp((steps.length + activeMin.length) / 20, 0.1, 1))
  return { score, bodyAwareness, movementSmoothness, balanceIndicator, confidence, date: targetDate.toISOString() }
}

// ─── 59. estimateHandGripStrengthProxy ──────────────────────────────────────

interface HandGripStrengthProxyResult {
  estimatedKg: number
  percentile: number
  strengthCategory: string
  leanMassIndicator: number
  confidence: number
  date: string
}

export async function estimateHandGripStrengthProxy(
  userId: string,
  date?: Date
): Promise<HandGripStrengthProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const weightVals = getValues(byType, "weight")
  const bodyFat = getValues(byType, "body_fat")
  const activeMin = getValues(byType, "active_minutes")
  const calories = getValues(byType, "calories")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const bf = bodyFat.length > 0 ? mean(bodyFat) : 20
  const leanMass = w * (1 - bf / 100)
  const leanMassIndicator = round1(leanMass)
  const activityIntensity = activeMin.length > 0 && calories.length > 0
    ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const estimatedKg = round1(clamp(leanMass * 0.6 + activityIntensity * 0.5, 15, 80))
  const pctl = round1(clamp((estimatedKg - 20) / 50 * 100, 0, 100))
  let strengthCategory = "average"
  if (estimatedKg > 55) strengthCategory = "excellent"
  else if (estimatedKg > 45) strengthCategory = "above average"
  else if (estimatedKg > 35) strengthCategory = "average"
  else if (estimatedKg > 25) strengthCategory = "below average"
  else strengthCategory = "poor"
  const confidence = round1(clamp((weightVals.length + bodyFat.length + activeMin.length) / 20, 0.1, 1))
  return { estimatedKg, percentile: pctl, strengthCategory, leanMassIndicator, confidence, date: targetDate.toISOString() }
}

// ─── 60. computeCoreStabilityIndex ──────────────────────────────────────────

interface CoreStabilityIndexResult {
  stabilityIndex: number
  endurance: number
  functionalStrength: number
  postureScore: number
  confidence: number
  date: string
}

export async function computeCoreStabilityIndex(
  userId: string,
  date?: Date
): Promise<CoreStabilityIndexResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeMin = getValues(byType, "active_minutes")
  const steps = getValues(byType, "steps")
  const calories = getValues(byType, "calories")
  const bodyFat = getValues(byType, "body_fat")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const bf = bodyFat.length > 0 ? mean(bodyFat) : 20
  const leanRatio = 1 - bf / 100
  const activeConsistency = activeMin.length > 2 ? (1 - coefficientOfVariation(activeMin)) : 0.5
  const endurance = round1(clamp(activeConsistency * 100, 0, 100))
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const functionalStrength = round1(clamp(leanRatio * 100 + avgActive / 60 * 20, 0, 100))
  const stepConsistency = steps.length > 2 ? (1 - coefficientOfVariation(steps)) : 0.5
  const postureScore = round1(clamp(stepConsistency * 100, 0, 100))
  const stabilityIndex = round1(clamp(endurance * 0.35 + functionalStrength * 0.35 + postureScore * 0.3, 0, 100))
  const confidence = round1(clamp((activeMin.length + steps.length) / 20, 0.1, 1))
  return { stabilityIndex, endurance, functionalStrength, postureScore, confidence, date: targetDate.toISOString() }
}

// ─── 61. analyzeCardiacOutput ───────────────────────────────────────────────

interface CardiacOutputResult {
  cardiacOutput: number
  strokeVolume: number
  heartRate: number
  cardiacIndex: number
  confidence: number
  date: string
}

export async function analyzeCardiacOutput(
  userId: string,
  date?: Date
): Promise<CardiacOutputResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const weightVals = getValues(byType, "weight")
  const vo2 = getValues(byType, "vo2max")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const vo2max = vo2.length > 0 ? mean(vo2) : 40
  const bsa = Math.sqrt((w * 175) / 3600)
  const strokeVolume = round1(clamp(1000 * vo2max * w / (avgHR * 200), 40, 150))
  const heartRate = round1(avgHR)
  const cardiacOutput = round1(strokeVolume * avgHR / 1000)
  const cardiacIndex = round1(bsa > 0 ? cardiacOutput / bsa : 0)
  const confidence = round1(clamp((hrValues.length + weightVals.length + vo2.length) / 25, 0.1, 1))
  return { cardiacOutput, strokeVolume, heartRate, cardiacIndex, confidence, date: targetDate.toISOString() }
}

// ─── 62. computeCardiacEfficiency ───────────────────────────────────────────

interface CardiacEfficiencyResult {
  efficiencyIndex: number
  trend: string
  workPerBeat: number
  restingEfficiency: number
  confidence: number
  date: string
}

export async function computeCardiacEfficiency(
  userId: string,
  date?: Date
): Promise<CardiacEfficiencyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const restHR = getValues(byType, "resting_heart_rate")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const totalCal = calories.reduce((a, b) => a + b, 0)
  const totalBeats = avgHR * (activeMin.reduce((a, b) => a + b, 0)) + avgRestHR * (1440 - activeMin.reduce((a, b) => a + b, 0))
  const workPerBeat = round1(totalBeats > 0 ? totalCal / totalBeats * 1000 : 0)
  const restingEfficiency = round1(clamp((80 - avgRestHR) / 30 * 100, 0, 100))
  const efficiencyIndex = round1(clamp(restingEfficiency * 0.5 + workPerBeat * 0.3 + clamp((200 - avgHR) / 100 * 20, 0, 20), 0, 100))
  const restHRSlope = linearRegressionSlope(restHR)
  const trend = restHRSlope < -0.1 ? "improving" : restHRSlope > 0.1 ? "declining" : "stable"
  const confidence = round1(clamp((restHR.length + hrValues.length + calories.length) / 30, 0.1, 1))
  return { efficiencyIndex, trend, workPerBeat, restingEfficiency, confidence, date: targetDate.toISOString() }
}
// ─── 63. assessVentilatorThreshold ──────────────────────────────────────────

interface VentilatoryThresholdResult {
  thresholdHR: number
  vtPercent: number
  respiratoryRate: number
  crossoverPoint: number
  confidence: number
  date: string
}

export async function assessVentilatorThreshold(
  userId: string,
  date?: Date
): Promise<VentilatoryThresholdResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const respRate = getValues(byType, "respiratory_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const avgResp = respRate.length > 0 ? mean(respRate) : 16
  const respSlope = linearRegressionSlope(respRate)
  const hrSlope = linearRegressionSlope(hrValues)
  const crossoverPoint = round1(clamp(
    avgRestHR + (maxHR - avgRestHR) * 0.65 + respSlope * 5,
    avgRestHR + 20, maxHR * 0.9
  ))
  const thresholdHR = round1(crossoverPoint)
  const vtPercent = round1(clamp((thresholdHR / maxHR) * 100, 50, 95))
  const respiratoryRate = round1(avgResp)
  const confidence = round1(clamp((hrValues.length + respRate.length) / 20, 0.1, 1))
  return { thresholdHR, vtPercent, respiratoryRate, crossoverPoint, confidence, date: targetDate.toISOString() }
}

// ─── 64. computeOxygenPulse ─────────────────────────────────────────────────

interface OxygenPulseResult {
  o2Pulse: number
  trend: string
  strokeVolumeProxy: number
  aerobicEfficiency: number
  confidence: number
  date: string
}

export async function computeOxygenPulse(
  userId: string,
  date?: Date
): Promise<OxygenPulseResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const hrValues = getValues(byType, "heart_rate")
  const weightVals = getValues(byType, "weight")
  const restHR = getValues(byType, "resting_heart_rate")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const vo2max = vo2.length > 0 ? mean(vo2) : 40
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const vo2ml = vo2max * w
  const o2Pulse = round1(avgHR > 0 ? vo2ml / avgHR : 0)
  const strokeVolumeProxy = round1(clamp(o2Pulse * 5, 40, 150))
  const o2PulseValues: number[] = []
  for (let i = 0; i < hrValues.length; i++) {
    if (hrValues[i] > 0) o2PulseValues.push(vo2ml / hrValues[i])
  }
  const o2PulseSlope = linearRegressionSlope(o2PulseValues)
  const trend = o2PulseSlope > 0.05 ? "improving" : o2PulseSlope < -0.05 ? "declining" : "stable"
  const aerobicEfficiency = round1(clamp(o2Pulse / 30 * 100, 0, 100))
  const confidence = round1(clamp((vo2.length + hrValues.length) / 25, 0.1, 1))
  return { o2Pulse, trend, strokeVolumeProxy, aerobicEfficiency, confidence, date: targetDate.toISOString() }
}

// ─── 65. analyzeHeartRateVariabilityProfile ─────────────────────────────────

interface HRVProfileResult {
  profile: string
  parasympathetic: number
  sympathetic: number
  balance: number
  rmssdTrend: number
  dailyVariation: number
  trainingResponse: string
  confidence: number
  date: string
}

export async function analyzeHeartRateVariabilityProfile(
  userId: string,
  date?: Date
): Promise<HRVProfileResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrv = getValues(byType, "hrv")
  const restHR = getValues(byType, "resting_heart_rate")
  const stress = getValues(byType, "stress")
  const avgHRV = hrv.length > 0 ? mean(hrv) : 50
  const hrvSD = hrv.length > 2 ? stdDev(hrv) : 10
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const avgStress = stress.length > 0 ? mean(stress) : 50
  const parasympathetic = round1(clamp(avgHRV / 80 * 100, 0, 100))
  const sympathetic = round1(clamp((avgRestHR - 40) / 40 * 50 + avgStress / 100 * 50, 0, 100))
  const balance = round1(clamp(parasympathetic - sympathetic + 50, 0, 100))
  const rmssdTrend = round1(linearRegressionSlope(hrv))
  const dailyVariation = round1(hrvSD)
  let profile = "balanced"
  if (balance > 70) profile = "parasympathetic dominant"
  else if (balance < 30) profile = "sympathetic dominant"
  let trainingResponse = "normal"
  if (rmssdTrend > 0.5) trainingResponse = "positive adaptation"
  else if (rmssdTrend < -0.5) trainingResponse = "overload detected"
  const confidence = round1(clamp((hrv.length + restHR.length) / 30, 0.1, 1))
  return { profile, parasympathetic, sympathetic, balance, rmssdTrend, dailyVariation, trainingResponse, confidence, date: targetDate.toISOString() }
}

// ─── 66. computeAutonomicBalance ────────────────────────────────────────────

interface AutonomicBalanceResult {
  balance: number
  sympatheticTone: number
  parasympatheticTone: number
  stressIndex: number
  recoveryIndex: number
  confidence: number
  date: string
}

export async function computeAutonomicBalance(
  userId: string,
  date?: Date
): Promise<AutonomicBalanceResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrv = getValues(byType, "hrv")
  const restHR = getValues(byType, "resting_heart_rate")
  const respRate = getValues(byType, "respiratory_rate")
  const stress = getValues(byType, "stress")
  const avgHRV = hrv.length > 0 ? mean(hrv) : 50
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const avgResp = respRate.length > 0 ? mean(respRate) : 16
  const avgStress = stress.length > 0 ? mean(stress) : 50
  const parasympatheticTone = round1(clamp(avgHRV / 70 * 50 + (70 - avgRestHR) / 20 * 25 + (18 - avgResp) / 6 * 25, 0, 100))
  const sympatheticTone = round1(clamp(avgStress / 100 * 40 + (avgRestHR - 50) / 30 * 30 + avgResp / 25 * 30, 0, 100))
  const balance = round1(clamp(parasympatheticTone - sympatheticTone + 50, 0, 100))
  const stressIndex = round1(clamp(sympatheticTone * 0.7 + (100 - parasympatheticTone) * 0.3, 0, 100))
  const recoveryIndex = round1(clamp(parasympatheticTone * 0.7 + (100 - sympatheticTone) * 0.3, 0, 100))
  const confidence = round1(clamp((hrv.length + restHR.length + respRate.length) / 25, 0.1, 1))
  return { balance, sympatheticTone, parasympatheticTone, stressIndex, recoveryIndex, confidence, date: targetDate.toISOString() }
}

// ─── 67. assessCardiacDriftRate ─────────────────────────────────────────────

interface CardiacDriftRateResult {
  driftRate: number
  dehydrationRisk: string
  fatigueLevel: string
  firstQuarterHR: number
  lastQuarterHR: number
  confidence: number
  date: string
}

export async function assessCardiacDriftRate(
  userId: string,
  date?: Date
): Promise<CardiacDriftRateResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 7 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrEntries = byType.get("heart_rate") ?? []
  const hrValues = hrEntries.map((e) => e.value)
  const quarter = Math.max(Math.floor(hrValues.length / 4), 1)
  const firstQuarterHR = round1(mean(hrValues.slice(0, quarter).length > 0 ? hrValues.slice(0, quarter) : [130]))
  const lastQuarterHR = round1(mean(hrValues.slice(-quarter).length > 0 ? hrValues.slice(-quarter) : [135]))
  const driftRate = round1(firstQuarterHR > 0 ? ((lastQuarterHR - firstQuarterHR) / firstQuarterHR) * 100 : 0)
  let dehydrationRisk = "low"
  if (driftRate > 10) dehydrationRisk = "high"
  else if (driftRate > 5) dehydrationRisk = "moderate"
  let fatigueLevel = "low"
  if (driftRate > 8) fatigueLevel = "high"
  else if (driftRate > 4) fatigueLevel = "moderate"
  const confidence = round1(clamp(hrValues.length / 20, 0.1, 1))
  return { driftRate, dehydrationRisk, fatigueLevel, firstQuarterHR, lastQuarterHR, confidence, date: targetDate.toISOString() }
}

// ─── 68. computeMetabolicFlexibility ────────────────────────────────────────

interface MetabolicFlexibilityResult {
  flexibilityScore: number
  fatOxidation: number
  carbOxidation: number
  crossoverIntensity: number
  metabolicHealth: string
  confidence: number
  date: string
}

export async function computeMetabolicFlexibility(
  userId: string,
  date?: Date
): Promise<MetabolicFlexibilityResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const restHR = getValues(byType, "resting_heart_rate")
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const intensityFraction = clamp((avgHR - avgRestHR) / (maxHR - avgRestHR), 0, 1)
  const fatOxidation = round1(clamp((1 - intensityFraction) * 100 * 0.8, 0, 100))
  const carbOxidation = round1(clamp(intensityFraction * 100 * 0.9, 0, 100))
  const crossoverIntensity = round1(clamp(avgRestHR + (maxHR - avgRestHR) * 0.55, avgRestHR, maxHR))
  const calVariation = calories.length > 2 ? coefficientOfVariation(calories) : 0.2
  const hrVariation = hrValues.length > 2 ? coefficientOfVariation(hrValues) : 0.1
  const flexibilityScore = round1(clamp(
    (calVariation * 100 + hrVariation * 100) * 0.5 + (crossoverIntensity - avgRestHR) / (maxHR - avgRestHR) * 50,
    0, 100
  ))
  let metabolicHealth = "average"
  if (flexibilityScore > 70) metabolicHealth = "excellent"
  else if (flexibilityScore > 50) metabolicHealth = "good"
  else if (flexibilityScore < 30) metabolicHealth = "needs improvement"
  const confidence = round1(clamp((hrValues.length + calories.length) / 20, 0.1, 1))
  return { flexibilityScore, fatOxidation, carbOxidation, crossoverIntensity, metabolicHealth, confidence, date: targetDate.toISOString() }
}
// ─── 69. analyzeSubstrateUtilization ────────────────────────────────────────

interface SubstrateUtilizationResult {
  fatPercent: number
  carbPercent: number
  crossoverPoint: number
  fuelMixAtRest: string
  fuelMixAtPeak: string
  confidence: number
  date: string
}

export async function analyzeSubstrateUtilization(
  userId: string,
  date?: Date
): Promise<SubstrateUtilizationResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const calories = getValues(byType, "calories")
  const vo2 = getValues(byType, "vo2max")
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const intensityFrac = clamp((avgHR - avgRestHR) / (maxHR - avgRestHR), 0, 1)
  const fatPercent = round1(clamp((1 - intensityFrac * 1.2) * 100, 5, 90))
  const carbPercent = round1(100 - fatPercent)
  const crossoverPoint = round1(avgRestHR + (maxHR - avgRestHR) * 0.55)
  const fuelMixAtRest = `${round1(85)}% fat / ${round1(15)}% carb`
  const fuelMixAtPeak = `${round1(15)}% fat / ${round1(85)}% carb`
  const confidence = round1(clamp((hrValues.length + calories.length) / 20, 0.1, 1))
  return { fatPercent, carbPercent, crossoverPoint, fuelMixAtRest, fuelMixAtPeak, confidence, date: targetDate.toISOString() }
}

// ─── 70. computeRespiratoryExchangeProxy ────────────────────────────────────

interface RespiratoryExchangeProxyResult {
  rerEstimate: number
  primaryFuel: string
  respiratoryRate: number
  heartRateIntensity: number
  metabolicRate: number
  confidence: number
  date: string
}

export async function computeRespiratoryExchangeProxy(
  userId: string,
  date?: Date
): Promise<RespiratoryExchangeProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const respRate = getValues(byType, "respiratory_rate")
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const restHR = getValues(byType, "resting_heart_rate")
  const avgResp = respRate.length > 0 ? mean(respRate) : 16
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const intensityFrac = clamp((avgHR - avgRestHR) / (maxHR - avgRestHR), 0, 1)
  const rerEstimate = round1(clamp(0.7 + intensityFrac * 0.35 + (avgResp - 12) * 0.005, 0.7, 1.15))
  let primaryFuel = "mixed"
  if (rerEstimate < 0.8) primaryFuel = "fat"
  else if (rerEstimate > 1.0) primaryFuel = "carbohydrate"
  const respiratoryRate = round1(avgResp)
  const heartRateIntensity = round1(intensityFrac * 100)
  const avgCal = calories.length > 0 ? mean(calories) : 2000
  const metabolicRate = round1(avgCal / 1440)
  const confidence = round1(clamp((respRate.length + hrValues.length + calories.length) / 25, 0.1, 1))
  return { rerEstimate, primaryFuel, respiratoryRate, heartRateIntensity, metabolicRate, confidence, date: targetDate.toISOString() }
}

// ─── 71. assessAnaerobicCapacity ────────────────────────────────────────────

interface AnaerobicCapacityResult {
  capacity: number
  glycolyticPower: number
  atp_pcr_estimate: number
  anaerobicIndex: number
  confidence: number
  date: string
}

export async function assessAnaerobicCapacity(
  userId: string,
  date?: Date
): Promise<AnaerobicCapacityResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const peakHR = hrValues.length > 0 ? Math.max(...hrValues) : 180
  const maxHR = 220 - 30
  const peakIntensity = clamp(peakHR / maxHR, 0, 1)
  const calRate = calories.length > 0 && activeMin.length > 0
    ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const glycolyticPower = round1(clamp(peakIntensity * 60 + calRate * 2, 0, 100))
  const atp_pcr_estimate = round1(clamp(glycolyticPower * 0.5 + (w * 0.15), 0, 100))
  const capacity = round1(clamp(glycolyticPower * 0.6 + atp_pcr_estimate * 0.4, 0, 100))
  const anaerobicIndex = round1(capacity / w * 10)
  const confidence = round1(clamp((hrValues.length + calories.length) / 20, 0.1, 1))
  return { capacity, glycolyticPower, atp_pcr_estimate, anaerobicIndex, confidence, date: targetDate.toISOString() }
}

// ─── 72. computeAerobicCapacity ─────────────────────────────────────────────

interface AerobicCapacityResult {
  capacity: number
  sustainablePower: number
  duration: number
  aerobicIndex: number
  confidence: number
  date: string
}

export async function computeAerobicCapacity(
  userId: string,
  date?: Date
): Promise<AerobicCapacityResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const activeMin = getValues(byType, "active_minutes")
  const hrv = getValues(byType, "hrv")
  const restHR = getValues(byType, "resting_heart_rate")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const vo2max = vo2.length > 0 ? mean(vo2) : 40
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const avgHRV = hrv.length > 0 ? mean(hrv) : 50
  const sustainablePower = round1(clamp(vo2max * w * 0.05, 20, 400))
  const duration = round1(clamp(avgActive * 1.5 + avgHRV * 0.3, 10, 300))
  const capacity = round1(clamp(vo2max / 60 * 100 * 0.6 + avgActive / 60 * 20 + avgHRV / 80 * 20, 0, 100))
  const aerobicIndex = round1(capacity * w / 1000)
  const confidence = round1(clamp((vo2.length + activeMin.length + hrv.length) / 30, 0.1, 1))
  return { capacity, sustainablePower, duration, aerobicIndex, confidence, date: targetDate.toISOString() }
}

// ─── 73. analyzeEnergySystemContribution ────────────────────────────────────

interface EnergySystemContributionResult {
  aerobicPercent: number
  anaerobicPercent: number
  atpPcrPercent: number
  dominantSystem: string
  activityDuration: number
  confidence: number
  date: string
}

export async function analyzeEnergySystemContribution(
  userId: string,
  date?: Date
): Promise<EnergySystemContributionResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const intensityFrac = clamp((avgHR - avgRestHR) / (maxHR - avgRestHR), 0, 1)
  const durationFactor = clamp(avgActive / 60, 0, 1)
  const aerobicBase = 40 + durationFactor * 40 - intensityFrac * 20
  const anaerobicBase = 10 + intensityFrac * 30 - durationFactor * 10
  const atpPcrBase = 5 + intensityFrac * 15 - durationFactor * 5
  const total = aerobicBase + anaerobicBase + atpPcrBase
  const aerobicPercent = round1(clamp(aerobicBase / total * 100, 5, 95))
  const anaerobicPercent = round1(clamp(anaerobicBase / total * 100, 2, 50))
  const atpPcrPercent = round1(clamp(100 - aerobicPercent - anaerobicPercent, 1, 30))
  let dominantSystem = "aerobic"
  if (anaerobicPercent > aerobicPercent) dominantSystem = "anaerobic"
  if (atpPcrPercent > anaerobicPercent && atpPcrPercent > aerobicPercent) dominantSystem = "ATP-PCr"
  const activityDuration = round1(avgActive)
  const confidence = round1(clamp((activeMin.length + hrValues.length) / 20, 0.1, 1))
  return { aerobicPercent, anaerobicPercent, atpPcrPercent, dominantSystem, activityDuration, confidence, date: targetDate.toISOString() }
}

// ─── 74. computeTrainingLoadBalance ─────────────────────────────────────────

interface TrainingLoadBalanceResult {
  balance: string
  polarizationIndex: number
  recommendation: string
  zoneDistribution: { easy: number; moderate: number; hard: number }
  confidence: number
  date: string
}

export async function computeTrainingLoadBalance(
  userId: string,
  date?: Date
): Promise<TrainingLoadBalanceResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 28 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const hrReserve = maxHR - avgRestHR
  let easy = 0, moderate = 0, hard = 0
  for (const hr of hrValues) {
    const zone = (hr - avgRestHR) / hrReserve
    if (zone < 0.6) easy++
    else if (zone < 0.8) moderate++
    else hard++
  }
  const total = Math.max(easy + moderate + hard, 1)
  const easyPct = round1(easy / total * 100)
  const moderatePct = round1(moderate / total * 100)
  const hardPct = round1(hard / total * 100)
  const polarizationIndex = round1(clamp((easyPct + hardPct) - moderatePct, 0, 100))
  let balance = "mixed"
  if (easyPct > 70 && hardPct > 10) balance = "polarized"
  else if (moderatePct > 50) balance = "threshold-heavy"
  else if (easyPct > 75) balance = "too easy"
  else if (hardPct > 40) balance = "too intense"
  let recommendation = "maintain current balance"
  if (balance === "threshold-heavy") recommendation = "reduce moderate intensity, add more easy and hard sessions"
  else if (balance === "too intense") recommendation = "add more easy recovery sessions"
  else if (balance === "too easy") recommendation = "add high-intensity intervals"
  const confidence = round1(clamp(hrValues.length / 30, 0.1, 1))
  return { balance, polarizationIndex, recommendation, zoneDistribution: { easy: easyPct, moderate: moderatePct, hard: hardPct }, confidence, date: targetDate.toISOString() }
}
// ─── 75. assessRecoveryDebt ─────────────────────────────────────────────────

interface RecoveryDebtResult {
  debtScore: number
  daysAccumulated: number
  recoveryPlan: string
  loadVsRecovery: number
  sleepDebt: number
  confidence: number
  date: string
}

export async function assessRecoveryDebt(
  userId: string,
  date?: Date
): Promise<RecoveryDebtResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeMin = getValues(byType, "active_minutes")
  const sleepDur = getValues(byType, "sleep_duration")
  const hrv = getValues(byType, "hrv")
  const stress = getValues(byType, "stress")
  const avgActive = activeMin.length > 0 ? mean(activeMin) : 30
  const avgSleep = sleepDur.length > 0 ? mean(sleepDur) : 7
  const avgHRV = hrv.length > 0 ? mean(hrv) : 50
  const avgStress = stress.length > 0 ? mean(stress) : 50
  const sleepDebt = round1(clamp((8 - avgSleep) * sleepDur.length, 0, 30))
  const loadScore = avgActive * 0.5 + avgStress * 0.3
  const recoveryScore = avgSleep * 5 + avgHRV * 0.5
  const loadVsRecovery = round1(recoveryScore > 0 ? loadScore / recoveryScore : 1)
  let daysAccumulated = 0
  for (let i = 0; i < sleepDur.length; i++) {
    if ((sleepDur[i] ?? 7) < 7 || (activeMin[i] ?? 30) > 60) daysAccumulated++
  }
  const debtScore = round1(clamp(
    sleepDebt * 2 + (loadVsRecovery > 1 ? (loadVsRecovery - 1) * 40 : 0) + daysAccumulated * 3,
    0, 100
  ))
  let recoveryPlan = "no significant debt"
  if (debtScore > 60) recoveryPlan = "take 3-4 rest days, prioritize 9+ hours sleep"
  else if (debtScore > 30) recoveryPlan = "reduce training volume 50%, add 1 hour sleep"
  else if (debtScore > 10) recoveryPlan = "add light recovery sessions, maintain sleep hygiene"
  const confidence = round1(clamp((activeMin.length + sleepDur.length + hrv.length) / 25, 0.1, 1))
  return { debtScore, daysAccumulated, recoveryPlan, loadVsRecovery, sleepDebt, confidence, date: targetDate.toISOString() }
}

// ─── 76. computePerformanceEfficiencyIndex ──────────────────────────────────

interface PerformanceEfficiencyIndexResult {
  pei: number
  components: { cardioEfficiency: number; metabolicEfficiency: number; movementEfficiency: number; recoveryEfficiency: number }
  trend: string
  confidence: number
  date: string
}

export async function computePerformanceEfficiencyIndex(
  userId: string,
  date?: Date
): Promise<PerformanceEfficiencyIndexResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const restHR = getValues(byType, "resting_heart_rate")
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const steps = getValues(byType, "steps")
  const hrv = getValues(byType, "hrv")
  const sleepDur = getValues(byType, "sleep_duration")
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const cardioEfficiency = round1(clamp((80 - avgRestHR) / 30 * 50 + (180 - avgHR) / 80 * 50, 0, 100))
  const calRate = calories.length > 0 && activeMin.length > 0 ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const metabolicEfficiency = round1(clamp(100 - calRate * 3, 0, 100))
  const cadence = steps.length > 0 && activeMin.length > 0 ? mean(steps) / Math.max(mean(activeMin), 1) : 150
  const movementEfficiency = round1(clamp((cadence - 100) / 80 * 100, 0, 100))
  const avgHRV = hrv.length > 0 ? mean(hrv) : 50
  const avgSleep = sleepDur.length > 0 ? mean(sleepDur) : 7
  const recoveryEfficiency = round1(clamp(avgHRV / 80 * 50 + avgSleep / 8 * 50, 0, 100))
  const pei = round1(cardioEfficiency * 0.3 + metabolicEfficiency * 0.2 + movementEfficiency * 0.2 + recoveryEfficiency * 0.3)
  const peiValues = hrValues.map((hr, i) => {
    const re = restHR[i] ?? avgRestHR
    return clamp((80 - re) / 30 * 100, 0, 100)
  })
  const trend = linearRegressionSlope(peiValues) > 0.1 ? "improving" : linearRegressionSlope(peiValues) < -0.1 ? "declining" : "stable"
  const confidence = round1(clamp((restHR.length + hrValues.length + calories.length + hrv.length) / 40, 0.1, 1))
  return { pei, components: { cardioEfficiency, metabolicEfficiency, movementEfficiency, recoveryEfficiency }, trend, confidence, date: targetDate.toISOString() }
}

// ─── 77. analyzeWorkoutIntensityDistribution ────────────────────────────────

interface WorkoutIntensityDistributionResult {
  zones: { zone1: number; zone2: number; zone3: number; zone4: number; zone5: number }
  polarization: string
  recommendation: string
  dominantZone: string
  confidence: number
  date: string
}

export async function analyzeWorkoutIntensityDistribution(
  userId: string,
  date?: Date
): Promise<WorkoutIntensityDistributionResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 28 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const hrReserve = maxHR - avgRestHR
  let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0
  for (const hr of hrValues) {
    const zoneFrac = hrReserve > 0 ? (hr - avgRestHR) / hrReserve : 0.5
    if (zoneFrac < 0.5) z1++
    else if (zoneFrac < 0.6) z2++
    else if (zoneFrac < 0.7) z3++
    else if (zoneFrac < 0.8) z4++
    else z5++
  }
  const total = Math.max(z1 + z2 + z3 + z4 + z5, 1)
  const zones = {
    zone1: round1(z1 / total * 100),
    zone2: round1(z2 / total * 100),
    zone3: round1(z3 / total * 100),
    zone4: round1(z4 / total * 100),
    zone5: round1(z5 / total * 100),
  }
  const lowIntensity = zones.zone1 + zones.zone2
  const highIntensity = zones.zone4 + zones.zone5
  let polarization = "mixed"
  if (lowIntensity > 70 && highIntensity > 10) polarization = "polarized"
  else if (zones.zone3 > 40) polarization = "threshold"
  else if (highIntensity > 50) polarization = "intensity-focused"
  const maxZone = Math.max(z1, z2, z3, z4, z5)
  const dominantZone = maxZone === z1 ? "zone1" : maxZone === z2 ? "zone2" : maxZone === z3 ? "zone3" : maxZone === z4 ? "zone4" : "zone5"
  let recommendation = "maintain current distribution"
  if (polarization === "threshold") recommendation = "reduce zone 3 time, add more zone 1-2 and zone 4-5"
  else if (polarization === "intensity-focused") recommendation = "add more low-intensity base work"
  const confidence = round1(clamp(hrValues.length / 30, 0.1, 1))
  return { zones, polarization, recommendation, dominantZone, confidence, date: targetDate.toISOString() }
}

// ─── 78. computeTrainingEffectiveness ───────────────────────────────────────

interface TrainingEffectivenessResult {
  effectiveness: number
  gainRate: number
  plateauRisk: number
  responseScore: number
  confidence: number
  date: string
}

export async function computeTrainingEffectiveness(
  userId: string,
  date?: Date
): Promise<TrainingEffectivenessResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const hrv = getValues(byType, "hrv")
  const restHR = getValues(byType, "resting_heart_rate")
  const activeMin = getValues(byType, "active_minutes")
  const vo2Slope = linearRegressionSlope(vo2)
  const hrvSlope = linearRegressionSlope(hrv)
  const restHRSlope = linearRegressionSlope(restHR)
  const activeSlope = linearRegressionSlope(activeMin)
  const gainRate = round1(
    clamp(vo2Slope * 5, -10, 10) +
    clamp(hrvSlope * 2, -10, 10) +
    clamp(-restHRSlope * 3, -10, 10)
  )
  const responseScore = round1(clamp(50 + gainRate * 5, 0, 100))
  const vo2CV = vo2.length > 2 ? coefficientOfVariation(vo2) : 0.1
  const plateauRisk = round1(clamp(100 - vo2CV * 200 - Math.abs(gainRate) * 10, 0, 100))
  const effectiveness = round1(clamp(
    responseScore * 0.4 + (100 - plateauRisk) * 0.3 + clamp(activeSlope * 2 + 50, 0, 100) * 0.3,
    0, 100
  ))
  const confidence = round1(clamp((vo2.length + hrv.length + restHR.length + activeMin.length) / 40, 0.1, 1))
  return { effectiveness, gainRate, plateauRisk, responseScore, confidence, date: targetDate.toISOString() }
}

// ─── 79. assessAthleteProfile ───────────────────────────────────────────────

interface AthleteProfileResult {
  profile: string
  strengths: string[]
  weaknesses: string[]
  scores: { endurance: number; power: number; speed: number; recovery: number; flexibility: number }
  confidence: number
  date: string
}

export async function assessAthleteProfile(
  userId: string,
  date?: Date
): Promise<AthleteProfileResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const hrv = getValues(byType, "hrv")
  const restHR = getValues(byType, "resting_heart_rate")
  const activeMin = getValues(byType, "active_minutes")
  const steps = getValues(byType, "steps")
  const calories = getValues(byType, "calories")
  const sleepDur = getValues(byType, "sleep_duration")
  const hrValues = getValues(byType, "heart_rate")
  const weightVals = getValues(byType, "weight")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const endurance = round1(clamp(
    (vo2.length > 0 ? mean(vo2) / 60 * 40 : 30) +
    (activeMin.length > 0 ? mean(activeMin) / 60 * 30 : 15) +
    (restHR.length > 0 ? (80 - mean(restHR)) / 30 * 30 : 15),
    0, 100
  ))
  const peakHR = hrValues.length > 0 ? Math.max(...hrValues) : 180
  const calRate = calories.length > 0 && activeMin.length > 0 ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const power = round1(clamp(calRate * 5 + (peakHR / 190) * 30 + (w > 60 ? 20 : 10), 0, 100))
  const stepRate = steps.length > 0 && activeMin.length > 0 ? mean(steps) / Math.max(mean(activeMin), 1) : 150
  const speed = round1(clamp(stepRate / 200 * 60 + (180 - (restHR.length > 0 ? mean(restHR) : 65)) / 100 * 40, 0, 100))
  const avgHRV = hrv.length > 0 ? mean(hrv) : 50
  const avgSleep = sleepDur.length > 0 ? mean(sleepDur) : 7
  const recovery = round1(clamp(avgHRV / 80 * 50 + avgSleep / 8 * 50, 0, 100))
  const stepsCV = steps.length > 2 ? coefficientOfVariation(steps) : 0.3
  const flexibility = round1(clamp(stepsCV * 200, 0, 100))
  const scores = { endurance, power, speed, recovery, flexibility }
  const scoreEntries = Object.entries(scores) as [string, number][]
  scoreEntries.sort((a, b) => b[1] - a[1])
  const strengths = scoreEntries.slice(0, 2).map((e) => e[0])
  const weaknesses = scoreEntries.slice(-2).map((e) => e[0])
  let profile = "mixed athlete"
  if (endurance > power + 15 && endurance > speed + 10) profile = "endurance athlete"
  else if (power > endurance + 15) profile = "power athlete"
  else if (speed > endurance + 10 && speed > power + 5) profile = "speed athlete"
  const confidence = round1(clamp((vo2.length + hrv.length + activeMin.length + steps.length) / 40, 0.1, 1))
  return { profile, strengths, weaknesses, scores, confidence, date: targetDate.toISOString() }
}

// ─── 80. computePerformanceIndex ────────────────────────────────────────────

interface PerformanceIndexResult {
  index: number
  ranking: string
  components: { cardiovascular: number; muscular: number; metabolic: number; recovery: number; bodyComp: number }
  trend: string
  confidence: number
  date: string
}

export async function computePerformanceIndex(
  userId: string,
  date?: Date
): Promise<PerformanceIndexResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const vo2 = getValues(byType, "vo2max")
  const restHR = getValues(byType, "resting_heart_rate")
  const hrv = getValues(byType, "hrv")
  const activeMin = getValues(byType, "active_minutes")
  const steps = getValues(byType, "steps")
  const calories = getValues(byType, "calories")
  const sleepDur = getValues(byType, "sleep_duration")
  const bodyFat = getValues(byType, "body_fat")
  const weightVals = getValues(byType, "weight")
  const cardiovascular = round1(clamp(
    (vo2.length > 0 ? mean(vo2) / 60 * 50 : 30) +
    (restHR.length > 0 ? (80 - mean(restHR)) / 30 * 50 : 25),
    0, 100
  ))
  const muscular = round1(clamp(
    (activeMin.length > 0 ? mean(activeMin) / 60 * 50 : 25) +
    (steps.length > 0 ? mean(steps) / 10000 * 50 : 25),
    0, 100
  ))
  const metabolic = round1(clamp(
    (calories.length > 0 ? clamp(mean(calories) / 2500 * 50, 0, 50) : 25) +
    (hrv.length > 0 ? mean(hrv) / 80 * 50 : 25),
    0, 100
  ))
  const recovery = round1(clamp(
    (sleepDur.length > 0 ? mean(sleepDur) / 8 * 50 : 25) +
    (hrv.length > 0 ? mean(hrv) / 80 * 50 : 25),
    0, 100
  ))
  const bf = bodyFat.length > 0 ? mean(bodyFat) : 20
  const bodyComp = round1(clamp((30 - bf) / 20 * 100, 0, 100))
  const index = round1(
    cardiovascular * 0.25 +
    muscular * 0.2 +
    metabolic * 0.2 +
    recovery * 0.2 +
    bodyComp * 0.15
  )
  let ranking = "average"
  if (index > 85) ranking = "elite"
  else if (index > 70) ranking = "advanced"
  else if (index > 55) ranking = "intermediate"
  else if (index > 40) ranking = "beginner"
  else ranking = "novice"
  const indexValues = activeMin.map((a, i) => {
    const v = vo2[i] ?? (vo2.length > 0 ? mean(vo2) : 40)
    return v / 60 * 50 + a / 60 * 50
  })
  const slope = linearRegressionSlope(indexValues)
  const trend = slope > 0.5 ? "improving" : slope < -0.5 ? "declining" : "stable"
  const confidence = round1(clamp(
    (vo2.length + restHR.length + hrv.length + activeMin.length + sleepDur.length) / 50, 0.1, 1
  ))
  return { index, ranking, components: { cardiovascular, muscular, metabolic, recovery, bodyComp }, trend, confidence, date: targetDate.toISOString() }
}
// ─── 81. analyzeHeartRateZones ──────────────────────────────────────────────

interface HeartRateZonesResult {
  zones: { zone1: { min: number; max: number; pct: number }; zone2: { min: number; max: number; pct: number }; zone3: { min: number; max: number; pct: number }; zone4: { min: number; max: number; pct: number }; zone5: { min: number; max: number; pct: number } }
  distribution: number[]
  optimalZone: string
  maxHR: number
  restingHR: number
  confidence: number
  date: string
}

export async function analyzeHeartRateZones(
  userId: string,
  date?: Date
): Promise<HeartRateZonesResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 28 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const restingHR = round1(restHR.length > 0 ? mean(restHR) : 65)
  const hrReserve = maxHR - restingHR
  const z1 = { min: round1(restingHR + hrReserve * 0.5), max: round1(restingHR + hrReserve * 0.6), pct: 0 }
  const z2 = { min: round1(restingHR + hrReserve * 0.6), max: round1(restingHR + hrReserve * 0.7), pct: 0 }
  const z3 = { min: round1(restingHR + hrReserve * 0.7), max: round1(restingHR + hrReserve * 0.8), pct: 0 }
  const z4 = { min: round1(restingHR + hrReserve * 0.8), max: round1(restingHR + hrReserve * 0.9), pct: 0 }
  const z5 = { min: round1(restingHR + hrReserve * 0.9), max: round1(maxHR), pct: 0 }
  let c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0
  for (const hr of hrValues) {
    if (hr < z1.max) c1++
    else if (hr < z2.max) c2++
    else if (hr < z3.max) c3++
    else if (hr < z4.max) c4++
    else c5++
  }
  const total = Math.max(c1 + c2 + c3 + c4 + c5, 1)
  z1.pct = round1(c1 / total * 100)
  z2.pct = round1(c2 / total * 100)
  z3.pct = round1(c3 / total * 100)
  z4.pct = round1(c4 / total * 100)
  z5.pct = round1(c5 / total * 100)
  const distribution = [z1.pct, z2.pct, z3.pct, z4.pct, z5.pct]
  const maxPct = Math.max(...distribution)
  const optimalZone = maxPct === z1.pct ? "zone1" : maxPct === z2.pct ? "zone2" : maxPct === z3.pct ? "zone3" : maxPct === z4.pct ? "zone4" : "zone5"
  const confidence = round1(clamp(hrValues.length / 30, 0.1, 1))
  return { zones: { zone1: z1, zone2: z2, zone3: z3, zone4: z4, zone5: z5 }, distribution, optimalZone, maxHR, restingHR, confidence, date: targetDate.toISOString() }
}

// ─── 82. computeCriticalPowerProxy ──────────────────────────────────────────

interface CriticalPowerProxyResult {
  criticalPower: number
  wPrime: number
  timeToExhaustion: number
  sustainableIntensity: number
  confidence: number
  date: string
}

export async function computeCriticalPowerProxy(
  userId: string,
  date?: Date
): Promise<CriticalPowerProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const calories = getValues(byType, "calories")
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const weightVals = getValues(byType, "weight")
  const vo2 = getValues(byType, "vo2max")
  const w = weightVals.length > 0 ? mean(weightVals) : 70
  const vo2max = vo2.length > 0 ? mean(vo2) : 40
  const calRate = calories.length > 0 && activeMin.length > 0 ? mean(calories) / Math.max(mean(activeMin), 1) : 8
  const maxPower = calRate * 69.78 / 60 * 1.2
  const criticalPower = round1(clamp(maxPower * 0.75, 30, 400))
  const wPrime = round1(clamp(vo2max * w * 0.3, 5000, 30000))
  const excessPower = Math.max(maxPower - criticalPower, 1)
  const timeToExhaustion = round1(clamp(wPrime / excessPower / 60, 1, 60))
  const sustainableIntensity = round1(clamp(criticalPower / Math.max(maxPower, 1) * 100, 0, 100))
  const confidence = round1(clamp((calories.length + activeMin.length + vo2.length) / 30, 0.1, 1))
  return { criticalPower, wPrime, timeToExhaustion, sustainableIntensity, confidence, date: targetDate.toISOString() }
}

// ─── 83. assessMuscleOxygenProxy ────────────────────────────────────────────

interface MuscleOxygenProxyResult {
  smo2Estimate: number
  muscleO2Trend: string
  oxygenDelivery: number
  extractionEfficiency: number
  confidence: number
  date: string
}

export async function assessMuscleOxygenProxy(
  userId: string,
  date?: Date
): Promise<MuscleOxygenProxyResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const spO2 = getValues(byType, "blood_oxygen")
  const hrValues = getValues(byType, "heart_rate")
  const restHR = getValues(byType, "resting_heart_rate")
  const activeMin = getValues(byType, "active_minutes")
  const avgSpO2 = spO2.length > 0 ? mean(spO2) : 97
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const intensityFrac = clamp((avgHR - avgRestHR) / (maxHR - avgRestHR), 0, 1)
  const smo2Estimate = round1(clamp(avgSpO2 * 0.8 - intensityFrac * 30, 30, 90))
  const oxygenDelivery = round1(clamp(avgSpO2 / 100 * (avgHR / 130) * 100, 0, 100))
  const extractionEfficiency = round1(clamp((100 - smo2Estimate) / 70 * 100, 0, 100))
  const spO2Slope = linearRegressionSlope(spO2)
  const muscleO2Trend = spO2Slope > 0.05 ? "improving" : spO2Slope < -0.05 ? "declining" : "stable"
  const confidence = round1(clamp((spO2.length + hrValues.length) / 20, 0.1, 1))
  return { smo2Estimate, muscleO2Trend, oxygenDelivery, extractionEfficiency, confidence, date: targetDate.toISOString() }
}

// ─── 84. computeTrainingStressScore ─────────────────────────────────────────

interface TrainingStressScoreResult {
  tss: number
  intensityFactor: number
  normalizedLoad: number
  weeklyTSS: number
  category: string
  confidence: number
  date: string
}

export async function computeTrainingStressScore(
  userId: string,
  date?: Date
): Promise<TrainingStressScoreResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 7 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const hrValues = getValues(byType, "heart_rate")
  const activeMin = getValues(byType, "active_minutes")
  const restHR = getValues(byType, "resting_heart_rate")
  const calories = getValues(byType, "calories")
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const ltHR = avgRestHR + (maxHR - avgRestHR) * 0.85
  const avgHR = hrValues.length > 0 ? mean(hrValues) : 130
  const totalDuration = activeMin.reduce((a, b) => a + b, 0)
  const intensityFactor = round1(clamp(avgHR / ltHR, 0.5, 1.5))
  const normalizedLoad = round1(intensityFactor * avgHR)
  const tss = round1(clamp(
    (totalDuration * avgHR * intensityFactor) / (ltHR * 60) * 100,
    0, 500
  ))
  const weeklyTSS = round1(tss)
  let category = "maintenance"
  if (weeklyTSS > 400) category = "overload"
  else if (weeklyTSS > 300) category = "high"
  else if (weeklyTSS > 200) category = "moderate"
  else if (weeklyTSS > 100) category = "light"
  else category = "recovery"
  const confidence = round1(clamp((hrValues.length + activeMin.length) / 15, 0.1, 1))
  return { tss, intensityFactor, normalizedLoad, weeklyTSS, category, confidence, date: targetDate.toISOString() }
}

// ─── 85. analyzeChronicTrainingLoad ─────────────────────────────────────────

interface ChronicTrainingLoadResult {
  ctl: number
  trend: string
  fitnessLevel: string
  atl: number
  tsb: number
  formScore: number
  confidence: number
  date: string
}

export async function analyzeChronicTrainingLoad(
  userId: string,
  date?: Date
): Promise<ChronicTrainingLoadResult> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 42 * 86400000)
  const rows = await db
    .select({ metricType: healthMetrics.metricType, value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.recordedAt, start), lte(healthMetrics.recordedAt, targetDate)))
    .orderBy(asc(healthMetrics.recordedAt))
  const byType = groupByType(rows)
  const activeMin = getValues(byType, "active_minutes")
  const hrValues = getValues(byType, "heart_rate")
  const calories = getValues(byType, "calories")
  const restHR = getValues(byType, "resting_heart_rate")
  const avgRestHR = restHR.length > 0 ? mean(restHR) : 65
  const maxHR = hrValues.length > 0 ? Math.max(...hrValues) : 190
  const dailyLoads: number[] = []
  const maxLen = Math.max(activeMin.length, hrValues.length, 1)
  for (let i = 0; i < maxLen; i++) {
    const dur = activeMin[i] ?? 30
    const hr = hrValues[i] ?? 130
    const hrFrac = clamp((hr - avgRestHR) / (maxHR - avgRestHR), 0, 1)
    dailyLoads.push(dur * hrFrac * 0.64 * Math.exp(1.92 * hrFrac))
  }
  const ctlAlpha = 2 / (42 + 1)
  const atlAlpha = 2 / (7 + 1)
  const ctlEMA = exponentialMovingAverage(dailyLoads, ctlAlpha)
  const atlEMA = exponentialMovingAverage(dailyLoads, atlAlpha)
  const ctl = round1(ctlEMA.length > 0 ? ctlEMA[ctlEMA.length - 1] : 0)
  const atl = round1(atlEMA.length > 0 ? atlEMA[atlEMA.length - 1] : 0)
  const tsb = round1(ctl - atl)
  const formScore = round1(clamp(50 + tsb, 0, 100))
  const ctlSlope = linearRegressionSlope(ctlEMA)
  const trend = ctlSlope > 0.1 ? "building fitness" : ctlSlope < -0.1 ? "losing fitness" : "maintaining"
  let fitnessLevel = "moderate"
  if (ctl > 80) fitnessLevel = "highly trained"
  else if (ctl > 50) fitnessLevel = "well trained"
  else if (ctl > 30) fitnessLevel = "moderately trained"
  else if (ctl > 15) fitnessLevel = "recreationally active"
  else fitnessLevel = "untrained"
  const confidence = round1(clamp((activeMin.length + hrValues.length) / 40, 0.1, 1))
  return { ctl, trend, fitnessLevel, atl, tsb, formScore, confidence, date: targetDate.toISOString() }
}