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

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000
}

function windowStart(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

// ---------------------------------------------------------------------------
// 1. Cognitive Load Index
// ---------------------------------------------------------------------------

export interface CognitiveLoadResult {
  score: number
  level: "low" | "moderate" | "high" | "overload"
  hrvComponent: number
  heartRateComponent: number
  variabilityComponent: number
  confidence: number
}

export async function cognitiveLoadIndex(
  userId: string,
  date: Date = new Date(),
): Promise<CognitiveLoadResult> {
  const start = windowStart(date, 1)
  const [hrv, hr, steps] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const avgHrv = mean(hrv)
  const avgHr = mean(hr)
  const stepActivity = mean(steps)

  const hrvComponent = 1 - normalize(avgHrv, 20, 100)
  const heartRateComponent = normalize(avgHr, 50, 120)
  const variabilityComponent = coefficientOfVariation(hr)

  const score = clamp(
    hrvComponent * 0.4 + heartRateComponent * 0.35 + variabilityComponent * 0.25,
    0,
    1,
  ) * 100

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "overload"

  const confidence = Math.min(hrv.length, hr.length, 10) / 10

  return { score, level, hrvComponent, heartRateComponent, variabilityComponent, confidence }
}

// ---------------------------------------------------------------------------
// 2. Brain Fog Risk
// ---------------------------------------------------------------------------

export interface BrainFogRiskResult {
  risk: number
  category: "clear" | "mild" | "moderate" | "severe"
  sleepFactor: number
  oxygenFactor: number
  activityFactor: number
  confidence: number
}

export async function brainFogRisk(
  userId: string,
  date: Date = new Date(),
): Promise<BrainFogRiskResult> {
  const start = windowStart(date, 3)
  const [sleep, spo2, steps, hr] = await Promise.all([
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "spo2", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "heart_rate", start, date),
  ])

  const avgSleep = mean(sleep)
  const avgSpo2 = mean(spo2)
  const avgSteps = mean(steps)
  const hrVariability = coefficientOfVariation(hr)

  const sleepFactor = avgSleep < 6 ? 0.8 : avgSleep < 7 ? 0.4 : 0.1
  const oxygenFactor = avgSpo2 < 94 ? 0.9 : avgSpo2 < 96 ? 0.4 : 0.05
  const activityFactor = avgSteps < 2000 ? 0.6 : avgSteps < 5000 ? 0.3 : 0.05

  const risk = clamp(
    sleepFactor * 0.4 + oxygenFactor * 0.35 + activityFactor * 0.15 + hrVariability * 0.1,
    0,
    1,
  ) * 100

  const category =
    risk < 20 ? "clear" : risk < 45 ? "mild" : risk < 70 ? "moderate" : "severe"

  const confidence = Math.min(sleep.length + spo2.length, 20) / 20

  return { risk, category, sleepFactor, oxygenFactor, activityFactor, confidence }
}

// ---------------------------------------------------------------------------
// 3. Focus Score
// ---------------------------------------------------------------------------

export interface FocusScoreResult {
  score: number
  rating: "poor" | "fair" | "good" | "excellent"
  restfulness: number
  cardiovascularReadiness: number
  movementRegularity: number
  confidence: number
}

export async function focusScore(
  userId: string,
  date: Date = new Date(),
): Promise<FocusScoreResult> {
  const start = windowStart(date, 1)
  const [hrv, hr, sleep, steps] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const restfulness = normalize(mean(sleep), 0, 100)
  const cardiovascularReadiness = normalize(mean(hrv), 20, 100)
  const movementRegularity = 1 - clamp(coefficientOfVariation(steps), 0, 1)

  const score = clamp(
    restfulness * 0.35 + cardiovascularReadiness * 0.4 + movementRegularity * 0.25,
    0,
    1,
  ) * 100

  const rating =
    score < 30 ? "poor" : score < 55 ? "fair" : score < 80 ? "good" : "excellent"

  const confidence = Math.min(hrv.length + sleep.length, 20) / 20

  return { score, rating, restfulness, cardiovascularReadiness, movementRegularity, confidence }
}

// ---------------------------------------------------------------------------
// 4. Neurofatigue Index
// ---------------------------------------------------------------------------

export interface NeurofatigueResult {
  index: number
  severity: "minimal" | "mild" | "moderate" | "severe"
  cumulativeSleepDebt: number
  hrTrend: number
  activityDecline: number
  confidence: number
}

export async function neurofatigueIndex(
  userId: string,
  date: Date = new Date(),
): Promise<NeurofatigueResult> {
  const start = windowStart(date, 7)
  const [sleep, hr, steps] = await Promise.all([
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const idealSleep = 8
  const cumulativeSleepDebt = sleep.reduce((acc, s) => acc + Math.max(0, idealSleep - s), 0)
  const normalizedDebt = normalize(cumulativeSleepDebt, 0, 20)

  const hrFirst = mean(hr.slice(Math.floor(hr.length / 2)))
  const hrSecond = mean(hr.slice(0, Math.floor(hr.length / 2)))
  const hrTrend = hrSecond > 0 ? (hrSecond - hrFirst) / hrSecond : 0

  const stepsFirst = mean(steps.slice(Math.floor(steps.length / 2)))
  const stepsSecond = mean(steps.slice(0, Math.floor(steps.length / 2)))
  const activityDecline = stepsFirst > 0 ? Math.max(0, (stepsFirst - stepsSecond) / stepsFirst) : 0

  const index = clamp(
    normalizedDebt * 0.45 + normalize(hrTrend, -0.1, 0.2) * 0.3 + activityDecline * 0.25,
    0,
    1,
  ) * 100

  const severity =
    index < 20 ? "minimal" : index < 45 ? "mild" : index < 70 ? "moderate" : "severe"

  const confidence = Math.min(sleep.length, 7) / 7

  return { index, severity, cumulativeSleepDebt, hrTrend, activityDecline, confidence }
}

// ---------------------------------------------------------------------------
// 5. Neuroplasticity Proxy
// ---------------------------------------------------------------------------

export interface NeuroplasticityResult {
  score: number
  level: "low" | "moderate" | "high"
  exerciseContribution: number
  sleepContribution: number
  hrvContribution: number
  confidence: number
}

export async function neuroplasticityProxy(
  userId: string,
  date: Date = new Date(),
): Promise<NeuroplasticityResult> {
  const start = windowStart(date, 14)
  const [steps, sleep, hrv] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "hrv", start, date),
  ])

  const exerciseContribution = normalize(mean(steps), 2000, 12000)
  const sleepContribution = normalize(mean(sleep), 5, 9)
  const hrvContribution = normalize(mean(hrv), 20, 80)

  const score = clamp(
    exerciseContribution * 0.4 + sleepContribution * 0.35 + hrvContribution * 0.25,
    0,
    1,
  ) * 100

  const level = score < 35 ? "low" : score < 65 ? "moderate" : "high"
  const confidence = Math.min(steps.length + sleep.length, 28) / 28

  return { score, level, exerciseContribution, sleepContribution, hrvContribution, confidence }
}

// ---------------------------------------------------------------------------
// 6. Migraine Risk
// ---------------------------------------------------------------------------

export interface MigraineRiskResult {
  risk: number
  category: "low" | "moderate" | "high" | "critical"
  sleepIrregularity: number
  hrSpikes: number
  hrvDepression: number
  confidence: number
}

export async function migraineRisk(
  userId: string,
  date: Date = new Date(),
): Promise<MigraineRiskResult> {
  const start = windowStart(date, 3)
  const [sleep, hr, hrv] = await Promise.all([
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
  ])

  const sleepIrregularity = coefficientOfVariation(sleep)
  const avgHr = mean(hr)
  const hrSpikes = hr.filter((v) => v > avgHr * 1.3).length / Math.max(hr.length, 1)
  const hrvDepression = 1 - normalize(mean(hrv), 15, 70)

  const risk = clamp(
    sleepIrregularity * 0.3 + hrSpikes * 0.3 + hrvDepression * 0.4,
    0,
    1,
  ) * 100

  const category =
    risk < 20 ? "low" : risk < 45 ? "moderate" : risk < 70 ? "high" : "critical"

  const confidence = Math.min(sleep.length + hr.length, 20) / 20

  return { risk, category, sleepIrregularity, hrSpikes, hrvDepression, confidence }
}

// ---------------------------------------------------------------------------
// 7. Attention Span Proxy
// ---------------------------------------------------------------------------

export interface AttentionSpanResult {
  estimatedMinutes: number
  category: "very_short" | "short" | "average" | "long" | "extended"
  restScore: number
  autonomicBalance: number
  confidence: number
}

export async function attentionSpanProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AttentionSpanResult> {
  const start = windowStart(date, 1)
  const [sleep, hrv, hr] = await Promise.all([
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
  ])

  const restScore = normalize(mean(sleep), 0, 100)
  const autonomicBalance = normalize(mean(hrv), 20, 80) * (1 - normalize(mean(hr), 50, 110))

  const baseMinutes = 25
  const estimatedMinutes = clamp(
    baseMinutes + restScore * 35 + autonomicBalance * 30,
    5,
    120,
  )

  const category =
    estimatedMinutes < 15
      ? "very_short"
      : estimatedMinutes < 30
        ? "short"
        : estimatedMinutes < 60
          ? "average"
          : estimatedMinutes < 90
            ? "long"
            : "extended"

  const confidence = Math.min(sleep.length + hrv.length, 10) / 10

  return { estimatedMinutes, category, restScore, autonomicBalance, confidence }
}

// ---------------------------------------------------------------------------
// 8. Memory Consolidation Score
// ---------------------------------------------------------------------------

export interface MemoryConsolidationResult {
  score: number
  rating: "poor" | "fair" | "good" | "excellent"
  deepSleepFactor: number
  sleepContinuity: number
  recoveryFactor: number
  confidence: number
}

