import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, sql } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchMetric(
  userId: string,
  metric: string,
  start: Date,
  end: Date,
): Promise<number[]> {
  const db = getDb()
  const rows = await db
    .select({ value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, metric),
        gte(healthMetrics.recordedAt, start),
        lte(healthMetrics.recordedAt, end),
      ),
    )
    .orderBy(desc(healthMetrics.recordedAt))
  return rows.map((r) => Number(r.value))
}

async function fetchMetricWithTimestamps(
  userId: string,
  metric: string,
  start: Date,
  end: Date,
): Promise<{ value: number; timestamp: Date }[]> {
  const db = getDb()
  const rows = await db
    .select({ value: healthMetrics.value, timestamp: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, metric),
        gte(healthMetrics.recordedAt, start),
        lte(healthMetrics.recordedAt, end),
      ),
    )
    .orderBy(healthMetrics.recordedAt)
  return rows.map((r) => ({ value: Number(r.value), timestamp: new Date(r.timestamp) }))
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function coefficientOfVariation(values: number[]): number {
  const m = mean(values)
  if (m === 0) return 0
  return stddev(values) / Math.abs(m)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5
  return clamp((value - min) / (max - min), 0, 1)
}

function windowStart(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

function slope(values: number[]): number {
  if (values.length < 2) return 0
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = mean(values)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i]! - yMean)
    den += (i - xMean) ** 2
  }
  return den === 0 ? 0 : num / den
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function exponentialDecay(value: number, halfLife: number, elapsed: number): number {
  return value * Math.pow(0.5, elapsed / halfLife)
}

function hourOfDay(date: Date): number {
  return date.getHours() + date.getMinutes() / 60
}

// ---------------------------------------------------------------------------
// 1. Cortisol Curve Estimation
// ---------------------------------------------------------------------------

export interface CortisolCurveResult {
  morningPeak: number
  afternoonLevel: number
  eveningLevel: number
  curveSlope: number
  areaUnderCurve: number
  pattern: "healthy" | "flat" | "inverted" | "erratic"
  confidence: number
}

export async function cortisolCurveEstimation(
  userId: string,
  date: Date = new Date(),
): Promise<CortisolCurveResult> {
  const start = windowStart(date, 7)
  const hrv = await fetchMetric(userId, "hrv", start, date)
  const restingHr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const sleep = await fetchMetric(userId, "sleep_quality", start, date)

  const avgHrv = mean(hrv)
  const avgRhr = mean(restingHr)
  const avgStress = mean(stress)
  const avgSleep = mean(sleep)

  // Cortisol is inversely related to HRV and sleep, positively to stress and HR
  const morningPeak = clamp(20 + avgStress * 0.3 - avgHrv * 0.05 + avgRhr * 0.1, 5, 30)
  const afternoonLevel = morningPeak * clamp(0.5 - avgStress * 0.005 + avgSleep * 0.003, 0.3, 0.7)
  const eveningLevel = morningPeak * clamp(0.25 - avgStress * 0.003 + avgSleep * 0.004, 0.1, 0.5)
  const curveSlope = (eveningLevel - morningPeak) / 16
  const areaUnderCurve = (morningPeak + 4 * afternoonLevel + eveningLevel) * (16 / 6)

  let pattern: CortisolCurveResult["pattern"] = "healthy"
  if (Math.abs(morningPeak - eveningLevel) < 3) pattern = "flat"
  else if (eveningLevel > morningPeak) pattern = "inverted"
  else if (stddev([morningPeak, afternoonLevel, eveningLevel]) > 8) pattern = "erratic"

  const confidence = clamp(Math.min(hrv.length, stress.length, restingHr.length) / 7, 0, 1)

  return { morningPeak, afternoonLevel, eveningLevel, curveSlope, areaUnderCurve, pattern, confidence }
}

// ---------------------------------------------------------------------------
// 2. Thyroid Status Proxy
// ---------------------------------------------------------------------------

export interface ThyroidStatusResult {
  score: number
  status: "hypo" | "normal" | "hyper"
  metabolicRate: number
  thermoregulation: number
  energyLevel: number
  confidence: number
}

export async function thyroidStatusProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ThyroidStatusResult> {
  const start = windowStart(date, 14)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const calories = await fetchMetric(userId, "calories_burned", start, date)
  const sleep = await fetchMetric(userId, "sleep_duration", start, date)

  const avgRhr = mean(rhr)
  const avgTemp = mean(temp)
  const avgCalories = mean(calories)
  const avgSleep = mean(sleep)

  const metabolicRate = normalize(avgCalories, 1200, 3500)
  const thermoregulation = normalize(avgTemp, 35.5, 37.5)
  const energyLevel = normalize(avgRhr, 45, 100) * 0.4 + (1 - normalize(avgSleep, 5, 12)) * 0.6

  const score = clamp(metabolicRate * 35 + thermoregulation * 35 + energyLevel * 30, 0, 100)

  let status: ThyroidStatusResult["status"] = "normal"
  if (score < 35) status = "hypo"
  else if (score > 75) status = "hyper"

  const confidence = clamp(Math.min(rhr.length, temp.length) / 14, 0, 1)

  return { score, status, metabolicRate, thermoregulation, energyLevel, confidence }
}

// ---------------------------------------------------------------------------
// 3. Insulin Sensitivity Proxy
// ---------------------------------------------------------------------------

export interface InsulinSensitivityResult {
  score: number
  level: "low" | "moderate" | "high"
  glucoseStability: number
  activityFactor: number
  restingMetabolicFactor: number
  trend: "improving" | "stable" | "declining"
  confidence: number
}

export async function insulinSensitivityProxy(
  userId: string,
  date: Date = new Date(),
): Promise<InsulinSensitivityResult> {
  const start = windowStart(date, 14)
  const glucose = await fetchMetric(userId, "blood_glucose", start, date)
  const steps = await fetchMetric(userId, "steps", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const weight = await fetchMetric(userId, "weight", start, date)

  const glucoseCV = coefficientOfVariation(glucose)
  const glucoseStability = clamp(1 - glucoseCV * 5, 0, 1)
  const avgSteps = mean(steps)
  const activityFactor = normalize(avgSteps, 2000, 15000)
  const avgRhr = mean(rhr)
  const restingMetabolicFactor = 1 - normalize(avgRhr, 50, 90)
  const weightTrend = slope(weight)
  const weightPenalty = clamp(weightTrend * 10, -0.2, 0.2)

  const score = clamp(
    (glucoseStability * 40 + activityFactor * 35 + restingMetabolicFactor * 25 - weightPenalty * 100) * 100 / 100,
    0,
    100,
  )

  const level: InsulinSensitivityResult["level"] =
    score > 65 ? "high" : score > 40 ? "moderate" : "low"

  const halfLen = Math.floor(glucose.length / 2)
  const firstHalfCV = coefficientOfVariation(glucose.slice(0, halfLen))
  const secondHalfCV = coefficientOfVariation(glucose.slice(halfLen))
  const trend: InsulinSensitivityResult["trend"] =
    secondHalfCV < firstHalfCV - 0.02 ? "improving" : secondHalfCV > firstHalfCV + 0.02 ? "declining" : "stable"

  const confidence = clamp(Math.min(glucose.length, steps.length) / 14, 0, 1)

  return { score, level, glucoseStability, activityFactor, restingMetabolicFactor, trend, confidence }
}

// ---------------------------------------------------------------------------
// 4. Testosterone Proxy
// ---------------------------------------------------------------------------

export interface TestosteroneProxyResult {
  score: number
  level: "low" | "normal" | "high"
  sleepComponent: number
  activityComponent: number
  stressComponent: number
  recoveryComponent: number
  confidence: number
}

export async function testosteroneProxy(
  userId: string,
  date: Date = new Date(),
): Promise<TestosteroneProxyResult> {
  const start = windowStart(date, 14)
  const sleep = await fetchMetric(userId, "deep_sleep_duration", start, date)
  const steps = await fetchMetric(userId, "steps", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)

  const sleepComponent = normalize(mean(sleep), 30, 120)
  const activityComponent = normalize(mean(steps), 3000, 12000)
  const stressComponent = 1 - normalize(mean(stress), 20, 80)
  const recoveryComponent = normalize(mean(hrv), 20, 80)

  const score = clamp(
    sleepComponent * 30 + activityComponent * 25 + stressComponent * 25 + recoveryComponent * 20,
    0,
    100,
  )

  const level: TestosteroneProxyResult["level"] =
    score < 35 ? "low" : score > 70 ? "high" : "normal"

  const confidence = clamp(Math.min(sleep.length, hrv.length) / 14, 0, 1)

  return { score, level, sleepComponent, activityComponent, stressComponent, recoveryComponent, confidence }
}

// ---------------------------------------------------------------------------
// 5. Estrogen Cycle Proxy
// ---------------------------------------------------------------------------

export interface EstrogenCycleResult {
  estimatedPhase: "follicular" | "ovulatory" | "luteal" | "menstrual" | "unknown"
  estimatedLevel: number
  tempVariation: number
  rhrVariation: number
  cycleDay: number
  confidence: number
}

export async function estrogenCycleProxy(
  userId: string,
  date: Date = new Date(),
): Promise<EstrogenCycleResult> {
  const start = windowStart(date, 35)
  const temp = await fetchMetricWithTimestamps(userId, "body_temperature", start, date)
  const rhr = await fetchMetricWithTimestamps(userId, "resting_heart_rate", start, date)

  const tempValues = temp.map((t) => t.value)
  const rhrValues = rhr.map((r) => r.value)
  const tempVariation = stddev(tempValues)
  const rhrVariation = stddev(rhrValues)

  // Detect thermal shift to estimate cycle phase
  const tempMedian = median(tempValues)
  const recentTemps = tempValues.slice(-7)
  const avgRecent = mean(recentTemps)

  let cycleDay = 14
  let estimatedPhase: EstrogenCycleResult["estimatedPhase"] = "unknown"

  if (tempValues.length >= 14) {
    if (avgRecent < tempMedian - 0.1) {
      estimatedPhase = "follicular"
      cycleDay = 7
    } else if (avgRecent >= tempMedian - 0.1 && avgRecent < tempMedian + 0.05) {
      estimatedPhase = "ovulatory"
      cycleDay = 14
    } else if (avgRecent >= tempMedian + 0.05 && avgRecent < tempMedian + 0.3) {
      estimatedPhase = "luteal"
      cycleDay = 21
    } else {
      estimatedPhase = "menstrual"
      cycleDay = 1
    }
  }

  const phaseLevelMap = { follicular: 60, ovulatory: 90, luteal: 50, menstrual: 20, unknown: 50 }
  const estimatedLevel = phaseLevelMap[estimatedPhase]

  const confidence = clamp(tempValues.length / 28, 0, 1)

  return { estimatedPhase, estimatedLevel, tempVariation, rhrVariation, cycleDay, confidence }
}

// ---------------------------------------------------------------------------
// 6. Growth Hormone Proxy
// ---------------------------------------------------------------------------

export interface GrowthHormoneProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  deepSleepFactor: number
  exerciseIntensityFactor: number
  fastingFactor: number
  confidence: number
}

