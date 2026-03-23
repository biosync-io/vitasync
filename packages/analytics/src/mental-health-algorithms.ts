import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, sql } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

async function fetchMetric(
  userId: string,
  metricName: string,
  startDate: Date,
  endDate: Date,
): Promise<number[]> {
  const db = getDb()
  const rows = await db
    .select({ value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, metricName),
        gte(healthMetrics.recordedAt, startDate),
        lte(healthMetrics.recordedAt, endDate),
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
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1))
}

function coefficientOfVariation(values: number[]): number {
  const m = mean(values)
  if (m === 0) return 0
  return stddev(values) / Math.abs(m)
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000
}

function daysAgo(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

function normalize(value: number, minIn: number, maxIn: number): number {
  if (maxIn === minIn) return 0.5
  return clamp(((value - minIn) / (maxIn - minIn)) * 100)
}

function linearDecay(values: number[]): number {
  if (values.length === 0) return 0
  const weights = values.map((_, i) => 1 - i / (values.length + 1))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  return values.reduce((s, v, i) => s + v * weights[i]!, 0) / totalWeight
}

function slope(values: number[]): number {
  if (values.length < 2) return 0
  const n = values.length
  const xs = values.map((_, i) => i)
  const xMean = mean(xs)
  const yMean = mean(values)
  const num = xs.reduce((s, x, i) => s + (x - xMean) * (values[i]! - yMean), 0)
  const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0)
  return den === 0 ? 0 : num / den
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 3) return 0
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const diffA = a[i]! - ma
    const diffB = b[i]! - mb
    num += diffA * diffB
    da += diffA ** 2
    db += diffB ** 2
  }
  const den = Math.sqrt(da * db)
  return den === 0 ? 0 : num / den
}

function entropy(values: number[], bins = 10): number {
  if (values.length === 0) return 0
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return 0
  const binWidth = (max - min) / bins
  const counts = new Array(bins).fill(0)
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1)
    counts[idx]++
  }
  const total = values.length
  return -counts.reduce((s, c) => {
    if (c === 0) return s
    const p = c / total
    return s + p * Math.log2(p)
  }, 0)
}

// ---------------------------------------------------------------------------
// 1. Anxiety Index
// ---------------------------------------------------------------------------

export interface AnxietyIndexResult {
  score: number
  level: "minimal" | "mild" | "moderate" | "severe"
  heartRateComponent: number
  hrvComponent: number
  sleepComponent: number
  respiratoryComponent: number
}

export async function calculateAnxietyIndex(
  userId: string,
  date: Date = new Date(),
): Promise<AnxietyIndexResult> {
  const start = daysAgo(date, 7)
  const [hr, hrv, sleep, resp] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "respiratory_rate", start, date),
  ])

  const hrComponent = clamp(((mean(hr) - 60) / 40) * 100)
  const hrvComponent = clamp(100 - ((mean(hrv) - 20) / 80) * 100)
  const sleepComponent = clamp(100 - mean(sleep))
  const respComponent = clamp(((mean(resp) - 12) / 12) * 100)

  const score = clamp(
    hrComponent * 0.3 + hrvComponent * 0.3 + sleepComponent * 0.2 + respComponent * 0.2,
  )

  const level =
    score < 25 ? "minimal" : score < 50 ? "mild" : score < 75 ? "moderate" : "severe"

  return {
    score,
    level,
    heartRateComponent: hrComponent,
    hrvComponent: hrvComponent,
    sleepComponent: sleepComponent,
    respiratoryComponent: respComponent,
  }
}

// ---------------------------------------------------------------------------
// 2. Depression Risk (PHQ-9-like)
// ---------------------------------------------------------------------------

export interface DepressionRiskResult {
  score: number
  severity: "none" | "mild" | "moderate" | "moderately_severe" | "severe"
  activityDecline: number
  sleepDisturbance: number
  heartRateVariabilityLoss: number
  energyDeficit: number
  socialWithdrawal: number
}

export async function calculateDepressionRisk(
  userId: string,
  date: Date = new Date(),
): Promise<DepressionRiskResult> {
  const start = daysAgo(date, 14)
  const [activity, sleep, hrv, energy, steps] = await Promise.all([
    fetchMetric(userId, "activity_score", start, date),
    fetchMetric(userId, "sleep_efficiency", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "daily_steps", start, date),
  ])

  const activityDecline = clamp(100 - mean(activity))
  const sleepDisturbance = clamp(100 - mean(sleep))
  const hrvLoss = clamp(100 - normalize(mean(hrv), 20, 100))
  const energyDeficit = clamp(100 - mean(energy))
  const socialWithdrawal = clamp(100 - normalize(mean(steps), 2000, 12000))

  const score = clamp(
    activityDecline * 0.25 +
      sleepDisturbance * 0.2 +
      hrvLoss * 0.2 +
      energyDeficit * 0.2 +
      socialWithdrawal * 0.15,
  )

  const severity =
    score < 10
      ? "none"
      : score < 30
        ? "mild"
        : score < 50
          ? "moderate"
          : score < 70
            ? "moderately_severe"
            : "severe"

  return {
    score,
    severity,
    activityDecline,
    sleepDisturbance,
    heartRateVariabilityLoss: hrvLoss,
    energyDeficit,
    socialWithdrawal,
  }
}

// ---------------------------------------------------------------------------
// 3. Stress Level Assessment
// ---------------------------------------------------------------------------

export interface StressLevelResult {
  score: number
  level: "low" | "moderate" | "high" | "very_high"
  cortisolProxy: number
  autonomicStrain: number
  sleepImpact: number
  activityStress: number
}

export async function calculateStressLevel(
  userId: string,
  date: Date = new Date(),
): Promise<StressLevelResult> {
  const start = daysAgo(date, 7)
  const [hr, hrv, sleep, skinTemp] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "skin_temperature", start, date),
  ])

  const cortisolProxy = clamp(((mean(hr) - 55) / 45) * 100)
  const autonomicStrain = clamp(100 - normalize(mean(hrv), 20, 100))
  const sleepImpact = clamp(100 - normalize(mean(sleep), 300, 540))
  const activityStress = clamp(coefficientOfVariation(skinTemp) * 200)

  const score = clamp(
    cortisolProxy * 0.3 + autonomicStrain * 0.3 + sleepImpact * 0.25 + activityStress * 0.15,
  )

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "very_high"

  return {
    score,
    level,
    "cortisolProxy": cortisolProxy,
    autonomicStrain,
    sleepImpact,
    activityStress,
  }
}

// ---------------------------------------------------------------------------
// 4. Mood Stability
// ---------------------------------------------------------------------------

export interface MoodStabilityResult {
  score: number
  classification: "stable" | "mildly_variable" | "variable" | "highly_variable"
  variabilityIndex: number
  trendDirection: number
  rhythmRegularity: number
}

export async function calculateMoodStability(
  userId: string,
  date: Date = new Date(),
): Promise<MoodStabilityResult> {
  const start = daysAgo(date, 30)
  const [mood, hrv, sleep] = await Promise.all([
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "sleep_regularity", start, date),
  ])

  const variabilityIndex = clamp(coefficientOfVariation(mood) * 200)
  const trendDirection = slope(mood)
  const rhythmRegularity = clamp(100 - coefficientOfVariation(sleep) * 200)

  const score = clamp(
    100 - variabilityIndex * 0.5 - Math.abs(trendDirection) * 20 + rhythmRegularity * 0.3,
  )

  const classification =
    score > 75
      ? "stable"
      : score > 50
        ? "mildly_variable"
        : score > 25
          ? "variable"
          : "highly_variable"

  return { score, classification, variabilityIndex, trendDirection, rhythmRegularity }
}

// ---------------------------------------------------------------------------
// 5. Emotional Resilience
// ---------------------------------------------------------------------------

export interface EmotionalResilienceResult {
  score: number
  level: "low" | "moderate" | "high" | "very_high"
  recoveryRate: number
  baselineStability: number
  adaptiveCapacity: number
}

export async function calculateEmotionalResilience(
  userId: string,
  date: Date = new Date(),
): Promise<EmotionalResilienceResult> {
  const start = daysAgo(date, 30)
  const [hrv, rhr, sleep, activity] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "activity_score", start, date),
  ])

  const hrvTrend = slope(hrv)
  const recoveryRate = clamp(normalize(hrvTrend, -2, 2) + normalize(mean(hrv), 20, 100)) / 2
  const baselineStability = clamp(100 - coefficientOfVariation(rhr) * 300)
  const adaptiveCapacity = clamp(
    (normalize(mean(sleep), 40, 100) + normalize(mean(activity), 30, 100)) / 2,
  )

  const score = clamp(recoveryRate * 0.4 + baselineStability * 0.3 + adaptiveCapacity * 0.3)

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "very_high"

  return { score, level, recoveryRate, baselineStability, adaptiveCapacity }
}

// ---------------------------------------------------------------------------
// 6. Burnout Risk
// ---------------------------------------------------------------------------

export interface BurnoutRiskResult {
  score: number
  risk: "low" | "moderate" | "high" | "critical"
  exhaustionIndex: number
  detachmentIndex: number
  efficacyDecline: number
  physiologicalStrain: number
}

export async function calculateBurnoutRisk(
  userId: string,
  date: Date = new Date(),
): Promise<BurnoutRiskResult> {
  const start = daysAgo(date, 30)
  const [energy, sleep, hrv, steps, rhr] = await Promise.all([
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "sleep_efficiency", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const exhaustionIndex = clamp(100 - mean(energy))
  const detachmentIndex = clamp(100 - normalize(mean(steps), 2000, 12000))
  const efficacyDecline = clamp(Math.abs(slope(energy)) * 50)
  const physiologicalStrain = clamp(
    (clamp(((mean(rhr) - 55) / 45) * 100) + clamp(100 - normalize(mean(hrv), 20, 100))) / 2,
  )

  const score = clamp(
    exhaustionIndex * 0.3 +
      detachmentIndex * 0.2 +
      efficacyDecline * 0.2 +
      physiologicalStrain * 0.3,
  )

  const risk =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "critical"

  return { score, risk, exhaustionIndex, detachmentIndex, efficacyDecline, physiologicalStrain }
}

// ---------------------------------------------------------------------------
// 7. PTSD Markers
// ---------------------------------------------------------------------------

export interface PtsdMarkersResult {
  score: number
  riskLevel: "low" | "moderate" | "elevated" | "high"
  hyperarousalIndex: number
  sleepFragmentation: number
  startleResponseProxy: number
  avoidanceBehavior: number
}

export async function calculatePtsdMarkers(
  userId: string,
  date: Date = new Date(),
): Promise<PtsdMarkersResult> {
  const start = daysAgo(date, 14)
  const [rhr, hrv, sleepInterruptions, steps, sleepOnset] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "sleep_interruptions", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_onset_latency", start, date),
  ])

  const hyperarousalIndex = clamp(
    (clamp(((mean(rhr) - 55) / 45) * 100) + clamp(100 - normalize(mean(hrv), 20, 100))) / 2,
  )
  const sleepFragmentation = clamp(normalize(mean(sleepInterruptions), 0, 10))
  const startleResponseProxy = clamp(coefficientOfVariation(rhr) * 400)
  const avoidanceBehavior = clamp(100 - normalize(mean(steps), 2000, 12000))

  const score = clamp(
    hyperarousalIndex * 0.3 +
      sleepFragmentation * 0.3 +
      startleResponseProxy * 0.2 +
      avoidanceBehavior * 0.2,
  )

  const riskLevel =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "elevated" : "high"

  return { score, riskLevel, hyperarousalIndex, sleepFragmentation, startleResponseProxy, avoidanceBehavior }
}