export async function memoryConsolidation(
  userId: string,
  date: Date = new Date(),
): Promise<MemoryConsolidationResult> {
  const start = windowStart(date, 3)
  const [deepSleep, sleepDur, hrv, restingHr] = await Promise.all([
    fetchMetric(userId, "deep_sleep", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const deepSleepFactor = normalize(mean(deepSleep), 0, 120)
  const sleepContinuity = 1 - coefficientOfVariation(sleepDur)
  const recoveryFactor =
    normalize(mean(hrv), 20, 80) * (1 - normalize(mean(restingHr), 45, 90))

  const score = clamp(
    deepSleepFactor * 0.45 + sleepContinuity * 0.25 + recoveryFactor * 0.3,
    0,
    1,
  ) * 100

  const rating =
    score < 30 ? "poor" : score < 55 ? "fair" : score < 80 ? "good" : "excellent"

  const confidence = Math.min(deepSleep.length + sleepDur.length, 10) / 10

  return { score, rating, deepSleepFactor, sleepContinuity, recoveryFactor, confidence }
}

// ---------------------------------------------------------------------------
// 9. Reaction Time Proxy
// ---------------------------------------------------------------------------

export interface ReactionTimeResult {
  estimatedMs: number
  category: "fast" | "average" | "slow" | "impaired"
  fatigueImpact: number
  arousalLevel: number
  confidence: number
}

export async function reactionTimeProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ReactionTimeResult> {
  const start = windowStart(date, 1)
  const [sleep, hr, hrv, spo2] = await Promise.all([
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "spo2", start, date),
  ])

  const fatigueImpact = 1 - normalize(mean(sleep), 4, 9)
  const arousalLevel = normalize(mean(hr), 50, 100) * normalize(mean(hrv), 20, 80)

  const baseMs = 250
  const estimatedMs = clamp(
    baseMs + fatigueImpact * 150 - arousalLevel * 80 + (1 - normalize(mean(spo2), 90, 100)) * 60,
    150,
    600,
  )

  const category =
    estimatedMs < 200
      ? "fast"
      : estimatedMs < 300
        ? "average"
        : estimatedMs < 450
          ? "slow"
          : "impaired"

  const confidence = Math.min(sleep.length + hr.length, 10) / 10

  return { estimatedMs, category, fatigueImpact, arousalLevel, confidence }
}

// ---------------------------------------------------------------------------
// 10. Seizure Risk Proxy
// ---------------------------------------------------------------------------

export interface SeizureRiskResult {
  risk: number
  level: "low" | "moderate" | "elevated" | "high"
  sleepDeprivationFactor: number
  autonomicInstability: number
  stressFactor: number
  confidence: number
}

export async function seizureRiskProxy(
  userId: string,
  date: Date = new Date(),
): Promise<SeizureRiskResult> {
  const start = windowStart(date, 7)
  const [sleep, hr, hrv] = await Promise.all([
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
  ])

  const avgSleep = mean(sleep)
  const sleepDeprivationFactor = avgSleep < 5 ? 0.9 : avgSleep < 6 ? 0.6 : avgSleep < 7 ? 0.3 : 0.05
  const autonomicInstability = coefficientOfVariation(hr) + coefficientOfVariation(hrv)
  const stressFactor = 1 - normalize(mean(hrv), 15, 80)

  const risk = clamp(
    sleepDeprivationFactor * 0.4 + normalize(autonomicInstability, 0, 0.8) * 0.3 + stressFactor * 0.3,
    0,
    1,
  ) * 100

  const level =
    risk < 15 ? "low" : risk < 40 ? "moderate" : risk < 65 ? "elevated" : "high"

  const confidence = Math.min(sleep.length, 7) / 7

  return { risk, level, sleepDeprivationFactor, autonomicInstability, stressFactor, confidence }
}

// ---------------------------------------------------------------------------
// 11. Cerebral Blood Flow Proxy
// ---------------------------------------------------------------------------

export interface CerebralBloodFlowResult {
  index: number
  status: "reduced" | "normal" | "elevated"
  cardiacOutput: number
  oxygenation: number
  vasomotorTone: number
  confidence: number
}

export async function cerebralBloodFlowProxy(
  userId: string,
  date: Date = new Date(),
): Promise<CerebralBloodFlowResult> {
  const start = windowStart(date, 1)
  const [hr, spo2, hrv, bp] = await Promise.all([
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "spo2", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "blood_pressure_systolic", start, date),
  ])

  const cardiacOutput = normalize(mean(hr), 50, 100)
  const oxygenation = normalize(mean(spo2), 88, 100)
  const vasomotorTone = normalize(mean(hrv), 20, 80)
  const bpFactor = bp.length > 0 ? normalize(mean(bp), 90, 160) : 0.5

  const index = clamp(
    cardiacOutput * 0.3 + oxygenation * 0.3 + vasomotorTone * 0.2 + (1 - Math.abs(bpFactor - 0.5) * 2) * 0.2,
    0,
    1,
  ) * 100

  const status = index < 35 ? "reduced" : index > 70 ? "elevated" : "normal"
  const confidence = Math.min(hr.length + spo2.length, 20) / 20

  return { index, status, cardiacOutput, oxygenation, vasomotorTone, confidence }
}

// ---------------------------------------------------------------------------
// 12. Neurotransmitter Balance Proxy
// ---------------------------------------------------------------------------

export interface NeurotransmitterBalanceResult {
  balanceScore: number
  status: "imbalanced" | "suboptimal" | "balanced" | "optimal"
  sympatheticDrive: number
  parasympatheticDrive: number
  moodProxy: number
  confidence: number
}

export async function neurotransmitterBalance(
  userId: string,
  date: Date = new Date(),
): Promise<NeurotransmitterBalanceResult> {
  const start = windowStart(date, 7)
  const [hrv, hr, sleep, steps] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const sympatheticDrive = normalize(mean(hr), 50, 110)
  const parasympatheticDrive = normalize(mean(hrv), 15, 90)
  const balance = 1 - Math.abs(sympatheticDrive - parasympatheticDrive)
  const moodProxy = normalize(mean(sleep), 0, 100) * 0.5 + normalize(mean(steps), 1000, 10000) * 0.5

  const balanceScore = clamp(balance * 0.5 + moodProxy * 0.3 + parasympatheticDrive * 0.2, 0, 1) * 100

  const status =
    balanceScore < 25
      ? "imbalanced"
      : balanceScore < 50
        ? "suboptimal"
        : balanceScore < 75
          ? "balanced"
          : "optimal"

  const confidence = Math.min(hrv.length + hr.length, 30) / 30

  return { balanceScore, status, sympatheticDrive, parasympatheticDrive, moodProxy, confidence }
}

// ---------------------------------------------------------------------------
// 13. Stress Response Pattern
// ---------------------------------------------------------------------------

export interface StressResponseResult {
  pattern: "resilient" | "reactive" | "chronic" | "exhausted"
  score: number
  recoveryRate: number
  baselineDeviation: number
  hrReactivity: number
  confidence: number
}

export async function stressResponsePattern(
  userId: string,
  date: Date = new Date(),
): Promise<StressResponseResult> {
  const start = windowStart(date, 7)
  const [hrv, hr, restingHr] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const avgHrv = mean(hrv)
  const hrvStd = stddev(hrv)
  const recoveryRate = normalize(avgHrv, 15, 80)
  const baselineDeviation = mean(restingHr) > 0
    ? Math.abs(mean(hr) - mean(restingHr)) / mean(restingHr)
    : 0
  const hrReactivity = coefficientOfVariation(hr)

  const score = clamp(
    (1 - recoveryRate) * 0.4 + normalize(baselineDeviation, 0, 0.4) * 0.35 + hrReactivity * 0.25,
    0,
    1,
  ) * 100

  const pattern =
    score < 20
      ? "resilient"
      : score < 45
        ? "reactive"
        : score < 70
          ? "chronic"
          : "exhausted"

  const confidence = Math.min(hrv.length, 14) / 14

  return { pattern, score, recoveryRate, baselineDeviation, hrReactivity, confidence }
}

// ---------------------------------------------------------------------------
// 14. Neurodegeneration Risk Proxy
// ---------------------------------------------------------------------------

export interface NeurodegenerationRiskResult {
  risk: number
  level: "low" | "moderate" | "elevated" | "high"
  sleepQualityTrend: number
  cardiovascularRisk: number
  activityDecline: number
  cognitiveLoadAvg: number
  confidence: number
}

export async function neurodegenerationRisk(
  userId: string,
  date: Date = new Date(),
): Promise<NeurodegenerationRiskResult> {
  const start = windowStart(date, 30)
  const midpoint = windowStart(date, 15)
  const [sleepEarly, sleepLate, hrv, hr, steps] = await Promise.all([
    fetchMetric(userId, "sleep_quality", start, midpoint),
    fetchMetric(userId, "sleep_quality", midpoint, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const sleepQualityTrend = mean(sleepLate) - mean(sleepEarly)
  const normalizedTrend = normalize(sleepQualityTrend, -30, 10)

  const cardiovascularRisk =
    (1 - normalize(mean(hrv), 15, 80)) * 0.5 + normalize(mean(hr), 60, 100) * 0.5

  const stepsFirst = mean(steps.slice(Math.floor(steps.length / 2)))
  const stepsSecond = mean(steps.slice(0, Math.floor(steps.length / 2)))
  const activityDecline = stepsFirst > 0 ? Math.max(0, (stepsFirst - stepsSecond) / stepsFirst) : 0

  const cognitiveLoadAvg = cardiovascularRisk * 0.6 + (1 - normalizedTrend) * 0.4

  const risk = clamp(
    (1 - normalizedTrend) * 0.3 + cardiovascularRisk * 0.3 + activityDecline * 0.2 + cognitiveLoadAvg * 0.2,
    0,
    1,
  ) * 100

  const level =
    risk < 20 ? "low" : risk < 45 ? "moderate" : risk < 70 ? "elevated" : "high"

  const confidence = Math.min(sleepEarly.length + sleepLate.length, 20) / 20

  return { risk, level, sleepQualityTrend, cardiovascularRisk, activityDecline, cognitiveLoadAvg, confidence }
}

// ---------------------------------------------------------------------------
// 15. Mental Fatigue Index
// ---------------------------------------------------------------------------

export interface MentalFatigueResult {
  index: number
  severity: "fresh" | "mild" | "moderate" | "exhausted"
  timeOnTaskDecay: number
  sleepDebt: number
  autonomicStrain: number
  confidence: number
}

export async function mentalFatigueIndex(
  userId: string,
  date: Date = new Date(),
): Promise<MentalFatigueResult> {
  const start = windowStart(date, 3)
  const [sleep, hrv, hr] = await Promise.all([
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
  ])

  const sleepDebt = Math.max(0, 8 - mean(sleep)) / 8
  const autonomicStrain = (1 - normalize(mean(hrv), 15, 80)) * 0.6 + normalize(mean(hr), 55, 100) * 0.4
  const timeOnTaskDecay = sleepDebt * 0.5 + autonomicStrain * 0.5

  const index = clamp(
    timeOnTaskDecay * 0.35 + sleepDebt * 0.35 + autonomicStrain * 0.3,
    0,
    1,
  ) * 100

  const severity =
    index < 20 ? "fresh" : index < 45 ? "mild" : index < 70 ? "moderate" : "exhausted"

  const confidence = Math.min(sleep.length + hrv.length, 12) / 12

  return { index, severity, timeOnTaskDecay, sleepDebt, autonomicStrain, confidence }
}

// ---------------------------------------------------------------------------
// 16. Autonomic Neuropathy Risk
// ---------------------------------------------------------------------------

export interface AutonomicNeuropathyRiskResult {
  risk: number
  level: "low" | "moderate" | "elevated" | "high"
  hrvDepression: number
  heartRateRecovery: number
  postureResponse: number
  confidence: number
}

export async function autonomicNeuropathyRisk(
  userId: string,
  date: Date = new Date(),
): Promise<AutonomicNeuropathyRiskResult> {
  const start = windowStart(date, 14)
  const [hrv, restHr, hr] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "heart_rate", start, date),
  ])

  const hrvDepression = 1 - normalize(mean(hrv), 10, 70)
  const heartRateRecovery = mean(restHr) > 0
    ? 1 - normalize(Math.abs(mean(hr) - mean(restHr)), 0, 40)
    : 0.5
  const postureResponse = coefficientOfVariation(hr)

  const risk = clamp(
    hrvDepression * 0.45 + (1 - heartRateRecovery) * 0.3 + postureResponse * 0.25,
    0,
    1,
  ) * 100

  const level =
    risk < 20 ? "low" : risk < 45 ? "moderate" : risk < 65 ? "elevated" : "high"

  const confidence = Math.min(hrv.length, 14) / 14

  return { risk, level, hrvDepression, heartRateRecovery, postureResponse, confidence }
}

// ---------------------------------------------------------------------------
// 17. Brain Recovery Index
// ---------------------------------------------------------------------------

export interface BrainRecoveryResult {
  index: number
  phase: "poor" | "recovering" | "recovered" | "optimal"
  sleepRecovery: number
  autonomicRecovery: number
  activityResumption: number
  confidence: number
}

export async function brainRecoveryIndex(
  userId: string,
  date: Date = new Date(),
): Promise<BrainRecoveryResult> {
  const start = windowStart(date, 3)
  const [sleep, hrv, hr, steps] = await Promise.all([
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const sleepRecovery = normalize(mean(sleep), 0, 100)
  const autonomicRecovery = normalize(mean(hrv), 15, 80) * (1 - normalize(mean(hr), 45, 85))
  const activityResumption = normalize(mean(steps), 1000, 10000)

  const index = clamp(
    sleepRecovery * 0.4 + autonomicRecovery * 0.35 + activityResumption * 0.25,
    0,
    1,
  ) * 100

  const phase =
    index < 25 ? "poor" : index < 50 ? "recovering" : index < 75 ? "recovered" : "optimal"

  const confidence = Math.min(sleep.length + hrv.length, 10) / 10

  return { index, phase, sleepRecovery, autonomicRecovery, activityResumption, confidence }
}

// ---------------------------------------------------------------------------
// 18. Anxiety Neural Markers
// ---------------------------------------------------------------------------

export interface AnxietyNeuralResult {
  score: number
  level: "minimal" | "mild" | "moderate" | "severe"
  autonomicArousal: number
  sleepDisturbance: number
  restlessness: number
  confidence: number
}

export async function anxietyNeuralMarkers(
  userId: string,
  date: Date = new Date(),
): Promise<AnxietyNeuralResult> {
  const start = windowStart(date, 7)
  const [hrv, hr, sleep, steps] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const autonomicArousal = normalize(mean(hr), 60, 110) * (1 - normalize(mean(hrv), 15, 80))
  const sleepDisturbance = 1 - normalize(mean(sleep), 0, 100)
  const restlessness = coefficientOfVariation(steps) + coefficientOfVariation(hr)

  const score = clamp(
    autonomicArousal * 0.4 + sleepDisturbance * 0.35 + normalize(restlessness, 0, 1) * 0.25,
    0,
    1,
  ) * 100

  const level =
    score < 20 ? "minimal" : score < 45 ? "mild" : score < 70 ? "moderate" : "severe"

  const confidence = Math.min(hrv.length + hr.length, 20) / 20

  return { score, level, autonomicArousal, sleepDisturbance, restlessness, confidence }
}

// ---------------------------------------------------------------------------
// 19. Depression Neural Markers
// ---------------------------------------------------------------------------

export interface DepressionNeuralResult {
  score: number
  level: "minimal" | "mild" | "moderate" | "severe"
  activityWithdrawal: number
  sleepDisruption: number
  circadianDisruption: number
  autonomicBlunting: number
  confidence: number
}

export async function depressionNeuralMarkers(
  userId: string,
  date: Date = new Date(),
): Promise<DepressionNeuralResult> {
  const start = windowStart(date, 14)
  const [steps, sleep, sleepDur, hrv] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "hrv", start, date),
  ])

  const activityWithdrawal = 1 - normalize(mean(steps), 1000, 8000)
  const sleepDisruption = 1 - normalize(mean(sleep), 0, 100)
  const circadianDisruption = coefficientOfVariation(sleepDur)
  const autonomicBlunting = 1 - normalize(stddev(hrv), 0, 30)

  const score = clamp(
    activityWithdrawal * 0.3 + sleepDisruption * 0.25 + circadianDisruption * 0.2 + autonomicBlunting * 0.25,
    0,
    1,
  ) * 100

  const level =
    score < 20 ? "minimal" : score < 45 ? "mild" : score < 70 ? "moderate" : "severe"

  const confidence = Math.min(steps.length + sleep.length, 28) / 28

  return { score, level, activityWithdrawal, sleepDisruption, circadianDisruption, autonomicBlunting, confidence }
}