export async function growthHormoneProxy(
  userId: string,
  date: Date = new Date(),
): Promise<GrowthHormoneProxyResult> {
  const start = windowStart(date, 7)
  const deepSleep = await fetchMetric(userId, "deep_sleep_duration", start, date)
  const activeMinutes = await fetchMetric(userId, "active_minutes_high", start, date)
  const calories = await fetchMetric(userId, "calories_consumed", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)

  const deepSleepFactor = normalize(mean(deepSleep), 20, 120)
  const exerciseIntensityFactor = normalize(mean(activeMinutes), 0, 60)
  // Lower calorie intake (intermittent fasting) can boost GH
  const fastingFactor = 1 - normalize(mean(calories), 1000, 3000)

  const score = clamp(
    deepSleepFactor * 40 + exerciseIntensityFactor * 35 + fastingFactor * 25,
    0,
    100,
  )

  const level: GrowthHormoneProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(deepSleep.length, activeMinutes.length) / 7, 0, 1)

  return { score, level, deepSleepFactor, exerciseIntensityFactor, fastingFactor, confidence }
}

// ---------------------------------------------------------------------------
// 7. Melatonin Proxy
// ---------------------------------------------------------------------------

export interface MelatoninProxyResult {
  score: number
  level: "low" | "normal" | "high"
  sleepOnsetComponent: number
  sleepDurationComponent: number
  regularityComponent: number
  lightExposurePenalty: number
  confidence: number
}

export async function melatoninProxy(
  userId: string,
  date: Date = new Date(),
): Promise<MelatoninProxyResult> {
  const start = windowStart(date, 14)
  const sleepOnset = await fetchMetric(userId, "sleep_onset_latency", start, date)
  const sleepDuration = await fetchMetric(userId, "sleep_duration", start, date)
  const lightExposure = await fetchMetric(userId, "light_exposure_evening", start, date)
  const sleepRegularity = await fetchMetric(userId, "sleep_regularity", start, date)

  const sleepOnsetComponent = 1 - normalize(mean(sleepOnset), 5, 60)
  const sleepDurationComponent = normalize(mean(sleepDuration), 4, 9)
  const regularityComponent = normalize(mean(sleepRegularity), 0, 100)
  const lightExposurePenalty = normalize(mean(lightExposure), 0, 500) * 0.3

  const score = clamp(
    (sleepOnsetComponent * 30 + sleepDurationComponent * 30 + regularityComponent * 25) * (1 - lightExposurePenalty) + 15,
    0,
    100,
  )

  const level: MelatoninProxyResult["level"] =
    score < 35 ? "low" : score > 70 ? "high" : "normal"

  const confidence = clamp(Math.min(sleepOnset.length, sleepDuration.length) / 14, 0, 1)

  return { score, level, sleepOnsetComponent, sleepDurationComponent, regularityComponent, lightExposurePenalty, confidence }
}

// ---------------------------------------------------------------------------
// 8. Adrenaline Response Proxy
// ---------------------------------------------------------------------------

export interface AdrenalineResponseResult {
  score: number
  reactivity: "hypo" | "normal" | "hyper"
  hrSpikeComponent: number
  recoverySpeed: number
  stressReactivity: number
  confidence: number
}

export async function adrenalineResponseProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AdrenalineResponseResult> {
  const start = windowStart(date, 7)
  const hrMax = await fetchMetric(userId, "heart_rate_max", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const recoveryHr = await fetchMetric(userId, "heart_rate_recovery", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)

  const hrSpikeComponent = normalize(mean(hrMax) - mean(rhr), 40, 120)
  const recoverySpeed = normalize(mean(recoveryHr), 10, 50)
  const stressReactivity = normalize(stddev(stress), 5, 30)

  const score = clamp(hrSpikeComponent * 40 + recoverySpeed * 30 + stressReactivity * 30, 0, 100)

  const reactivity: AdrenalineResponseResult["reactivity"] =
    score < 30 ? "hypo" : score > 70 ? "hyper" : "normal"

  const confidence = clamp(Math.min(hrMax.length, rhr.length) / 7, 0, 1)

  return { score, reactivity, hrSpikeComponent, recoverySpeed, stressReactivity, confidence }
}

// ---------------------------------------------------------------------------
// 9. Leptin Resistance Proxy
// ---------------------------------------------------------------------------

export interface LeptinResistanceResult {
  score: number
  status: "sensitive" | "moderate_resistance" | "high_resistance"
  bmiComponent: number
  sleepComponent: number
  activityComponent: number
  satietySignal: number
  confidence: number
}

export async function leptinResistanceProxy(
  userId: string,
  date: Date = new Date(),
): Promise<LeptinResistanceResult> {
  const start = windowStart(date, 30)
  const weight = await fetchMetric(userId, "weight", start, date)
  const height = await fetchMetric(userId, "height", start, date)
  const sleep = await fetchMetric(userId, "sleep_duration", start, date)
  const steps = await fetchMetric(userId, "steps", start, date)
  const calories = await fetchMetric(userId, "calories_consumed", start, date)

  const avgWeight = mean(weight)
  const avgHeight = mean(height) || 170
  const bmi = avgWeight / (avgHeight / 100) ** 2
  const bmiComponent = normalize(bmi, 18.5, 35)
  const sleepComponent = 1 - normalize(mean(sleep), 5, 9)
  const activityComponent = 1 - normalize(mean(steps), 3000, 12000)
  const satietySignal = normalize(mean(calories), 1500, 3500)

  const score = clamp(
    bmiComponent * 35 + sleepComponent * 25 + activityComponent * 20 + satietySignal * 20,
    0,
    100,
  )

  const status: LeptinResistanceResult["status"] =
    score < 30 ? "sensitive" : score < 60 ? "moderate_resistance" : "high_resistance"

  const confidence = clamp(Math.min(weight.length, sleep.length) / 14, 0, 1)

  return { score, status, bmiComponent, sleepComponent, activityComponent, satietySignal, confidence }
}

// ---------------------------------------------------------------------------
// 10. Ghrelin Pattern Proxy
// ---------------------------------------------------------------------------

export interface GhrelinPatternResult {
  score: number
  pattern: "regular" | "irregular" | "suppressed" | "elevated"
  mealTimingRegularity: number
  fastingDuration: number
  hungerProxy: number
  confidence: number
}

export async function ghrelinPatternProxy(
  userId: string,
  date: Date = new Date(),
): Promise<GhrelinPatternResult> {
  const start = windowStart(date, 14)
  const meals = await fetchMetricWithTimestamps(userId, "meal_time", start, date)
  const calories = await fetchMetric(userId, "calories_consumed", start, date)
  const glucose = await fetchMetric(userId, "blood_glucose", start, date)

  // Meal timing regularity: low stddev of meal-to-meal intervals
  const mealTimes = meals.map((m) => hourOfDay(m.timestamp))
  const mealTimingRegularity = mealTimes.length > 2 ? 1 - normalize(stddev(mealTimes), 0.5, 4) : 0.5

  const avgCalories = mean(calories)
  const fastingDuration = normalize(24 - (mealTimes.length > 1 ? Math.max(...mealTimes) - Math.min(...mealTimes) : 12), 8, 18)

  // Ghrelin spikes when glucose is low
  const avgGlucose = mean(glucose)
  const hungerProxy = 1 - normalize(avgGlucose, 60, 140)

  const score = clamp(
    mealTimingRegularity * 30 + fastingDuration * 35 + hungerProxy * 35,
    0,
    100,
  )

  let pattern: GhrelinPatternResult["pattern"] = "regular"
  if (mealTimingRegularity < 0.3) pattern = "irregular"
  else if (score > 70) pattern = "elevated"
  else if (score < 25) pattern = "suppressed"

  const confidence = clamp(meals.length / 14, 0, 1)

  return { score, pattern, mealTimingRegularity, fastingDuration, hungerProxy, confidence }
}

// ---------------------------------------------------------------------------
// 11. Aldosterone Proxy
// ---------------------------------------------------------------------------

export interface AldosteroneProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  bloodPressureComponent: number
  hydrationComponent: number
  sodiumBalanceProxy: number
  confidence: number
}

export async function aldosteroneProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AldosteroneProxyResult> {
  const start = windowStart(date, 14)
  const systolic = await fetchMetric(userId, "blood_pressure_systolic", start, date)
  const diastolic = await fetchMetric(userId, "blood_pressure_diastolic", start, date)
  const hydration = await fetchMetric(userId, "hydration_level", start, date)
  const sodium = await fetchMetric(userId, "sodium_intake", start, date)

  const bloodPressureComponent = normalize(mean(systolic), 90, 160) * 0.6 + normalize(mean(diastolic), 60, 100) * 0.4
  const hydrationComponent = 1 - normalize(mean(hydration), 30, 100)
  const sodiumBalanceProxy = normalize(mean(sodium), 1000, 5000)

  const score = clamp(
    bloodPressureComponent * 40 + hydrationComponent * 30 + sodiumBalanceProxy * 30,
    0,
    100,
  )

  const level: AldosteroneProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(systolic.length, hydration.length) / 14, 0, 1)

  return { score, level, bloodPressureComponent, hydrationComponent, sodiumBalanceProxy, confidence }
}

// ---------------------------------------------------------------------------
// 12. Progesterone Proxy
// ---------------------------------------------------------------------------