// ---------------------------------------------------------------------------
// 8. Sleep-Mood Correlation
// ---------------------------------------------------------------------------

export interface SleepMoodCorrelationResult {
  correlationCoefficient: number
  strength: "none" | "weak" | "moderate" | "strong"
  sleepQualityTrend: number
  moodTrend: number
  lagEffect: number
}

export async function calculateSleepMoodCorrelation(
  userId: string,
  date: Date = new Date(),
): Promise<SleepMoodCorrelationResult> {
  const start = daysAgo(date, 30)
  const [sleep, mood] = await Promise.all([
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "mood_score", start, date),
  ])

  const correlationCoefficient = pearson(sleep, mood)
  const sleepQualityTrend = slope(sleep)
  const moodTrend = slope(mood)

  const laggedSleep = sleep.slice(1)
  const laggedMood = mood.slice(0, laggedSleep.length)
  const lagEffect = pearson(laggedSleep, laggedMood)

  const absCorr = Math.abs(correlationCoefficient)
  const strength =
    absCorr < 0.2 ? "none" : absCorr < 0.4 ? "weak" : absCorr < 0.7 ? "moderate" : "strong"

  return { correlationCoefficient, strength, sleepQualityTrend, moodTrend, lagEffect }
}

// ---------------------------------------------------------------------------
// 9. Social Engagement Proxy
// ---------------------------------------------------------------------------

export interface SocialEngagementProxyResult {
  score: number
  level: "isolated" | "low" | "moderate" | "high"
  mobilityIndex: number
  activityVariety: number
  circadianAlignment: number
}

export async function calculateSocialEngagementProxy(
  userId: string,
  date: Date = new Date(),
): Promise<SocialEngagementProxyResult> {
  const start = daysAgo(date, 14)
  const [steps, locations, sleepMidpoint, activeMinutes] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "sleep_midpoint", start, date),
    fetchMetric(userId, "active_minutes", start, date),
  ])

  const mobilityIndex = clamp(normalize(mean(steps), 2000, 12000) * 0.5 + normalize(mean(locations), 1, 8) * 0.5)
  const activityVariety = clamp(100 - coefficientOfVariation(activeMinutes) * 150)
  const circadianAlignment = clamp(100 - coefficientOfVariation(sleepMidpoint) * 300)

  const score = clamp(mobilityIndex * 0.4 + activityVariety * 0.3 + circadianAlignment * 0.3)

  const level =
    score < 20 ? "isolated" : score < 45 ? "low" : score < 70 ? "moderate" : "high"

  return { score, level, mobilityIndex, activityVariety, circadianAlignment }
}

// ---------------------------------------------------------------------------
// 10. Substance Abuse Risk
// ---------------------------------------------------------------------------

export interface SubstanceAbuseRiskResult {
  score: number
  riskLevel: "low" | "moderate" | "high" | "very_high"
  sleepIrregularity: number
  heartRateAnomalies: number
  activityDisruption: number
  circadianDisruption: number
}

export async function calculateSubstanceAbuseRisk(
  userId: string,
  date: Date = new Date(),
): Promise<SubstanceAbuseRiskResult> {
  const start = daysAgo(date, 14)
  const [sleepOnset, rhr, steps, sleepDuration] = await Promise.all([
    fetchMetric(userId, "sleep_onset_latency", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
  ])

  const sleepIrregularity = clamp(coefficientOfVariation(sleepDuration) * 300)
  const heartRateAnomalies = clamp(coefficientOfVariation(rhr) * 400)
  const activityDisruption = clamp(coefficientOfVariation(steps) * 200)
  const circadianDisruption = clamp(coefficientOfVariation(sleepOnset) * 300)

  const score = clamp(
    sleepIrregularity * 0.3 +
      heartRateAnomalies * 0.25 +
      activityDisruption * 0.2 +
      circadianDisruption * 0.25,
  )

  const riskLevel =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "high" : "very_high"

  return { score, riskLevel, sleepIrregularity, heartRateAnomalies, activityDisruption, circadianDisruption }
}

// ---------------------------------------------------------------------------
// 11. Mindfulness Score
// ---------------------------------------------------------------------------

export interface MindfulnessScoreResult {
  score: number
  level: "low" | "developing" | "moderate" | "high"
  hrvCoherence: number
  breathingRegularity: number
  restfulness: number
}

export async function calculateMindfulnessScore(
  userId: string,
  date: Date = new Date(),
): Promise<MindfulnessScoreResult> {
  const start = daysAgo(date, 14)
  const [hrv, resp, sleepQuality] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "respiratory_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
  ])

  const hrvCoherence = clamp(normalize(mean(hrv), 20, 100))
  const breathingRegularity = clamp(100 - coefficientOfVariation(resp) * 300)
  const restfulness = clamp(mean(sleepQuality))

  const score = clamp(hrvCoherence * 0.4 + breathingRegularity * 0.3 + restfulness * 0.3)

  const level =
    score < 25 ? "low" : score < 50 ? "developing" : score < 75 ? "moderate" : "high"

  return { score, level, hrvCoherence, breathingRegularity, restfulness }
}

// ---------------------------------------------------------------------------
// 12. Rumination Proxy
// ---------------------------------------------------------------------------

export interface RuminationProxyResult {
  score: number
  level: "low" | "moderate" | "high" | "severe"
  sleepOnsetDelay: number
  nightWakefulness: number
  morningHrvSuppression: number
}

export async function calculateRuminationProxy(
  userId: string,
  date: Date = new Date(),
): Promise<RuminationProxyResult> {
  const start = daysAgo(date, 14)
  const [sleepOnset, wakeAfterOnset, morningHrv] = await Promise.all([
    fetchMetric(userId, "sleep_onset_latency", start, date),
    fetchMetric(userId, "wake_after_sleep_onset", start, date),
    fetchMetric(userId, "morning_hrv", start, date),
  ])

  const sleepOnsetDelay = clamp(normalize(mean(sleepOnset), 5, 60))
  const nightWakefulness = clamp(normalize(mean(wakeAfterOnset), 0, 90))
  const morningHrvSuppression = clamp(100 - normalize(mean(morningHrv), 20, 100))

  const score = clamp(
    sleepOnsetDelay * 0.35 + nightWakefulness * 0.35 + morningHrvSuppression * 0.3,
  )

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "severe"

  return { score, level, sleepOnsetDelay, nightWakefulness, morningHrvSuppression }
}

// ---------------------------------------------------------------------------
// 13. Panic Attack Risk
// ---------------------------------------------------------------------------

export interface PanicAttackRiskResult {
  score: number
  riskLevel: "low" | "moderate" | "elevated" | "high"
  heartRateSpikes: number
  respiratoryInstability: number
  hrvDropIndex: number
  nocturalRestlessness: number
}

export async function calculatePanicAttackRisk(
  userId: string,
  date: Date = new Date(),
): Promise<PanicAttackRiskResult> {
  const start = daysAgo(date, 7)
  const [rhr, resp, hrv, sleepRestless] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "respiratory_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "restless_periods", start, date),
  ])

  const heartRateSpikes = clamp(stddev(rhr) * 5)
  const respiratoryInstability = clamp(coefficientOfVariation(resp) * 400)
  const hrvDropIndex = clamp(100 - normalize(Math.min(...(hrv.length ? hrv : [50])), 10, 80))
  const nocturalRestlessness = clamp(normalize(mean(sleepRestless), 0, 15))

  const score = clamp(
    heartRateSpikes * 0.3 +
      respiratoryInstability * 0.25 +
      hrvDropIndex * 0.25 +
      nocturalRestlessness * 0.2,
  )

  const riskLevel =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "elevated" : "high"

  return { score, riskLevel, heartRateSpikes, respiratoryInstability, hrvDropIndex, nocturalRestlessness }
}

// ---------------------------------------------------------------------------
// 14. ADHD Markers
// ---------------------------------------------------------------------------

export interface AdhdMarkersResult {
  score: number
  likelihood: "low" | "moderate" | "elevated" | "high"
  activityVariability: number
  sleepInconsistency: number
  focusProxy: number
  impulsivityProxy: number
}

export async function calculateAdhdMarkers(
  userId: string,
  date: Date = new Date(),
): Promise<AdhdMarkersResult> {
  const start = daysAgo(date, 30)
  const [steps, sleepDuration, sedentaryBouts, rhr] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "sedentary_bouts", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const activityVariability = clamp(coefficientOfVariation(steps) * 200)
  const sleepInconsistency = clamp(coefficientOfVariation(sleepDuration) * 300)
  const focusProxy = clamp(100 - normalize(mean(sedentaryBouts), 2, 20))
  const impulsivityProxy = clamp(coefficientOfVariation(rhr) * 350)

  const score = clamp(
    activityVariability * 0.3 +
      sleepInconsistency * 0.25 +
      focusProxy * 0.25 +
      impulsivityProxy * 0.2,
  )

  const likelihood =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "elevated" : "high"

  return { score, likelihood, activityVariability, sleepInconsistency, focusProxy, impulsivityProxy }
}

// ---------------------------------------------------------------------------
// 15. Emotional Regulation
// ---------------------------------------------------------------------------

export interface EmotionalRegulationResult {
  score: number
  level: "poor" | "developing" | "adequate" | "strong"
  hrvRecovery: number
  moodVariability: number
  physiologicalFlexibility: number
}