// ---------------------------------------------------------------------------
// 20. Neuromuscular Junction Proxy
// ---------------------------------------------------------------------------

export interface NeuromuscularJunctionResult {
  score: number
  status: "impaired" | "suboptimal" | "normal" | "strong"
  motorActivity: number
  fatigueResistance: number
  neuralDrive: number
  confidence: number
}

export async function neuromuscularJunctionProxy(
  userId: string,
  date: Date = new Date(),
): Promise<NeuromuscularJunctionResult> {
  const start = windowStart(date, 7)
  const [steps, hr, hrv, sleep] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
  ])

  const motorActivity = normalize(mean(steps), 1000, 12000)
  const stepsStd = stddev(steps)
  const fatigueResistance = normalize(stepsStd, 500, 5000)
  const neuralDrive = normalize(mean(hrv), 20, 80) * normalize(mean(sleep), 5, 9)

  const score = clamp(
    motorActivity * 0.4 + fatigueResistance * 0.3 + neuralDrive * 0.3,
    0,
    1,
  ) * 100

  const status =
    score < 25 ? "impaired" : score < 50 ? "suboptimal" : score < 75 ? "normal" : "strong"

  const confidence = Math.min(steps.length, 7) / 7

  return { score, status, motorActivity, fatigueResistance, neuralDrive, confidence }
}

// ---------------------------------------------------------------------------
// 21. Cognitive Reserve Proxy
// ---------------------------------------------------------------------------

export interface CognitiveReserveResult {
  score: number
  level: "low" | "moderate" | "high" | "exceptional"
  physicalActivity: number
  sleepConsistency: number
  cardiovascularHealth: number
  confidence: number
}

export async function cognitiveReserve(
  userId: string,
  date: Date = new Date(),
): Promise<CognitiveReserveResult> {
  const start = windowStart(date, 30)
  const [steps, sleep, hrv, hr] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const physicalActivity = normalize(mean(steps), 2000, 12000)
  const sleepConsistency = 1 - coefficientOfVariation(sleep)
  const cardiovascularHealth =
    normalize(mean(hrv), 20, 80) * 0.5 + (1 - normalize(mean(hr), 45, 85)) * 0.5

  const score = clamp(
    physicalActivity * 0.35 + sleepConsistency * 0.3 + cardiovascularHealth * 0.35,
    0,
    1,
  ) * 100

  const level =
    score < 30 ? "low" : score < 55 ? "moderate" : score < 80 ? "high" : "exceptional"

  const confidence = Math.min(steps.length, 30) / 30

  return { score, level, physicalActivity, sleepConsistency, cardiovascularHealth, confidence }
}

// ---------------------------------------------------------------------------
// 22. Parkinson's Risk Proxy
// ---------------------------------------------------------------------------

export interface ParkinsonsRiskResult {
  risk: number
  level: "low" | "moderate" | "elevated" | "high"
  motorIrregularity: number
  sleepBehaviorDisorder: number
  autonomicDysfunction: number
  confidence: number
}

export async function parkinsonsRiskProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ParkinsonsRiskResult> {
  const start = windowStart(date, 30)
  const [steps, sleep, sleepQuality, hrv, hr] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
  ])

  const motorIrregularity = coefficientOfVariation(steps)
  const sleepBehaviorDisorder =
    coefficientOfVariation(sleep) * 0.5 + (1 - normalize(mean(sleepQuality), 0, 100)) * 0.5
  const autonomicDysfunction =
    (1 - normalize(mean(hrv), 10, 70)) * 0.5 + coefficientOfVariation(hr) * 0.5

  const risk = clamp(
    motorIrregularity * 0.35 + sleepBehaviorDisorder * 0.35 + autonomicDysfunction * 0.3,
    0,
    1,
  ) * 100

  const level =
    risk < 20 ? "low" : risk < 45 ? "moderate" : risk < 65 ? "elevated" : "high"

  const confidence = Math.min(steps.length, 30) / 30

  return { risk, level, motorIrregularity, sleepBehaviorDisorder, autonomicDysfunction, confidence }
}

// ---------------------------------------------------------------------------
// 23. Alzheimer's Risk Proxy
// ---------------------------------------------------------------------------

export interface AlzheimersRiskResult {
  risk: number
  level: "low" | "moderate" | "elevated" | "high"
  sleepFragmentation: number
  cardiovascularBurden: number
  physicalDecline: number
  metabolicRisk: number
  confidence: number
}