export interface ProgesteroneProxyResult {
  score: number
  estimatedPhase: "low" | "rising" | "peak" | "declining"
  tempComponent: number
  sleepQualityComponent: number
  moodStabilityComponent: number
  confidence: number
}

export async function progesteroneProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ProgesteroneProxyResult> {
  const start = windowStart(date, 28)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const sleepQuality = await fetchMetric(userId, "sleep_quality", start, date)
  const mood = await fetchMetric(userId, "mood_score", start, date)

  const recentTemp = mean(temp.slice(-7))
  const baselineTemp = mean(temp.slice(0, 14))
  const tempComponent = normalize(recentTemp - baselineTemp, -0.2, 0.6)
  const sleepQualityComponent = normalize(mean(sleepQuality), 30, 90)
  const moodStabilityComponent = 1 - normalize(stddev(mood), 5, 30)

  const score = clamp(tempComponent * 45 + sleepQualityComponent * 30 + moodStabilityComponent * 25, 0, 100)

  let estimatedPhase: ProgesteroneProxyResult["estimatedPhase"] = "low"
  if (tempComponent > 0.7) estimatedPhase = "peak"
  else if (tempComponent > 0.4) estimatedPhase = "rising"
  else if (tempComponent > 0.2 && slope(temp.slice(-7)) < 0) estimatedPhase = "declining"

  const confidence = clamp(temp.length / 28, 0, 1)

  return { score, estimatedPhase, tempComponent, sleepQualityComponent, moodStabilityComponent, confidence }
}

// ---------------------------------------------------------------------------
// 13. Serotonin Proxy
// ---------------------------------------------------------------------------

export interface SerotoninProxyResult {
  score: number
  level: "low" | "normal" | "high"
  moodComponent: number
  sleepComponent: number
  activityComponent: number
  lightExposureComponent: number
  confidence: number
}

export async function serotoninProxy(
  userId: string,
  date: Date = new Date(),
): Promise<SerotoninProxyResult> {
  const start = windowStart(date, 14)
  const mood = await fetchMetric(userId, "mood_score", start, date)
  const sleep = await fetchMetric(userId, "sleep_quality", start, date)
  const steps = await fetchMetric(userId, "steps", start, date)
  const light = await fetchMetric(userId, "light_exposure_daytime", start, date)

  const moodComponent = normalize(mean(mood), 20, 90)
  const sleepComponent = normalize(mean(sleep), 30, 90)
  const activityComponent = normalize(mean(steps), 3000, 12000)
  const lightExposureComponent = normalize(mean(light), 100, 2000)

  const score = clamp(
    moodComponent * 30 + sleepComponent * 25 + activityComponent * 25 + lightExposureComponent * 20,
    0,
    100,
  )

  const level: SerotoninProxyResult["level"] =
    score < 35 ? "low" : score > 70 ? "high" : "normal"

  const confidence = clamp(Math.min(mood.length, sleep.length) / 14, 0, 1)

  return { score, level, moodComponent, sleepComponent, activityComponent, lightExposureComponent, confidence }
}

// ---------------------------------------------------------------------------
// 14. Dopamine Balance Proxy
// ---------------------------------------------------------------------------

export interface DopamineBalanceResult {
  score: number
  level: "depleted" | "low" | "balanced" | "elevated"
  motivationComponent: number
  rewardSensitivity: number
  focusComponent: number
  noveltySeekingComponent: number
  confidence: number
}

export async function dopamineBalanceProxy(
  userId: string,
  date: Date = new Date(),
): Promise<DopamineBalanceResult> {
  const start = windowStart(date, 14)
  const mood = await fetchMetric(userId, "mood_score", start, date)
  const energy = await fetchMetric(userId, "energy_level", start, date)
  const focus = await fetchMetric(userId, "focus_score", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)

  const motivationComponent = normalize(mean(energy), 20, 85)
  const rewardSensitivity = normalize(stddev(mood), 5, 25)
  const focusComponent = normalize(mean(focus), 20, 90)
  const noveltySeekingComponent = normalize(coefficientOfVariation(hrv), 0.05, 0.3)

  const score = clamp(
    motivationComponent * 30 + focusComponent * 30 + (1 - rewardSensitivity) * 20 + noveltySeekingComponent * 20,
    0,
    100,
  )

  let level: DopamineBalanceResult["level"] = "balanced"
  if (score < 20) level = "depleted"
  else if (score < 40) level = "low"
  else if (score > 80) level = "elevated"

  const confidence = clamp(Math.min(mood.length, energy.length) / 14, 0, 1)

  return { score, level, motivationComponent, rewardSensitivity, focusComponent, noveltySeekingComponent, confidence }
}

// ---------------------------------------------------------------------------
// 15. Thyroxine (T4) Proxy
// ---------------------------------------------------------------------------

export interface ThyroxineProxyResult {
  score: number
  level: "low" | "normal" | "high"
  metabolicComponent: number
  thermalComponent: number
  heartRateComponent: number
  confidence: number
}

export async function thyroxineProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ThyroxineProxyResult> {
  const start = windowStart(date, 14)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const calories = await fetchMetric(userId, "calories_burned", start, date)

  const metabolicComponent = normalize(mean(calories), 1200, 3000)
  const thermalComponent = normalize(mean(temp), 35.8, 37.5)
  const heartRateComponent = normalize(mean(rhr), 50, 95)

  const score = clamp(
    metabolicComponent * 35 + thermalComponent * 35 + heartRateComponent * 30,
    0,
    100,
  )

  const level: ThyroxineProxyResult["level"] =
    score < 35 ? "low" : score > 70 ? "high" : "normal"

  const confidence = clamp(Math.min(rhr.length, temp.length) / 14, 0, 1)

  return { score, level, metabolicComponent, thermalComponent, heartRateComponent, confidence }
}

// ---------------------------------------------------------------------------
// 16. Parathyroid Function Proxy
// ---------------------------------------------------------------------------

export interface ParathyroidFunctionResult {
  score: number
  status: "hypo" | "normal" | "hyper"
  calciumBalanceProxy: number
  muscleFunctionComponent: number
  boneDensityProxy: number
  confidence: number
}

export async function parathyroidFunctionProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ParathyroidFunctionResult> {
  const start = windowStart(date, 30)
  const calcium = await fetchMetric(userId, "calcium_intake", start, date)
  const vitaminD = await fetchMetric(userId, "vitamin_d_level", start, date)
  const muscleStrength = await fetchMetric(userId, "grip_strength", start, date)
  const cramps = await fetchMetric(userId, "muscle_cramp_frequency", start, date)

  const calciumBalanceProxy = normalize(mean(calcium), 400, 1200)
  const vitaminDFactor = normalize(mean(vitaminD), 10, 60)
  const muscleFunctionComponent = normalize(mean(muscleStrength), 20, 60)
  const crampPenalty = normalize(mean(cramps), 0, 5) * 0.2
  const boneDensityProxy = (calciumBalanceProxy * 0.5 + vitaminDFactor * 0.5)

  const score = clamp(
    calciumBalanceProxy * 30 + muscleFunctionComponent * 25 + boneDensityProxy * 30 - crampPenalty * 100 + 15,
    0,
    100,
  )

  const status: ParathyroidFunctionResult["status"] =
    score < 35 ? "hypo" : score > 70 ? "hyper" : "normal"

  const confidence = clamp(Math.min(calcium.length, vitaminD.length) / 14, 0, 1)

  return { score, status, calciumBalanceProxy, muscleFunctionComponent, boneDensityProxy, confidence }
}

// ---------------------------------------------------------------------------
// 17. Epinephrine Response Proxy
// ---------------------------------------------------------------------------

export interface EpinephrineResponseResult {
  score: number
  reactivity: "blunted" | "normal" | "heightened"
  acuteHrResponse: number
  respiratoryComponent: number
  galvanicSkinProxy: number
  recoveryRate: number
  confidence: number
}