export async function calculateEmotionalRegulation(
  userId: string,
  date: Date = new Date(),
): Promise<EmotionalRegulationResult> {
  const start = daysAgo(date, 14)
  const [hrv, mood, rhr] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const hrvRecovery = clamp(normalize(mean(hrv), 20, 100))
  const moodVariability = clamp(100 - coefficientOfVariation(mood) * 200)
  const physiologicalFlexibility = clamp(100 - coefficientOfVariation(rhr) * 300)

  const score = clamp(
    hrvRecovery * 0.4 + moodVariability * 0.3 + physiologicalFlexibility * 0.3,
  )

  const level =
    score < 25 ? "poor" : score < 50 ? "developing" : score < 75 ? "adequate" : "strong"

  return { score, level, hrvRecovery, moodVariability, physiologicalFlexibility }
}

// ---------------------------------------------------------------------------
// 16. Stress Recovery Rate
// ---------------------------------------------------------------------------

export interface StressRecoveryRateResult {
  score: number
  rating: "poor" | "below_average" | "average" | "good" | "excellent"
  hrvReboundSpeed: number
  heartRateNormalization: number
  sleepRestorative: number
}

export async function calculateStressRecoveryRate(
  userId: string,
  date: Date = new Date(),
): Promise<StressRecoveryRateResult> {
  const start = daysAgo(date, 14)
  const [hrv, rhr, deepSleep] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "deep_sleep_minutes", start, date),
  ])

  const hrvReboundSpeed = clamp(normalize(slope(hrv), -2, 2) + 50)
  const heartRateNormalization = clamp(100 - coefficientOfVariation(rhr) * 300)
  const sleepRestorative = clamp(normalize(mean(deepSleep), 30, 120))

  const score = clamp(
    hrvReboundSpeed * 0.4 + heartRateNormalization * 0.3 + sleepRestorative * 0.3,
  )

  const rating =
    score < 20
      ? "poor"
      : score < 40
        ? "below_average"
        : score < 60
          ? "average"
          : score < 80
            ? "good"
            : "excellent"

  return { score, rating, hrvReboundSpeed, heartRateNormalization, sleepRestorative }
}

// ---------------------------------------------------------------------------
// 17. Psychological Flexibility
// ---------------------------------------------------------------------------

export interface PsychologicalFlexibilityResult {
  score: number
  level: "rigid" | "developing" | "flexible" | "highly_flexible"
  adaptiveResponse: number
  behavioralVariety: number
  recoveryAdaptation: number
}

export async function calculatePsychologicalFlexibility(
  userId: string,
  date: Date = new Date(),
): Promise<PsychologicalFlexibilityResult> {
  const start = daysAgo(date, 30)
  const [hrv, steps, sleepDuration, activeMin] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "active_minutes", start, date),
  ])

  const adaptiveResponse = clamp(normalize(mean(hrv), 20, 100))
  const behavioralVariety = clamp(entropy(steps, 8) * 20)
  const recoveryAdaptation = clamp(
    (100 - coefficientOfVariation(sleepDuration) * 200 + normalize(mean(activeMin), 15, 90)) / 2,
  )

  const score = clamp(
    adaptiveResponse * 0.4 + behavioralVariety * 0.3 + recoveryAdaptation * 0.3,
  )

  const level =
    score < 25
      ? "rigid"
      : score < 50
        ? "developing"
        : score < 75
          ? "flexible"
          : "highly_flexible"

  return { score, level, adaptiveResponse, behavioralVariety, recoveryAdaptation }
}

// ---------------------------------------------------------------------------
// 18. Bipolar Risk
// ---------------------------------------------------------------------------

export interface BipolarRiskResult {
  score: number
  riskLevel: "low" | "moderate" | "elevated" | "high"
  moodCyclicity: number
  energySwings: number
  sleepPatternDisruption: number
  activityExtremes: number
}

export async function calculateBipolarRisk(
  userId: string,
  date: Date = new Date(),
): Promise<BipolarRiskResult> {
  const start = daysAgo(date, 60)
  const [mood, energy, sleepDuration, steps] = await Promise.all([
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "daily_steps", start, date),
  ])

  const moodCyclicity = clamp(stddev(mood) * 3)
  const energySwings = clamp(stddev(energy) * 3)
  const sleepPatternDisruption = clamp(coefficientOfVariation(sleepDuration) * 300)

  const stepsMax = steps.length > 0 ? Math.max(...steps) : 0
  const stepsMin = steps.length > 0 ? Math.min(...steps) : 0
  const activityExtremes = clamp(
    stepsMax > 0 ? ((stepsMax - stepsMin) / stepsMax) * 100 : 0,
  )

  const score = clamp(
    moodCyclicity * 0.3 +
      energySwings * 0.25 +
      sleepPatternDisruption * 0.25 +
      activityExtremes * 0.2,
  )

  const riskLevel =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "elevated" : "high"

  return { score, riskLevel, moodCyclicity, energySwings, sleepPatternDisruption, activityExtremes }
}

// ---------------------------------------------------------------------------
// 19. Trauma Response
// ---------------------------------------------------------------------------

export interface TraumaResponseResult {
  score: number
  severity: "minimal" | "mild" | "moderate" | "severe"
  fightFlightIndex: number
  freezeResponse: number
  somaticSymptoms: number
  sleepDisruption: number
}

export async function calculateTraumaResponse(
  userId: string,
  date: Date = new Date(),
): Promise<TraumaResponseResult> {
  const start = daysAgo(date, 14)
  const [rhr, hrv, steps, sleepInterruptions, skinTemp] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_interruptions", start, date),
    fetchMetric(userId, "skin_temperature", start, date),
  ])

  const fightFlightIndex = clamp(
    (clamp(((mean(rhr) - 55) / 45) * 100) + clamp(100 - normalize(mean(hrv), 20, 100))) / 2,
  )
  const freezeResponse = clamp(100 - normalize(mean(steps), 1000, 10000))
  const somaticSymptoms = clamp(coefficientOfVariation(skinTemp) * 300)
  const sleepDisruption = clamp(normalize(mean(sleepInterruptions), 0, 8))

  const score = clamp(
    fightFlightIndex * 0.3 +
      freezeResponse * 0.2 +
      somaticSymptoms * 0.2 +
      sleepDisruption * 0.3,
  )

  const severity =
    score < 20 ? "minimal" : score < 45 ? "mild" : score < 70 ? "moderate" : "severe"

  return { score, severity, fightFlightIndex, freezeResponse, somaticSymptoms, sleepDisruption }
}

// ---------------------------------------------------------------------------
// 20. Sleep-Anxiety Cycle
// ---------------------------------------------------------------------------

export interface SleepAnxietyCycleResult {
  score: number
  cycleStrength: "weak" | "moderate" | "strong" | "very_strong"
  anxietyToSleepImpact: number
  sleepToAnxietyImpact: number
  feedbackLoopIntensity: number
}

export async function calculateSleepAnxietyCycle(
  userId: string,
  date: Date = new Date(),
): Promise<SleepAnxietyCycleResult> {
  const start = daysAgo(date, 21)
  const [sleepQuality, rhr, hrv, sleepOnset] = await Promise.all([
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "sleep_onset_latency", start, date),
  ])

  const anxietyProxy = rhr.map((r, i) => {
    const h = hrv[i] ?? 50
    return clamp(((r - 55) / 45) * 50 + (100 - normalize(h, 20, 100)) * 0.5)
  })

  const anxietyToSleepImpact = Math.abs(pearson(anxietyProxy, sleepQuality)) * 100
  const sleepToAnxietyImpact = Math.abs(
    pearson(sleepQuality.slice(0, -1), anxietyProxy.slice(1)),
  ) * 100
  const feedbackLoopIntensity = clamp((anxietyToSleepImpact + sleepToAnxietyImpact) / 2)

  const score = clamp(feedbackLoopIntensity)

  const cycleStrength =
    score < 25 ? "weak" : score < 50 ? "moderate" : score < 75 ? "strong" : "very_strong"

  return { score, cycleStrength, anxietyToSleepImpact, sleepToAnxietyImpact, feedbackLoopIntensity }
}

// ---------------------------------------------------------------------------
// 21. Social Anxiety
// ---------------------------------------------------------------------------

export interface SocialAnxietyResult {
  score: number
  level: "minimal" | "mild" | "moderate" | "severe"
  avoidanceIndex: number
  physiologicalReactivity: number
  socialWithdrawalTrend: number
}

export async function calculateSocialAnxiety(
  userId: string,
  date: Date = new Date(),
): Promise<SocialAnxietyResult> {
  const start = daysAgo(date, 14)
  const [steps, locations, rhr, hrv] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
  ])

  const avoidanceIndex = clamp(100 - normalize(mean(locations), 1, 8))
  const physiologicalReactivity = clamp(
    coefficientOfVariation(rhr) * 300 + (100 - normalize(mean(hrv), 20, 100)) * 0.3,
  )
  const socialWithdrawalTrend = clamp(50 - slope(steps) * 0.01)

  const score = clamp(
    avoidanceIndex * 0.4 + physiologicalReactivity * 0.35 + socialWithdrawalTrend * 0.25,
  )

  const level =
    score < 20 ? "minimal" : score < 45 ? "mild" : score < 70 ? "moderate" : "severe"

  return { score, level, avoidanceIndex, physiologicalReactivity, socialWithdrawalTrend }
}

// ---------------------------------------------------------------------------
// 22. OCD Patterns
// ---------------------------------------------------------------------------

export interface OcdPatternsResult {
  score: number
  likelihood: "low" | "moderate" | "elevated" | "high"
  repetitiveBehaviorIndex: number
  rigidityScore: number
  anxietyComorbidity: number
  sleepRitualImpact: number
}

export async function calculateOcdPatterns(
  userId: string,
  date: Date = new Date(),
): Promise<OcdPatternsResult> {
  const start = daysAgo(date, 30)
  const [steps, sleepOnset, sleepDuration, rhr, hrv] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_onset_latency", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
  ])

  // Low variability in routines can indicate rigid/compulsive patterns
  const repetitiveBehaviorIndex = clamp(100 - coefficientOfVariation(steps) * 200)
  const rigidityScore = clamp(100 - stddev(sleepDuration) * 2)
  const anxietyComorbidity = clamp(
    (clamp(((mean(rhr) - 55) / 45) * 100) + clamp(100 - normalize(mean(hrv), 20, 100))) / 2,
  )
  const sleepRitualImpact = clamp(normalize(mean(sleepOnset), 5, 60))

  const score = clamp(
    repetitiveBehaviorIndex * 0.25 +
      rigidityScore * 0.25 +
      anxietyComorbidity * 0.3 +
      sleepRitualImpact * 0.2,
  )

  const likelihood =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "elevated" : "high"

  return { score, likelihood, repetitiveBehaviorIndex, rigidityScore, anxietyComorbidity, sleepRitualImpact }
}

// ---------------------------------------------------------------------------
// 23. Grief Response
// ---------------------------------------------------------------------------