export async function alzheimersRiskProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AlzheimersRiskResult> {
  const start = windowStart(date, 30)
  const [sleepDur, deepSleep, hrv, hr, steps, glucose] = await Promise.all([
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "deep_sleep", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "blood_glucose", start, date),
  ])

  const sleepFragmentation = coefficientOfVariation(sleepDur) + (1 - normalize(mean(deepSleep), 0, 120)) * 0.5
  const cardiovascularBurden =
    (1 - normalize(mean(hrv), 10, 70)) * 0.5 + normalize(mean(hr), 50, 90) * 0.5
  const physicalDecline = 1 - normalize(mean(steps), 2000, 10000)
  const metabolicRisk = glucose.length > 0 ? normalize(mean(glucose), 70, 200) : 0.3

  const risk = clamp(
    normalize(sleepFragmentation, 0, 1.5) * 0.25 +
    cardiovascularBurden * 0.3 +
    physicalDecline * 0.25 +
    metabolicRisk * 0.2,
    0,
    1,
  ) * 100

  const level =
    risk < 20 ? "low" : risk < 45 ? "moderate" : risk < 65 ? "elevated" : "high"

  const confidence = Math.min(sleepDur.length + hrv.length, 40) / 40

  return { risk, level, sleepFragmentation, cardiovascularBurden, physicalDecline, metabolicRisk, confidence }
}

// ---------------------------------------------------------------------------
// 24. Sensory Processing Proxy
// ---------------------------------------------------------------------------

export interface SensoryProcessingResult {
  score: number
  status: "hypo" | "normal" | "hyper"
  autonomicReactivity: number
  restoreCapacity: number
  sensorySensitivity: number
  confidence: number
}

export async function sensoryProcessingProxy(
  userId: string,
  date: Date = new Date(),
): Promise<SensoryProcessingResult> {
  const start = windowStart(date, 3)
  const [hr, hrv, sleep] = await Promise.all([
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
  ])

  const autonomicReactivity = coefficientOfVariation(hr)
  const restoreCapacity = normalize(mean(hrv), 15, 80)
  const sensorySensitivity = autonomicReactivity * (1 - restoreCapacity)

  const score = clamp(
    restoreCapacity * 0.4 + (1 - normalize(sensorySensitivity, 0, 0.5)) * 0.35 +
    normalize(mean(sleep), 0, 100) * 0.25,
    0,
    1,
  ) * 100

  const status = score < 35 ? "hypo" : score > 75 ? "hyper" : "normal"
  const confidence = Math.min(hr.length + hrv.length, 20) / 20

  return { score, status, autonomicReactivity, restoreCapacity, sensorySensitivity, confidence }
}

// ---------------------------------------------------------------------------
// 25. Neurovascular Coupling Proxy
// ---------------------------------------------------------------------------

export interface NeurovascularCouplingResult {
  index: number
  status: "poor" | "fair" | "good" | "excellent"
  cerebralPerfusion: number
  metabolicCoupling: number
  vascularReactivity: number
  confidence: number
}

export async function neurovascularCoupling(
  userId: string,
  date: Date = new Date(),
): Promise<NeurovascularCouplingResult> {
  const start = windowStart(date, 7)
  const [hr, spo2, hrv, bp] = await Promise.all([
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "spo2", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "blood_pressure_systolic", start, date),
  ])

  const cerebralPerfusion = normalize(mean(spo2), 90, 100) * normalize(mean(hr), 50, 90)
  const metabolicCoupling = normalize(mean(hrv), 15, 80)
  const vascularReactivity = bp.length > 0
    ? 1 - normalize(coefficientOfVariation(bp), 0, 0.2)
    : 0.5

  const index = clamp(
    cerebralPerfusion * 0.35 + metabolicCoupling * 0.35 + vascularReactivity * 0.3,
    0,
    1,
  ) * 100

  const status =
    index < 30 ? "poor" : index < 55 ? "fair" : index < 80 ? "good" : "excellent"

  const confidence = Math.min(hr.length + spo2.length, 20) / 20

  return { index, status, cerebralPerfusion, metabolicCoupling, vascularReactivity, confidence }
}

// ---------------------------------------------------------------------------
// 26. Multiple Sclerosis Proxy
// ---------------------------------------------------------------------------

export interface MSProxyResult {
  risk: number
  level: "low" | "moderate" | "elevated" | "high"
  fatigueBurden: number
  thermoregulationIssue: number
  motorConsistency: number
  confidence: number
}

export async function msProxy(
  userId: string,
  date: Date = new Date(),
): Promise<MSProxyResult> {
  const start = windowStart(date, 14)
  const [steps, sleep, hr, hrv, temp] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "body_temperature", start, date),
  ])

  const fatigueBurden = (1 - normalize(mean(sleep), 0, 100)) * 0.5 +
    (1 - normalize(mean(steps), 1000, 8000)) * 0.5
  const thermoregulationIssue = temp.length > 0
    ? normalize(coefficientOfVariation(temp), 0, 0.05)
    : 0.3
  const motorConsistency = 1 - coefficientOfVariation(steps)

  const risk = clamp(
    fatigueBurden * 0.4 + thermoregulationIssue * 0.3 + (1 - motorConsistency) * 0.3,
    0,
    1,
  ) * 100

  const level =
    risk < 20 ? "low" : risk < 45 ? "moderate" : risk < 65 ? "elevated" : "high"

  const confidence = Math.min(steps.length + sleep.length, 28) / 28

  return { risk, level, fatigueBurden, thermoregulationIssue, motorConsistency, confidence }
}

// ---------------------------------------------------------------------------
// 27. Neuropathic Pain Proxy
// ---------------------------------------------------------------------------

export interface NeuropathicPainResult {
  score: number
  severity: "none" | "mild" | "moderate" | "severe"
  autonomicDisruption: number
  sleepInterference: number
  activityLimitation: number
  confidence: number
}

export async function neuropathicPainProxy(
  userId: string,
  date: Date = new Date(),
): Promise<NeuropathicPainResult> {
  const start = windowStart(date, 7)
  const [hrv, hr, sleep, steps] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const autonomicDisruption = (1 - normalize(mean(hrv), 10, 70)) * 0.6 +
    normalize(mean(hr), 60, 100) * 0.4
  const sleepInterference = 1 - normalize(mean(sleep), 0, 100)
  const activityLimitation = 1 - normalize(mean(steps), 500, 8000)

  const score = clamp(
    autonomicDisruption * 0.4 + sleepInterference * 0.35 + activityLimitation * 0.25,
    0,
    1,
  ) * 100

  const severity =
    score < 15 ? "none" : score < 40 ? "mild" : score < 65 ? "moderate" : "severe"

  const confidence = Math.min(hrv.length + sleep.length, 14) / 14

  return { score, severity, autonomicDisruption, sleepInterference, activityLimitation, confidence }
}

// ---------------------------------------------------------------------------
// 28. Circadian Neural Rhythm
// ---------------------------------------------------------------------------

export interface CircadianNeuralRhythmResult {
  score: number
  alignment: "disrupted" | "shifting" | "aligned" | "optimal"
  sleepTimingConsistency: number
  restActivityRatio: number
  temperatureRhythm: number
  confidence: number
}

export async function circadianNeuralRhythm(
  userId: string,
  date: Date = new Date(),
): Promise<CircadianNeuralRhythmResult> {
  const start = windowStart(date, 7)
  const [sleepDur, sleepQuality, hr, temp] = await Promise.all([
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "body_temperature", start, date),
  ])

  const sleepTimingConsistency = 1 - coefficientOfVariation(sleepDur)
  const restActivityRatio = normalize(mean(sleepQuality), 0, 100) *
    (1 - coefficientOfVariation(hr))
  const temperatureRhythm = temp.length > 0
    ? 1 - normalize(coefficientOfVariation(temp), 0, 0.03)
    : 0.5

  const score = clamp(
    sleepTimingConsistency * 0.4 + restActivityRatio * 0.35 + temperatureRhythm * 0.25,
    0,
    1,
  ) * 100

  const alignment =
    score < 25 ? "disrupted" : score < 50 ? "shifting" : score < 75 ? "aligned" : "optimal"

  const confidence = Math.min(sleepDur.length, 7) / 7

  return { score, alignment, sleepTimingConsistency, restActivityRatio, temperatureRhythm, confidence }
}

// ---------------------------------------------------------------------------
// 29. Neural Recovery Rate
// ---------------------------------------------------------------------------

export interface NeuralRecoveryRateResult {
  rate: number
  category: "slow" | "moderate" | "fast" | "rapid"
  hrvRebound: number
  sleepEfficiency: number
  activityResumption: number
  confidence: number
}

export async function neuralRecoveryRate(
  userId: string,
  date: Date = new Date(),
): Promise<NeuralRecoveryRateResult> {
  const start = windowStart(date, 3)
  const [hrv, sleep, steps, restHr] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const recentHrv = mean(hrv.slice(0, Math.ceil(hrv.length / 3)))
  const olderHrv = mean(hrv.slice(Math.ceil(hrv.length * 2 / 3)))
  const hrvRebound = olderHrv > 0 ? (recentHrv - olderHrv) / olderHrv : 0

  const sleepEfficiency = normalize(mean(sleep), 0, 100)
  const activityResumption = normalize(mean(steps), 1000, 10000)

  const rate = clamp(
    normalize(hrvRebound, -0.2, 0.3) * 0.4 + sleepEfficiency * 0.35 + activityResumption * 0.25,
    0,
    1,
  ) * 100

  const category =
    rate < 25 ? "slow" : rate < 50 ? "moderate" : rate < 75 ? "fast" : "rapid"

  const confidence = Math.min(hrv.length, 10) / 10

  return { rate, category, hrvRebound, sleepEfficiency, activityResumption, confidence }
}

// ---------------------------------------------------------------------------
// 30. Stroke Recovery Proxy
// ---------------------------------------------------------------------------

export interface StrokeRecoveryResult {
  index: number
  phase: "acute" | "subacute" | "chronic" | "recovered"
  motorRecovery: number
  autonomicStability: number
  sleepRecovery: number
  confidence: number
}