export async function epinephrineResponseProxy(
  userId: string,
  date: Date = new Date(),
): Promise<EpinephrineResponseResult> {
  const start = windowStart(date, 7)
  const hrMax = await fetchMetric(userId, "heart_rate_max", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const respRate = await fetchMetric(userId, "respiratory_rate", start, date)
  const eda = await fetchMetric(userId, "electrodermal_activity", start, date)
  const recoveryHr = await fetchMetric(userId, "heart_rate_recovery", start, date)

  const acuteHrResponse = normalize(mean(hrMax) - mean(rhr), 30, 120)
  const respiratoryComponent = normalize(mean(respRate), 12, 25)
  const galvanicSkinProxy = normalize(mean(eda), 1, 20)
  const recoveryRate = normalize(mean(recoveryHr), 10, 50)

  const score = clamp(
    acuteHrResponse * 30 + respiratoryComponent * 20 + galvanicSkinProxy * 25 + recoveryRate * 25,
    0,
    100,
  )

  const reactivity: EpinephrineResponseResult["reactivity"] =
    score < 30 ? "blunted" : score > 70 ? "heightened" : "normal"

  const confidence = clamp(Math.min(hrMax.length, rhr.length) / 7, 0, 1)

  return { score, reactivity, acuteHrResponse, respiratoryComponent, galvanicSkinProxy, recoveryRate, confidence }
}

// ---------------------------------------------------------------------------
// 18. Adrenal Fatigue Proxy
// ---------------------------------------------------------------------------

export interface AdrenalFatigueResult {
  score: number
  stage: "healthy" | "alarm" | "resistance" | "exhaustion"
  morningEnergyComponent: number
  afternoonCrashComponent: number
  recoveryComponent: number
  stressAccumulationComponent: number
  confidence: number
}

export async function adrenalFatigueProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AdrenalFatigueResult> {
  const start = windowStart(date, 30)
  const energy = await fetchMetric(userId, "energy_level", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)
  const sleep = await fetchMetric(userId, "sleep_quality", start, date)

  const morningEnergyComponent = 1 - normalize(mean(energy.slice(-7)), 30, 80)
  const afternoonCrashComponent = normalize(stddev(energy), 10, 30)
  const recoveryComponent = 1 - normalize(mean(hrv), 20, 70)
  const stressAccumulationComponent = normalize(mean(stress), 30, 80)

  const score = clamp(
    morningEnergyComponent * 25 + afternoonCrashComponent * 25 + recoveryComponent * 25 + stressAccumulationComponent * 25,
    0,
    100,
  )

  let stage: AdrenalFatigueResult["stage"] = "healthy"
  if (score > 75) stage = "exhaustion"
  else if (score > 55) stage = "resistance"
  else if (score > 35) stage = "alarm"

  const confidence = clamp(Math.min(energy.length, stress.length) / 21, 0, 1)

  return { score, stage, morningEnergyComponent, afternoonCrashComponent, recoveryComponent, stressAccumulationComponent, confidence }
}

// ---------------------------------------------------------------------------
// 19. Endorphin Proxy
// ---------------------------------------------------------------------------

export interface EndorphinProxyResult {
  score: number
  level: "low" | "moderate" | "high" | "runners_high"
  exerciseDurationComponent: number
  exerciseIntensityComponent: number
  moodLiftComponent: number
  painToleranceProxy: number
  confidence: number
}

export async function endorphinProxy(
  userId: string,
  date: Date = new Date(),
): Promise<EndorphinProxyResult> {
  const start = windowStart(date, 7)
  const activeMins = await fetchMetric(userId, "active_minutes_high", start, date)
  const totalActive = await fetchMetric(userId, "active_minutes_total", start, date)
  const mood = await fetchMetric(userId, "mood_score", start, date)
  const painLevel = await fetchMetric(userId, "pain_level", start, date)

  const exerciseDurationComponent = normalize(mean(totalActive), 10, 90)
  const exerciseIntensityComponent = normalize(mean(activeMins), 0, 45)
  const moodLiftComponent = normalize(mean(mood), 30, 90)
  const painToleranceProxy = 1 - normalize(mean(painLevel), 0, 10)

  const score = clamp(
    exerciseDurationComponent * 25 + exerciseIntensityComponent * 30 + moodLiftComponent * 25 + painToleranceProxy * 20,
    0,
    100,
  )

  let level: EndorphinProxyResult["level"] = "moderate"
  if (score < 25) level = "low"
  else if (score > 85) level = "runners_high"
  else if (score > 60) level = "high"

  const confidence = clamp(Math.min(activeMins.length, mood.length) / 7, 0, 1)

  return { score, level, exerciseDurationComponent, exerciseIntensityComponent, moodLiftComponent, painToleranceProxy, confidence }
}

// ---------------------------------------------------------------------------
// 20. Oxytocin Proxy
// ---------------------------------------------------------------------------

export interface OxytocinProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  socialInteractionComponent: number
  stressReductionComponent: number
  heartRateCalm: number
  touchInteractionProxy: number
  confidence: number
}

export async function oxytocinProxy(
  userId: string,
  date: Date = new Date(),
): Promise<OxytocinProxyResult> {
  const start = windowStart(date, 14)
  const social = await fetchMetric(userId, "social_interaction_minutes", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)

  const socialInteractionComponent = normalize(mean(social), 10, 180)
  const stressReductionComponent = 1 - normalize(mean(stress), 20, 80)
  const heartRateCalm = 1 - normalize(mean(rhr), 50, 90)
  const touchInteractionProxy = normalize(mean(hrv), 25, 75) * socialInteractionComponent

  const score = clamp(
    socialInteractionComponent * 35 + stressReductionComponent * 25 + heartRateCalm * 20 + touchInteractionProxy * 20,
    0,
    100,
  )

  const level: OxytocinProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(social.length, stress.length) / 14, 0, 1)

  return { score, level, socialInteractionComponent, stressReductionComponent, heartRateCalm, touchInteractionProxy, confidence }
}

// ---------------------------------------------------------------------------
// 21. Prolactin Proxy
// ---------------------------------------------------------------------------

export interface ProlactinProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  sleepComponent: number
  stressComponent: number
  exerciseRecoveryComponent: number
  reproductiveProxy: number
  confidence: number
}

export async function prolactinProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ProlactinProxyResult> {
  const start = windowStart(date, 14)
  const sleepDuration = await fetchMetric(userId, "sleep_duration", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)

  const sleepComponent = normalize(mean(sleepDuration), 5, 10)
  const stressComponent = normalize(mean(stress), 20, 80)
  const exerciseRecoveryComponent = 1 - normalize(mean(rhr), 50, 85)
  const reproductiveProxy = normalize(mean(temp), 36.0, 37.5)

  const score = clamp(
    sleepComponent * 30 + stressComponent * 30 + exerciseRecoveryComponent * 20 + reproductiveProxy * 20,
    0,
    100,
  )

  const level: ProlactinProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(sleepDuration.length, stress.length) / 14, 0, 1)

  return { score, level, sleepComponent, stressComponent, exerciseRecoveryComponent, reproductiveProxy, confidence }
}

// ---------------------------------------------------------------------------
// 22. DHEA Proxy
// ---------------------------------------------------------------------------

export interface DHEAProxyResult {
  score: number
  level: "low" | "normal" | "optimal"
  recoveryComponent: number
  sleepQualityComponent: number
  stressBufferComponent: number
  activityComponent: number
  confidence: number
}

export async function dheaProxy(
  userId: string,
  date: Date = new Date(),
): Promise<DHEAProxyResult> {
  const start = windowStart(date, 14)
  const hrv = await fetchMetric(userId, "hrv", start, date)
  const sleepQuality = await fetchMetric(userId, "sleep_quality", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const steps = await fetchMetric(userId, "steps", start, date)

  const recoveryComponent = normalize(mean(hrv), 20, 75)
  const sleepQualityComponent = normalize(mean(sleepQuality), 30, 90)
  const stressBufferComponent = 1 - normalize(mean(stress), 25, 75)
  const activityComponent = normalize(mean(steps), 4000, 12000)

  const score = clamp(
    recoveryComponent * 30 + sleepQualityComponent * 25 + stressBufferComponent * 25 + activityComponent * 20,
    0,
    100,
  )

  const level: DHEAProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "optimal" : "normal"

  const confidence = clamp(Math.min(hrv.length, sleepQuality.length) / 14, 0, 1)

  return { score, level, recoveryComponent, sleepQualityComponent, stressBufferComponent, activityComponent, confidence }
}

// ---------------------------------------------------------------------------
// 23. Cortisone Proxy
// ---------------------------------------------------------------------------

export interface CortisoneProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  inflammationProxy: number
  stressChronicity: number
  recoveryDeficit: number
  immuneActivityProxy: number
  confidence: number
}

export async function cortisoneProxy(
  userId: string,
  date: Date = new Date(),
): Promise<CortisoneProxyResult> {
  const start = windowStart(date, 21)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)

  const inflammationProxy = normalize(mean(temp) - 36.5, -0.5, 1.0)
  const stressChronicity = normalize(mean(stress), 30, 75)
  const recoveryDeficit = 1 - normalize(mean(hrv), 25, 70)
  const immuneActivityProxy = normalize(mean(rhr), 55, 90) * 0.5 + inflammationProxy * 0.5

  const score = clamp(
    inflammationProxy * 25 + stressChronicity * 30 + recoveryDeficit * 25 + immuneActivityProxy * 20,
    0,
    100,
  )

  const level: CortisoneProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(stress.length, hrv.length) / 14, 0, 1)

  return { score, level, inflammationProxy, stressChronicity, recoveryDeficit, immuneActivityProxy, confidence }
}

// ---------------------------------------------------------------------------
// 24. Renin-Angiotensin Proxy
// ---------------------------------------------------------------------------

export interface ReninAngiotensinProxyResult {
  score: number
  status: "low_activity" | "normal" | "high_activity"
  bloodPressureComponent: number
  hydrationComponent: number
  sodiumPotassiumRatio: number
  cardiovascularStrain: number
  confidence: number
}

export async function reninAngiotensinProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ReninAngiotensinProxyResult> {
  const start = windowStart(date, 14)
  const systolic = await fetchMetric(userId, "blood_pressure_systolic", start, date)
  const diastolic = await fetchMetric(userId, "blood_pressure_diastolic", start, date)
  const hydration = await fetchMetric(userId, "hydration_level", start, date)
  const sodium = await fetchMetric(userId, "sodium_intake", start, date)
  const potassium = await fetchMetric(userId, "potassium_intake", start, date)

  const bloodPressureComponent = normalize(
    mean(systolic) * 0.6 + mean(diastolic) * 0.4,
    80,
    160,
  )
  const hydrationComponent = 1 - normalize(mean(hydration), 40, 100)
  const avgSodium = mean(sodium) || 2300
  const avgPotassium = mean(potassium) || 3500
  const sodiumPotassiumRatio = normalize(avgSodium / avgPotassium, 0.3, 1.5)
  const cardiovascularStrain = (bloodPressureComponent + sodiumPotassiumRatio) / 2

  const score = clamp(
    bloodPressureComponent * 35 + hydrationComponent * 25 + sodiumPotassiumRatio * 20 + cardiovascularStrain * 20,
    0,
    100,
  )

  const status: ReninAngiotensinProxyResult["status"] =
    score < 30 ? "low_activity" : score > 65 ? "high_activity" : "normal"

  const confidence = clamp(Math.min(systolic.length, hydration.length) / 14, 0, 1)

  return { score, status, bloodPressureComponent, hydrationComponent, sodiumPotassiumRatio, cardiovascularStrain, confidence }
}

// ---------------------------------------------------------------------------
// 25. Calcitonin Proxy
// ---------------------------------------------------------------------------

export interface CalcitoninProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  calciumIntakeComponent: number
  boneLoadComponent: number
  thyroidLinkProxy: number
  confidence: number
}

export async function calcitoninProxy(
  userId: string,
  date: Date = new Date(),
): Promise<CalcitoninProxyResult> {
  const start = windowStart(date, 30)
  const calcium = await fetchMetric(userId, "calcium_intake", start, date)
  const steps = await fetchMetric(userId, "steps", start, date)
  const activeHigh = await fetchMetric(userId, "active_minutes_high", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)

  const calciumIntakeComponent = normalize(mean(calcium), 300, 1200)
  const boneLoadComponent = normalize(mean(steps) * 0.6 + mean(activeHigh) * 50, 2000, 15000)
  const thyroidLinkProxy = normalize(mean(rhr), 55, 85)

  const score = clamp(
    calciumIntakeComponent * 40 + boneLoadComponent * 35 + thyroidLinkProxy * 25,
    0,
    100,
  )

  const level: CalcitoninProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(calcium.length, steps.length) / 21, 0, 1)

  return { score, level, calciumIntakeComponent, boneLoadComponent, thyroidLinkProxy, confidence }
}