export interface GriefResponseResult {
  score: number
  phase: "absent" | "acute" | "integrated" | "complicated"
  appetiteChange: number
  sleepDeterioration: number
  activityDecline: number
  physiologicalBurden: number
}

export async function calculateGriefResponse(
  userId: string,
  date: Date = new Date(),
): Promise<GriefResponseResult> {
  const start = daysAgo(date, 30)
  const priorStart = daysAgo(date, 60)
  const [recentEnergy, priorEnergy, sleep, steps, rhr] = await Promise.all([
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "energy_level", priorStart, start),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const appetiteChange = clamp(
    Math.abs(mean(recentEnergy) - mean(priorEnergy)) * 3,
  )
  const sleepDeterioration = clamp(100 - mean(sleep))
  const activityDecline = clamp(100 - normalize(mean(steps), 2000, 12000))
  const physiologicalBurden = clamp(((mean(rhr) - 55) / 45) * 100)

  const score = clamp(
    appetiteChange * 0.2 +
      sleepDeterioration * 0.3 +
      activityDecline * 0.25 +
      physiologicalBurden * 0.25,
  )

  const phase =
    score < 15
      ? "absent"
      : score < 40
        ? "integrated"
        : score < 70
          ? "acute"
          : "complicated"

  return { score, phase, appetiteChange, sleepDeterioration, activityDecline, physiologicalBurden }
}

// ---------------------------------------------------------------------------
// 24. Anger Management Proxy
// ---------------------------------------------------------------------------

export interface AngerManagementProxyResult {
  score: number
  control: "poor" | "fair" | "good" | "excellent"
  heartRateReactivity: number
  autonomicRecovery: number
  sleepImpact: number
}

export async function calculateAngerManagementProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AngerManagementProxyResult> {
  const start = daysAgo(date, 14)
  const [rhr, hrv, sleepQuality] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
  ])

  const heartRateReactivity = clamp(stddev(rhr) * 5)
  const autonomicRecovery = clamp(normalize(mean(hrv), 20, 100))
  const sleepImpact = clamp(mean(sleepQuality))

  // Higher score = better anger management
  const score = clamp(
    (100 - heartRateReactivity) * 0.4 + autonomicRecovery * 0.35 + sleepImpact * 0.25,
  )

  const control =
    score < 25 ? "poor" : score < 50 ? "fair" : score < 75 ? "good" : "excellent"

  return { score, control, heartRateReactivity, autonomicRecovery, sleepImpact }
}

// ---------------------------------------------------------------------------
// 25. Self-Efficacy
// ---------------------------------------------------------------------------

export interface SelfEfficacyResult {
  score: number
  level: "low" | "moderate" | "high" | "very_high"
  goalConsistency: number
  progressTrajectory: number
  activityCommitment: number
}

export async function calculateSelfEfficacy(
  userId: string,
  date: Date = new Date(),
): Promise<SelfEfficacyResult> {
  const start = daysAgo(date, 30)
  const [steps, activeMin, sleep] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "active_minutes", start, date),
    fetchMetric(userId, "sleep_consistency", start, date),
  ])

  const goalConsistency = clamp(100 - coefficientOfVariation(steps) * 150)
  const progressTrajectory = clamp(50 + slope(activeMin) * 10)
  const activityCommitment = clamp(mean(sleep))

  const score = clamp(
    goalConsistency * 0.4 + progressTrajectory * 0.3 + activityCommitment * 0.3,
  )

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "very_high"

  return { score, level, goalConsistency, progressTrajectory, activityCommitment }
}

// ---------------------------------------------------------------------------
// 26. Locus of Control
// ---------------------------------------------------------------------------

export interface LocusOfControlResult {
  score: number
  orientation: "external" | "mixed" | "internal"
  behavioralConsistency: number
  routineAdherence: number
  proactiveHealthBehavior: number
}

export async function calculateLocusOfControl(
  userId: string,
  date: Date = new Date(),
): Promise<LocusOfControlResult> {
  const start = daysAgo(date, 30)
  const [steps, sleepDuration, activeMin] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "active_minutes", start, date),
  ])

  const behavioralConsistency = clamp(100 - coefficientOfVariation(steps) * 150)
  const routineAdherence = clamp(100 - coefficientOfVariation(sleepDuration) * 200)
  const proactiveHealthBehavior = clamp(normalize(mean(activeMin), 15, 90))

  // Higher = more internal locus
  const score = clamp(
    behavioralConsistency * 0.35 + routineAdherence * 0.35 + proactiveHealthBehavior * 0.3,
  )

  const orientation = score < 35 ? "external" : score < 65 ? "mixed" : "internal"

  return { score, orientation, behavioralConsistency, routineAdherence, proactiveHealthBehavior }
}

// ---------------------------------------------------------------------------
// 27. Cognitive Flexibility
// ---------------------------------------------------------------------------

export interface CognitiveFlexibilityResult {
  score: number
  level: "rigid" | "moderate" | "flexible" | "highly_flexible"
  activityDiversity: number
  scheduleAdaptability: number
  recoveryVariability: number
}

export async function calculateCognitiveFlexibility(
  userId: string,
  date: Date = new Date(),
): Promise<CognitiveFlexibilityResult> {
  const start = daysAgo(date, 30)
  const [steps, sleepMidpoint, hrv] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_midpoint", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
  ])

  const activityDiversity = clamp(entropy(steps, 8) * 20)
  const scheduleAdaptability = clamp(entropy(sleepMidpoint, 6) * 25)
  const recoveryVariability = clamp(normalize(mean(hrv), 20, 100))

  const score = clamp(
    activityDiversity * 0.35 + scheduleAdaptability * 0.3 + recoveryVariability * 0.35,
  )

  const level =
    score < 25
      ? "rigid"
      : score < 50
        ? "moderate"
        : score < 75
          ? "flexible"
          : "highly_flexible"

  return { score, level, activityDiversity, scheduleAdaptability, recoveryVariability }
}

// ---------------------------------------------------------------------------
// 28. Creative Thinking Proxy
// ---------------------------------------------------------------------------

export interface CreativeThinkingProxyResult {
  score: number
  level: "low" | "moderate" | "high" | "exceptional"
  divergentActivityIndex: number
  restQuality: number
  optimalArousal: number
}

export async function calculateCreativeThinkingProxy(
  userId: string,
  date: Date = new Date(),
): Promise<CreativeThinkingProxyResult> {
  const start = daysAgo(date, 14)
  const [steps, deepSleep, hrv, rhr] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "deep_sleep_minutes", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const divergentActivityIndex = clamp(entropy(steps, 8) * 20)
  const restQuality = clamp(normalize(mean(deepSleep), 30, 120))
  // Optimal arousal: not too high, not too low RHR; moderate HRV
  const arousalDist = Math.abs(mean(rhr) - 65)
  const optimalArousal = clamp(100 - arousalDist * 2.5 + normalize(mean(hrv), 30, 80) * 0.3)

  const score = clamp(
    divergentActivityIndex * 0.3 + restQuality * 0.35 + optimalArousal * 0.35,
  )

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "exceptional"

  return { score, level, divergentActivityIndex, restQuality, optimalArousal }
}

// ---------------------------------------------------------------------------
// 29. Flow State Detection
// ---------------------------------------------------------------------------

export interface FlowStateDetectionResult {
  score: number
  frequency: "rare" | "occasional" | "regular" | "frequent"
  focusSustainability: number
  autonomicBalance: number
  energyOptimality: number
}

export async function calculateFlowStateDetection(
  userId: string,
  date: Date = new Date(),
): Promise<FlowStateDetectionResult> {
  const start = daysAgo(date, 14)
  const [hrv, rhr, activeMin, energy] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "active_minutes", start, date),
    fetchMetric(userId, "energy_level", start, date),
  ])

  const focusSustainability = clamp(normalize(mean(activeMin), 30, 120))
  const autonomicBalance = clamp(
    normalize(mean(hrv), 30, 80) * 0.6 +
      (100 - Math.abs(mean(rhr) - 65) * 2.5) * 0.4,
  )
  const energyOptimality = clamp(mean(energy))

  const score = clamp(
    focusSustainability * 0.35 + autonomicBalance * 0.35 + energyOptimality * 0.3,
  )

  const frequency =
    score < 25 ? "rare" : score < 50 ? "occasional" : score < 75 ? "regular" : "frequent"

  return { score, frequency, focusSustainability, autonomicBalance, energyOptimality }
}

// ---------------------------------------------------------------------------
// 30. Dopamine Sensitivity
// ---------------------------------------------------------------------------

export interface DopamineSensitivityResult {
  score: number
  level: "blunted" | "reduced" | "normal" | "heightened"
  motivationProxy: number
  rewardSeeking: number
  noveltyResponse: number
}

export async function calculateDopamineSensitivity(
  userId: string,
  date: Date = new Date(),
): Promise<DopamineSensitivityResult> {
  const start = daysAgo(date, 21)
  const [steps, energy, locations, activeMin] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "active_minutes", start, date),
  ])

  const motivationProxy = clamp(normalize(mean(energy), 20, 90))
  const rewardSeeking = clamp(normalize(mean(activeMin), 15, 90))
  const noveltyResponse = clamp(normalize(mean(locations), 1, 8))

  const score = clamp(
    motivationProxy * 0.4 + rewardSeeking * 0.3 + noveltyResponse * 0.3,
  )

  const level =
    score < 25 ? "blunted" : score < 45 ? "reduced" : score < 75 ? "normal" : "heightened"

  return { score, level, motivationProxy, rewardSeeking, noveltyResponse }
}

// ---------------------------------------------------------------------------
// 31. Serotonin Proxy from Sleep
// ---------------------------------------------------------------------------

export interface SerotoninProxyResult {
  score: number
  level: "low" | "suboptimal" | "adequate" | "optimal"
  sleepOnsetRegularity: number
  deepSleepRatio: number
  morningReadiness: number
  lightExposureProxy: number
}

export async function calculateSerotoninProxy(
  userId: string,
  date: Date = new Date(),
): Promise<SerotoninProxyResult> {
  const start = daysAgo(date, 14)
  const [sleepOnset, deepSleep, sleepDuration, morningHr] = await Promise.all([
    fetchMetric(userId, "sleep_onset_latency", start, date),
    fetchMetric(userId, "deep_sleep_minutes", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "morning_heart_rate", start, date),
  ])

  const sleepOnsetRegularity = clamp(100 - coefficientOfVariation(sleepOnset) * 300)
  const deepSleepRatio =
    mean(sleepDuration) > 0
      ? clamp(normalize((mean(deepSleep) / mean(sleepDuration)) * 60, 5, 25))
      : 0
  const morningReadiness = clamp(100 - normalize(mean(morningHr), 55, 85))
  const lightExposureProxy = clamp(normalize(mean(sleepDuration), 360, 540))

  const score = clamp(
    sleepOnsetRegularity * 0.3 +
      deepSleepRatio * 0.25 +
      morningReadiness * 0.25 +
      lightExposureProxy * 0.2,
  )

  const level =
    score < 25 ? "low" : score < 45 ? "suboptimal" : score < 70 ? "adequate" : "optimal"

  return { score, level, sleepOnsetRegularity, deepSleepRatio, morningReadiness, lightExposureProxy }
}