export async function strokeRecoveryProxy(
  userId: string,
  date: Date = new Date(),
): Promise<StrokeRecoveryResult> {
  const start = windowStart(date, 14)
  const midpoint = windowStart(date, 7)
  const [stepsEarly, stepsLate, hrv, hr, sleep] = await Promise.all([
    fetchMetric(userId, "steps", start, midpoint),
    fetchMetric(userId, "steps", midpoint, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
  ])

  const motorRecovery = mean(stepsEarly) > 0
    ? normalize((mean(stepsLate) - mean(stepsEarly)) / mean(stepsEarly), -0.5, 1)
    : 0.5
  const autonomicStability = normalize(mean(hrv), 15, 70) * (1 - coefficientOfVariation(hr))
  const sleepRecovery = normalize(mean(sleep), 0, 100)

  const index = clamp(
    motorRecovery * 0.35 + autonomicStability * 0.35 + sleepRecovery * 0.3,
    0,
    1,
  ) * 100

  const phase =
    index < 25 ? "acute" : index < 50 ? "subacute" : index < 75 ? "chronic" : "recovered"

  const confidence = Math.min(stepsEarly.length + stepsLate.length, 14) / 14

  return { index, phase, motorRecovery, autonomicStability, sleepRecovery, confidence }
}

// ---------------------------------------------------------------------------
// 31. Vestibular Function Proxy
// ---------------------------------------------------------------------------

export interface VestibularFunctionResult {
  score: number
  status: "impaired" | "reduced" | "normal" | "strong"
  balanceProxy: number
  autonomicStability: number
  spatialOrientation: number
  confidence: number
}

export async function vestibularFunctionProxy(
  userId: string,
  date: Date = new Date(),
): Promise<VestibularFunctionResult> {
  const start = windowStart(date, 7)
  const [steps, hr, hrv] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
  ])

  const balanceProxy = 1 - coefficientOfVariation(steps)
  const autonomicStability = normalize(mean(hrv), 15, 70) * (1 - coefficientOfVariation(hr))
  const spatialOrientation = normalize(mean(steps), 2000, 10000)

  const score = clamp(
    balanceProxy * 0.35 + autonomicStability * 0.35 + spatialOrientation * 0.3,
    0,
    1,
  ) * 100

  const status =
    score < 25 ? "impaired" : score < 50 ? "reduced" : score < 75 ? "normal" : "strong"

  const confidence = Math.min(steps.length, 7) / 7

  return { score, status, balanceProxy, autonomicStability, spatialOrientation, confidence }
}

// ---------------------------------------------------------------------------
// 32. Brain Age Estimation
// ---------------------------------------------------------------------------

export interface BrainAgeResult {
  estimatedAge: number
  delta: number
  category: "younger" | "typical" | "older"
  cardiovascularAge: number
  sleepAge: number
  activityAge: number
  confidence: number
}

export async function brainAgeEstimation(
  userId: string,
  date: Date = new Date(),
): Promise<BrainAgeResult> {
  const start = windowStart(date, 30)
  const [hrv, restHr, sleep, steps, spo2] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "spo2", start, date),
  ])

  const cardiovascularAge = 30 + (1 - normalize(mean(hrv), 15, 80)) * 40 +
    normalize(mean(restHr), 50, 90) * 20
  const sleepAge = 30 + (1 - normalize(mean(sleep), 0, 100)) * 35
  const activityAge = 30 + (1 - normalize(mean(steps), 2000, 12000)) * 30

  const estimatedAge = cardiovascularAge * 0.4 + sleepAge * 0.3 + activityAge * 0.3
  const chronologicalBaseline = 40
  const delta = estimatedAge - chronologicalBaseline

  const category = delta < -3 ? "younger" : delta > 3 ? "older" : "typical"
  const confidence = Math.min(hrv.length + restHr.length, 40) / 40

  return { estimatedAge, delta, category, cardiovascularAge, sleepAge, activityAge, confidence }
}

// ---------------------------------------------------------------------------
// 33. Neural Coherence Proxy
// ---------------------------------------------------------------------------

export interface NeuralCoherenceResult {
  score: number
  level: "low" | "moderate" | "high" | "peak"
  hrvCoherence: number
  respiratorySync: number
  autonomicAlignment: number
  confidence: number
}

export async function neuralCoherence(
  userId: string,
  date: Date = new Date(),
): Promise<NeuralCoherenceResult> {
  const start = windowStart(date, 1)
  const [hrv, hr, respRate] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "respiratory_rate", start, date),
  ])

  const hrvCoherence = 1 - coefficientOfVariation(hrv)
  const respiratorySync = respRate.length > 0
    ? 1 - normalize(coefficientOfVariation(respRate), 0, 0.3)
    : 0.5
  const autonomicAlignment = normalize(mean(hrv), 20, 80) * (1 - normalize(mean(hr), 50, 100))

  const score = clamp(
    hrvCoherence * 0.4 + respiratorySync * 0.3 + autonomicAlignment * 0.3,
    0,
    1,
  ) * 100

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "peak"

  const confidence = Math.min(hrv.length + hr.length, 20) / 20

  return { score, level, hrvCoherence, respiratorySync, autonomicAlignment, confidence }
}

// ---------------------------------------------------------------------------
// 34. Neural Inflammation Proxy
// ---------------------------------------------------------------------------

export interface NeuralInflammationResult {
  score: number
  level: "low" | "moderate" | "elevated" | "high"
  restingHrElevation: number
  hrvSuppression: number
  sleepDisturbance: number
  temperatureDeviation: number
  confidence: number
}

export async function neuralInflammation(
  userId: string,
  date: Date = new Date(),
): Promise<NeuralInflammationResult> {
  const start = windowStart(date, 7)
  const [restHr, hrv, sleep, temp] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "body_temperature", start, date),
  ])

  const restingHrElevation = normalize(mean(restHr), 55, 90)
  const hrvSuppression = 1 - normalize(mean(hrv), 10, 70)
  const sleepDisturbance = 1 - normalize(mean(sleep), 0, 100)
  const temperatureDeviation = temp.length > 0
    ? normalize(Math.abs(mean(temp) - 36.8), 0, 2)
    : 0.3

  const score = clamp(
    restingHrElevation * 0.3 + hrvSuppression * 0.3 + sleepDisturbance * 0.2 + temperatureDeviation * 0.2,
    0,
    1,
  ) * 100

  const level =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "elevated" : "high"

  const confidence = Math.min(restHr.length + hrv.length, 14) / 14

  return { score, level, restingHrElevation, hrvSuppression, sleepDisturbance, temperatureDeviation, confidence }
}

// ---------------------------------------------------------------------------
// 35. Cortical Arousal Proxy
// ---------------------------------------------------------------------------

export interface CorticalArousalResult {
  level: number
  state: "hypoarousal" | "low" | "optimal" | "hyperarousal"
  sympatheticTone: number
  alertnessProxy: number
  sensoryGating: number
  confidence: number
}

export async function corticalArousal(
  userId: string,
  date: Date = new Date(),
): Promise<CorticalArousalResult> {
  const start = windowStart(date, 1)
  const [hr, hrv, steps, sleep] = await Promise.all([
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
  ])

  const sympatheticTone = normalize(mean(hr), 50, 110)
  const alertnessProxy = normalize(mean(sleep), 5, 9) * normalize(mean(steps), 1000, 8000)
  const sensoryGating = normalize(mean(hrv), 20, 70)

  const level = clamp(
    sympatheticTone * 0.4 + alertnessProxy * 0.35 + (1 - sensoryGating) * 0.25,
    0,
    1,
  ) * 100

  const state =
    level < 20
      ? "hypoarousal"
      : level < 40
        ? "low"
        : level < 70
          ? "optimal"
          : "hyperarousal"

  const confidence = Math.min(hr.length + hrv.length, 15) / 15

  return { level, state, sympatheticTone, alertnessProxy, sensoryGating, confidence }
}

// ---------------------------------------------------------------------------
// 36. Prefrontal Function Proxy
// ---------------------------------------------------------------------------

export interface PrefrontalFunctionResult {
  score: number
  status: "impaired" | "reduced" | "normal" | "enhanced"
  executiveControl: number
  impulseRegulation: number
  workingMemoryProxy: number
  confidence: number
}

export async function prefrontalFunctionProxy(
  userId: string,
  date: Date = new Date(),
): Promise<PrefrontalFunctionResult> {
  const start = windowStart(date, 3)
  const [hrv, sleep, hr, steps] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const executiveControl = normalize(mean(hrv), 20, 80) * normalize(mean(sleep), 0, 100)
  const impulseRegulation = 1 - coefficientOfVariation(hr)
  const workingMemoryProxy = normalize(mean(sleep), 0, 100) *
    (1 - normalize(coefficientOfVariation(steps), 0, 0.8))

  const score = clamp(
    executiveControl * 0.4 + impulseRegulation * 0.3 + workingMemoryProxy * 0.3,
    0,
    1,
  ) * 100

  const status =
    score < 25 ? "impaired" : score < 50 ? "reduced" : score < 75 ? "normal" : "enhanced"

  const confidence = Math.min(hrv.length + sleep.length, 12) / 12

  return { score, status, executiveControl, impulseRegulation, workingMemoryProxy, confidence }
}

// ---------------------------------------------------------------------------
// 37. Hippocampal Health Proxy
// ---------------------------------------------------------------------------

export interface HippocampalHealthResult {
  score: number
  status: "poor" | "fair" | "good" | "excellent"
  memoryConsolidation: number
  neurogenesisFactor: number
  stressImpact: number
  confidence: number
}