// ---------------------------------------------------------------------------
// 26. Erythropoietin (EPO) Proxy
// ---------------------------------------------------------------------------

export interface ErythropoietinProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  vo2MaxProxy: number
  enduranceComponent: number
  oxygenSaturationComponent: number
  altitudeProxy: number
  confidence: number
}

export async function erythropoietinProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ErythropoietinProxyResult> {
  const start = windowStart(date, 14)
  const vo2 = await fetchMetric(userId, "vo2_max", start, date)
  const activeTotal = await fetchMetric(userId, "active_minutes_total", start, date)
  const spo2 = await fetchMetric(userId, "spo2", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)

  const vo2MaxProxy = normalize(mean(vo2), 25, 60)
  const enduranceComponent = normalize(mean(activeTotal), 15, 90)
  const oxygenSaturationComponent = 1 - normalize(mean(spo2), 90, 100)
  const altitudeProxy = oxygenSaturationComponent * 0.5

  const score = clamp(
    vo2MaxProxy * 30 + enduranceComponent * 30 + oxygenSaturationComponent * 25 + altitudeProxy * 15,
    0,
    100,
  )

  const level: ErythropoietinProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(vo2.length, spo2.length) / 14, 0, 1)

  return { score, level, vo2MaxProxy, enduranceComponent, oxygenSaturationComponent, altitudeProxy, confidence }
}

// ---------------------------------------------------------------------------
// 27. Glucagon Proxy
// ---------------------------------------------------------------------------

export interface GlucagonProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  fastingComponent: number
  glucoseComponent: number
  exerciseComponent: number
  proteinIntakeComponent: number
  confidence: number
}

export async function glucagonProxy(
  userId: string,
  date: Date = new Date(),
): Promise<GlucagonProxyResult> {
  const start = windowStart(date, 14)
  const glucose = await fetchMetric(userId, "blood_glucose", start, date)
  const calories = await fetchMetric(userId, "calories_consumed", start, date)
  const activeHigh = await fetchMetric(userId, "active_minutes_high", start, date)
  const protein = await fetchMetric(userId, "protein_intake", start, date)

  const fastingComponent = 1 - normalize(mean(calories), 1200, 3000)
  const glucoseComponent = 1 - normalize(mean(glucose), 70, 140)
  const exerciseComponent = normalize(mean(activeHigh), 0, 45)
  const proteinIntakeComponent = normalize(mean(protein), 30, 150)

  const score = clamp(
    fastingComponent * 30 + glucoseComponent * 30 + exerciseComponent * 20 + proteinIntakeComponent * 20,
    0,
    100,
  )

  const level: GlucagonProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(glucose.length, calories.length) / 14, 0, 1)

  return { score, level, fastingComponent, glucoseComponent, exerciseComponent, proteinIntakeComponent, confidence }
}

// ---------------------------------------------------------------------------
// 28. Vasopressin (ADH) Proxy
// ---------------------------------------------------------------------------

export interface VasopressinProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  hydrationComponent: number
  osmolalityProxy: number
  bloodPressureComponent: number
  exerciseDehydrationFactor: number
  confidence: number
}

export async function vasopressinProxy(
  userId: string,
  date: Date = new Date(),
): Promise<VasopressinProxyResult> {
  const start = windowStart(date, 7)
  const hydration = await fetchMetric(userId, "hydration_level", start, date)
  const sodium = await fetchMetric(userId, "sodium_intake", start, date)
  const systolic = await fetchMetric(userId, "blood_pressure_systolic", start, date)
  const activeTotal = await fetchMetric(userId, "active_minutes_total", start, date)

  const hydrationComponent = 1 - normalize(mean(hydration), 40, 100)
  const osmolalityProxy = normalize(mean(sodium), 1500, 5000)
  const bloodPressureComponent = 1 - normalize(mean(systolic), 100, 150)
  const exerciseDehydrationFactor = normalize(mean(activeTotal), 20, 90) * hydrationComponent

  const score = clamp(
    hydrationComponent * 35 + osmolalityProxy * 25 + bloodPressureComponent * 20 + exerciseDehydrationFactor * 20,
    0,
    100,
  )

  const level: VasopressinProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(hydration.length, sodium.length) / 7, 0, 1)

  return { score, level, hydrationComponent, osmolalityProxy, bloodPressureComponent, exerciseDehydrationFactor, confidence }
}

// ---------------------------------------------------------------------------
// 29. Prostaglandin Proxy
// ---------------------------------------------------------------------------

export interface ProstaglandinProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  inflammationComponent: number
  painComponent: number
  temperatureComponent: number
  recoveryStateComponent: number
  confidence: number
}

export async function prostaglandinProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ProstaglandinProxyResult> {
  const start = windowStart(date, 7)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const pain = await fetchMetric(userId, "pain_level", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)

  const inflammationComponent = normalize(mean(temp) - 36.5, -0.3, 1.0)
  const painComponent = normalize(mean(pain), 0, 8)
  const temperatureComponent = normalize(mean(temp), 36.0, 38.0)
  const recoveryStateComponent = 1 - normalize(mean(hrv), 25, 70)

  const score = clamp(
    inflammationComponent * 30 + painComponent * 30 + temperatureComponent * 20 + recoveryStateComponent * 20,
    0,
    100,
  )

  const level: ProstaglandinProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(temp.length, pain.length) / 7, 0, 1)

  return { score, level, inflammationComponent, painComponent, temperatureComponent, recoveryStateComponent, confidence }
}

// ---------------------------------------------------------------------------
// 30. Norepinephrine Proxy
// ---------------------------------------------------------------------------

export interface NorepinephrineProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  sympatheticTone: number
  bloodPressureComponent: number
  alertnessProxy: number
  coldExposureProxy: number
  confidence: number
}

export async function norepinephrineProxy(
  userId: string,
  date: Date = new Date(),
): Promise<NorepinephrineProxyResult> {
  const start = windowStart(date, 7)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const systolic = await fetchMetric(userId, "blood_pressure_systolic", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)

  const sympatheticTone = normalize(mean(rhr), 50, 90)
  const bloodPressureComponent = normalize(mean(systolic), 100, 150)
  const alertnessProxy = normalize(mean(stress), 20, 70)
  const coldExposureProxy = 1 - normalize(mean(temp), 35.5, 37.0)

  const score = clamp(
    sympatheticTone * 30 + bloodPressureComponent * 25 + alertnessProxy * 25 + coldExposureProxy * 20,
    0,
    100,
  )

  const level: NorepinephrineProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(rhr.length, systolic.length) / 7, 0, 1)

  return { score, level, sympatheticTone, bloodPressureComponent, alertnessProxy, coldExposureProxy, confidence }
}

// ---------------------------------------------------------------------------
// 31. Histamine Response Proxy
// ---------------------------------------------------------------------------

export interface HistamineResponseResult {
  score: number
  level: "low" | "normal" | "elevated" | "reactive"
  inflammationComponent: number
  skinReactivityProxy: number
  respiratoryComponent: number
  digestiveProxy: number
  confidence: number
}

export async function histamineResponseProxy(
  userId: string,
  date: Date = new Date(),
): Promise<HistamineResponseResult> {
  const start = windowStart(date, 14)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const respRate = await fetchMetric(userId, "respiratory_rate", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const sleepQuality = await fetchMetric(userId, "sleep_quality", start, date)

  const inflammationComponent = normalize(mean(temp) - 36.5, -0.2, 0.8)
  const skinReactivityProxy = normalize(stddev(temp), 0.1, 0.6)
  const respiratoryComponent = normalize(mean(respRate), 14, 22)
  const digestiveProxy = 1 - normalize(mean(sleepQuality), 40, 85)

  const score = clamp(
    inflammationComponent * 30 + skinReactivityProxy * 25 + respiratoryComponent * 25 + digestiveProxy * 20,
    0,
    100,
  )

  let level: HistamineResponseResult["level"] = "normal"
  if (score < 25) level = "low"
  else if (score > 80) level = "reactive"
  else if (score > 60) level = "elevated"

  const confidence = clamp(Math.min(temp.length, respRate.length) / 14, 0, 1)

  return { score, level, inflammationComponent, skinReactivityProxy, respiratoryComponent, digestiveProxy, confidence }
}

// ---------------------------------------------------------------------------
// 32. Acetylcholine Proxy
// ---------------------------------------------------------------------------

export interface AcetylcholineProxyResult {
  score: number
  level: "low" | "normal" | "high"
  cognitiveComponent: number
  parasympatheticTone: number
  muscleFunctionComponent: number
  memoryProxy: number
  confidence: number
}

export async function acetylcholineProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AcetylcholineProxyResult> {
  const start = windowStart(date, 14)
  const hrv = await fetchMetric(userId, "hrv", start, date)
  const focus = await fetchMetric(userId, "focus_score", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const sleepQuality = await fetchMetric(userId, "sleep_quality", start, date)

  const parasympatheticTone = normalize(mean(hrv), 25, 75)
  const cognitiveComponent = normalize(mean(focus), 25, 85)
  const muscleFunctionComponent = 1 - normalize(mean(rhr), 50, 85)
  const memoryProxy = normalize(mean(sleepQuality), 35, 90)

  const score = clamp(
    parasympatheticTone * 30 + cognitiveComponent * 30 + muscleFunctionComponent * 20 + memoryProxy * 20,
    0,
    100,
  )

  const level: AcetylcholineProxyResult["level"] =
    score < 35 ? "low" : score > 70 ? "high" : "normal"

  const confidence = clamp(Math.min(hrv.length, focus.length) / 14, 0, 1)

  return { score, level, cognitiveComponent, parasympatheticTone, muscleFunctionComponent, memoryProxy, confidence }
}

// ---------------------------------------------------------------------------
// 33. GABA Proxy
// ---------------------------------------------------------------------------

export interface GABAProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  calmComponent: number
  sleepOnsetComponent: number
  anxietyInverse: number
  muscleRelaxationProxy: number
  confidence: number
}

export async function gabaProxy(
  userId: string,
  date: Date = new Date(),
): Promise<GABAProxyResult> {
  const start = windowStart(date, 14)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const sleepOnset = await fetchMetric(userId, "sleep_onset_latency", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)

  const calmComponent = 1 - normalize(mean(stress), 20, 75)
  const sleepOnsetComponent = 1 - normalize(mean(sleepOnset), 5, 45)
  const anxietyInverse = normalize(mean(hrv), 25, 70)
  const muscleRelaxationProxy = 1 - normalize(mean(rhr), 50, 85)

  const score = clamp(
    calmComponent * 30 + sleepOnsetComponent * 25 + anxietyInverse * 25 + muscleRelaxationProxy * 20,
    0,
    100,
  )

  const level: GABAProxyResult["level"] =
    score < 35 ? "low" : score > 70 ? "elevated" : "normal"

  const confidence = clamp(Math.min(stress.length, hrv.length) / 14, 0, 1)

  return { score, level, calmComponent, sleepOnsetComponent, anxietyInverse, muscleRelaxationProxy, confidence }
}

// ---------------------------------------------------------------------------
// 34. Glutamate Proxy
// ---------------------------------------------------------------------------

export interface GlutamateProxyResult {
  score: number
  level: "low" | "balanced" | "excitatory"
  neuralExcitability: number
  stressActivation: number
  sleepDisruptionProxy: number
  focusIntensity: number
  confidence: number
}

export async function glutamateProxy(
  userId: string,
  date: Date = new Date(),
): Promise<GlutamateProxyResult> {
  const start = windowStart(date, 14)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const sleepQuality = await fetchMetric(userId, "sleep_quality", start, date)
  const focus = await fetchMetric(userId, "focus_score", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)

  const neuralExcitability = normalize(mean(rhr), 55, 90)
  const stressActivation = normalize(mean(stress), 25, 75)
  const sleepDisruptionProxy = 1 - normalize(mean(sleepQuality), 35, 85)
  const focusIntensity = normalize(mean(focus), 30, 90)

  const score = clamp(
    neuralExcitability * 25 + stressActivation * 30 + sleepDisruptionProxy * 25 + focusIntensity * 20,
    0,
    100,
  )

  let level: GlutamateProxyResult["level"] = "balanced"
  if (score < 30) level = "low"
  else if (score > 65) level = "excitatory"

  const confidence = clamp(Math.min(stress.length, sleepQuality.length) / 14, 0, 1)

  return { score, level, neuralExcitability, stressActivation, sleepDisruptionProxy, focusIntensity, confidence }
}

// ---------------------------------------------------------------------------
// 35. Substance P Proxy
// ---------------------------------------------------------------------------

export interface SubstancePProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  painSensitivity: number
  inflammatoryLoad: number
  stressNeurogenic: number
  moodComponent: number
  confidence: number
}