// ---------------------------------------------------------------------------
// 32. GABA Activity Proxy
// ---------------------------------------------------------------------------

export interface GabaActivityProxyResult {
  score: number
  level: "low" | "suboptimal" | "adequate" | "optimal"
  calmIndex: number
  inhibitoryTone: number
  sleepLatencyIndex: number
}

export async function calculateGabaActivityProxy(
  userId: string,
  date: Date = new Date(),
): Promise<GabaActivityProxyResult> {
  const start = daysAgo(date, 14)
  const [hrv, rhr, sleepOnset, resp] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "sleep_onset_latency", start, date),
    fetchMetric(userId, "respiratory_rate", start, date),
  ])

  const calmIndex = clamp(normalize(mean(hrv), 20, 100))
  const inhibitoryTone = clamp(100 - normalize(mean(rhr), 50, 90))
  const sleepLatencyIndex = clamp(100 - normalize(mean(sleepOnset), 5, 45))

  const score = clamp(calmIndex * 0.4 + inhibitoryTone * 0.3 + sleepLatencyIndex * 0.3)

  const level =
    score < 25 ? "low" : score < 45 ? "suboptimal" : score < 70 ? "adequate" : "optimal"

  return { score, level, calmIndex, inhibitoryTone, sleepLatencyIndex }
}

// ---------------------------------------------------------------------------
// 33. Executive Function
// ---------------------------------------------------------------------------

export interface ExecutiveFunctionResult {
  score: number
  level: "impaired" | "below_average" | "average" | "above_average" | "superior"
  planningProxy: number
  impulseControl: number
  taskSwitching: number
  workingMemoryProxy: number
}

export async function calculateExecutiveFunction(
  userId: string,
  date: Date = new Date(),
): Promise<ExecutiveFunctionResult> {
  const start = daysAgo(date, 14)
  const [sleepQuality, hrv, steps, rhr] = await Promise.all([
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const planningProxy = clamp(100 - coefficientOfVariation(steps) * 150)
  const impulseControl = clamp(100 - coefficientOfVariation(rhr) * 300)
  const taskSwitching = clamp(entropy(steps, 8) * 20)
  const workingMemoryProxy = clamp(
    (normalize(mean(sleepQuality), 40, 100) + normalize(mean(hrv), 20, 100)) / 2,
  )

  const score = clamp(
    planningProxy * 0.25 +
      impulseControl * 0.25 +
      taskSwitching * 0.25 +
      workingMemoryProxy * 0.25,
  )

  const level =
    score < 20
      ? "impaired"
      : score < 40
        ? "below_average"
        : score < 60
          ? "average"
          : score < 80
            ? "above_average"
            : "superior"

  return { score, level, planningProxy, impulseControl, taskSwitching, workingMemoryProxy }
}

// ---------------------------------------------------------------------------
// 34. Working Memory Proxy
// ---------------------------------------------------------------------------

export interface WorkingMemoryProxyResult {
  score: number
  capacity: "low" | "moderate" | "high" | "very_high"
  sleepContribution: number
  oxygenationProxy: number
  cognitiveLoadTolerance: number
}

export async function calculateWorkingMemoryProxy(
  userId: string,
  date: Date = new Date(),
): Promise<WorkingMemoryProxyResult> {
  const start = daysAgo(date, 7)
  const [deepSleep, spo2, hrv, rhr] = await Promise.all([
    fetchMetric(userId, "deep_sleep_minutes", start, date),
    fetchMetric(userId, "spo2", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const sleepContribution = clamp(normalize(mean(deepSleep), 30, 120))
  const oxygenationProxy = clamp(normalize(mean(spo2), 90, 100))
  const cognitiveLoadTolerance = clamp(
    (normalize(mean(hrv), 20, 100) + (100 - normalize(mean(rhr), 50, 90))) / 2,
  )

  const score = clamp(
    sleepContribution * 0.35 + oxygenationProxy * 0.3 + cognitiveLoadTolerance * 0.35,
  )

  const capacity =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "very_high"

  return { score, capacity, sleepContribution, oxygenationProxy, cognitiveLoadTolerance }
}

// ---------------------------------------------------------------------------
// 35. Emotional Intelligence
// ---------------------------------------------------------------------------

export interface EmotionalIntelligenceResult {
  score: number
  level: "developing" | "moderate" | "proficient" | "advanced"
  selfAwareness: number
  selfRegulation: number
  socialAwareness: number
  adaptability: number
}

export async function calculateEmotionalIntelligence(
  userId: string,
  date: Date = new Date(),
): Promise<EmotionalIntelligenceResult> {
  const start = daysAgo(date, 30)
  const [hrv, mood, steps, locations, rhr] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const selfAwareness = clamp(100 - coefficientOfVariation(mood) * 150)
  const selfRegulation = clamp(
    (normalize(mean(hrv), 20, 100) + (100 - coefficientOfVariation(rhr) * 300)) / 2,
  )
  const socialAwareness = clamp(normalize(mean(locations), 1, 8))
  const adaptability = clamp(entropy(steps, 8) * 20)

  const score = clamp(
    selfAwareness * 0.3 + selfRegulation * 0.3 + socialAwareness * 0.2 + adaptability * 0.2,
  )

  const level =
    score < 30 ? "developing" : score < 55 ? "moderate" : score < 80 ? "proficient" : "advanced"

  return { score, level, selfAwareness, selfRegulation, socialAwareness, adaptability }
}

// ---------------------------------------------------------------------------
// 36. Social Cognition
// ---------------------------------------------------------------------------

export interface SocialCognitionResult {
  score: number
  level: "low" | "moderate" | "good" | "excellent"
  socialExposure: number
  interpersonalRegulation: number
  environmentalEngagement: number
}

export async function calculateSocialCognition(
  userId: string,
  date: Date = new Date(),
): Promise<SocialCognitionResult> {
  const start = daysAgo(date, 14)
  const [locations, steps, hrv, activeMin] = await Promise.all([
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "active_minutes", start, date),
  ])

  const socialExposure = clamp(normalize(mean(locations), 1, 8))
  const interpersonalRegulation = clamp(normalize(mean(hrv), 20, 100))
  const environmentalEngagement = clamp(
    (normalize(mean(steps), 3000, 12000) + normalize(mean(activeMin), 20, 90)) / 2,
  )

  const score = clamp(
    socialExposure * 0.35 + interpersonalRegulation * 0.3 + environmentalEngagement * 0.35,
  )

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "good" : "excellent"

  return { score, level, socialExposure, interpersonalRegulation, environmentalEngagement }
}

// ---------------------------------------------------------------------------
// 37. Empathy Index
// ---------------------------------------------------------------------------

export interface EmpathyIndexResult {
  score: number
  level: "low" | "moderate" | "high" | "very_high"
  autonomicResonance: number
  socialEngagement: number
  emotionalOpenness: number
}

export async function calculateEmpathyIndex(
  userId: string,
  date: Date = new Date(),
): Promise<EmpathyIndexResult> {
  const start = daysAgo(date, 14)
  const [hrv, locations, mood, steps] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "daily_steps", start, date),
  ])

  const autonomicResonance = clamp(normalize(mean(hrv), 30, 90))
  const socialEngagement = clamp(
    (normalize(mean(locations), 1, 8) + normalize(mean(steps), 3000, 12000)) / 2,
  )
  const emotionalOpenness = clamp(entropy(mood, 6) * 25)

  const score = clamp(
    autonomicResonance * 0.35 + socialEngagement * 0.35 + emotionalOpenness * 0.3,
  )

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "very_high"

  return { score, level, autonomicResonance, socialEngagement, emotionalOpenness }
}

// ---------------------------------------------------------------------------
// 38. Motivation Score
// ---------------------------------------------------------------------------

export interface MotivationScoreResult {
  score: number
  level: "amotivated" | "low" | "moderate" | "high" | "driven"
  initiativeIndex: number
  consistencyIndex: number
  energyAllocation: number
}

export async function calculateMotivationScore(
  userId: string,
  date: Date = new Date(),
): Promise<MotivationScoreResult> {
  const start = daysAgo(date, 14)
  const [steps, energy, activeMin] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "active_minutes", start, date),
  ])

  const initiativeIndex = clamp(normalize(mean(steps), 3000, 12000))
  const consistencyIndex = clamp(100 - coefficientOfVariation(activeMin) * 150)
  const energyAllocation = clamp(mean(energy))

  const score = clamp(
    initiativeIndex * 0.35 + consistencyIndex * 0.3 + energyAllocation * 0.35,
  )

  const level =
    score < 15
      ? "amotivated"
      : score < 35
        ? "low"
        : score < 60
          ? "moderate"
          : score < 80
            ? "high"
            : "driven"

  return { score, level, initiativeIndex, consistencyIndex, energyAllocation }
}

// ---------------------------------------------------------------------------
// 39. Loneliness Proxy
// ---------------------------------------------------------------------------

export interface LonelinessProxyResult {
  score: number
  level: "connected" | "mildly_lonely" | "moderately_lonely" | "severely_lonely"
  socialIsolationIndex: number
  circadianDisruption: number
  sedentaryBurden: number
  sleepQualityImpact: number
}

export async function calculateLonelinessProxy(
  userId: string,
  date: Date = new Date(),
): Promise<LonelinessProxyResult> {
  const start = daysAgo(date, 14)
  const [locations, sleepMidpoint, steps, sleepQuality] = await Promise.all([
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "sleep_midpoint", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
  ])

  const socialIsolationIndex = clamp(100 - normalize(mean(locations), 1, 8))
  const circadianDisruption = clamp(coefficientOfVariation(sleepMidpoint) * 300)
  const sedentaryBurden = clamp(100 - normalize(mean(steps), 2000, 10000))
  const sleepQualityImpact = clamp(100 - mean(sleepQuality))

  const score = clamp(
    socialIsolationIndex * 0.35 +
      circadianDisruption * 0.2 +
      sedentaryBurden * 0.25 +
      sleepQualityImpact * 0.2,
  )

  const level =
    score < 20
      ? "connected"
      : score < 45
        ? "mildly_lonely"
        : score < 70
          ? "moderately_lonely"
          : "severely_lonely"

  return { score, level, socialIsolationIndex, circadianDisruption, sedentaryBurden, sleepQualityImpact }
}