export async function hippocampalHealthProxy(
  userId: string,
  date: Date = new Date(),
): Promise<HippocampalHealthResult> {
  const start = windowStart(date, 14)
  const [deepSleep, steps, hrv, hr] = await Promise.all([
    fetchMetric(userId, "deep_sleep", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
  ])

  const memoryConsolidation = normalize(mean(deepSleep), 0, 120)
  const neurogenesisFactor = normalize(mean(steps), 2000, 12000)
  const stressImpact = 1 - normalize(mean(hrv), 15, 80)

  const score = clamp(
    memoryConsolidation * 0.35 + neurogenesisFactor * 0.35 + (1 - stressImpact) * 0.3,
    0,
    1,
  ) * 100

  const status =
    score < 25 ? "poor" : score < 50 ? "fair" : score < 75 ? "good" : "excellent"

  const confidence = Math.min(deepSleep.length + steps.length, 28) / 28

  return { score, status, memoryConsolidation, neurogenesisFactor, stressImpact, confidence }
}

// ---------------------------------------------------------------------------
// 38. Amygdala Reactivity Proxy
// ---------------------------------------------------------------------------

export interface AmygdalaReactivityResult {
  score: number
  level: "blunted" | "normal" | "heightened" | "hyperreactive"
  emotionalArousal: number
  fearResponse: number
  stressRecovery: number
  confidence: number
}

export async function amygdalaReactivity(
  userId: string,
  date: Date = new Date(),
): Promise<AmygdalaReactivityResult> {
  const start = windowStart(date, 7)
  const [hr, hrv, sleep] = await Promise.all([
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
  ])

  const avgHr = mean(hr)
  const emotionalArousal = normalize(avgHr, 60, 100) * coefficientOfVariation(hr)
  const fearResponse = hr.filter((v) => v > avgHr * 1.25).length / Math.max(hr.length, 1)
  const stressRecovery = normalize(mean(hrv), 15, 80)

  const score = clamp(
    normalize(emotionalArousal, 0, 0.3) * 0.35 +
    fearResponse * 0.35 +
    (1 - stressRecovery) * 0.3,
    0,
    1,
  ) * 100

  const level =
    score < 20 ? "blunted" : score < 45 ? "normal" : score < 70 ? "heightened" : "hyperreactive"

  const confidence = Math.min(hr.length + hrv.length, 20) / 20

  return { score, level, emotionalArousal, fearResponse, stressRecovery, confidence }
}

// ---------------------------------------------------------------------------
// 39. Default Mode Network Proxy
// ---------------------------------------------------------------------------

export interface DefaultModeNetworkResult {
  activity: number
  state: "underactive" | "balanced" | "overactive"
  restfulness: number
  mindWandering: number
  selfReferentialProcessing: number
  confidence: number
}

export async function defaultModeNetworkProxy(
  userId: string,
  date: Date = new Date(),
): Promise<DefaultModeNetworkResult> {
  const start = windowStart(date, 3)
  const [hr, hrv, sleep, steps] = await Promise.all([
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const restfulness = normalize(mean(hrv), 20, 80)
  const mindWandering = 1 - normalize(coefficientOfVariation(hr), 0, 0.3)
  const selfReferentialProcessing = normalize(mean(sleep), 0, 100) *
    (1 - normalize(mean(steps), 2000, 10000))

  const activity = clamp(
    restfulness * 0.35 + mindWandering * 0.35 + selfReferentialProcessing * 0.3,
    0,
    1,
  ) * 100

  const state =
    activity < 30 ? "underactive" : activity > 70 ? "overactive" : "balanced"

  const confidence = Math.min(hr.length + hrv.length, 15) / 15

  return { activity, state, restfulness, mindWandering, selfReferentialProcessing, confidence }
}

// ---------------------------------------------------------------------------
// 40. Executive Control Proxy
// ---------------------------------------------------------------------------

export interface ExecutiveControlResult {
  score: number
  rating: "poor" | "fair" | "good" | "excellent"
  inhibition: number
  cognitiveFlexibility: number
  planning: number
  confidence: number
}

export async function executiveControl(
  userId: string,
  date: Date = new Date(),
): Promise<ExecutiveControlResult> {
  const start = windowStart(date, 3)
  const [hrv, sleep, hr, steps] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const inhibition = normalize(mean(hrv), 20, 80) * (1 - coefficientOfVariation(hr))
  const cognitiveFlexibility = normalize(mean(sleep), 0, 100) *
    normalize(coefficientOfVariation(steps), 0.05, 0.5)
  const planning = normalize(mean(hrv), 20, 80) * normalize(mean(sleep), 0, 100)

  const score = clamp(
    inhibition * 0.35 + cognitiveFlexibility * 0.35 + planning * 0.3,
    0,
    1,
  ) * 100

  const rating =
    score < 25 ? "poor" : score < 50 ? "fair" : score < 75 ? "good" : "excellent"

  const confidence = Math.min(hrv.length + sleep.length, 12) / 12

  return { score, rating, inhibition, cognitiveFlexibility, planning, confidence }
}

// ---------------------------------------------------------------------------
// 41. Working Memory Capacity Proxy
// ---------------------------------------------------------------------------

export interface WorkingMemoryCapacityResult {
  score: number
  capacity: "low" | "moderate" | "high" | "superior"
  attentionalControl: number
  cognitiveLoad: number
  refreshRate: number
  confidence: number
}

export async function workingMemoryCapacity(
  userId: string,
  date: Date = new Date(),
): Promise<WorkingMemoryCapacityResult> {
  const start = windowStart(date, 1)
  const [hrv, sleep, hr, spo2] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "spo2", start, date),
  ])

  const attentionalControl = normalize(mean(hrv), 20, 80) * (1 - coefficientOfVariation(hr))
  const cognitiveLoad = 1 - (normalize(mean(hr), 50, 100) * (1 - normalize(mean(hrv), 20, 80)))
  const refreshRate = normalize(mean(sleep), 0, 100) * normalize(mean(spo2), 92, 100)

  const score = clamp(
    attentionalControl * 0.4 + cognitiveLoad * 0.3 + refreshRate * 0.3,
    0,
    1,
  ) * 100

  const capacity =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "superior"

  const confidence = Math.min(hrv.length + sleep.length, 10) / 10

  return { score, capacity, attentionalControl, cognitiveLoad, refreshRate, confidence }
}

// ---------------------------------------------------------------------------
// 42. Processing Speed Proxy
// ---------------------------------------------------------------------------

export interface ProcessingSpeedResult {
  score: number
  rating: "slow" | "average" | "fast" | "superior"
  neuralEfficiency: number
  oxygenDelivery: number
  arousalOptimality: number
  confidence: number
}

export async function processingSpeedProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ProcessingSpeedResult> {
  const start = windowStart(date, 1)
  const [hrv, hr, spo2, sleep] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "spo2", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
  ])

  const neuralEfficiency = normalize(mean(hrv), 20, 80)
  const oxygenDelivery = normalize(mean(spo2), 90, 100)
  const optimalHr = Math.abs(mean(hr) - 72)
  const arousalOptimality = 1 - normalize(optimalHr, 0, 40)

  const score = clamp(
    neuralEfficiency * 0.35 + oxygenDelivery * 0.3 +
    arousalOptimality * 0.2 + normalize(mean(sleep), 5, 9) * 0.15,
    0,
    1,
  ) * 100

  const rating =
    score < 25 ? "slow" : score < 50 ? "average" : score < 75 ? "fast" : "superior"

  const confidence = Math.min(hrv.length + hr.length, 15) / 15

  return { score, rating, neuralEfficiency, oxygenDelivery, arousalOptimality, confidence }
}

// ---------------------------------------------------------------------------
// 43. Verbal Fluency Proxy
// ---------------------------------------------------------------------------

export interface VerbalFluencyResult {
  score: number
  level: "impaired" | "below_average" | "average" | "above_average"
  prefrontalActivity: number
  semanticAccess: number
  processingResource: number
  confidence: number
}

export async function verbalFluencyProxy(
  userId: string,
  date: Date = new Date(),
): Promise<VerbalFluencyResult> {
  const start = windowStart(date, 3)
  const [hrv, sleep, hr, spo2] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "spo2", start, date),
  ])

  const prefrontalActivity = normalize(mean(hrv), 20, 80) * normalize(mean(sleep), 0, 100)
  const semanticAccess = normalize(mean(sleep), 0, 100) *
    (1 - normalize(Math.abs(mean(hr) - 70), 0, 30))
  const processingResource = normalize(mean(spo2), 92, 100)

  const score = clamp(
    prefrontalActivity * 0.4 + semanticAccess * 0.35 + processingResource * 0.25,
    0,
    1,
  ) * 100

  const level =
    score < 25 ? "impaired" : score < 45 ? "below_average" : score < 70 ? "average" : "above_average"

  const confidence = Math.min(hrv.length + sleep.length, 12) / 12

  return { score, level, prefrontalActivity, semanticAccess, processingResource, confidence }
}

// ---------------------------------------------------------------------------
// 44. Spatial Reasoning Proxy
// ---------------------------------------------------------------------------

export interface SpatialReasoningResult {
  score: number
  level: "low" | "moderate" | "high" | "exceptional"
  parietalActivity: number
  visuospatialResource: number
  mentalRotation: number
  confidence: number
}

export async function spatialReasoningProxy(
  userId: string,
  date: Date = new Date(),
): Promise<SpatialReasoningResult> {
  const start = windowStart(date, 3)
  const [hrv, sleep, hr, steps, spo2] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "spo2", start, date),
  ])

  const parietalActivity = normalize(mean(hrv), 20, 80) * normalize(mean(spo2), 92, 100)
  const visuospatialResource = normalize(mean(sleep), 0, 100) *
    (1 - normalize(Math.abs(mean(hr) - 68), 0, 35))
  const mentalRotation = normalize(mean(steps), 2000, 10000) * normalize(mean(hrv), 20, 80)

  const score = clamp(
    parietalActivity * 0.35 + visuospatialResource * 0.35 + mentalRotation * 0.3,
    0,
    1,
  ) * 100

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "exceptional"

  const confidence = Math.min(hrv.length + sleep.length, 12) / 12

  return { score, level, parietalActivity, visuospatialResource, mentalRotation, confidence }
}

// ---------------------------------------------------------------------------
// 45. Attention Network Proxy
// ---------------------------------------------------------------------------

export interface AttentionNetworkResult {
  score: number
  status: "deficient" | "below_average" | "normal" | "superior"
  alertingNetwork: number
  orientingNetwork: number
  executiveNetwork: number
  confidence: number
}

export async function attentionNetworkProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AttentionNetworkResult> {
  const start = windowStart(date, 3)
  const [hrv, hr, sleep, spo2] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "spo2", start, date),
  ])

  const alertingNetwork = normalize(mean(hr), 55, 90) * normalize(mean(spo2), 92, 100)
  const orientingNetwork = normalize(mean(sleep), 0, 100) *
    (1 - coefficientOfVariation(hr))
  const executiveNetwork = normalize(mean(hrv), 20, 80) * normalize(mean(sleep), 0, 100)

  const score = clamp(
    alertingNetwork * 0.3 + orientingNetwork * 0.35 + executiveNetwork * 0.35,
    0,
    1,
  ) * 100

  const status =
    score < 25 ? "deficient" : score < 50 ? "below_average" : score < 75 ? "normal" : "superior"

  const confidence = Math.min(hrv.length + hr.length, 15) / 15

  return { score, status, alertingNetwork, orientingNetwork, executiveNetwork, confidence }
}