export async function substancePProxy(
  userId: string,
  date: Date = new Date(),
): Promise<SubstancePProxyResult> {
  const start = windowStart(date, 14)
  const pain = await fetchMetric(userId, "pain_level", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const mood = await fetchMetric(userId, "mood_score", start, date)

  const painSensitivity = normalize(mean(pain), 0, 8)
  const inflammatoryLoad = normalize(mean(temp) - 36.5, -0.2, 0.8)
  const stressNeurogenic = normalize(mean(stress), 25, 75)
  const moodComponent = 1 - normalize(mean(mood), 30, 85)

  const score = clamp(
    painSensitivity * 35 + inflammatoryLoad * 20 + stressNeurogenic * 25 + moodComponent * 20,
    0,
    100,
  )

  const level: SubstancePProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(pain.length, stress.length) / 14, 0, 1)

  return { score, level, painSensitivity, inflammatoryLoad, stressNeurogenic, moodComponent, confidence }
}

// ---------------------------------------------------------------------------
// 36. Neuropeptide Y Proxy
// ---------------------------------------------------------------------------

export interface NeuropeptideYProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  stressResilienceComponent: number
  appetiteComponent: number
  anxiolyticProxy: number
  energyRegulation: number
  confidence: number
}

export async function neuropeptideYProxy(
  userId: string,
  date: Date = new Date(),
): Promise<NeuropeptideYProxyResult> {
  const start = windowStart(date, 14)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const calories = await fetchMetric(userId, "calories_consumed", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)
  const energy = await fetchMetric(userId, "energy_level", start, date)

  const stressResilienceComponent = normalize(mean(hrv), 20, 70) * (1 - normalize(mean(stress), 30, 80))
  const appetiteComponent = normalize(mean(calories), 1500, 3500)
  const anxiolyticProxy = 1 - normalize(stddev(stress), 5, 25)
  const energyRegulation = normalize(mean(energy), 25, 80)

  const score = clamp(
    stressResilienceComponent * 100 * 0.3 + appetiteComponent * 25 + anxiolyticProxy * 25 + energyRegulation * 20,
    0,
    100,
  )

  const level: NeuropeptideYProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(stress.length, hrv.length) / 14, 0, 1)

  return { score, level, stressResilienceComponent, appetiteComponent, anxiolyticProxy, energyRegulation, confidence }
}

// ---------------------------------------------------------------------------
// 37. Adiponectin Proxy
// ---------------------------------------------------------------------------

export interface AdiponectinProxyResult {
  score: number
  level: "low" | "normal" | "optimal"
  insulinSensitivityComponent: number
  antiInflammatoryComponent: number
  activityComponent: number
  bodyCompositionProxy: number
  confidence: number
}

export async function adiponectinProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AdiponectinProxyResult> {
  const start = windowStart(date, 30)
  const glucose = await fetchMetric(userId, "blood_glucose", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const steps = await fetchMetric(userId, "steps", start, date)
  const weight = await fetchMetric(userId, "weight", start, date)

  const insulinSensitivityComponent = 1 - normalize(coefficientOfVariation(glucose), 0.05, 0.25)
  const antiInflammatoryComponent = 1 - normalize(mean(temp) - 36.5, -0.2, 0.6)
  const activityComponent = normalize(mean(steps), 4000, 12000)
  const weightTrend = slope(weight)
  const bodyCompositionProxy = clamp(1 - normalize(weightTrend, -0.5, 0.5), 0, 1)

  const score = clamp(
    insulinSensitivityComponent * 30 + antiInflammatoryComponent * 25 + activityComponent * 25 + bodyCompositionProxy * 20,
    0,
    100,
  )

  const level: AdiponectinProxyResult["level"] =
    score < 35 ? "low" : score > 70 ? "optimal" : "normal"

  const confidence = clamp(Math.min(glucose.length, steps.length) / 21, 0, 1)

  return { score, level, insulinSensitivityComponent, antiInflammatoryComponent, activityComponent, bodyCompositionProxy, confidence }
}

// ---------------------------------------------------------------------------
// 38. Resistin Proxy
// ---------------------------------------------------------------------------

export interface ResistinProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  inflammationComponent: number
  insulinResistanceProxy: number
  adiposityComponent: number
  sedentaryComponent: number
  confidence: number
}

export async function resistinProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ResistinProxyResult> {
  const start = windowStart(date, 14)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const glucose = await fetchMetric(userId, "blood_glucose", start, date)
  const weight = await fetchMetric(userId, "weight", start, date)
  const steps = await fetchMetric(userId, "steps", start, date)

  const inflammationComponent = normalize(mean(temp) - 36.5, -0.2, 0.7)
  const insulinResistanceProxy = normalize(coefficientOfVariation(glucose), 0.05, 0.25)
  const adiposityComponent = normalize(slope(weight), -0.2, 0.5)
  const sedentaryComponent = 1 - normalize(mean(steps), 3000, 10000)

  const score = clamp(
    inflammationComponent * 25 + insulinResistanceProxy * 30 + adiposityComponent * 25 + sedentaryComponent * 20,
    0,
    100,
  )

  const level: ResistinProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(glucose.length, steps.length) / 14, 0, 1)

  return { score, level, inflammationComponent, insulinResistanceProxy, adiposityComponent, sedentaryComponent, confidence }
}

// ---------------------------------------------------------------------------
// 39. Irisin Proxy
// ---------------------------------------------------------------------------

export interface IrisinProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  exerciseComponent: number
  muscleMassProxy: number
  metabolicBenefit: number
  browningFatProxy: number
  confidence: number
}

export async function irisinProxy(
  userId: string,
  date: Date = new Date(),
): Promise<IrisinProxyResult> {
  const start = windowStart(date, 14)
  const activeHigh = await fetchMetric(userId, "active_minutes_high", start, date)
  const activeTotal = await fetchMetric(userId, "active_minutes_total", start, date)
  const calories = await fetchMetric(userId, "calories_burned", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)

  const exerciseComponent = normalize(mean(activeHigh), 0, 50)
  const muscleMassProxy = normalize(mean(activeTotal), 20, 90)
  const metabolicBenefit = normalize(mean(calories), 1500, 3500)
  // Irisin promotes thermogenesis through browning of white fat
  const browningFatProxy = exerciseComponent * normalize(mean(temp), 36.2, 37.2)

  const score = clamp(
    exerciseComponent * 35 + muscleMassProxy * 25 + metabolicBenefit * 20 + browningFatProxy * 20,
    0,
    100,
  )

  const level: IrisinProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(activeHigh.length, activeTotal.length) / 14, 0, 1)

  return { score, level, exerciseComponent, muscleMassProxy, metabolicBenefit, browningFatProxy, confidence }
}

// ---------------------------------------------------------------------------
// 40. FGF21 Proxy
// ---------------------------------------------------------------------------

export interface FGF21ProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  fastingComponent: number
  exerciseStressComponent: number
  metabolicFlexibility: number
  liverStressProxy: number
  confidence: number
}