// ---------------------------------------------------------------------------
// 40. Gratitude Impact
// ---------------------------------------------------------------------------

export interface GratitudeImpactResult {
  score: number
  level: "low" | "moderate" | "high" | "transformative"
  positiveAffectProxy: number
  sleepBenefit: number
  socialConnection: number
}

export async function calculateGratitudeImpact(
  userId: string,
  date: Date = new Date(),
): Promise<GratitudeImpactResult> {
  const start = daysAgo(date, 14)
  const [mood, sleepQuality, locations, hrv] = await Promise.all([
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
  ])

  const positiveAffectProxy = clamp(mean(mood))
  const sleepBenefit = clamp(mean(sleepQuality))
  const socialConnection = clamp(
    (normalize(mean(locations), 1, 8) + normalize(mean(hrv), 20, 100)) / 2,
  )

  const score = clamp(
    positiveAffectProxy * 0.4 + sleepBenefit * 0.3 + socialConnection * 0.3,
  )

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "transformative"

  return { score, level, positiveAffectProxy, sleepBenefit, socialConnection }
}

// ---------------------------------------------------------------------------
// 41. Purpose Score
// ---------------------------------------------------------------------------

export interface PurposeScoreResult {
  score: number
  level: "searching" | "emerging" | "developing" | "strong"
  directionality: number
  persistenceIndex: number
  engagementDepth: number
}

export async function calculatePurposeScore(
  userId: string,
  date: Date = new Date(),
): Promise<PurposeScoreResult> {
  const start = daysAgo(date, 30)
  const [steps, activeMin, energy] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "active_minutes", start, date),
    fetchMetric(userId, "energy_level", start, date),
  ])

  const directionality = clamp(50 + slope(activeMin) * 10)
  const persistenceIndex = clamp(100 - coefficientOfVariation(steps) * 150)
  const engagementDepth = clamp(mean(energy))

  const score = clamp(
    directionality * 0.35 + persistenceIndex * 0.35 + engagementDepth * 0.3,
  )

  const level =
    score < 25 ? "searching" : score < 50 ? "emerging" : score < 75 ? "developing" : "strong"

  return { score, level, directionality, persistenceIndex, engagementDepth }
}

// ---------------------------------------------------------------------------
// 42. Optimism Index
// ---------------------------------------------------------------------------

export interface OptimismIndexResult {
  score: number
  level: "pessimistic" | "neutral" | "optimistic" | "highly_optimistic"
  moodTrajectory: number
  energyOutlook: number
  activityMomentum: number
}

export async function calculateOptimismIndex(
  userId: string,
  date: Date = new Date(),
): Promise<OptimismIndexResult> {
  const start = daysAgo(date, 14)
  const [mood, energy, steps] = await Promise.all([
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "daily_steps", start, date),
  ])

  const moodTrajectory = clamp(50 + slope(mood) * 15)
  const energyOutlook = clamp(50 + slope(energy) * 15)
  const activityMomentum = clamp(50 + slope(steps) * 0.005)

  const score = clamp(
    moodTrajectory * 0.4 + energyOutlook * 0.35 + activityMomentum * 0.25,
  )

  const level =
    score < 30
      ? "pessimistic"
      : score < 50
        ? "neutral"
        : score < 75
          ? "optimistic"
          : "highly_optimistic"

  return { score, level, moodTrajectory, energyOutlook, activityMomentum }
}

// ---------------------------------------------------------------------------
// 43. Psychological Wellbeing
// ---------------------------------------------------------------------------

export interface PsychologicalWellbeingResult {
  score: number
  level: "poor" | "fair" | "good" | "excellent"
  autonomy: number
  environmentalMastery: number
  personalGrowth: number
  positiveRelations: number
  purposeInLife: number
  selfAcceptance: number
}

export async function calculatePsychologicalWellbeing(
  userId: string,
  date: Date = new Date(),
): Promise<PsychologicalWellbeingResult> {
  const start = daysAgo(date, 30)
  const [steps, sleep, hrv, mood, locations, energy] = await Promise.all([
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "energy_level", start, date),
  ])

  const autonomy = clamp(100 - coefficientOfVariation(steps) * 150)
  const environmentalMastery = clamp(mean(sleep))
  const personalGrowth = clamp(50 + slope(energy) * 15)
  const positiveRelations = clamp(normalize(mean(locations), 1, 8))
  const purposeInLife = clamp(100 - coefficientOfVariation(steps) * 100 + slope(steps) * 0.005)
  const selfAcceptance = clamp(
    (mean(mood) + normalize(mean(hrv), 20, 100)) / 2,
  )

  const score = clamp(
    (autonomy + environmentalMastery + personalGrowth + positiveRelations + purposeInLife + selfAcceptance) / 6,
  )

  const level =
    score < 25 ? "poor" : score < 50 ? "fair" : score < 75 ? "good" : "excellent"

  return { score, level, autonomy, environmentalMastery, personalGrowth, positiveRelations, purposeInLife, selfAcceptance }
}

// ---------------------------------------------------------------------------
// 44. Life Satisfaction Proxy
// ---------------------------------------------------------------------------

export interface LifeSatisfactionProxyResult {
  score: number
  level: "dissatisfied" | "somewhat_dissatisfied" | "neutral" | "satisfied" | "very_satisfied"
  healthSatisfaction: number
  activitySatisfaction: number
  restSatisfaction: number
  socialSatisfaction: number
}

export async function calculateLifeSatisfactionProxy(
  userId: string,
  date: Date = new Date(),
): Promise<LifeSatisfactionProxyResult> {
  const start = daysAgo(date, 30)
  const [hrv, activeMin, sleepQuality, locations] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "active_minutes", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "unique_locations", start, date),
  ])

  const healthSatisfaction = clamp(normalize(mean(hrv), 20, 100))
  const activitySatisfaction = clamp(normalize(mean(activeMin), 15, 90))
  const restSatisfaction = clamp(mean(sleepQuality))
  const socialSatisfaction = clamp(normalize(mean(locations), 1, 8))

  const score = clamp(
    healthSatisfaction * 0.3 +
      activitySatisfaction * 0.25 +
      restSatisfaction * 0.25 +
      socialSatisfaction * 0.2,
  )

  const level =
    score < 20
      ? "dissatisfied"
      : score < 40
        ? "somewhat_dissatisfied"
        : score < 60
          ? "neutral"
          : score < 80
            ? "satisfied"
            : "very_satisfied"

  return { score, level, healthSatisfaction, activitySatisfaction, restSatisfaction, socialSatisfaction }
}

// ---------------------------------------------------------------------------
// 45. Perceived Stress Scale
// ---------------------------------------------------------------------------

export interface PerceivedStressScaleResult {
  score: number
  level: "low" | "moderate" | "high" | "very_high"
  unpredictabilityIndex: number
  uncontrollabilityIndex: number
  overloadIndex: number
}

export async function calculatePerceivedStressScale(
  userId: string,
  date: Date = new Date(),
): Promise<PerceivedStressScaleResult> {
  const start = daysAgo(date, 14)
  const [hrv, rhr, sleepDuration, energy] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "sleep_duration", start, date),
    fetchMetric(userId, "energy_level", start, date),
  ])

  const unpredictabilityIndex = clamp(coefficientOfVariation(hrv) * 200)
  const uncontrollabilityIndex = clamp(
    (clamp(((mean(rhr) - 55) / 45) * 100) +
      clamp(100 - normalize(mean(hrv), 20, 100))) /
      2,
  )
  const overloadIndex = clamp(
    (clamp(100 - mean(energy)) +
      clamp(100 - normalize(mean(sleepDuration), 360, 540))) /
      2,
  )

  const score = clamp(
    unpredictabilityIndex * 0.3 + uncontrollabilityIndex * 0.4 + overloadIndex * 0.3,
  )

  const level =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "high" : "very_high"

  return { score, level, unpredictabilityIndex, uncontrollabilityIndex, overloadIndex }
}

// ---------------------------------------------------------------------------
// 46. GAD-7 Proxy
// ---------------------------------------------------------------------------

export interface Gad7ProxyResult {
  score: number
  severity: "minimal" | "mild" | "moderate" | "severe"
  worryIndex: number
  restlessnessIndex: number
  tensionIndex: number
  irritabilityProxy: number
}

export async function calculateGad7Proxy(
  userId: string,
  date: Date = new Date(),
): Promise<Gad7ProxyResult> {
  const start = daysAgo(date, 14)
  const [sleepOnset, restless, rhr, hrv] = await Promise.all([
    fetchMetric(userId, "sleep_onset_latency", start, date),
    fetchMetric(userId, "restless_periods", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
  ])

  const worryIndex = clamp(normalize(mean(sleepOnset), 5, 60))
  const restlessnessIndex = clamp(normalize(mean(restless), 0, 15))
  const tensionIndex = clamp(100 - normalize(mean(hrv), 20, 100))
  const irritabilityProxy = clamp(coefficientOfVariation(rhr) * 400)

  const score = clamp(
    worryIndex * 0.3 + restlessnessIndex * 0.25 + tensionIndex * 0.25 + irritabilityProxy * 0.2,
  )

  const severity =
    score < 13 ? "minimal" : score < 38 ? "mild" : score < 63 ? "moderate" : "severe"

  return { score, severity, worryIndex, restlessnessIndex, tensionIndex, irritabilityProxy }
}

// ---------------------------------------------------------------------------
// 47. WHO-5 Wellbeing Proxy
// ---------------------------------------------------------------------------

export interface Who5WellbeingProxyResult {
  score: number
  level: "poor" | "low" | "moderate" | "good" | "excellent"
  cheerfulnessProxy: number
  calmProxy: number
  vitalityProxy: number
  restednessProxy: number
  interestProxy: number
}

export async function calculateWho5WellbeingProxy(
  userId: string,
  date: Date = new Date(),
): Promise<Who5WellbeingProxyResult> {
  const start = daysAgo(date, 14)
  const [mood, hrv, energy, sleepQuality, activeMin] = await Promise.all([
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "active_minutes", start, date),
  ])

  const cheerfulnessProxy = clamp(mean(mood))
  const calmProxy = clamp(normalize(mean(hrv), 20, 100))
  const vitalityProxy = clamp(mean(energy))
  const restednessProxy = clamp(mean(sleepQuality))
  const interestProxy = clamp(normalize(mean(activeMin), 15, 90))

  const score = clamp(
    (cheerfulnessProxy + calmProxy + vitalityProxy + restednessProxy + interestProxy) / 5,
  )

  const level =
    score < 20
      ? "poor"
      : score < 40
        ? "low"
        : score < 60
          ? "moderate"
          : score < 80
            ? "good"
            : "excellent"

  return { score, level, cheerfulnessProxy, calmProxy, vitalityProxy, restednessProxy, interestProxy }
}