// ---------------------------------------------------------------------------
// 46. Inhibitory Control Proxy
// ---------------------------------------------------------------------------

export interface InhibitoryControlResult {
  score: number
  level: "poor" | "fair" | "good" | "excellent"
  prefrontalEngagement: number
  impulseSuppression: number
  errorMonitoring: number
  confidence: number
}

export async function inhibitoryControl(
  userId: string,
  date: Date = new Date(),
): Promise<InhibitoryControlResult> {
  const start = windowStart(date, 3)
  const [hrv, hr, sleep] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
  ])

  const prefrontalEngagement = normalize(mean(hrv), 20, 80)
  const impulseSuppression = 1 - coefficientOfVariation(hr)
  const errorMonitoring = normalize(mean(sleep), 0, 100) * prefrontalEngagement

  const score = clamp(
    prefrontalEngagement * 0.4 + impulseSuppression * 0.3 + errorMonitoring * 0.3,
    0,
    1,
  ) * 100

  const level =
    score < 25 ? "poor" : score < 50 ? "fair" : score < 75 ? "good" : "excellent"

  const confidence = Math.min(hrv.length + hr.length, 12) / 12

  return { score, level, prefrontalEngagement, impulseSuppression, errorMonitoring, confidence }
}

// ---------------------------------------------------------------------------
// 47. Task Switching Cost Proxy
// ---------------------------------------------------------------------------

export interface TaskSwitchingCostResult {
  costMs: number
  efficiency: "poor" | "fair" | "good" | "excellent"
  cognitiveFlexibility: number
  mentalFatigue: number
  attentionalInertia: number
  confidence: number
}

export async function taskSwitchingCost(
  userId: string,
  date: Date = new Date(),
): Promise<TaskSwitchingCostResult> {
  const start = windowStart(date, 1)
  const [hrv, hr, sleep, spo2] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "spo2", start, date),
  ])

  const cognitiveFlexibility = normalize(mean(hrv), 20, 80) * normalize(mean(spo2), 92, 100)
  const mentalFatigue = Math.max(0, 8 - mean(sleep)) / 8
  const attentionalInertia = coefficientOfVariation(hr)

  const baseCost = 200
  const costMs = clamp(
    baseCost + (1 - cognitiveFlexibility) * 300 + mentalFatigue * 200 + attentionalInertia * 150,
    100,
    800,
  )

  const efficiency =
    costMs < 200 ? "excellent" : costMs < 350 ? "good" : costMs < 500 ? "fair" : "poor"

  const confidence = Math.min(hrv.length + hr.length, 10) / 10

  return { costMs, efficiency, cognitiveFlexibility, mentalFatigue, attentionalInertia, confidence }
}

// ---------------------------------------------------------------------------
// 48. Dual Task Interference Proxy
// ---------------------------------------------------------------------------

export interface DualTaskInterferenceResult {
  interferenceIndex: number
  severity: "minimal" | "mild" | "moderate" | "severe"
  resourceCompetition: number
  bottleneckRisk: number
  dividedAttention: number
  confidence: number
}

export async function dualTaskInterference(
  userId: string,
  date: Date = new Date(),
): Promise<DualTaskInterferenceResult> {
  const start = windowStart(date, 1)
  const [hrv, hr, sleep, spo2] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "spo2", start, date),
  ])

  const resourceCompetition = 1 - normalize(mean(hrv), 20, 80)
  const bottleneckRisk = normalize(mean(hr), 60, 100) * (1 - normalize(mean(spo2), 92, 100))
  const dividedAttention = normalize(mean(sleep), 0, 100) *
    normalize(mean(hrv), 20, 80)

  const interferenceIndex = clamp(
    resourceCompetition * 0.4 + bottleneckRisk * 0.3 + (1 - dividedAttention) * 0.3,
    0,
    1,
  ) * 100

  const severity =
    interferenceIndex < 20
      ? "minimal"
      : interferenceIndex < 45
        ? "mild"
        : interferenceIndex < 70
          ? "moderate"
          : "severe"

  const confidence = Math.min(hrv.length + hr.length, 10) / 10

  return { interferenceIndex, severity, resourceCompetition, bottleneckRisk, dividedAttention, confidence }
}

// ---------------------------------------------------------------------------
// 49. Cognitive Endurance Proxy
// ---------------------------------------------------------------------------

export interface CognitiveEnduranceResult {
  score: number
  rating: "poor" | "fair" | "good" | "excellent"
  sustainedAttention: number
  mentalStamina: number
  fatigueResistance: number
  confidence: number
}

export async function cognitiveEndurance(
  userId: string,
  date: Date = new Date(),
): Promise<CognitiveEnduranceResult> {
  const start = windowStart(date, 7)
  const [sleep, hrv, steps, hr] = await Promise.all([
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "heart_rate", start, date),
  ])

  const sustainedAttention = normalize(mean(hrv), 20, 80) * (1 - coefficientOfVariation(hr))
  const mentalStamina = normalize(mean(sleep), 6, 9) * normalize(mean(steps), 3000, 10000)
  const fatigueResistance = 1 - coefficientOfVariation(steps)

  const score = clamp(
    sustainedAttention * 0.35 + mentalStamina * 0.35 + fatigueResistance * 0.3,
    0,
    1,
  ) * 100

  const rating =
    score < 25 ? "poor" : score < 50 ? "fair" : score < 75 ? "good" : "excellent"

  const confidence = Math.min(sleep.length + hrv.length, 14) / 14

  return { score, rating, sustainedAttention, mentalStamina, fatigueResistance, confidence }
}

// ---------------------------------------------------------------------------
// 50. Brain Connectivity Proxy
// ---------------------------------------------------------------------------

export interface BrainConnectivityResult {
  index: number
  status: "weak" | "moderate" | "strong" | "optimal"
  interHemisphericSync: number
  networkIntegration: number
  functionalConnectivity: number
  confidence: number
}

export async function brainConnectivityProxy(
  userId: string,
  date: Date = new Date(),
): Promise<BrainConnectivityResult> {
  const start = windowStart(date, 7)
  const [hrv, hr, sleep, steps] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "steps", start, date),
  ])

  const interHemisphericSync = 1 - coefficientOfVariation(hrv)
  const networkIntegration = normalize(mean(sleep), 0, 100) * normalize(mean(steps), 2000, 10000)
  const functionalConnectivity = normalize(mean(hrv), 20, 80) *
    (1 - coefficientOfVariation(hr))

  const index = clamp(
    interHemisphericSync * 0.35 + networkIntegration * 0.3 + functionalConnectivity * 0.35,
    0,
    1,
  ) * 100

  const status =
    index < 25 ? "weak" : index < 50 ? "moderate" : index < 75 ? "strong" : "optimal"

  const confidence = Math.min(hrv.length + hr.length, 14) / 14

  return { index, status, interHemisphericSync, networkIntegration, functionalConnectivity, confidence }
}

// ---------------------------------------------------------------------------
// 51. Neurogenesis Proxy
// ---------------------------------------------------------------------------

export interface NeurogenesisResult {
  score: number
  potential: "low" | "moderate" | "high" | "optimal"
  aerobicExercise: number
  sleepSupport: number
  stressModulation: number
  confidence: number
}

export async function neurogenesisProxy(
  userId: string,
  date: Date = new Date(),
): Promise<NeurogenesisResult> {
  const start = windowStart(date, 14)
  const [steps, sleep, hrv, hr] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
  ])

  const aerobicExercise = normalize(mean(steps), 3000, 15000)
  const sleepSupport = normalize(mean(sleep), 6, 9)
  const stressModulation = normalize(mean(hrv), 20, 80)

  const score = clamp(
    aerobicExercise * 0.45 + sleepSupport * 0.3 + stressModulation * 0.25,
    0,
    1,
  ) * 100

  const potential =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "optimal"

  const confidence = Math.min(steps.length, 14) / 14

  return { score, potential, aerobicExercise, sleepSupport, stressModulation, confidence }
}

// ---------------------------------------------------------------------------
// 52. Synaptic Plasticity Proxy
// ---------------------------------------------------------------------------

export interface SynapticPlasticityResult {
  score: number
  level: "low" | "moderate" | "high" | "optimal"
  ltpProxy: number
  bdnfProxy: number
  sleepConsolidation: number
  confidence: number
}

export async function synapticPlasticityProxy(
  userId: string,
  date: Date = new Date(),
): Promise<SynapticPlasticityResult> {
  const start = windowStart(date, 14)
  const [steps, deepSleep, hrv, sleep] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "deep_sleep", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
  ])

  const ltpProxy = normalize(mean(deepSleep), 0, 120) * normalize(mean(hrv), 20, 80)
  const bdnfProxy = normalize(mean(steps), 3000, 12000)
  const sleepConsolidation = normalize(mean(sleep), 0, 100)

  const score = clamp(
    ltpProxy * 0.35 + bdnfProxy * 0.35 + sleepConsolidation * 0.3,
    0,
    1,
  ) * 100

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "optimal"

  const confidence = Math.min(steps.length + deepSleep.length, 28) / 28

  return { score, level, ltpProxy, bdnfProxy, sleepConsolidation, confidence }
}

// ---------------------------------------------------------------------------
// 53. Myelination Proxy
// ---------------------------------------------------------------------------

export interface MyelinationResult {
  score: number
  status: "poor" | "fair" | "good" | "excellent"
  sleepMyelination: number
  exerciseSupport: number
  metabolicHealth: number
  confidence: number
}

export async function myelinationProxy(
  userId: string,
  date: Date = new Date(),
): Promise<MyelinationResult> {
  const start = windowStart(date, 14)
  const [deepSleep, sleep, steps, hrv, glucose] = await Promise.all([
    fetchMetric(userId, "deep_sleep", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "blood_glucose", start, date),
  ])

  const sleepMyelination = normalize(mean(deepSleep), 0, 120) * normalize(mean(sleep), 6, 9)
  const exerciseSupport = normalize(mean(steps), 2000, 10000)
  const metabolicHealth = glucose.length > 0
    ? 1 - normalize(Math.abs(mean(glucose) - 90), 0, 60)
    : normalize(mean(hrv), 20, 70)

  const score = clamp(
    sleepMyelination * 0.35 + exerciseSupport * 0.35 + metabolicHealth * 0.3,
    0,
    1,
  ) * 100

  const status =
    score < 25 ? "poor" : score < 50 ? "fair" : score < 75 ? "good" : "excellent"

  const confidence = Math.min(deepSleep.length + steps.length, 28) / 28

  return { score, status, sleepMyelination, exerciseSupport, metabolicHealth, confidence }
}