export async function fgf21Proxy(
  userId: string,
  date: Date = new Date(),
): Promise<FGF21ProxyResult> {
  const start = windowStart(date, 14)
  const calories = await fetchMetric(userId, "calories_consumed", start, date)
  const activeHigh = await fetchMetric(userId, "active_minutes_high", start, date)
  const glucose = await fetchMetric(userId, "blood_glucose", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)

  const fastingComponent = 1 - normalize(mean(calories), 1200, 2800)
  const exerciseStressComponent = normalize(mean(activeHigh), 0, 50)
  const metabolicFlexibility = 1 - normalize(coefficientOfVariation(glucose), 0.03, 0.2)
  const liverStressProxy = normalize(mean(rhr), 55, 85) * fastingComponent

  const score = clamp(
    fastingComponent * 30 + exerciseStressComponent * 25 + metabolicFlexibility * 25 + liverStressProxy * 20,
    0,
    100,
  )

  const level: FGF21ProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(calories.length, glucose.length) / 14, 0, 1)

  return { score, level, fastingComponent, exerciseStressComponent, metabolicFlexibility, liverStressProxy, confidence }
}

// ---------------------------------------------------------------------------
// 41. GLP-1 Proxy
// ---------------------------------------------------------------------------

export interface GLP1ProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  postprandialGlucoseControl: number
  satietyComponent: number
  gutMotilityProxy: number
  insulinSecretionProxy: number
  confidence: number
}

export async function glp1Proxy(
  userId: string,
  date: Date = new Date(),
): Promise<GLP1ProxyResult> {
  const start = windowStart(date, 14)
  const glucose = await fetchMetric(userId, "blood_glucose", start, date)
  const calories = await fetchMetric(userId, "calories_consumed", start, date)
  const fiber = await fetchMetric(userId, "fiber_intake", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)

  const postprandialGlucoseControl = 1 - normalize(stddev(glucose), 5, 30)
  const satietyComponent = 1 - normalize(mean(calories), 1500, 3500)
  const gutMotilityProxy = normalize(mean(fiber), 10, 40)
  const insulinSecretionProxy = 1 - normalize(mean(glucose), 80, 140)

  const score = clamp(
    postprandialGlucoseControl * 30 + satietyComponent * 25 + gutMotilityProxy * 25 + insulinSecretionProxy * 20,
    0,
    100,
  )

  const level: GLP1ProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(glucose.length, fiber.length) / 14, 0, 1)

  return { score, level, postprandialGlucoseControl, satietyComponent, gutMotilityProxy, insulinSecretionProxy, confidence }
}

// ---------------------------------------------------------------------------
// 42. IGF-1 Proxy
// ---------------------------------------------------------------------------

export interface IGF1ProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  growthHormoneLink: number
  proteinComponent: number
  exerciseComponent: number
  sleepComponent: number
  confidence: number
}

export async function igf1Proxy(
  userId: string,
  date: Date = new Date(),
): Promise<IGF1ProxyResult> {
  const start = windowStart(date, 14)
  const deepSleep = await fetchMetric(userId, "deep_sleep_duration", start, date)
  const protein = await fetchMetric(userId, "protein_intake", start, date)
  const activeHigh = await fetchMetric(userId, "active_minutes_high", start, date)
  const calories = await fetchMetric(userId, "calories_consumed", start, date)

  const sleepComponent = normalize(mean(deepSleep), 20, 120)
  const proteinComponent = normalize(mean(protein), 40, 150)
  const exerciseComponent = normalize(mean(activeHigh), 0, 45)
  const growthHormoneLink = sleepComponent * 0.5 + exerciseComponent * 0.3 + (1 - normalize(mean(calories), 1200, 3000)) * 0.2

  const score = clamp(
    growthHormoneLink * 30 + proteinComponent * 25 + exerciseComponent * 25 + sleepComponent * 20,
    0,
    100,
  )

  const level: IGF1ProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(Math.min(deepSleep.length, protein.length) / 14, 0, 1)

  return { score, level, growthHormoneLink, proteinComponent, exerciseComponent, sleepComponent, confidence }
}

// ---------------------------------------------------------------------------
// 43. SHBG Proxy
// ---------------------------------------------------------------------------

export interface SHBGProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  insulinSensitivityLink: number
  liverFunctionProxy: number
  bodyCompositionComponent: number
  thyroidLink: number
  confidence: number
}

export async function shbgProxy(
  userId: string,
  date: Date = new Date(),
): Promise<SHBGProxyResult> {
  const start = windowStart(date, 30)
  const glucose = await fetchMetric(userId, "blood_glucose", start, date)
  const weight = await fetchMetric(userId, "weight", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)

  // SHBG is positively associated with insulin sensitivity
  const insulinSensitivityLink = 1 - normalize(coefficientOfVariation(glucose), 0.05, 0.2)
  const liverFunctionProxy = 1 - normalize(mean(rhr), 55, 90)
  const weightSlope = slope(weight)
  const bodyCompositionComponent = 1 - normalize(weightSlope, -0.3, 0.5)
  const thyroidLink = normalize(mean(temp), 36.0, 37.2)

  const score = clamp(
    insulinSensitivityLink * 30 + liverFunctionProxy * 25 + bodyCompositionComponent * 25 + thyroidLink * 20,
    0,
    100,
  )

  const level: SHBGProxyResult["level"] =
    score < 30 ? "low" : score > 70 ? "elevated" : "normal"

  const confidence = clamp(Math.min(glucose.length, weight.length) / 21, 0, 1)

  return { score, level, insulinSensitivityLink, liverFunctionProxy, bodyCompositionComponent, thyroidLink, confidence }
}

// ---------------------------------------------------------------------------
// 44. AMH (Anti-Müllerian Hormone) Proxy
// ---------------------------------------------------------------------------

export interface AMHProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  reproductiveAgeProxy: number
  hormoneStabilityComponent: number
  metabolicHealthComponent: number
  stressImpact: number
  confidence: number
}

export async function amhProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AMHProxyResult> {
  const start = windowStart(date, 30)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const sleepQuality = await fetchMetric(userId, "sleep_quality", start, date)

  // AMH reflects ovarian reserve — proxied by hormonal stability markers
  const reproductiveAgeProxy = 1 - normalize(stddev(temp), 0.1, 0.5)
  const hormoneStabilityComponent = 1 - normalize(coefficientOfVariation(rhr), 0.03, 0.15)
  const metabolicHealthComponent = normalize(mean(sleepQuality), 35, 85)
  const stressImpact = 1 - normalize(mean(stress), 25, 75)

  const score = clamp(
    reproductiveAgeProxy * 30 + hormoneStabilityComponent * 25 + metabolicHealthComponent * 25 + stressImpact * 20,
    0,
    100,
  )

  const level: AMHProxyResult["level"] =
    score < 30 ? "low" : score > 70 ? "elevated" : "normal"

  const confidence = clamp(Math.min(temp.length, rhr.length) / 28, 0, 1)

  return { score, level, reproductiveAgeProxy, hormoneStabilityComponent, metabolicHealthComponent, stressImpact, confidence }
}

// ---------------------------------------------------------------------------
// 45. FSH (Follicle-Stimulating Hormone) Proxy
// ---------------------------------------------------------------------------

export interface FSHProxyResult {
  score: number
  level: "low" | "normal" | "elevated"
  cycleRegularityComponent: number
  tempPatternComponent: number
  rhrPatternComponent: number
  stressModulator: number
  confidence: number
}

export async function fshProxy(
  userId: string,
  date: Date = new Date(),
): Promise<FSHProxyResult> {
  const start = windowStart(date, 35)
  const temp = await fetchMetricWithTimestamps(userId, "body_temperature", start, date)
  const rhr = await fetchMetricWithTimestamps(userId, "resting_heart_rate", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)

  const tempValues = temp.map((t) => t.value)
  const rhrValues = rhr.map((r) => r.value)

  // FSH rises when ovarian feedback is reduced (higher temp variability = cycle activity)
  const cycleRegularityComponent = normalize(stddev(tempValues), 0.1, 0.5)
  const tempPatternComponent = normalize(coefficientOfVariation(tempValues), 0.002, 0.015)
  const rhrPatternComponent = normalize(coefficientOfVariation(rhrValues), 0.03, 0.12)
  const stressModulator = normalize(mean(stress), 20, 70)

  const score = clamp(
    cycleRegularityComponent * 30 + tempPatternComponent * 25 + rhrPatternComponent * 25 + stressModulator * 20,
    0,
    100,
  )

  const level: FSHProxyResult["level"] =
    score < 30 ? "low" : score > 65 ? "elevated" : "normal"

  const confidence = clamp(tempValues.length / 28, 0, 1)

  return { score, level, cycleRegularityComponent, tempPatternComponent, rhrPatternComponent, stressModulator, confidence }
}

// ---------------------------------------------------------------------------
// 46. LH (Luteinizing Hormone) Proxy
// ---------------------------------------------------------------------------

export interface LHProxyResult {
  score: number
  level: "low" | "normal" | "surge"
  ovulatorySignal: number
  tempShiftComponent: number
  rhrShiftComponent: number
  energyComponent: number
  confidence: number
}

export async function lhProxy(
  userId: string,
  date: Date = new Date(),
): Promise<LHProxyResult> {
  const start = windowStart(date, 35)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const energy = await fetchMetric(userId, "energy_level", start, date)

  // LH surges at ovulation — look for acute temp/rhr shift in recent days
  const recentTemp = mean(temp.slice(-3))
  const priorTemp = mean(temp.slice(-14, -3))
  const tempShiftComponent = normalize(recentTemp - priorTemp, -0.1, 0.5)

  const recentRhr = mean(rhr.slice(-3))
  const priorRhr = mean(rhr.slice(-14, -3))
  const rhrShiftComponent = normalize(recentRhr - priorRhr, -2, 5)

  const ovulatorySignal = (tempShiftComponent * 0.6 + rhrShiftComponent * 0.4)
  const energyComponent = normalize(mean(energy.slice(-3)), 30, 85)

  const score = clamp(
    ovulatorySignal * 45 + tempShiftComponent * 20 + rhrShiftComponent * 15 + energyComponent * 20,
    0,
    100,
  )

  let level: LHProxyResult["level"] = "normal"
  if (score < 25) level = "low"
  else if (score > 70) level = "surge"

  const confidence = clamp(temp.length / 28, 0, 1)

  return { score, level, ovulatorySignal, tempShiftComponent, rhrShiftComponent, energyComponent, confidence }
}

// ---------------------------------------------------------------------------
// 47. TSH (Thyroid-Stimulating Hormone) Proxy
// ---------------------------------------------------------------------------

export interface TSHProxyResult {
  score: number
  level: "suppressed" | "normal" | "elevated"
  metabolicRateInverse: number
  thermalInverse: number
  heartRateInverse: number
  fatigueComponent: number
  confidence: number
}