// ---------------------------------------------------------------------------
// 48. K10 Psychological Distress
// ---------------------------------------------------------------------------

export interface K10PsychologicalDistressResult {
  score: number
  level: "low" | "moderate" | "high" | "very_high"
  fatigueIndex: number
  nervousnessProxy: number
  hopelessnessProxy: number
  restlessnessScore: number
  worthlessnessProxy: number
}

export async function calculateK10PsychologicalDistress(
  userId: string,
  date: Date = new Date(),
): Promise<K10PsychologicalDistressResult> {
  const start = daysAgo(date, 30)
  const [energy, rhr, hrv, mood, restless] = await Promise.all([
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "restless_periods", start, date),
  ])

  const fatigueIndex = clamp(100 - mean(energy))
  const nervousnessProxy = clamp(((mean(rhr) - 55) / 45) * 100)
  const hopelessnessProxy = clamp(100 - mean(mood) + Math.abs(slope(mood)) * 10)
  const restlessnessScore = clamp(normalize(mean(restless), 0, 15))
  const worthlessnessProxy = clamp(
    (clamp(100 - mean(energy)) + clamp(100 - mean(mood))) / 2,
  )

  const score = clamp(
    fatigueIndex * 0.2 +
      nervousnessProxy * 0.2 +
      hopelessnessProxy * 0.2 +
      restlessnessScore * 0.2 +
      worthlessnessProxy * 0.2,
  )

  const level =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "high" : "very_high"

  return { score, level, fatigueIndex, nervousnessProxy, hopelessnessProxy, restlessnessScore, worthlessnessProxy }
}

// ---------------------------------------------------------------------------
// 49. Flourishing Scale Proxy
// ---------------------------------------------------------------------------

export interface FlourishingScaleProxyResult {
  score: number
  level: "languishing" | "moderate" | "flourishing" | "thriving"
  meaningIndex: number
  competenceProxy: number
  optimismProxy: number
  socialContribution: number
  engagementScore: number
}

export async function calculateFlourishingScaleProxy(
  userId: string,
  date: Date = new Date(),
): Promise<FlourishingScaleProxyResult> {
  const start = daysAgo(date, 30)
  const [energy, steps, mood, locations, activeMin] = await Promise.all([
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "active_minutes", start, date),
  ])

  const meaningIndex = clamp(100 - coefficientOfVariation(steps) * 100 + mean(energy) * 0.3)
  const competenceProxy = clamp(50 + slope(activeMin) * 10)
  const optimismProxy = clamp(50 + slope(mood) * 15)
  const socialContribution = clamp(normalize(mean(locations), 1, 8))
  const engagementScore = clamp(normalize(mean(activeMin), 15, 90))

  const score = clamp(
    (meaningIndex + competenceProxy + optimismProxy + socialContribution + engagementScore) / 5,
  )

  const level =
    score < 25 ? "languishing" : score < 50 ? "moderate" : score < 75 ? "flourishing" : "thriving"

  return { score, level, meaningIndex, competenceProxy, optimismProxy, socialContribution, engagementScore }
}

// ---------------------------------------------------------------------------
// 50. Self-Compassion Proxy
// ---------------------------------------------------------------------------

export interface SelfCompassionProxyResult {
  score: number
  level: "low" | "moderate" | "high" | "very_high"
  selfKindnessProxy: number
  commonHumanityProxy: number
  mindfulnessProxy: number
}

export async function calculateSelfCompassionProxy(
  userId: string,
  date: Date = new Date(),
): Promise<SelfCompassionProxyResult> {
  const start = daysAgo(date, 14)
  const [sleepQuality, hrv, mood, rhr] = await Promise.all([
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  // Self-kindness: attending to rest and maintaining low physiological stress
  const selfKindnessProxy = clamp(
    (mean(sleepQuality) + (100 - normalize(mean(rhr), 50, 90))) / 2,
  )
  // Common humanity: mood stability (not extreme self-criticism)
  const commonHumanityProxy = clamp(100 - coefficientOfVariation(mood) * 200)
  const mindfulnessProxy = clamp(normalize(mean(hrv), 20, 100))

  const score = clamp(
    selfKindnessProxy * 0.35 + commonHumanityProxy * 0.3 + mindfulnessProxy * 0.35,
  )

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "very_high"

  return { score, level, selfKindnessProxy, commonHumanityProxy, mindfulnessProxy }
}

// ---------------------------------------------------------------------------
// 51. Alexithymia Proxy
// ---------------------------------------------------------------------------

export interface AlexithymiaProxyResult {
  score: number
  level: "low" | "moderate" | "elevated" | "high"
  emotionalAwarenessDeficit: number
  somatizationIndex: number
  expressionDifficulty: number
}

export async function calculateAlexithymiaProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AlexithymiaProxyResult> {
  const start = daysAgo(date, 30)
  const [mood, skinTemp, rhr, hrv, steps] = await Promise.all([
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "skin_temperature", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "daily_steps", start, date),
  ])

  // Flat mood with somatic variability suggests poor emotional awareness
  const emotionalAwarenessDeficit = clamp(100 - entropy(mood, 6) * 25)
  const somatizationIndex = clamp(
    (coefficientOfVariation(skinTemp) * 300 + coefficientOfVariation(rhr) * 200) / 2,
  )
  const expressionDifficulty = clamp(
    100 - normalize(mean(hrv), 20, 100) * 0.5 - normalize(stddev(steps), 500, 5000) * 0.5,
  )

  const score = clamp(
    emotionalAwarenessDeficit * 0.4 + somatizationIndex * 0.3 + expressionDifficulty * 0.3,
  )

  const level =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "elevated" : "high"

  return { score, level, emotionalAwarenessDeficit, somatizationIndex, expressionDifficulty }
}

// ---------------------------------------------------------------------------
// 52. Emotional Granularity
// ---------------------------------------------------------------------------

export interface EmotionalGranularityResult {
  score: number
  level: "coarse" | "moderate" | "fine" | "highly_differentiated"
  moodDifferentiation: number
  physiologicalSensitivity: number
  contextualResponsiveness: number
}

export async function calculateEmotionalGranularity(
  userId: string,
  date: Date = new Date(),
): Promise<EmotionalGranularityResult> {
  const start = daysAgo(date, 30)
  const [mood, hrv, rhr, steps] = await Promise.all([
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "daily_steps", start, date),
  ])

  const moodDifferentiation = clamp(entropy(mood, 8) * 25)
  const physiologicalSensitivity = clamp(entropy(hrv, 8) * 25)
  const contextualResponsiveness = clamp(Math.abs(pearson(steps, mood)) * 100)

  const score = clamp(
    moodDifferentiation * 0.4 + physiologicalSensitivity * 0.3 + contextualResponsiveness * 0.3,
  )

  const level =
    score < 25
      ? "coarse"
      : score < 50
        ? "moderate"
        : score < 75
          ? "fine"
          : "highly_differentiated"

  return { score, level, moodDifferentiation, physiologicalSensitivity, contextualResponsiveness }
}

// ---------------------------------------------------------------------------
// 53. Interoceptive Awareness
// ---------------------------------------------------------------------------

export interface InteroceptiveAwarenessResult {
  score: number
  level: "low" | "moderate" | "high" | "very_high"
  bodySignalTracking: number
  autonomicSensitivity: number
  somaticConsistency: number
}

export async function calculateInteroceptiveAwareness(
  userId: string,
  date: Date = new Date(),
): Promise<InteroceptiveAwarenessResult> {
  const start = daysAgo(date, 14)
  const [hrv, rhr, resp, skinTemp] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "respiratory_rate", start, date),
    fetchMetric(userId, "skin_temperature", start, date),
  ])

  // High HRV suggests better body-brain connection
  const bodySignalTracking = clamp(normalize(mean(hrv), 20, 100))
  const autonomicSensitivity = clamp(
    (entropy(rhr, 8) * 15 + entropy(resp, 6) * 15),
  )
  const somaticConsistency = clamp(100 - coefficientOfVariation(skinTemp) * 300)

  const score = clamp(
    bodySignalTracking * 0.4 + autonomicSensitivity * 0.3 + somaticConsistency * 0.3,
  )

  const level =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "very_high"

  return { score, level, bodySignalTracking, autonomicSensitivity, somaticConsistency }
}

// ---------------------------------------------------------------------------
// 54. Nervous System Regulation
// ---------------------------------------------------------------------------

export interface NervousSystemRegulationResult {
  score: number
  state: "dysregulated" | "labile" | "regulated" | "well_regulated"
  sympatheticTone: number
  parasympatheticTone: number
  autonomicBalance: number
  regulationCapacity: number
}

export async function calculateNervousSystemRegulation(
  userId: string,
  date: Date = new Date(),
): Promise<NervousSystemRegulationResult> {
  const start = daysAgo(date, 14)
  const [rhr, hrv, resp, sleepQuality] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "respiratory_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
  ])

  const sympatheticTone = clamp(normalize(mean(rhr), 50, 90))
  const parasympatheticTone = clamp(normalize(mean(hrv), 20, 100))
  const autonomicBalance = clamp(
    100 - Math.abs(sympatheticTone - parasympatheticTone),
  )
  const regulationCapacity = clamp(
    (mean(sleepQuality) + (100 - coefficientOfVariation(resp) * 300)) / 2,
  )

  const score = clamp(
    parasympatheticTone * 0.3 +
      autonomicBalance * 0.3 +
      regulationCapacity * 0.25 +
      (100 - sympatheticTone) * 0.15,
  )

  const state =
    score < 25
      ? "dysregulated"
      : score < 50
        ? "labile"
        : score < 75
          ? "regulated"
          : "well_regulated"

  return { score, state, sympatheticTone, parasympatheticTone, autonomicBalance, regulationCapacity }
}

// ---------------------------------------------------------------------------
// 55. Window of Tolerance
// ---------------------------------------------------------------------------

export interface WindowOfToleranceResult {
  score: number
  state: "hypoarousal" | "narrow" | "moderate" | "wide"
  arousalRange: number
  regulationFlexibility: number
  recoverySpeed: number
}