// ---------------------------------------------------------------------------
// 54. Blood-Brain Barrier Proxy
// ---------------------------------------------------------------------------

export interface BloodBrainBarrierResult {
  integrityScore: number
  status: "compromised" | "weakened" | "intact" | "strong"
  inflammatoryLoad: number
  sleepProtection: number
  vascularHealth: number
  confidence: number
}

export async function bloodBrainBarrierProxy(
  userId: string,
  date: Date = new Date(),
): Promise<BloodBrainBarrierResult> {
  const start = windowStart(date, 7)
  const [restHr, hrv, sleep, spo2, temp] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "spo2", start, date),
    fetchMetric(userId, "body_temperature", start, date),
  ])

  const inflammatoryLoad = normalize(mean(restHr), 55, 90) +
    (temp.length > 0 ? normalize(Math.abs(mean(temp) - 36.8), 0, 1.5) : 0.2)
  const sleepProtection = normalize(mean(sleep), 0, 100)
  const vascularHealth = normalize(mean(hrv), 15, 75) * normalize(mean(spo2), 92, 100)

  const integrityScore = clamp(
    (1 - normalize(inflammatoryLoad, 0, 2)) * 0.35 + sleepProtection * 0.35 + vascularHealth * 0.3,
    0,
    1,
  ) * 100

  const status =
    integrityScore < 25
      ? "compromised"
      : integrityScore < 50
        ? "weakened"
        : integrityScore < 75
          ? "intact"
          : "strong"

  const confidence = Math.min(restHr.length + hrv.length, 14) / 14

  return { integrityScore, status, inflammatoryLoad, sleepProtection, vascularHealth, confidence }
}

// ---------------------------------------------------------------------------
// 55. Glial Cell Health Proxy
// ---------------------------------------------------------------------------

export interface GlialCellHealthResult {
  score: number
  status: "poor" | "fair" | "good" | "excellent"
  glymphaticFunction: number
  metabolicSupport: number
  inflammatoryStatus: number
  confidence: number
}

export async function glialCellHealth(
  userId: string,
  date: Date = new Date(),
): Promise<GlialCellHealthResult> {
  const start = windowStart(date, 7)
  const [deepSleep, sleep, hrv, restHr, spo2] = await Promise.all([
    fetchMetric(userId, "deep_sleep", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "spo2", start, date),
  ])

  const glymphaticFunction = normalize(mean(deepSleep), 0, 120) * normalize(mean(sleep), 6, 9)
  const metabolicSupport = normalize(mean(spo2), 92, 100) * normalize(mean(hrv), 20, 80)
  const inflammatoryStatus = 1 - normalize(mean(restHr), 55, 85)

  const score = clamp(
    glymphaticFunction * 0.4 + metabolicSupport * 0.3 + inflammatoryStatus * 0.3,
    0,
    1,
  ) * 100

  const status =
    score < 25 ? "poor" : score < 50 ? "fair" : score < 75 ? "good" : "excellent"

  const confidence = Math.min(deepSleep.length + sleep.length, 14) / 14

  return { score, status, glymphaticFunction, metabolicSupport, inflammatoryStatus, confidence }
}

// ---------------------------------------------------------------------------
// 56. Neurotrophic Factor Proxy
// ---------------------------------------------------------------------------

export interface NeurotrophicFactorResult {
  score: number
  level: "depleted" | "low" | "adequate" | "elevated"
  bdnfProxy: number
  ngfProxy: number
  exerciseStimulation: number
  confidence: number
}

export async function neurotrophicFactorProxy(
  userId: string,
  date: Date = new Date(),
): Promise<NeurotrophicFactorResult> {
  const start = windowStart(date, 14)
  const [steps, sleep, hrv, hr] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
  ])

  const exerciseStimulation = normalize(mean(steps), 3000, 15000)
  const bdnfProxy = exerciseStimulation * 0.6 + normalize(mean(sleep), 0, 100) * 0.4
  const ngfProxy = normalize(mean(hrv), 20, 80) * normalize(mean(sleep), 0, 100)

  const score = clamp(
    bdnfProxy * 0.4 + ngfProxy * 0.3 + exerciseStimulation * 0.3,
    0,
    1,
  ) * 100

  const level =
    score < 20 ? "depleted" : score < 45 ? "low" : score < 70 ? "adequate" : "elevated"

  const confidence = Math.min(steps.length, 14) / 14

  return { score, level, bdnfProxy, ngfProxy, exerciseStimulation, confidence }
}

// ---------------------------------------------------------------------------
// 57. Dopaminergic Tone Proxy
// ---------------------------------------------------------------------------

export interface DopaminergicToneResult {
  score: number
  status: "depleted" | "low" | "balanced" | "elevated"
  motivationProxy: number
  rewardSensitivity: number
  motorDrive: number
  confidence: number
}

export async function dopaminergicTone(
  userId: string,
  date: Date = new Date(),
): Promise<DopaminergicToneResult> {
  const start = windowStart(date, 7)
  const [steps, sleep, hr, hrv] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
  ])

  const motivationProxy = normalize(mean(steps), 2000, 12000)
  const rewardSensitivity = normalize(mean(sleep), 0, 100) *
    (1 - coefficientOfVariation(steps))
  const motorDrive = normalize(mean(steps), 1000, 10000) *
    (1 - normalize(Math.abs(mean(hr) - 72), 0, 30))

  const score = clamp(
    motivationProxy * 0.4 + rewardSensitivity * 0.3 + motorDrive * 0.3,
    0,
    1,
  ) * 100

  const status =
    score < 20 ? "depleted" : score < 45 ? "low" : score < 70 ? "balanced" : "elevated"

  const confidence = Math.min(steps.length + sleep.length, 14) / 14

  return { score, status, motivationProxy, rewardSensitivity, motorDrive, confidence }
}

// ---------------------------------------------------------------------------
// 58. Cholinergic Function Proxy
// ---------------------------------------------------------------------------

export interface CholinergicFunctionResult {
  score: number
  status: "deficient" | "low" | "normal" | "optimal"
  attentionModulation: number
  memoryEncoding: number
  parasympatheticTone: number
  confidence: number
}

export async function cholinergicFunction(
  userId: string,
  date: Date = new Date(),
): Promise<CholinergicFunctionResult> {
  const start = windowStart(date, 7)
  const [hrv, hr, sleep, deepSleep] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "deep_sleep", start, date),
  ])

  const parasympatheticTone = normalize(mean(hrv), 15, 80)
  const attentionModulation = parasympatheticTone * (1 - coefficientOfVariation(hr))
  const memoryEncoding = normalize(mean(deepSleep), 0, 120) * normalize(mean(sleep), 0, 100)

  const score = clamp(
    attentionModulation * 0.35 + memoryEncoding * 0.35 + parasympatheticTone * 0.3,
    0,
    1,
  ) * 100

  const status =
    score < 20 ? "deficient" : score < 45 ? "low" : score < 70 ? "normal" : "optimal"

  const confidence = Math.min(hrv.length + deepSleep.length, 14) / 14

  return { score, status, attentionModulation, memoryEncoding, parasympatheticTone, confidence }
}

// ---------------------------------------------------------------------------
// 59. GABAergic Tone Proxy
// ---------------------------------------------------------------------------

export interface GABAergicToneResult {
  score: number
  status: "deficient" | "low" | "balanced" | "elevated"
  inhibitoryBalance: number
  anxiolysis: number
  sleepPromotion: number
  confidence: number
}

export async function gabaergicTone(
  userId: string,
  date: Date = new Date(),
): Promise<GABAergicToneResult> {
  const start = windowStart(date, 7)
  const [hrv, hr, sleep, deepSleep] = await Promise.all([
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "deep_sleep", start, date),
  ])

  const inhibitoryBalance = normalize(mean(hrv), 20, 80) * (1 - normalize(mean(hr), 50, 100))
  const anxiolysis = 1 - coefficientOfVariation(hr)
  const sleepPromotion = normalize(mean(deepSleep), 0, 120) * normalize(mean(sleep), 0, 100)

  const score = clamp(
    inhibitoryBalance * 0.35 + anxiolysis * 0.3 + sleepPromotion * 0.35,
    0,
    1,
  ) * 100

  const status =
    score < 20 ? "deficient" : score < 45 ? "low" : score < 70 ? "balanced" : "elevated"

  const confidence = Math.min(hrv.length + deepSleep.length, 14) / 14

  return { score, status, inhibitoryBalance, anxiolysis, sleepPromotion, confidence }
}

// ---------------------------------------------------------------------------
// 60. Glutamatergic Balance Proxy
// ---------------------------------------------------------------------------

export interface GlutamatergicBalanceResult {
  score: number
  status: "hypoactive" | "balanced" | "excitotoxic"
  excitatoryDrive: number
  inhibitoryCounterbalance: number
  metabolicSupport: number
  confidence: number
}

export async function glutamatergicBalance(
  userId: string,
  date: Date = new Date(),
): Promise<GlutamatergicBalanceResult> {
  const start = windowStart(date, 7)
  const [hr, hrv, spo2, sleep, restHr] = await Promise.all([
    fetchMetric(userId, "heart_rate", start, date),
    fetchMetric(userId, "hrv", start, date),
    fetchMetric(userId, "spo2", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const excitatoryDrive = normalize(mean(hr), 55, 100) * (1 - normalize(mean(hrv), 20, 80))
  const inhibitoryCounterbalance = normalize(mean(hrv), 15, 80) *
    normalize(mean(sleep), 0, 100)
  const metabolicSupport = normalize(mean(spo2), 92, 100)

  const balance = 1 - Math.abs(excitatoryDrive - inhibitoryCounterbalance)

  const score = clamp(
    balance * 0.4 + inhibitoryCounterbalance * 0.3 + metabolicSupport * 0.3,
    0,
    1,
  ) * 100

  const status =
    excitatoryDrive > inhibitoryCounterbalance * 1.5
      ? "excitotoxic"
      : excitatoryDrive < inhibitoryCounterbalance * 0.5
        ? "hypoactive"
        : "balanced"

  const confidence = Math.min(hr.length + hrv.length, 14) / 14

  return { score, status, excitatoryDrive, inhibitoryCounterbalance, metabolicSupport, confidence }
}