export async function tshProxy(
  userId: string,
  date: Date = new Date(),
): Promise<TSHProxyResult> {
  const start = windowStart(date, 14)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const calories = await fetchMetric(userId, "calories_burned", start, date)
  const energy = await fetchMetric(userId, "energy_level", start, date)

  // TSH is inversely related to thyroid output — high TSH means low thyroid activity
  const metabolicRateInverse = 1 - normalize(mean(calories), 1200, 3000)
  const thermalInverse = 1 - normalize(mean(temp), 35.8, 37.3)
  const heartRateInverse = 1 - normalize(mean(rhr), 50, 90)
  const fatigueComponent = 1 - normalize(mean(energy), 25, 80)

  const score = clamp(
    metabolicRateInverse * 30 + thermalInverse * 25 + heartRateInverse * 20 + fatigueComponent * 25,
    0,
    100,
  )

  let level: TSHProxyResult["level"] = "normal"
  if (score < 25) level = "suppressed"
  else if (score > 70) level = "elevated"

  const confidence = clamp(Math.min(rhr.length, temp.length) / 14, 0, 1)

  return { score, level, metabolicRateInverse, thermalInverse, heartRateInverse, fatigueComponent, confidence }
}

// ---------------------------------------------------------------------------
// 48. Free T3 Proxy
// ---------------------------------------------------------------------------

export interface FreeT3ProxyResult {
  score: number
  level: "low" | "normal" | "high"
  activeMetabolism: number
  thermalComponent: number
  cardiacComponent: number
  energyComponent: number
  confidence: number
}

export async function freeT3Proxy(
  userId: string,
  date: Date = new Date(),
): Promise<FreeT3ProxyResult> {
  const start = windowStart(date, 14)
  const calories = await fetchMetric(userId, "calories_burned", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const energy = await fetchMetric(userId, "energy_level", start, date)

  // Free T3 is the active thyroid hormone — most directly affects metabolism
  const activeMetabolism = normalize(mean(calories), 1400, 3200)
  const thermalComponent = normalize(mean(temp), 36.0, 37.3)
  const cardiacComponent = normalize(mean(rhr), 55, 90)
  const energyComponent = normalize(mean(energy), 25, 85)

  const score = clamp(
    activeMetabolism * 30 + thermalComponent * 25 + cardiacComponent * 25 + energyComponent * 20,
    0,
    100,
  )

  const level: FreeT3ProxyResult["level"] =
    score < 35 ? "low" : score > 70 ? "high" : "normal"

  const confidence = clamp(Math.min(calories.length, temp.length) / 14, 0, 1)

  return { score, level, activeMetabolism, thermalComponent, cardiacComponent, energyComponent, confidence }
}

// ---------------------------------------------------------------------------
// 49. Free T4 Proxy
// ---------------------------------------------------------------------------

export interface FreeT4ProxyResult {
  score: number
  level: "low" | "normal" | "high"
  metabolicReserve: number
  thermalStability: number
  heartRateBaseline: number
  weightTrendComponent: number
  confidence: number
}

export async function freeT4Proxy(
  userId: string,
  date: Date = new Date(),
): Promise<FreeT4ProxyResult> {
  const start = windowStart(date, 21)
  const calories = await fetchMetric(userId, "calories_burned", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const weight = await fetchMetric(userId, "weight", start, date)

  // Free T4 is the reservoir form — more stable than T3
  const metabolicReserve = normalize(mean(calories), 1300, 3000)
  const thermalStability = 1 - normalize(stddev(temp), 0.1, 0.5)
  const heartRateBaseline = normalize(mean(rhr), 50, 85)
  const weightSlope = slope(weight)
  const weightTrendComponent = 1 - normalize(Math.abs(weightSlope), 0, 0.5)

  const score = clamp(
    metabolicReserve * 30 + thermalStability * 25 + heartRateBaseline * 25 + weightTrendComponent * 20,
    0,
    100,
  )

  const level: FreeT4ProxyResult["level"] =
    score < 35 ? "low" : score > 70 ? "high" : "normal"

  const confidence = clamp(Math.min(temp.length, rhr.length) / 21, 0, 1)

  return { score, level, metabolicReserve, thermalStability, heartRateBaseline, weightTrendComponent, confidence }
}

// ---------------------------------------------------------------------------
// 50. Cortisol Awakening Response (CAR)
// ---------------------------------------------------------------------------

export interface CortisolAwakeningResponseResult {
  score: number
  pattern: "blunted" | "normal" | "exaggerated"
  wakeUpStressComponent: number
  sleepToWakeTransition: number
  morningHrvDrop: number
  morningHeartRateRise: number
  hpaAxisReactivity: number
  confidence: number
}

export async function cortisolAwakeningResponse(
  userId: string,
  date: Date = new Date(),
): Promise<CortisolAwakeningResponseResult> {
  const start = windowStart(date, 14)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const sleepQuality = await fetchMetric(userId, "sleep_quality", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const morningHr = await fetchMetric(userId, "morning_heart_rate", start, date)
  const nightHrv = await fetchMetric(userId, "night_hrv", start, date)

  // CAR = cortisol surge 30-45 min after waking
  const wakeUpStressComponent = normalize(mean(stress), 20, 70)
  const sleepToWakeTransition = 1 - normalize(mean(sleepQuality), 40, 85)

  const avgNightHrv = mean(nightHrv)
  const avgMorningHrv = mean(hrv)
  const morningHrvDrop = normalize(avgNightHrv - avgMorningHrv, -5, 25)

  const avgRhr = mean(rhr)
  const avgMorningHr = mean(morningHr)
  const morningHeartRateRise = normalize(avgMorningHr - avgRhr, 0, 20)

  const hpaAxisReactivity = (wakeUpStressComponent * 0.4 + morningHrvDrop * 0.3 + morningHeartRateRise * 0.3)

  const score = clamp(
    wakeUpStressComponent * 20 +
    sleepToWakeTransition * 15 +
    morningHrvDrop * 20 +
    morningHeartRateRise * 20 +
    hpaAxisReactivity * 25,
    0,
    100,
  )

  let pattern: CortisolAwakeningResponseResult["pattern"] = "normal"
  if (score < 25) pattern = "blunted"
  else if (score > 70) pattern = "exaggerated"

  const confidence = clamp(Math.min(stress.length, hrv.length, morningHr.length) / 14, 0, 1)

  return {
    score,
    pattern,
    wakeUpStressComponent,
    sleepToWakeTransition,
    morningHrvDrop,
    morningHeartRateRise,
    hpaAxisReactivity,
    confidence,
  }
}

// ---------------------------------------------------------------------------
// 51. Comprehensive Endocrine Balance Index
// ---------------------------------------------------------------------------

export interface EndocrineBalanceResult {
  overallScore: number
  status: "imbalanced" | "suboptimal" | "balanced" | "optimal"
  thyroidAxis: number
  adrenalAxis: number
  gonadotropinAxis: number
  metabolicAxis: number
  neuroendocrineAxis: number
  confidence: number
}

export async function endocrineBalanceIndex(
  userId: string,
  date: Date = new Date(),
): Promise<EndocrineBalanceResult> {
  const start = windowStart(date, 21)
  const rhr = await fetchMetric(userId, "resting_heart_rate", start, date)
  const temp = await fetchMetric(userId, "body_temperature", start, date)
  const hrv = await fetchMetric(userId, "hrv", start, date)
  const stress = await fetchMetric(userId, "stress_level", start, date)
  const sleep = await fetchMetric(userId, "sleep_quality", start, date)
  const energy = await fetchMetric(userId, "energy_level", start, date)
  const glucose = await fetchMetric(userId, "blood_glucose", start, date)
  const steps = await fetchMetric(userId, "steps", start, date)

  // Thyroid axis: temp stability + metabolic rate indicators
  const thyroidAxis = clamp(
    normalize(mean(temp), 36.2, 37.0) * 50 +
    (1 - normalize(stddev(temp), 0.1, 0.4)) * 30 +
    normalize(mean(rhr), 55, 80) * 20,
    0,
    100,
  )

  // Adrenal axis: stress management + cortisol curve proxy
  const adrenalAxis = clamp(
    (1 - normalize(mean(stress), 25, 75)) * 40 +
    normalize(mean(hrv), 25, 70) * 35 +
    normalize(mean(sleep), 40, 85) * 25,
    0,
    100,
  )

  // Gonadotropin axis: hormonal stability markers
  const gonadotropinAxis = clamp(
    (1 - normalize(stddev(temp), 0.05, 0.4)) * 35 +
    normalize(mean(sleep), 40, 85) * 35 +
    (1 - normalize(stddev(rhr), 2, 10)) * 30,
    0,
    100,
  )

  // Metabolic axis: glucose + activity + weight
  const metabolicAxis = clamp(
    (1 - normalize(coefficientOfVariation(glucose), 0.05, 0.2)) * 40 +
    normalize(mean(steps), 4000, 12000) * 35 +
    normalize(mean(energy), 30, 80) * 25,
    0,
    100,
  )

  // Neuroendocrine axis: neurotransmitter-hormone interface
  const neuroendocrineAxis = clamp(
    normalize(mean(hrv), 25, 70) * 30 +
    (1 - normalize(mean(stress), 25, 70)) * 30 +
    normalize(mean(sleep), 40, 85) * 20 +
    normalize(mean(energy), 30, 80) * 20,
    0,
    100,
  )

  const overallScore = clamp(
    thyroidAxis * 0.2 + adrenalAxis * 0.25 + gonadotropinAxis * 0.15 + metabolicAxis * 0.2 + neuroendocrineAxis * 0.2,
    0,
    100,
  )

  let status: EndocrineBalanceResult["status"] = "suboptimal"
  if (overallScore < 25) status = "imbalanced"
  else if (overallScore > 75) status = "optimal"
  else if (overallScore > 55) status = "balanced"

  const confidence = clamp(
    Math.min(rhr.length, temp.length, hrv.length, stress.length, sleep.length) / 21,
    0,
    1,
  )

  return {
    overallScore,
    status,
    thyroidAxis,
    adrenalAxis,
    gonadotropinAxis,
    metabolicAxis,
    neuroendocrineAxis,
    confidence,
  }
}