export async function calculateWindowOfTolerance(
  userId: string,
  date: Date = new Date(),
): Promise<WindowOfToleranceResult> {
  const start = daysAgo(date, 14)
  const [rhr, hrv, energy, sleepQuality] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
  ])

  const rhrRange = rhr.length > 1 ? Math.max(...rhr) - Math.min(...rhr) : 0
  const arousalRange = clamp(100 - normalize(rhrRange, 5, 30))
  const regulationFlexibility = clamp(normalize(mean(hrv), 20, 100))
  const recoverySpeed = clamp(
    (mean(sleepQuality) + mean(energy)) / 2,
  )

  const score = clamp(
    arousalRange * 0.3 + regulationFlexibility * 0.4 + recoverySpeed * 0.3,
  )

  const state =
    score < 20 ? "hypoarousal" : score < 45 ? "narrow" : score < 70 ? "moderate" : "wide"

  return { score, state, arousalRange, regulationFlexibility, recoverySpeed }
}

// ---------------------------------------------------------------------------
// 56. Polyvagal State
// ---------------------------------------------------------------------------

export interface PolyvagalStateResult {
  score: number
  dominantState: "dorsal_vagal" | "sympathetic" | "ventral_vagal"
  ventralVagalTone: number
  sympatheticActivation: number
  dorsalVagalCollapse: number
  socialEngagementSystem: number
}

export async function calculatePolyvagalState(
  userId: string,
  date: Date = new Date(),
): Promise<PolyvagalStateResult> {
  const start = daysAgo(date, 14)
  const [hrv, rhr, steps, locations, energy] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "unique_locations", start, date),
    fetchMetric(userId, "energy_level", start, date),
  ])

  const ventralVagalTone = clamp(normalize(mean(hrv), 20, 100))
  const sympatheticActivation = clamp(normalize(mean(rhr), 50, 90))
  const dorsalVagalCollapse = clamp(
    (clamp(100 - normalize(mean(steps), 1000, 10000)) +
      clamp(100 - mean(energy))) /
      2,
  )
  const socialEngagementSystem = clamp(normalize(mean(locations), 1, 8))

  const score = clamp(
    ventralVagalTone * 0.35 +
      (100 - sympatheticActivation) * 0.25 +
      (100 - dorsalVagalCollapse) * 0.2 +
      socialEngagementSystem * 0.2,
  )

  let dominantState: "dorsal_vagal" | "sympathetic" | "ventral_vagal"
  if (dorsalVagalCollapse > sympatheticActivation && dorsalVagalCollapse > ventralVagalTone) {
    dominantState = "dorsal_vagal"
  } else if (sympatheticActivation > ventralVagalTone) {
    dominantState = "sympathetic"
  } else {
    dominantState = "ventral_vagal"
  }

  return { score, dominantState, ventralVagalTone, sympatheticActivation, dorsalVagalCollapse, socialEngagementSystem }
}

// ---------------------------------------------------------------------------
// 57. Dissociation Risk
// ---------------------------------------------------------------------------

export interface DissociationRiskResult {
  score: number
  riskLevel: "low" | "moderate" | "elevated" | "high"
  detachmentIndex: number
  perceptualDisruption: number
  memoryGapProxy: number
  depersonalizationRisk: number
}

export async function calculateDissociationRisk(
  userId: string,
  date: Date = new Date(),
): Promise<DissociationRiskResult> {
  const start = daysAgo(date, 14)
  const [hrv, rhr, steps, sleepQuality, energy] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "energy_level", start, date),
  ])

  // Very flat/low HRV can indicate freeze/dissociation
  const detachmentIndex = clamp(100 - normalize(stddev(hrv), 5, 30))
  const perceptualDisruption = clamp(100 - mean(sleepQuality))
  const memoryGapProxy = clamp(
    100 - normalize(mean(energy), 20, 80),
  )
  const depersonalizationRisk = clamp(
    (clamp(100 - normalize(mean(steps), 1000, 10000)) +
      clamp(100 - normalize(mean(hrv), 20, 100))) /
      2,
  )

  const score = clamp(
    detachmentIndex * 0.25 +
      perceptualDisruption * 0.25 +
      memoryGapProxy * 0.25 +
      depersonalizationRisk * 0.25,
  )

  const riskLevel =
    score < 20 ? "low" : score < 45 ? "moderate" : score < 70 ? "elevated" : "high"

  return { score, riskLevel, detachmentIndex, perceptualDisruption, memoryGapProxy, depersonalizationRisk }
}

// ---------------------------------------------------------------------------
// 58. Hypervigilance Markers
// ---------------------------------------------------------------------------

export interface HypervigilanceMarkersResult {
  score: number
  level: "normal" | "mildly_elevated" | "elevated" | "severe"
  sustainedArousal: number
  sleepVigilance: number
  startleReadiness: number
  scanningBehavior: number
}

export async function calculateHypervigilanceMarkers(
  userId: string,
  date: Date = new Date(),
): Promise<HypervigilanceMarkersResult> {
  const start = daysAgo(date, 14)
  const [rhr, hrv, sleepOnset, restless, resp] = await Promise.all([
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "sleep_onset_latency", start, date),
    fetchMetric(userId, "restless_periods", start, date),
    fetchMetric(userId, "respiratory_rate", start, date),
  ])

  const sustainedArousal = clamp(
    (normalize(mean(rhr), 55, 90) + (100 - normalize(mean(hrv), 20, 100))) / 2,
  )
  const sleepVigilance = clamp(
    (normalize(mean(sleepOnset), 5, 60) + normalize(mean(restless), 0, 15)) / 2,
  )
  const startleReadiness = clamp(coefficientOfVariation(rhr) * 400)
  const scanningBehavior = clamp(normalize(mean(resp), 14, 24))

  const score = clamp(
    sustainedArousal * 0.3 + sleepVigilance * 0.3 + startleReadiness * 0.2 + scanningBehavior * 0.2,
  )

  const level =
    score < 20
      ? "normal"
      : score < 45
        ? "mildly_elevated"
        : score < 70
          ? "elevated"
          : "severe"

  return { score, level, sustainedArousal, sleepVigilance, startleReadiness, scanningBehavior }
}

// ---------------------------------------------------------------------------
// 59. Emotional Exhaustion
// ---------------------------------------------------------------------------

export interface EmotionalExhaustionResult {
  score: number
  level: "minimal" | "mild" | "moderate" | "severe"
  energyDepletion: number
  emotionalFlatness: number
  physicalManifestations: number
  recoveryDeficit: number
}

export async function calculateEmotionalExhaustion(
  userId: string,
  date: Date = new Date(),
): Promise<EmotionalExhaustionResult> {
  const start = daysAgo(date, 14)
  const [energy, mood, rhr, hrv, deepSleep] = await Promise.all([
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "deep_sleep_minutes", start, date),
  ])

  const energyDepletion = clamp(100 - mean(energy))
  const emotionalFlatness = clamp(100 - entropy(mood, 6) * 25)
  const physicalManifestations = clamp(
    (normalize(mean(rhr), 55, 90) + (100 - normalize(mean(hrv), 20, 100))) / 2,
  )
  const recoveryDeficit = clamp(100 - normalize(mean(deepSleep), 30, 120))

  const score = clamp(
    energyDepletion * 0.3 +
      emotionalFlatness * 0.2 +
      physicalManifestations * 0.25 +
      recoveryDeficit * 0.25,
  )

  const level =
    score < 20 ? "minimal" : score < 45 ? "mild" : score < 70 ? "moderate" : "severe"

  return { score, level, energyDepletion, emotionalFlatness, physicalManifestations, recoveryDeficit }
}

// ---------------------------------------------------------------------------
// 60. Depersonalization Proxy
// ---------------------------------------------------------------------------

export interface DepersonalizationProxyResult {
  score: number
  level: "absent" | "mild" | "moderate" | "severe"
  emotionalNumbing: number
  bodyDisconnection: number
  cognitiveDetachment: number
  realityDistortion: number
}

export async function calculateDepersonalizationProxy(
  userId: string,
  date: Date = new Date(),
): Promise<DepersonalizationProxyResult> {
  const start = daysAgo(date, 14)
  const [mood, hrv, steps, sleepQuality, energy, rhr] = await Promise.all([
    fetchMetric(userId, "mood_score", start, date),
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "daily_steps", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "energy_level", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  // Flat mood + disconnected physiology
  const emotionalNumbing = clamp(100 - entropy(mood, 6) * 25)
  const bodyDisconnection = clamp(
    100 - Math.abs(pearson(mood, rhr)) * 100,
  )
  const cognitiveDetachment = clamp(
    (clamp(100 - mean(energy)) + clamp(100 - normalize(mean(steps), 2000, 10000))) / 2,
  )
  const realityDistortion = clamp(100 - mean(sleepQuality))

  const score = clamp(
    emotionalNumbing * 0.3 +
      bodyDisconnection * 0.25 +
      cognitiveDetachment * 0.25 +
      realityDistortion * 0.2,
  )

  const level =
    score < 15 ? "absent" : score < 40 ? "mild" : score < 65 ? "moderate" : "severe"

  return { score, level, emotionalNumbing, bodyDisconnection, cognitiveDetachment, realityDistortion }
}

// ---------------------------------------------------------------------------
// 61. Comprehensive Mental Health Summary
// ---------------------------------------------------------------------------

export interface MentalHealthSummaryResult {
  overallWellbeing: number
  anxietyRisk: number
  depressionRisk: number
  stressLevel: number
  emotionalResilience: number
  burnoutRisk: number
  cognitiveFunction: number
  socialHealth: number
  sleepMentalHealthLink: number
  timestamp: Date
}

export async function calculateMentalHealthSummary(
  userId: string,
  date: Date = new Date(),
): Promise<MentalHealthSummaryResult> {
  const [
    anxiety,
    depression,
    stress,
    resilience,
    burnout,
    executive,
    social,
    sleepMood,
  ] = await Promise.all([
    calculateAnxietyIndex(userId, date),
    calculateDepressionRisk(userId, date),
    calculateStressLevel(userId, date),
    calculateEmotionalResilience(userId, date),
    calculateBurnoutRisk(userId, date),
    calculateExecutiveFunction(userId, date),
    calculateSocialEngagementProxy(userId, date),
    calculateSleepMoodCorrelation(userId, date),
  ])

  const overallWellbeing = clamp(
    (100 - anxiety.score) * 0.15 +
      (100 - depression.score) * 0.15 +
      (100 - stress.score) * 0.15 +
      resilience.score * 0.15 +
      (100 - burnout.score) * 0.1 +
      executive.score * 0.1 +
      social.score * 0.1 +
      (sleepMood.correlationCoefficient + 1) * 25 * 0.1,
  )

  return {
    overallWellbeing,
    anxietyRisk: anxiety.score,
    depressionRisk: depression.score,
    stressLevel: stress.score,
    emotionalResilience: resilience.score,
    burnoutRisk: burnout.score,
    cognitiveFunction: executive.score,
    socialHealth: social.score,
    sleepMentalHealthLink: sleepMood.correlationCoefficient,
    timestamp: date,
  }
}
