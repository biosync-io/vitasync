import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, sql } from "drizzle-orm"

async function fetchMetric(db: any, userId: string, metricType: string, since: Date, until: Date) {
  return db.select({ value: healthMetrics.value, recordedAt: healthMetrics.recordedAt }).from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), eq(healthMetrics.metricType, metricType), gte(healthMetrics.recordedAt, since), lte(healthMetrics.recordedAt, until)))
    .orderBy(healthMetrics.recordedAt)
}
function mean(v: number[]): number { return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }
function stddev(v: number[]): number { const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length || 1)) }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)) }
function slope(v: number[]): number {
  if (v.length < 2) return 0
  const m = mean(v)
  const mi = mean(v.map((_, i) => i))
  const num = v.reduce((s, x, i) => s + (i - mi) * (x - m), 0)
  const den = v.reduce((s, _, i) => s + (i - mi) ** 2, 0)
  return den === 0 ? 0 : num / den
}
function coefficient_of_variation(v: number[]): number { const m = mean(v); return m === 0 ? 0 : stddev(v) / Math.abs(m) }
function median(v: number[]): number {
  if (!v.length) return 0
  const sorted = [...v].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}
function iqr(v: number[]): number {
  if (v.length < 4) return 0
  const sorted = [...v].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]!
  const q3 = sorted[Math.floor(sorted.length * 0.75)]!
  return q3 - q1
}
function exponentialDecay(v: number[], alpha: number): number {
  let result = v[0] ?? 0
  for (let i = 1; i < v.length; i++) result = alpha * v[i]! + (1 - alpha) * result
  return result
}
function percentAboveThreshold(v: number[], threshold: number): number {
  return v.length ? v.filter(x => x > threshold).length / v.length : 0
}
function percentBelowThreshold(v: number[], threshold: number): number {
  return v.length ? v.filter(x => x < threshold).length / v.length : 0
}

// ---------------------------------------------------------------------------
// 1. computeImmuneReadiness
// ---------------------------------------------------------------------------
export interface ImmuneReadinessResult {
  readinessScore: number
  wbcStability: number
  temperatureBaseline: number
  restingHeartRateProxy: number
  sleepContribution: number
  riskLevel: "low" | "moderate" | "high"
}

export async function computeImmuneReadiness(userId: string, since: Date, until: Date): Promise<ImmuneReadinessResult> {
  const db = getDb()
  const [wbc, temp, hr, sleep] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const wbcStability = 1 - clamp(coefficient_of_variation(wbcVals), 0, 1)
  const temperatureBaseline = mean(tempVals)
  const tempNorm = clamp(1 - Math.abs(temperatureBaseline - 36.8) / 2, 0, 1)
  const restingHeartRateProxy = clamp(1 - (mean(hrVals) - 50) / 50, 0, 1)
  const sleepContribution = clamp(mean(sleepVals) / 8, 0, 1)
  const readinessScore = clamp((wbcStability * 0.3 + tempNorm * 0.25 + restingHeartRateProxy * 0.2 + sleepContribution * 0.25) * 100, 0, 100)
  const riskLevel = readinessScore >= 70 ? "low" : readinessScore >= 40 ? "moderate" : "high"
  return { readinessScore, wbcStability, temperatureBaseline, restingHeartRateProxy, sleepContribution, riskLevel }
}

// ---------------------------------------------------------------------------
// 2. assessInfectionRisk
// ---------------------------------------------------------------------------
export interface InfectionRiskResult {
  riskScore: number
  temperatureTrend: number
  heartRateElevation: number
  sleepDeficit: number
  activityDecline: number
  riskLevel: "low" | "moderate" | "high" | "critical"
}

export async function assessInfectionRisk(userId: string, since: Date, until: Date): Promise<InfectionRiskResult> {
  const db = getDb()
  const [temp, hr, sleep, steps] = await Promise.all([
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "steps", since, until),
  ])
  const tempVals = temp.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const stepVals = steps.map((r: any) => Number(r.value))

  const temperatureTrend = slope(tempVals)
  const heartRateElevation = clamp((mean(hrVals) - 65) / 35, 0, 1)
  const sleepDeficit = clamp(1 - mean(sleepVals) / 7, 0, 1)
  const activityDecline = slope(stepVals) < 0 ? clamp(Math.abs(slope(stepVals)) / 500, 0, 1) : 0
  const riskScore = clamp((temperatureTrend * 20 + heartRateElevation * 30 + sleepDeficit * 25 + activityDecline * 25), 0, 100)
  const riskLevel = riskScore >= 80 ? "critical" : riskScore >= 55 ? "high" : riskScore >= 30 ? "moderate" : "low"
  return { riskScore, temperatureTrend, heartRateElevation, sleepDeficit, activityDecline, riskLevel }
}

// ---------------------------------------------------------------------------
// 3. computeInflammationLevel
// ---------------------------------------------------------------------------
export interface InflammationLevelResult {
  inflammationIndex: number
  crpProxy: number
  restingHRContribution: number
  temperatureContribution: number
  hrvContribution: number
  classification: "minimal" | "mild" | "moderate" | "severe"
}

export async function computeInflammationLevel(userId: string, since: Date, until: Date): Promise<InflammationLevelResult> {
  const db = getDb()
  const [crp, hr, temp, hrv] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "hrv", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))
  const hrvVals = hrv.map((r: any) => Number(r.value))

  const crpProxy = clamp(mean(crpVals) / 10, 0, 1)
  const restingHRContribution = clamp((mean(hrVals) - 60) / 40, 0, 1)
  const temperatureContribution = clamp((mean(tempVals) - 37.0) / 2, 0, 1)
  const hrvContribution = clamp(1 - mean(hrvVals) / 80, 0, 1)
  const inflammationIndex = clamp((crpProxy * 0.35 + restingHRContribution * 0.2 + temperatureContribution * 0.25 + hrvContribution * 0.2) * 100, 0, 100)
  const classification = inflammationIndex >= 75 ? "severe" : inflammationIndex >= 50 ? "moderate" : inflammationIndex >= 25 ? "mild" : "minimal"
  return { inflammationIndex, crpProxy, restingHRContribution, temperatureContribution, hrvContribution, classification }
}

// ---------------------------------------------------------------------------
// 4. analyzeImmuneRecovery
// ---------------------------------------------------------------------------
export interface ImmuneRecoveryResult {
  recoveryScore: number
  temperatureNormalization: number
  heartRateRecovery: number
  sleepQualityImprovement: number
  activityResumption: number
  phase: "acute" | "recovering" | "recovered"
}

export async function analyzeImmuneRecovery(userId: string, since: Date, until: Date): Promise<ImmuneRecoveryResult> {
  const db = getDb()
  const [temp, hr, sleep, steps] = await Promise.all([
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "sleep_quality", since, until),
    fetchMetric(db, userId, "steps", since, until),
  ])
  const tempVals = temp.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const stepVals = steps.map((r: any) => Number(r.value))

  const temperatureNormalization = clamp(1 - Math.abs(slope(tempVals)) * 5, 0, 1)
  const heartRateRecovery = slope(hrVals) < 0 ? clamp(Math.abs(slope(hrVals)) / 2, 0, 1) : 0
  const sleepQualityImprovement = clamp(slope(sleepVals) * 10, 0, 1)
  const activityResumption = slope(stepVals) > 0 ? clamp(slope(stepVals) / 200, 0, 1) : 0
  const recoveryScore = clamp((temperatureNormalization * 0.3 + heartRateRecovery * 0.25 + sleepQualityImprovement * 0.2 + activityResumption * 0.25) * 100, 0, 100)
  const phase = recoveryScore >= 75 ? "recovered" : recoveryScore >= 35 ? "recovering" : "acute"
  return { recoveryScore, temperatureNormalization, heartRateRecovery, sleepQualityImprovement, activityResumption, phase }
}

// ---------------------------------------------------------------------------
// 5. computeVaccineResponseProxy
// ---------------------------------------------------------------------------
export interface VaccineResponseProxyResult {
  responseScore: number
  immuneReactivity: number
  baselineImmunity: number
  sleepPreparation: number
  stressImpact: number
  expectedEfficacy: "low" | "moderate" | "high"
}

export async function computeVaccineResponseProxy(userId: string, since: Date, until: Date): Promise<VaccineResponseProxyResult> {
  const db = getDb()
  const [temp, wbc, sleep, cortisol] = await Promise.all([
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
  ])
  const tempVals = temp.map((r: any) => Number(r.value))
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))

  const immuneReactivity = clamp(stddev(tempVals) / 0.5, 0, 1)
  const baselineImmunity = clamp(mean(wbcVals) / 10, 0, 1)
  const sleepPreparation = clamp(mean(sleepVals) / 8, 0, 1)
  const stressImpact = clamp(1 - mean(cortisolVals) / 25, 0, 1)
  const responseScore = clamp((immuneReactivity * 0.2 + baselineImmunity * 0.3 + sleepPreparation * 0.25 + stressImpact * 0.25) * 100, 0, 100)
  const expectedEfficacy = responseScore >= 65 ? "high" : responseScore >= 35 ? "moderate" : "low"
  return { responseScore, immuneReactivity, baselineImmunity, sleepPreparation, stressImpact, expectedEfficacy }
}

// ---------------------------------------------------------------------------
// 6. assessAutoimmunityRisk
// ---------------------------------------------------------------------------
export interface AutoimmunityRiskResult {
  riskScore: number
  inflammationPersistence: number
  immuneOveractivity: number
  stressLoad: number
  sleepDisruption: number
  riskCategory: "low" | "moderate" | "high"
}

export async function assessAutoimmunityRisk(userId: string, since: Date, until: Date): Promise<AutoimmunityRiskResult> {
  const db = getDb()
  const [crp, wbc, cortisol, sleep] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
    fetchMetric(db, userId, "sleep_quality", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const inflammationPersistence = clamp(percentAboveThreshold(crpVals, 3), 0, 1)
  const immuneOveractivity = clamp((mean(wbcVals) - 8) / 7, 0, 1)
  const stressLoad = clamp(mean(cortisolVals) / 25, 0, 1)
  const sleepDisruption = clamp(1 - mean(sleepVals) / 100, 0, 1)
  const riskScore = clamp((inflammationPersistence * 0.35 + immuneOveractivity * 0.25 + stressLoad * 0.2 + sleepDisruption * 0.2) * 100, 0, 100)
  const riskCategory = riskScore >= 60 ? "high" : riskScore >= 30 ? "moderate" : "low"
  return { riskScore, inflammationPersistence, immuneOveractivity, stressLoad, sleepDisruption, riskCategory }
}

// ---------------------------------------------------------------------------
// 7. computeImmunosenescence
// ---------------------------------------------------------------------------
export interface ImmunosenescenceResult {
  senescenceIndex: number
  immuneDeclineRate: number
  recoverySlowing: number
  inflammatoryAging: number
  thymusDeclineProxy: number
  biologicalImmuneAge: "young" | "normal" | "accelerated" | "advanced"
}

export async function computeImmunosenescence(userId: string, since: Date, until: Date): Promise<ImmunosenescenceResult> {
  const db = getDb()
  const [wbc, crp, hr, temp] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))

  const immuneDeclineRate = clamp(-slope(wbcVals) / 0.5, 0, 1)
  const recoverySlowing = clamp(coefficient_of_variation(hrVals), 0, 1)
  const inflammatoryAging = clamp(slope(crpVals) * 5, 0, 1)
  const thymusDeclineProxy = clamp(1 - mean(wbcVals) / 9, 0, 1)
  const senescenceIndex = clamp((immuneDeclineRate * 0.3 + recoverySlowing * 0.2 + inflammatoryAging * 0.3 + thymusDeclineProxy * 0.2) * 100, 0, 100)
  const biologicalImmuneAge = senescenceIndex >= 75 ? "advanced" : senescenceIndex >= 50 ? "accelerated" : senescenceIndex >= 25 ? "normal" : "young"
  return { senescenceIndex, immuneDeclineRate, recoverySlowing, inflammatoryAging, thymusDeclineProxy, biologicalImmuneAge }
}

// ---------------------------------------------------------------------------
// 8. analyzeAllergySeverityProxy
// ---------------------------------------------------------------------------
export interface AllergySeverityProxyResult {
  severityScore: number
  histamineProxy: number
  respiratoryImpact: number
  skinReactivity: number
  sleepImpact: number
  classification: "none" | "mild" | "moderate" | "severe"
}

export async function analyzeAllergySeverityProxy(userId: string, since: Date, until: Date): Promise<AllergySeverityProxyResult> {
  const db = getDb()
  const [hr, spo2, temp, sleep] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "spo2", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "sleep_quality", since, until),
  ])
  const hrVals = hr.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const histamineProxy = clamp((mean(hrVals) - 70) / 30, 0, 1)
  const respiratoryImpact = clamp((97 - mean(spo2Vals)) / 5, 0, 1)
  const skinReactivity = clamp((mean(tempVals) - 37.0) / 1.5, 0, 1)
  const sleepImpact = clamp(1 - mean(sleepVals) / 85, 0, 1)
  const severityScore = clamp((histamineProxy * 0.3 + respiratoryImpact * 0.25 + skinReactivity * 0.2 + sleepImpact * 0.25) * 100, 0, 100)
  const classification = severityScore >= 70 ? "severe" : severityScore >= 45 ? "moderate" : severityScore >= 20 ? "mild" : "none"
  return { severityScore, histamineProxy, respiratoryImpact, skinReactivity, sleepImpact, classification }
}

// ---------------------------------------------------------------------------
// 9. computeCytokineStormRisk
// ---------------------------------------------------------------------------
export interface CytokineStormRiskResult {
  riskScore: number
  temperatureSpike: number
  heartRateSurge: number
  oxygenDrop: number
  inflammationSurge: number
  urgency: "none" | "watch" | "alert" | "emergency"
}

export async function computeCytokineStormRisk(userId: string, since: Date, until: Date): Promise<CytokineStormRiskResult> {
  const db = getDb()
  const [temp, hr, spo2, crp] = await Promise.all([
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "spo2", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
  ])
  const tempVals = temp.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))

  const temperatureSpike = clamp((Math.max(...tempVals, 36.5) - 38) / 3, 0, 1)
  const heartRateSurge = clamp((Math.max(...hrVals, 60) - 100) / 40, 0, 1)
  const oxygenDrop = clamp((95 - Math.min(...spo2Vals, 100)) / 10, 0, 1)
  const inflammationSurge = clamp(slope(crpVals) * 3, 0, 1)
  const riskScore = clamp((temperatureSpike * 0.25 + heartRateSurge * 0.25 + oxygenDrop * 0.3 + inflammationSurge * 0.2) * 100, 0, 100)
  const urgency = riskScore >= 80 ? "emergency" : riskScore >= 55 ? "alert" : riskScore >= 25 ? "watch" : "none"
  return { riskScore, temperatureSpike, heartRateSurge, oxygenDrop, inflammationSurge, urgency }
}

// ---------------------------------------------------------------------------
// 10. assessSepsisRisk
// ---------------------------------------------------------------------------
export interface SepsisRiskResult {
  riskScore: number
  sofa_proxy: number
  temperatureAbnormality: number
  heartRateAbnormality: number
  respiratoryDistress: number
  riskLevel: "low" | "moderate" | "high" | "critical"
}

export async function assessSepsisRisk(userId: string, since: Date, until: Date): Promise<SepsisRiskResult> {
  const db = getDb()
  const [temp, hr, spo2, bp] = await Promise.all([
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "spo2", since, until),
    fetchMetric(db, userId, "blood_pressure_systolic", since, until),
  ])
  const tempVals = temp.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))
  const bpVals = bp.map((r: any) => Number(r.value))

  const temperatureAbnormality = clamp(Math.max((mean(tempVals) - 38) / 3, (36 - mean(tempVals)) / 2), 0, 1)
  const heartRateAbnormality = clamp((mean(hrVals) - 90) / 40, 0, 1)
  const respiratoryDistress = clamp((94 - mean(spo2Vals)) / 8, 0, 1)
  const sofa_proxy = clamp((100 - mean(bpVals)) / 40, 0, 1)
  const riskScore = clamp((sofa_proxy * 0.3 + temperatureAbnormality * 0.25 + heartRateAbnormality * 0.2 + respiratoryDistress * 0.25) * 100, 0, 100)
  const riskLevel = riskScore >= 75 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 25 ? "moderate" : "low"
  return { riskScore, sofa_proxy, temperatureAbnormality, heartRateAbnormality, respiratoryDistress, riskLevel }
}

// ---------------------------------------------------------------------------
// 11. computeWhiteBloodCellProxy
// ---------------------------------------------------------------------------
export interface WhiteBloodCellProxyResult {
  estimatedWBC: number
  stability: number
  trend: number
  deviationFromNormal: number
  inflammatoryBias: number
  status: "low" | "normal" | "elevated" | "high"
}

export async function computeWhiteBloodCellProxy(userId: string, since: Date, until: Date): Promise<WhiteBloodCellProxyResult> {
  const db = getDb()
  const [wbc, crp, temp, hr] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))

  const estimatedWBC = wbcVals.length > 0
    ? mean(wbcVals)
    : 4.5 + mean(crpVals) * 0.3 + (mean(tempVals) - 36.5) * 1.2 + (mean(hrVals) - 60) * 0.05
  const stability = 1 - clamp(coefficient_of_variation(wbcVals), 0, 1)
  const trend = slope(wbcVals)
  const deviationFromNormal = Math.abs(estimatedWBC - 7) / 7
  const inflammatoryBias = clamp(mean(crpVals) / 5, 0, 1)
  const status = estimatedWBC >= 11 ? "high" : estimatedWBC >= 8 ? "elevated" : estimatedWBC >= 4 ? "normal" : "low"
  return { estimatedWBC, stability, trend, deviationFromNormal, inflammatoryBias, status }
}

// ---------------------------------------------------------------------------
// 12. analyzeImmuneCircadianRhythm
// ---------------------------------------------------------------------------
export interface ImmuneCircadianRhythmResult {
  rhythmScore: number
  sleepConsistency: number
  temperatureAmplitude: number
  heartRateVariability: number
  cortisolPattern: number
  alignment: "aligned" | "mildly_disrupted" | "severely_disrupted"
}

export async function analyzeImmuneCircadianRhythm(userId: string, since: Date, until: Date): Promise<ImmuneCircadianRhythmResult> {
  const db = getDb()
  const [sleep, temp, hrv, cortisol] = await Promise.all([
    fetchMetric(db, userId, "sleep_onset_time", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "hrv", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
  ])
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))
  const hrvVals = hrv.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))

  const sleepConsistency = 1 - clamp(stddev(sleepVals) / 120, 0, 1)
  const temperatureAmplitude = clamp((Math.max(...tempVals, 36) - Math.min(...tempVals, 37)) / 1.5, 0, 1)
  const heartRateVariability = clamp(mean(hrvVals) / 80, 0, 1)
  const cortisolPattern = clamp(1 - coefficient_of_variation(cortisolVals), 0, 1)
  const rhythmScore = clamp((sleepConsistency * 0.3 + temperatureAmplitude * 0.2 + heartRateVariability * 0.25 + cortisolPattern * 0.25) * 100, 0, 100)
  const alignment = rhythmScore >= 70 ? "aligned" : rhythmScore >= 40 ? "mildly_disrupted" : "severely_disrupted"
  return { rhythmScore, sleepConsistency, temperatureAmplitude, heartRateVariability, cortisolPattern, alignment }
}

// ---------------------------------------------------------------------------
// 13. computeGutImmuneLink
// ---------------------------------------------------------------------------
export interface GutImmuneLinkResult {
  linkScore: number
  digestiveStability: number
  inflammationCorrelation: number
  nutritionQuality: number
  stressGutImpact: number
  gutImmuneStatus: "strong" | "moderate" | "weak"
}

export async function computeGutImmuneLink(userId: string, since: Date, until: Date): Promise<GutImmuneLinkResult> {
  const db = getDb()
  const [fiber, crp, calories, cortisol] = await Promise.all([
    fetchMetric(db, userId, "fiber_intake", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "caloric_intake", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
  ])
  const fiberVals = fiber.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const calorieVals = calories.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))

  const digestiveStability = clamp(mean(fiberVals) / 30, 0, 1)
  const inflammationCorrelation = clamp(1 - mean(crpVals) / 8, 0, 1)
  const nutritionQuality = clamp(mean(calorieVals) / 2200, 0, 1)
  const stressGutImpact = clamp(1 - mean(cortisolVals) / 22, 0, 1)
  const linkScore = clamp((digestiveStability * 0.3 + inflammationCorrelation * 0.25 + nutritionQuality * 0.2 + stressGutImpact * 0.25) * 100, 0, 100)
  const gutImmuneStatus = linkScore >= 65 ? "strong" : linkScore >= 35 ? "moderate" : "weak"
  return { linkScore, digestiveStability, inflammationCorrelation, nutritionQuality, stressGutImpact, gutImmuneStatus }
}

// ---------------------------------------------------------------------------
// 14. assessLymphaticFunction
// ---------------------------------------------------------------------------
export interface LymphaticFunctionResult {
  functionScore: number
  activityLevel: number
  hydrationProxy: number
  inflammationLoad: number
  restfulness: number
  status: "optimal" | "adequate" | "impaired"
}

export async function assessLymphaticFunction(userId: string, since: Date, until: Date): Promise<LymphaticFunctionResult> {
  const db = getDb()
  const [steps, water, crp, sleep] = await Promise.all([
    fetchMetric(db, userId, "steps", since, until),
    fetchMetric(db, userId, "water_intake", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
  ])
  const stepVals = steps.map((r: any) => Number(r.value))
  const waterVals = water.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const activityLevel = clamp(mean(stepVals) / 10000, 0, 1)
  const hydrationProxy = clamp(mean(waterVals) / 2500, 0, 1)
  const inflammationLoad = clamp(1 - mean(crpVals) / 8, 0, 1)
  const restfulness = clamp(mean(sleepVals) / 8, 0, 1)
  const functionScore = clamp((activityLevel * 0.35 + hydrationProxy * 0.25 + inflammationLoad * 0.2 + restfulness * 0.2) * 100, 0, 100)
  const status = functionScore >= 65 ? "optimal" : functionScore >= 35 ? "adequate" : "impaired"
  return { functionScore, activityLevel, hydrationProxy, inflammationLoad, restfulness, status }
}

// ---------------------------------------------------------------------------
// 15. computeMucosalImmunityProxy
// ---------------------------------------------------------------------------
export interface MucosalImmunityProxyResult {
  immunityScore: number
  hydrationFactor: number
  vitaminAProxy: number
  inflammationFactor: number
  respiratoryHealth: number
  status: "strong" | "moderate" | "weak"
}

export async function computeMucosalImmunityProxy(userId: string, since: Date, until: Date): Promise<MucosalImmunityProxyResult> {
  const db = getDb()
  const [water, vitA, crp, spo2] = await Promise.all([
    fetchMetric(db, userId, "water_intake", since, until),
    fetchMetric(db, userId, "vitamin_a_intake", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "spo2", since, until),
  ])
  const waterVals = water.map((r: any) => Number(r.value))
  const vitAVals = vitA.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))

  const hydrationFactor = clamp(mean(waterVals) / 2500, 0, 1)
  const vitaminAProxy = clamp(mean(vitAVals) / 900, 0, 1)
  const inflammationFactor = clamp(1 - mean(crpVals) / 6, 0, 1)
  const respiratoryHealth = clamp((mean(spo2Vals) - 92) / 6, 0, 1)
  const immunityScore = clamp((hydrationFactor * 0.25 + vitaminAProxy * 0.25 + inflammationFactor * 0.25 + respiratoryHealth * 0.25) * 100, 0, 100)
  const status = immunityScore >= 65 ? "strong" : immunityScore >= 35 ? "moderate" : "weak"
  return { immunityScore, hydrationFactor, vitaminAProxy, inflammationFactor, respiratoryHealth, status }
}

// ---------------------------------------------------------------------------
// 16. computeComplementSystemProxy
// ---------------------------------------------------------------------------
export interface ComplementSystemProxyResult {
  activityScore: number
  inflammationDriver: number
  immuneComplexProxy: number
  liverFunctionProxy: number
  activationLevel: number
  status: "normal" | "underactive" | "overactive"
}

export async function computeComplementSystemProxy(userId: string, since: Date, until: Date): Promise<ComplementSystemProxyResult> {
  const db = getDb()
  const [crp, wbc, alt, temp] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "alt_liver", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const altVals = alt.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))

  const inflammationDriver = clamp(mean(crpVals) / 8, 0, 1)
  const immuneComplexProxy = clamp(mean(wbcVals) / 12, 0, 1)
  const liverFunctionProxy = clamp(1 - (mean(altVals) - 20) / 40, 0, 1)
  const activationLevel = clamp((mean(tempVals) - 36.5) / 2.5, 0, 1)
  const activityScore = clamp((inflammationDriver * 0.3 + immuneComplexProxy * 0.25 + liverFunctionProxy * 0.2 + activationLevel * 0.25) * 100, 0, 100)
  const status = activityScore >= 70 ? "overactive" : activityScore <= 30 ? "underactive" : "normal"
  return { activityScore, inflammationDriver, immuneComplexProxy, liverFunctionProxy, activationLevel, status }
}

// ---------------------------------------------------------------------------
// 17. computePhagocyteFunctionProxy
// ---------------------------------------------------------------------------
export interface PhagocyteFunctionProxyResult {
  functionScore: number
  wbcAvailability: number
  metabolicSupport: number
  oxygenSupply: number
  inflammationResponse: number
  efficiency: "high" | "moderate" | "low"
}

export async function computePhagocyteFunctionProxy(userId: string, since: Date, until: Date): Promise<PhagocyteFunctionProxyResult> {
  const db = getDb()
  const [wbc, glucose, spo2, crp] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "blood_glucose", since, until),
    fetchMetric(db, userId, "spo2", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const glucoseVals = glucose.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))

  const wbcAvailability = clamp(mean(wbcVals) / 10, 0, 1)
  const metabolicSupport = clamp(1 - Math.abs(mean(glucoseVals) - 100) / 60, 0, 1)
  const oxygenSupply = clamp((mean(spo2Vals) - 90) / 8, 0, 1)
  const inflammationResponse = clamp(mean(crpVals) / 5, 0, 1)
  const functionScore = clamp((wbcAvailability * 0.3 + metabolicSupport * 0.2 + oxygenSupply * 0.25 + inflammationResponse * 0.25) * 100, 0, 100)
  const efficiency = functionScore >= 65 ? "high" : functionScore >= 35 ? "moderate" : "low"
  return { functionScore, wbcAvailability, metabolicSupport, oxygenSupply, inflammationResponse, efficiency }
}

// ---------------------------------------------------------------------------
// 18. computeNKCellActivityProxy
// ---------------------------------------------------------------------------
export interface NKCellActivityProxyResult {
  activityScore: number
  sleepSupport: number
  stressInhibition: number
  exerciseStimulation: number
  inflammationSignal: number
  activityLevel: "high" | "moderate" | "low"
}

export async function computeNKCellActivityProxy(userId: string, since: Date, until: Date): Promise<NKCellActivityProxyResult> {
  const db = getDb()
  const [sleep, cortisol, steps, crp] = await Promise.all([
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
    fetchMetric(db, userId, "steps", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
  ])
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))
  const stepVals = steps.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))

  const sleepSupport = clamp(mean(sleepVals) / 8, 0, 1)
  const stressInhibition = clamp(1 - mean(cortisolVals) / 22, 0, 1)
  const exerciseStimulation = clamp(mean(stepVals) / 10000, 0, 1)
  const inflammationSignal = clamp(mean(crpVals) / 6, 0, 1)
  const activityScore = clamp((sleepSupport * 0.3 + stressInhibition * 0.25 + exerciseStimulation * 0.25 + inflammationSignal * 0.2) * 100, 0, 100)
  const activityLevel = activityScore >= 65 ? "high" : activityScore >= 35 ? "moderate" : "low"
  return { activityScore, sleepSupport, stressInhibition, exerciseStimulation, inflammationSignal, activityLevel }
}

// ---------------------------------------------------------------------------
// 19. computeTCellExhaustionProxy
// ---------------------------------------------------------------------------
export interface TCellExhaustionProxyResult {
  exhaustionIndex: number
  chronicStimulation: number
  sleepDeprivation: number
  cortisolLoad: number
  inflammationDuration: number
  status: "fresh" | "mildly_exhausted" | "moderately_exhausted" | "severely_exhausted"
}

export async function computeTCellExhaustionProxy(userId: string, since: Date, until: Date): Promise<TCellExhaustionProxyResult> {
  const db = getDb()
  const [crp, sleep, cortisol, temp] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))

  const chronicStimulation = clamp(percentAboveThreshold(crpVals, 2) + percentAboveThreshold(tempVals, 37.2), 0, 1)
  const sleepDeprivation = clamp(1 - mean(sleepVals) / 7.5, 0, 1)
  const cortisolLoad = clamp(mean(cortisolVals) / 25, 0, 1)
  const inflammationDuration = clamp(percentAboveThreshold(crpVals, 3), 0, 1)
  const exhaustionIndex = clamp((chronicStimulation * 0.3 + sleepDeprivation * 0.2 + cortisolLoad * 0.25 + inflammationDuration * 0.25) * 100, 0, 100)
  const status = exhaustionIndex >= 75 ? "severely_exhausted" : exhaustionIndex >= 50 ? "moderately_exhausted" : exhaustionIndex >= 25 ? "mildly_exhausted" : "fresh"
  return { exhaustionIndex, chronicStimulation, sleepDeprivation, cortisolLoad, inflammationDuration, status }
}

// ---------------------------------------------------------------------------
// 20. computeImmunoglobulinProxy
// ---------------------------------------------------------------------------
export interface ImmunoglobulinProxyResult {
  igScore: number
  immuneTraining: number
  proteinAvailability: number
  gutIntegrity: number
  infectionHistory: number
  level: "deficient" | "low" | "normal" | "high"
}

export async function computeImmunoglobulinProxy(userId: string, since: Date, until: Date): Promise<ImmunoglobulinProxyResult> {
  const db = getDb()
  const [wbc, protein, fiber, crp] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "protein_intake", since, until),
    fetchMetric(db, userId, "fiber_intake", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const proteinVals = protein.map((r: any) => Number(r.value))
  const fiberVals = fiber.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))

  const immuneTraining = clamp(mean(wbcVals) / 9, 0, 1)
  const proteinAvailability = clamp(mean(proteinVals) / 60, 0, 1)
  const gutIntegrity = clamp(mean(fiberVals) / 30, 0, 1)
  const infectionHistory = clamp(percentAboveThreshold(crpVals, 3), 0, 1)
  const igScore = clamp((immuneTraining * 0.3 + proteinAvailability * 0.25 + gutIntegrity * 0.2 + infectionHistory * 0.25) * 100, 0, 100)
  const level = igScore >= 75 ? "high" : igScore >= 50 ? "normal" : igScore >= 25 ? "low" : "deficient"
  return { igScore, immuneTraining, proteinAvailability, gutIntegrity, infectionHistory, level }
}

// ---------------------------------------------------------------------------
// 21. computeThymusFunctionProxy
// ---------------------------------------------------------------------------
export interface ThymusFunctionProxyResult {
  functionScore: number
  tCellProductionProxy: number
  ageRelatedDecline: number
  zincSupport: number
  hormonalInfluence: number
  status: "active" | "declining" | "involuted"
}

export async function computeThymusFunctionProxy(userId: string, since: Date, until: Date): Promise<ThymusFunctionProxyResult> {
  const db = getDb()
  const [wbc, age, zinc, cortisol] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "biological_age", since, until),
    fetchMetric(db, userId, "zinc_intake", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const ageVals = age.map((r: any) => Number(r.value))
  const zincVals = zinc.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))

  const tCellProductionProxy = clamp(mean(wbcVals) / 9, 0, 1)
  const ageRelatedDecline = clamp(1 - (mean(ageVals) - 20) / 60, 0, 1)
  const zincSupport = clamp(mean(zincVals) / 12, 0, 1)
  const hormonalInfluence = clamp(1 - mean(cortisolVals) / 25, 0, 1)
  const functionScore = clamp((tCellProductionProxy * 0.3 + ageRelatedDecline * 0.25 + zincSupport * 0.2 + hormonalInfluence * 0.25) * 100, 0, 100)
  const status = functionScore >= 60 ? "active" : functionScore >= 30 ? "declining" : "involuted"
  return { functionScore, tCellProductionProxy, ageRelatedDecline, zincSupport, hormonalInfluence, status }
}

// ---------------------------------------------------------------------------
// 22. computeInnateImmunityScore
// ---------------------------------------------------------------------------
export interface InnateImmunityScoreResult {
  score: number
  barrierIntegrity: number
  phagocyteReadiness: number
  complementActivity: number
  nkCellProxy: number
  level: "strong" | "adequate" | "weak"
}

export async function computeInnateImmunityScore(userId: string, since: Date, until: Date): Promise<InnateImmunityScoreResult> {
  const db = getDb()
  const [spo2, wbc, crp, sleep] = await Promise.all([
    fetchMetric(db, userId, "spo2", since, until),
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
  ])
  const spo2Vals = spo2.map((r: any) => Number(r.value))
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const barrierIntegrity = clamp((mean(spo2Vals) - 92) / 6, 0, 1)
  const phagocyteReadiness = clamp(mean(wbcVals) / 9, 0, 1)
  const complementActivity = clamp(1 - Math.abs(mean(crpVals) - 1) / 5, 0, 1)
  const nkCellProxy = clamp(mean(sleepVals) / 8, 0, 1)
  const score = clamp((barrierIntegrity * 0.25 + phagocyteReadiness * 0.3 + complementActivity * 0.2 + nkCellProxy * 0.25) * 100, 0, 100)
  const level = score >= 65 ? "strong" : score >= 35 ? "adequate" : "weak"
  return { score, barrierIntegrity, phagocyteReadiness, complementActivity, nkCellProxy, level }
}

// ---------------------------------------------------------------------------
// 23. computeAdaptiveImmunityScore
// ---------------------------------------------------------------------------
export interface AdaptiveImmunityScoreResult {
  score: number
  tCellProxy: number
  bCellProxy: number
  memoryResponse: number
  antibodyProxy: number
  level: "strong" | "adequate" | "weak"
}

export async function computeAdaptiveImmunityScore(userId: string, since: Date, until: Date): Promise<AdaptiveImmunityScoreResult> {
  const db = getDb()
  const [wbc, protein, sleep, crp] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "protein_intake", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const proteinVals = protein.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))

  const tCellProxy = clamp(mean(wbcVals) / 10, 0, 1)
  const bCellProxy = clamp(mean(proteinVals) / 65, 0, 1)
  const memoryResponse = clamp(mean(sleepVals) / 8, 0, 1)
  const antibodyProxy = clamp(1 - coefficient_of_variation(crpVals), 0, 1)
  const score = clamp((tCellProxy * 0.3 + bCellProxy * 0.2 + memoryResponse * 0.25 + antibodyProxy * 0.25) * 100, 0, 100)
  const level = score >= 65 ? "strong" : score >= 35 ? "adequate" : "weak"
  return { score, tCellProxy, bCellProxy, memoryResponse, antibodyProxy, level }
}

// ---------------------------------------------------------------------------
// 24. computeImmuneToleranceProxy
// ---------------------------------------------------------------------------
export interface ImmuneToleranceProxyResult {
  toleranceScore: number
  regulatoryBalance: number
  inflammationControl: number
  stressRegulation: number
  gutBarrier: number
  status: "tolerant" | "borderline" | "intolerant"
}

export async function computeImmuneToleranceProxy(userId: string, since: Date, until: Date): Promise<ImmuneToleranceProxyResult> {
  const db = getDb()
  const [crp, cortisol, fiber, hrv] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
    fetchMetric(db, userId, "fiber_intake", since, until),
    fetchMetric(db, userId, "hrv", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))
  const fiberVals = fiber.map((r: any) => Number(r.value))
  const hrvVals = hrv.map((r: any) => Number(r.value))

  const regulatoryBalance = clamp(mean(hrvVals) / 70, 0, 1)
  const inflammationControl = clamp(1 - mean(crpVals) / 6, 0, 1)
  const stressRegulation = clamp(1 - mean(cortisolVals) / 20, 0, 1)
  const gutBarrier = clamp(mean(fiberVals) / 28, 0, 1)
  const toleranceScore = clamp((regulatoryBalance * 0.25 + inflammationControl * 0.3 + stressRegulation * 0.2 + gutBarrier * 0.25) * 100, 0, 100)
  const status = toleranceScore >= 65 ? "tolerant" : toleranceScore >= 35 ? "borderline" : "intolerant"
  return { toleranceScore, regulatoryBalance, inflammationControl, stressRegulation, gutBarrier, status }
}

// ---------------------------------------------------------------------------
// 25. computeImmuneSurveillanceProxy
// ---------------------------------------------------------------------------
export interface ImmuneSurveillanceProxyResult {
  surveillanceScore: number
  patrollingCapacity: number
  detectionSensitivity: number
  responseReadiness: number
  metabolicFuel: number
  effectiveness: "high" | "moderate" | "low"
}

export async function computeImmuneSurveillanceProxy(userId: string, since: Date, until: Date): Promise<ImmuneSurveillanceProxyResult> {
  const db = getDb()
  const [wbc, hrv, sleep, glucose] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "hrv", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "blood_glucose", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const hrvVals = hrv.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const glucoseVals = glucose.map((r: any) => Number(r.value))

  const patrollingCapacity = clamp(mean(wbcVals) / 9, 0, 1)
  const detectionSensitivity = clamp(mean(hrvVals) / 75, 0, 1)
  const responseReadiness = clamp(mean(sleepVals) / 8, 0, 1)
  const metabolicFuel = clamp(1 - Math.abs(mean(glucoseVals) - 95) / 50, 0, 1)
  const surveillanceScore = clamp((patrollingCapacity * 0.3 + detectionSensitivity * 0.25 + responseReadiness * 0.25 + metabolicFuel * 0.2) * 100, 0, 100)
  const effectiveness = surveillanceScore >= 65 ? "high" : surveillanceScore >= 35 ? "moderate" : "low"
  return { surveillanceScore, patrollingCapacity, detectionSensitivity, responseReadiness, metabolicFuel, effectiveness }
}

// ---------------------------------------------------------------------------
// 26. computeCancerImmuneEscapeRisk
// ---------------------------------------------------------------------------
export interface CancerImmuneEscapeRiskResult {
  riskScore: number
  immuneSuppression: number
  chronicInflammation: number
  cellTurnoverStress: number
  surveillanceGap: number
  riskLevel: "low" | "moderate" | "elevated" | "high"
}

export async function computeCancerImmuneEscapeRisk(userId: string, since: Date, until: Date): Promise<CancerImmuneEscapeRiskResult> {
  const db = getDb()
  const [cortisol, crp, wbc, sleep] = await Promise.all([
    fetchMetric(db, userId, "cortisol", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
  ])
  const cortisolVals = cortisol.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const immuneSuppression = clamp(mean(cortisolVals) / 25, 0, 1)
  const chronicInflammation = clamp(percentAboveThreshold(crpVals, 3), 0, 1)
  const cellTurnoverStress = clamp(coefficient_of_variation(wbcVals), 0, 1)
  const surveillanceGap = clamp(1 - mean(sleepVals) / 7.5, 0, 1)
  const riskScore = clamp((immuneSuppression * 0.25 + chronicInflammation * 0.3 + cellTurnoverStress * 0.2 + surveillanceGap * 0.25) * 100, 0, 100)
  const riskLevel = riskScore >= 70 ? "high" : riskScore >= 50 ? "elevated" : riskScore >= 25 ? "moderate" : "low"
  return { riskScore, immuneSuppression, chronicInflammation, cellTurnoverStress, surveillanceGap, riskLevel }
}

// ---------------------------------------------------------------------------
// 27. computeChronicInflammationIndex
// ---------------------------------------------------------------------------
export interface ChronicInflammationIndexResult {
  index: number
  persistentCRP: number
  elevatedHR: number
  lowHRV: number
  poorSleep: number
  severity: "none" | "mild" | "moderate" | "severe"
}

export async function computeChronicInflammationIndex(userId: string, since: Date, until: Date): Promise<ChronicInflammationIndexResult> {
  const db = getDb()
  const [crp, hr, hrv, sleep] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "hrv", since, until),
    fetchMetric(db, userId, "sleep_quality", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))
  const hrvVals = hrv.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const persistentCRP = clamp(percentAboveThreshold(crpVals, 2), 0, 1)
  const elevatedHR = clamp(percentAboveThreshold(hrVals, 75), 0, 1)
  const lowHRV = clamp(percentBelowThreshold(hrvVals, 40), 0, 1)
  const poorSleep = clamp(percentBelowThreshold(sleepVals, 60), 0, 1)
  const index = clamp((persistentCRP * 0.35 + elevatedHR * 0.2 + lowHRV * 0.25 + poorSleep * 0.2) * 100, 0, 100)
  const severity = index >= 70 ? "severe" : index >= 45 ? "moderate" : index >= 20 ? "mild" : "none"
  return { index, persistentCRP, elevatedHR, lowHRV, poorSleep, severity }
}

// ---------------------------------------------------------------------------
// 28. computeWoundHealingCapacity
// ---------------------------------------------------------------------------
export interface WoundHealingCapacityResult {
  capacityScore: number
  circulatoryHealth: number
  nutritionalSupport: number
  immuneCellAvailability: number
  sleepRecovery: number
  capacity: "excellent" | "good" | "impaired"
}

export async function computeWoundHealingCapacity(userId: string, since: Date, until: Date): Promise<WoundHealingCapacityResult> {
  const db = getDb()
  const [spo2, vitC, wbc, sleep] = await Promise.all([
    fetchMetric(db, userId, "spo2", since, until),
    fetchMetric(db, userId, "vitamin_c_intake", since, until),
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
  ])
  const spo2Vals = spo2.map((r: any) => Number(r.value))
  const vitCVals = vitC.map((r: any) => Number(r.value))
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const circulatoryHealth = clamp((mean(spo2Vals) - 92) / 6, 0, 1)
  const nutritionalSupport = clamp(mean(vitCVals) / 90, 0, 1)
  const immuneCellAvailability = clamp(mean(wbcVals) / 9, 0, 1)
  const sleepRecovery = clamp(mean(sleepVals) / 8, 0, 1)
  const capacityScore = clamp((circulatoryHealth * 0.25 + nutritionalSupport * 0.25 + immuneCellAvailability * 0.25 + sleepRecovery * 0.25) * 100, 0, 100)
  const capacity = capacityScore >= 65 ? "excellent" : capacityScore >= 35 ? "good" : "impaired"
  return { capacityScore, circulatoryHealth, nutritionalSupport, immuneCellAvailability, sleepRecovery, capacity }
}

// ---------------------------------------------------------------------------
// 29. analyzeFeverResponse
// ---------------------------------------------------------------------------
export interface FeverResponseResult {
  responseScore: number
  peakTemperature: number
  duration: number
  heartRateCorrelation: number
  hydrationStatus: number
  classification: "no_fever" | "low_grade" | "moderate" | "high" | "hyperpyrexia"
}

export async function analyzeFeverResponse(userId: string, since: Date, until: Date): Promise<FeverResponseResult> {
  const db = getDb()
  const [temp, hr, water, spo2] = await Promise.all([
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "water_intake", since, until),
    fetchMetric(db, userId, "spo2", since, until),
  ])
  const tempVals = temp.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))
  const waterVals = water.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))

  const peakTemperature = Math.max(...tempVals, 36.5)
  const feverReadings = tempVals.filter((t: number) => t > 37.5)
  const duration = tempVals.length > 0 ? feverReadings.length / tempVals.length : 0
  const heartRateCorrelation = clamp((mean(hrVals) - 70) / 40, 0, 1)
  const hydrationStatus = clamp(mean(waterVals) / 2500, 0, 1)
  const responseScore = clamp((clamp((peakTemperature - 37) / 4, 0, 1) * 0.3 + duration * 0.25 + heartRateCorrelation * 0.25 + (1 - hydrationStatus) * 0.2) * 100, 0, 100)
  const classification = peakTemperature >= 41.1 ? "hyperpyrexia" : peakTemperature >= 39.4 ? "high" : peakTemperature >= 38.3 ? "moderate" : peakTemperature >= 37.5 ? "low_grade" : "no_fever"
  return { responseScore, peakTemperature, duration, heartRateCorrelation, hydrationStatus, classification }
}

// ---------------------------------------------------------------------------
// 30. computeImmuneMemoryProxy
// ---------------------------------------------------------------------------
export interface ImmuneMemoryProxyResult {
  memoryScore: number
  priorExposureProxy: number
  recallSpeed: number
  antibodyPersistence: number
  sleepConsolidation: number
  retention: "strong" | "moderate" | "weak"
}

export async function computeImmuneMemoryProxy(userId: string, since: Date, until: Date): Promise<ImmuneMemoryProxyResult> {
  const db = getDb()
  const [wbc, temp, crp, sleep] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const priorExposureProxy = clamp(mean(wbcVals) / 8, 0, 1)
  const recallSpeed = clamp(1 - stddev(tempVals) / 1.0, 0, 1)
  const antibodyPersistence = clamp(1 - coefficient_of_variation(crpVals), 0, 1)
  const sleepConsolidation = clamp(mean(sleepVals) / 8, 0, 1)
  const memoryScore = clamp((priorExposureProxy * 0.25 + recallSpeed * 0.25 + antibodyPersistence * 0.25 + sleepConsolidation * 0.25) * 100, 0, 100)
  const retention = memoryScore >= 65 ? "strong" : memoryScore >= 35 ? "moderate" : "weak"
  return { memoryScore, priorExposureProxy, recallSpeed, antibodyPersistence, sleepConsolidation, retention }
}

// ---------------------------------------------------------------------------
// 31. computePostInfectionRecovery
// ---------------------------------------------------------------------------
export interface PostInfectionRecoveryResult {
  recoveryScore: number
  energyRestoration: number
  inflammationResolution: number
  sleepNormalization: number
  cardioRecovery: number
  phase: "lingering" | "recovering" | "resolved"
}

export async function computePostInfectionRecovery(userId: string, since: Date, until: Date): Promise<PostInfectionRecoveryResult> {
  const db = getDb()
  const [steps, crp, sleep, hr] = await Promise.all([
    fetchMetric(db, userId, "steps", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "resting_heart_rate", since, until),
  ])
  const stepVals = steps.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const hrVals = hr.map((r: any) => Number(r.value))

  const energyRestoration = clamp(slope(stepVals) / 300, 0, 1)
  const inflammationResolution = slope(crpVals) < 0 ? clamp(Math.abs(slope(crpVals)) / 0.5, 0, 1) : 0
  const sleepNormalization = clamp(1 - Math.abs(mean(sleepVals) - 7.5) / 3, 0, 1)
  const cardioRecovery = slope(hrVals) < 0 ? clamp(Math.abs(slope(hrVals)) / 1.5, 0, 1) : 0
  const recoveryScore = clamp((energyRestoration * 0.25 + inflammationResolution * 0.3 + sleepNormalization * 0.2 + cardioRecovery * 0.25) * 100, 0, 100)
  const phase = recoveryScore >= 70 ? "resolved" : recoveryScore >= 35 ? "recovering" : "lingering"
  return { recoveryScore, energyRestoration, inflammationResolution, sleepNormalization, cardioRecovery, phase }
}

// ---------------------------------------------------------------------------
// 32. computeVaccinationTimingProxy
// ---------------------------------------------------------------------------
export interface VaccinationTimingProxyResult {
  timingScore: number
  immuneReadiness: number
  stressWindow: number
  sleepQuality: number
  inflammationBaseline: number
  recommendation: "optimal" | "acceptable" | "postpone"
}

export async function computeVaccinationTimingProxy(userId: string, since: Date, until: Date): Promise<VaccinationTimingProxyResult> {
  const db = getDb()
  const [wbc, cortisol, sleep, crp] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
    fetchMetric(db, userId, "sleep_quality", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))

  const immuneReadiness = clamp(mean(wbcVals) / 9, 0, 1)
  const stressWindow = clamp(1 - mean(cortisolVals) / 20, 0, 1)
  const sleepQuality = clamp(mean(sleepVals) / 90, 0, 1)
  const inflammationBaseline = clamp(1 - mean(crpVals) / 5, 0, 1)
  const timingScore = clamp((immuneReadiness * 0.3 + stressWindow * 0.2 + sleepQuality * 0.25 + inflammationBaseline * 0.25) * 100, 0, 100)
  const recommendation = timingScore >= 65 ? "optimal" : timingScore >= 35 ? "acceptable" : "postpone"
  return { timingScore, immuneReadiness, stressWindow, sleepQuality, inflammationBaseline, recommendation }
}

// ---------------------------------------------------------------------------
// 33. computeImmuneAgeEstimation
// ---------------------------------------------------------------------------
export interface ImmuneAgeEstimationResult {
  estimatedImmuneAge: number
  inflammatoryBurden: number
  immuneCellFitness: number
  recoveryCapacity: number
  metabolicHealth: number
  classification: "younger" | "age_appropriate" | "older"
}

export async function computeImmuneAgeEstimation(userId: string, since: Date, until: Date): Promise<ImmuneAgeEstimationResult> {
  const db = getDb()
  const [crp, wbc, hrv, glucose] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "hrv", since, until),
    fetchMetric(db, userId, "blood_glucose", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const hrvVals = hrv.map((r: any) => Number(r.value))
  const glucoseVals = glucose.map((r: any) => Number(r.value))

  const inflammatoryBurden = clamp(mean(crpVals) / 8, 0, 1)
  const immuneCellFitness = clamp(mean(wbcVals) / 10, 0, 1)
  const recoveryCapacity = clamp(mean(hrvVals) / 80, 0, 1)
  const metabolicHealth = clamp(1 - Math.abs(mean(glucoseVals) - 90) / 50, 0, 1)
  const agingFactor = (inflammatoryBurden * 0.3 + (1 - immuneCellFitness) * 0.25 + (1 - recoveryCapacity) * 0.25 + (1 - metabolicHealth) * 0.2)
  const estimatedImmuneAge = clamp(25 + agingFactor * 55, 20, 90)
  const classification = agingFactor <= 0.3 ? "younger" : agingFactor <= 0.6 ? "age_appropriate" : "older"
  return { estimatedImmuneAge, inflammatoryBurden, immuneCellFitness, recoveryCapacity, metabolicHealth, classification }
}

// ---------------------------------------------------------------------------
// 34. assessAutoimmuneFlarePrediction
// ---------------------------------------------------------------------------
export interface AutoimmuneFlarePredictionResult {
  flareRisk: number
  stressAccumulation: number
  sleepDebt: number
  inflammationTrend: number
  activityDrop: number
  prediction: "unlikely" | "possible" | "likely" | "imminent"
}

export async function assessAutoimmuneFlarePrediction(userId: string, since: Date, until: Date): Promise<AutoimmuneFlarePredictionResult> {
  const db = getDb()
  const [cortisol, sleep, crp, steps] = await Promise.all([
    fetchMetric(db, userId, "cortisol", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "steps", since, until),
  ])
  const cortisolVals = cortisol.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const stepVals = steps.map((r: any) => Number(r.value))

  const stressAccumulation = clamp(exponentialDecay(cortisolVals, 0.3) / 25, 0, 1)
  const sleepDebt = clamp(1 - mean(sleepVals) / 7, 0, 1)
  const inflammationTrend = clamp(slope(crpVals) * 5, 0, 1)
  const activityDrop = slope(stepVals) < 0 ? clamp(Math.abs(slope(stepVals)) / 500, 0, 1) : 0
  const flareRisk = clamp((stressAccumulation * 0.25 + sleepDebt * 0.25 + inflammationTrend * 0.3 + activityDrop * 0.2) * 100, 0, 100)
  const prediction = flareRisk >= 75 ? "imminent" : flareRisk >= 50 ? "likely" : flareRisk >= 25 ? "possible" : "unlikely"
  return { flareRisk, stressAccumulation, sleepDebt, inflammationTrend, activityDrop, prediction }
}

// ---------------------------------------------------------------------------
// 35. computeHistamineResponseProxy
// ---------------------------------------------------------------------------
export interface HistamineResponseProxyResult {
  responseScore: number
  heartRateReactivity: number
  skinFlushProxy: number
  digestiveImpact: number
  respiratoryProxy: number
  level: "normal" | "elevated" | "high"
}

export async function computeHistamineResponseProxy(userId: string, since: Date, until: Date): Promise<HistamineResponseProxyResult> {
  const db = getDb()
  const [hr, temp, fiber, spo2] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "fiber_intake", since, until),
    fetchMetric(db, userId, "spo2", since, until),
  ])
  const hrVals = hr.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))
  const fiberVals = fiber.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))

  const heartRateReactivity = clamp(stddev(hrVals) / 15, 0, 1)
  const skinFlushProxy = clamp((mean(tempVals) - 36.8) / 1.5, 0, 1)
  const digestiveImpact = clamp(1 - mean(fiberVals) / 25, 0, 1)
  const respiratoryProxy = clamp((97 - mean(spo2Vals)) / 5, 0, 1)
  const responseScore = clamp((heartRateReactivity * 0.3 + skinFlushProxy * 0.25 + digestiveImpact * 0.2 + respiratoryProxy * 0.25) * 100, 0, 100)
  const level = responseScore >= 60 ? "high" : responseScore >= 30 ? "elevated" : "normal"
  return { responseScore, heartRateReactivity, skinFlushProxy, digestiveImpact, respiratoryProxy, level }
}

// ---------------------------------------------------------------------------
// 36. computeMastCellActivationProxy
// ---------------------------------------------------------------------------
export interface MastCellActivationProxyResult {
  activationScore: number
  heartRateVariability: number
  temperatureFluctuation: number
  spo2Drops: number
  inflammationMarker: number
  status: "stable" | "mildly_activated" | "highly_activated"
}

export async function computeMastCellActivationProxy(userId: string, since: Date, until: Date): Promise<MastCellActivationProxyResult> {
  const db = getDb()
  const [hr, temp, spo2, crp] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "spo2", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
  ])
  const hrVals = hr.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))

  const heartRateVariability = clamp(stddev(hrVals) / 20, 0, 1)
  const temperatureFluctuation = clamp(iqr(tempVals) / 1.0, 0, 1)
  const spo2Drops = clamp(percentBelowThreshold(spo2Vals, 95), 0, 1)
  const inflammationMarker = clamp(mean(crpVals) / 6, 0, 1)
  const activationScore = clamp((heartRateVariability * 0.25 + temperatureFluctuation * 0.25 + spo2Drops * 0.25 + inflammationMarker * 0.25) * 100, 0, 100)
  const status = activationScore >= 60 ? "highly_activated" : activationScore >= 30 ? "mildly_activated" : "stable"
  return { activationScore, heartRateVariability, temperatureFluctuation, spo2Drops, inflammationMarker, status }
}

// ---------------------------------------------------------------------------
// 37. computeInflammatoryBowelProxy
// ---------------------------------------------------------------------------
export interface InflammatoryBowelProxyResult {
  riskScore: number
  gutInflammation: number
  dietaryRisk: number
  stressContribution: number
  sleepImpact: number
  severity: "remission" | "mild" | "moderate" | "severe"
}

export async function computeInflammatoryBowelProxy(userId: string, since: Date, until: Date): Promise<InflammatoryBowelProxyResult> {
  const db = getDb()
  const [crp, fiber, cortisol, sleep] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "fiber_intake", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
    fetchMetric(db, userId, "sleep_quality", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const fiberVals = fiber.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const gutInflammation = clamp(percentAboveThreshold(crpVals, 3), 0, 1)
  const dietaryRisk = clamp(1 - mean(fiberVals) / 30, 0, 1)
  const stressContribution = clamp(mean(cortisolVals) / 22, 0, 1)
  const sleepImpact = clamp(1 - mean(sleepVals) / 80, 0, 1)
  const riskScore = clamp((gutInflammation * 0.35 + dietaryRisk * 0.2 + stressContribution * 0.25 + sleepImpact * 0.2) * 100, 0, 100)
  const severity = riskScore >= 70 ? "severe" : riskScore >= 45 ? "moderate" : riskScore >= 20 ? "mild" : "remission"
  return { riskScore, gutInflammation, dietaryRisk, stressContribution, sleepImpact, severity }
}

// ---------------------------------------------------------------------------
// 38. computeImmuneCellCycling
// ---------------------------------------------------------------------------
export interface ImmuneCellCyclingResult {
  cyclingScore: number
  productionRate: number
  turnoverBalance: number
  nutritionalSupport: number
  circadianAlignment: number
  status: "balanced" | "accelerated" | "suppressed"
}

export async function computeImmuneCellCycling(userId: string, since: Date, until: Date): Promise<ImmuneCellCyclingResult> {
  const db = getDb()
  const [wbc, protein, sleep, temp] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "protein_intake", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const proteinVals = protein.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))

  const productionRate = clamp(mean(wbcVals) / 9, 0, 1)
  const turnoverBalance = 1 - clamp(coefficient_of_variation(wbcVals), 0, 1)
  const nutritionalSupport = clamp(mean(proteinVals) / 60, 0, 1)
  const circadianAlignment = clamp(1 - stddev(sleepVals) / 2, 0, 1)
  const cyclingScore = clamp((productionRate * 0.3 + turnoverBalance * 0.25 + nutritionalSupport * 0.2 + circadianAlignment * 0.25) * 100, 0, 100)
  const meanWbc = mean(wbcVals)
  const status = meanWbc > 10 ? "accelerated" : meanWbc < 4 ? "suppressed" : "balanced"
  return { cyclingScore, productionRate, turnoverBalance, nutritionalSupport, circadianAlignment, status }
}

// ---------------------------------------------------------------------------
// 39. computeNeutrophilFunctionProxy
// ---------------------------------------------------------------------------
export interface NeutrophilFunctionProxyResult {
  functionScore: number
  migrationCapacity: number
  bactericidalActivity: number
  oxidativeBurst: number
  lifespan: number
  efficiency: "high" | "moderate" | "low"
}

export async function computeNeutrophilFunctionProxy(userId: string, since: Date, until: Date): Promise<NeutrophilFunctionProxyResult> {
  const db = getDb()
  const [wbc, spo2, crp, vitC] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "spo2", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "vitamin_c_intake", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const vitCVals = vitC.map((r: any) => Number(r.value))

  const migrationCapacity = clamp(mean(wbcVals) / 9, 0, 1)
  const bactericidalActivity = clamp(mean(vitCVals) / 90, 0, 1)
  const oxidativeBurst = clamp((mean(spo2Vals) - 92) / 6, 0, 1)
  const lifespan = clamp(1 - mean(crpVals) / 10, 0, 1)
  const functionScore = clamp((migrationCapacity * 0.3 + bactericidalActivity * 0.2 + oxidativeBurst * 0.25 + lifespan * 0.25) * 100, 0, 100)
  const efficiency = functionScore >= 65 ? "high" : functionScore >= 35 ? "moderate" : "low"
  return { functionScore, migrationCapacity, bactericidalActivity, oxidativeBurst, lifespan, efficiency }
}

// ---------------------------------------------------------------------------
// 40. computeEosinophilActivityProxy
// ---------------------------------------------------------------------------
export interface EosinophilActivityProxyResult {
  activityScore: number
  allergySignal: number
  parasiteResponseProxy: number
  inflammationLevel: number
  respiratoryCorrelation: number
  status: "normal" | "mildly_elevated" | "elevated" | "high"
}

export async function computeEosinophilActivityProxy(userId: string, since: Date, until: Date): Promise<EosinophilActivityProxyResult> {
  const db = getDb()
  const [hr, crp, spo2, temp] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "spo2", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
  ])
  const hrVals = hr.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))

  const allergySignal = clamp(stddev(hrVals) / 15, 0, 1)
  const parasiteResponseProxy = clamp((mean(tempVals) - 37.0) / 2, 0, 1)
  const inflammationLevel = clamp(mean(crpVals) / 7, 0, 1)
  const respiratoryCorrelation = clamp((97 - mean(spo2Vals)) / 5, 0, 1)
  const activityScore = clamp((allergySignal * 0.25 + parasiteResponseProxy * 0.25 + inflammationLevel * 0.25 + respiratoryCorrelation * 0.25) * 100, 0, 100)
  const status = activityScore >= 70 ? "high" : activityScore >= 45 ? "elevated" : activityScore >= 20 ? "mildly_elevated" : "normal"
  return { activityScore, allergySignal, parasiteResponseProxy, inflammationLevel, respiratoryCorrelation, status }
}

// ---------------------------------------------------------------------------
// 41. computeBasophilResponseProxy
// ---------------------------------------------------------------------------
export interface BasophilResponseProxyResult {
  responseScore: number
  igEProxy: number
  histamineRelease: number
  inflammationSignal: number
  allergenSensitivity: number
  level: "normal" | "reactive" | "hyper_reactive"
}

export async function computeBasophilResponseProxy(userId: string, since: Date, until: Date): Promise<BasophilResponseProxyResult> {
  const db = getDb()
  const [hr, temp, crp, spo2] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "spo2", since, until),
  ])
  const hrVals = hr.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))

  const igEProxy = clamp(stddev(tempVals) / 0.8, 0, 1)
  const histamineRelease = clamp((mean(hrVals) - 68) / 30, 0, 1)
  const inflammationSignal = clamp(mean(crpVals) / 5, 0, 1)
  const allergenSensitivity = clamp((97 - mean(spo2Vals)) / 4, 0, 1)
  const responseScore = clamp((igEProxy * 0.25 + histamineRelease * 0.3 + inflammationSignal * 0.2 + allergenSensitivity * 0.25) * 100, 0, 100)
  const level = responseScore >= 60 ? "hyper_reactive" : responseScore >= 30 ? "reactive" : "normal"
  return { responseScore, igEProxy, histamineRelease, inflammationSignal, allergenSensitivity, level }
}

// ---------------------------------------------------------------------------
// 42. computeMonocyteFunctionProxy
// ---------------------------------------------------------------------------
export interface MonocyteFunctionProxyResult {
  functionScore: number
  phagocyticCapacity: number
  antigenPresentationProxy: number
  tissueMigration: number
  inflammatoryModulation: number
  efficiency: "high" | "moderate" | "low"
}

export async function computeMonocyteFunctionProxy(userId: string, since: Date, until: Date): Promise<MonocyteFunctionProxyResult> {
  const db = getDb()
  const [wbc, crp, spo2, hrv] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "spo2", since, until),
    fetchMetric(db, userId, "hrv", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))
  const hrvVals = hrv.map((r: any) => Number(r.value))

  const phagocyticCapacity = clamp(mean(wbcVals) / 10, 0, 1)
  const antigenPresentationProxy = clamp(mean(hrvVals) / 70, 0, 1)
  const tissueMigration = clamp((mean(spo2Vals) - 92) / 6, 0, 1)
  const inflammatoryModulation = clamp(1 - Math.abs(mean(crpVals) - 1.5) / 5, 0, 1)
  const functionScore = clamp((phagocyticCapacity * 0.3 + antigenPresentationProxy * 0.2 + tissueMigration * 0.25 + inflammatoryModulation * 0.25) * 100, 0, 100)
  const efficiency = functionScore >= 65 ? "high" : functionScore >= 35 ? "moderate" : "low"
  return { functionScore, phagocyticCapacity, antigenPresentationProxy, tissueMigration, inflammatoryModulation, efficiency }
}

// ---------------------------------------------------------------------------
// 43. computeDendriticCellProxy
// ---------------------------------------------------------------------------
export interface DendriticCellProxyResult {
  functionScore: number
  antigenCapture: number
  maturationProxy: number
  migrationToLymphNode: number
  costimulationCapacity: number
  status: "active" | "moderate" | "suppressed"
}

export async function computeDendriticCellProxy(userId: string, since: Date, until: Date): Promise<DendriticCellProxyResult> {
  const db = getDb()
  const [wbc, crp, sleep, cortisol] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))

  const antigenCapture = clamp(mean(wbcVals) / 9, 0, 1)
  const maturationProxy = clamp(mean(crpVals) / 4, 0, 1)
  const migrationToLymphNode = clamp(mean(sleepVals) / 8, 0, 1)
  const costimulationCapacity = clamp(1 - mean(cortisolVals) / 22, 0, 1)
  const functionScore = clamp((antigenCapture * 0.25 + maturationProxy * 0.25 + migrationToLymphNode * 0.25 + costimulationCapacity * 0.25) * 100, 0, 100)
  const status = functionScore >= 65 ? "active" : functionScore >= 35 ? "moderate" : "suppressed"
  return { functionScore, antigenCapture, maturationProxy, migrationToLymphNode, costimulationCapacity, status }
}

// ---------------------------------------------------------------------------
// 44. computeCytokineBalanceProxy
// ---------------------------------------------------------------------------
export interface CytokineBalanceProxyResult {
  balanceScore: number
  proInflammatoryProxy: number
  antiInflammatoryProxy: number
  th1Th2Ratio: number
  regulatorySignal: number
  balance: "balanced" | "pro_inflammatory" | "anti_inflammatory"
}

export async function computeCytokineBalanceProxy(userId: string, since: Date, until: Date): Promise<CytokineBalanceProxyResult> {
  const db = getDb()
  const [crp, hrv, cortisol, sleep] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "hrv", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const hrvVals = hrv.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const proInflammatoryProxy = clamp(mean(crpVals) / 6, 0, 1)
  const antiInflammatoryProxy = clamp(mean(hrvVals) / 75, 0, 1)
  const th1Th2Ratio = proInflammatoryProxy > 0 ? antiInflammatoryProxy / (proInflammatoryProxy + 0.01) : 1
  const regulatorySignal = clamp(mean(sleepVals) / 8 * (1 - mean(cortisolVals) / 25), 0, 1)
  const balanceScore = clamp(((1 - Math.abs(proInflammatoryProxy - antiInflammatoryProxy)) * 0.4 + regulatorySignal * 0.3 + clamp(1 - Math.abs(th1Th2Ratio - 1), 0, 1) * 0.3) * 100, 0, 100)
  const balance = proInflammatoryProxy > antiInflammatoryProxy + 0.2 ? "pro_inflammatory" : antiInflammatoryProxy > proInflammatoryProxy + 0.2 ? "anti_inflammatory" : "balanced"
  return { balanceScore, proInflammatoryProxy, antiInflammatoryProxy, th1Th2Ratio, regulatorySignal, balance }
}

// ---------------------------------------------------------------------------
// 45. computeInterferonResponseProxy
// ---------------------------------------------------------------------------
export interface InterferonResponseProxyResult {
  responseScore: number
  viralDefenseProxy: number
  feverInduction: number
  nkCellActivation: number
  cellularResistance: number
  status: "strong" | "moderate" | "weak"
}

export async function computeInterferonResponseProxy(userId: string, since: Date, until: Date): Promise<InterferonResponseProxyResult> {
  const db = getDb()
  const [temp, wbc, sleep, spo2] = await Promise.all([
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "spo2", since, until),
  ])
  const tempVals = temp.map((r: any) => Number(r.value))
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const spo2Vals = spo2.map((r: any) => Number(r.value))

  const viralDefenseProxy = clamp(mean(wbcVals) / 9, 0, 1)
  const feverInduction = clamp(stddev(tempVals) / 0.8, 0, 1)
  const nkCellActivation = clamp(mean(sleepVals) / 8, 0, 1)
  const cellularResistance = clamp((mean(spo2Vals) - 92) / 6, 0, 1)
  const responseScore = clamp((viralDefenseProxy * 0.3 + feverInduction * 0.2 + nkCellActivation * 0.25 + cellularResistance * 0.25) * 100, 0, 100)
  const status = responseScore >= 65 ? "strong" : responseScore >= 35 ? "moderate" : "weak"
  return { responseScore, viralDefenseProxy, feverInduction, nkCellActivation, cellularResistance, status }
}

// ---------------------------------------------------------------------------
// 46. computeInterleukinBalanceProxy
// ---------------------------------------------------------------------------
export interface InterleukinBalanceProxyResult {
  balanceScore: number
  il6Proxy: number
  il10Proxy: number
  il1BetaProxy: number
  il17Proxy: number
  status: "balanced" | "skewed_inflammatory" | "skewed_regulatory"
}

export async function computeInterleukinBalanceProxy(userId: string, since: Date, until: Date): Promise<InterleukinBalanceProxyResult> {
  const db = getDb()
  const [crp, hrv, sleep, cortisol] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "hrv", since, until),
    fetchMetric(db, userId, "sleep_quality", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const hrvVals = hrv.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))

  const il6Proxy = clamp(mean(crpVals) / 6, 0, 1)
  const il10Proxy = clamp(mean(hrvVals) / 80, 0, 1)
  const il1BetaProxy = clamp(1 - mean(sleepVals) / 90, 0, 1)
  const il17Proxy = clamp(mean(cortisolVals) / 22, 0, 1)
  const inflammatorySum = il6Proxy + il1BetaProxy + il17Proxy
  const regulatorySum = il10Proxy * 3
  const balanceScore = clamp((1 - Math.abs(inflammatorySum - regulatorySum) / 3) * 100, 0, 100)
  const status = inflammatorySum > regulatorySum + 0.3 ? "skewed_inflammatory" : regulatorySum > inflammatorySum + 0.3 ? "skewed_regulatory" : "balanced"
  return { balanceScore, il6Proxy, il10Proxy, il1BetaProxy, il17Proxy, status }
}

// ---------------------------------------------------------------------------
// 47. computeTNFActivityProxy
// ---------------------------------------------------------------------------
export interface TNFActivityProxyResult {
  activityScore: number
  inflammationDriver: number
  feverCorrelation: number
  cachexiaRisk: number
  apoptosisSignal: number
  level: "normal" | "elevated" | "high"
}

export async function computeTNFActivityProxy(userId: string, since: Date, until: Date): Promise<TNFActivityProxyResult> {
  const db = getDb()
  const [crp, temp, weight, wbc] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
    fetchMetric(db, userId, "weight", since, until),
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))
  const weightVals = weight.map((r: any) => Number(r.value))
  const wbcVals = wbc.map((r: any) => Number(r.value))

  const inflammationDriver = clamp(mean(crpVals) / 7, 0, 1)
  const feverCorrelation = clamp((mean(tempVals) - 37.0) / 2, 0, 1)
  const cachexiaRisk = slope(weightVals) < 0 ? clamp(Math.abs(slope(weightVals)) / 0.5, 0, 1) : 0
  const apoptosisSignal = clamp(coefficient_of_variation(wbcVals), 0, 1)
  const activityScore = clamp((inflammationDriver * 0.3 + feverCorrelation * 0.25 + cachexiaRisk * 0.2 + apoptosisSignal * 0.25) * 100, 0, 100)
  const level = activityScore >= 60 ? "high" : activityScore >= 30 ? "elevated" : "normal"
  return { activityScore, inflammationDriver, feverCorrelation, cachexiaRisk, apoptosisSignal, level }
}

// ---------------------------------------------------------------------------
// 48. computeComplementCascadeProxy
// ---------------------------------------------------------------------------
export interface ComplementCascadeProxyResult {
  cascadeScore: number
  classicalPathway: number
  alternativePathway: number
  lectinPathway: number
  terminalComplex: number
  activation: "normal" | "hypoactive" | "hyperactive"
}

export async function computeComplementCascadeProxy(userId: string, since: Date, until: Date): Promise<ComplementCascadeProxyResult> {
  const db = getDb()
  const [crp, wbc, alt, temp] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "alt_liver", since, until),
    fetchMetric(db, userId, "body_temperature", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const altVals = alt.map((r: any) => Number(r.value))
  const tempVals = temp.map((r: any) => Number(r.value))

  const classicalPathway = clamp(mean(crpVals) / 5, 0, 1)
  const alternativePathway = clamp((mean(tempVals) - 36.5) / 2.5, 0, 1)
  const lectinPathway = clamp(mean(wbcVals) / 10, 0, 1)
  const terminalComplex = clamp(1 - (mean(altVals) - 15) / 45, 0, 1)
  const cascadeScore = clamp((classicalPathway * 0.3 + alternativePathway * 0.2 + lectinPathway * 0.25 + terminalComplex * 0.25) * 100, 0, 100)
  const activation = cascadeScore >= 65 ? "hyperactive" : cascadeScore <= 30 ? "hypoactive" : "normal"
  return { cascadeScore, classicalPathway, alternativePathway, lectinPathway, terminalComplex, activation }
}

// ---------------------------------------------------------------------------
// 49. computeAntibodyDiversityProxy
// ---------------------------------------------------------------------------
export interface AntibodyDiversityProxyResult {
  diversityScore: number
  bCellActivity: number
  antigenExposureProxy: number
  somaticHypermutationProxy: number
  classSwitchingProxy: number
  diversity: "high" | "moderate" | "low"
}

export async function computeAntibodyDiversityProxy(userId: string, since: Date, until: Date): Promise<AntibodyDiversityProxyResult> {
  const db = getDb()
  const [wbc, crp, protein, sleep] = await Promise.all([
    fetchMetric(db, userId, "white_blood_cell_count", since, until),
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "protein_intake", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
  ])
  const wbcVals = wbc.map((r: any) => Number(r.value))
  const crpVals = crp.map((r: any) => Number(r.value))
  const proteinVals = protein.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))

  const bCellActivity = clamp(mean(wbcVals) / 9, 0, 1)
  const antigenExposureProxy = clamp(stddev(crpVals) / 3, 0, 1)
  const somaticHypermutationProxy = clamp(mean(proteinVals) / 65, 0, 1)
  const classSwitchingProxy = clamp(mean(sleepVals) / 8, 0, 1)
  const diversityScore = clamp((bCellActivity * 0.3 + antigenExposureProxy * 0.2 + somaticHypermutationProxy * 0.25 + classSwitchingProxy * 0.25) * 100, 0, 100)
  const diversity = diversityScore >= 65 ? "high" : diversityScore >= 35 ? "moderate" : "low"
  return { diversityScore, bCellActivity, antigenExposureProxy, somaticHypermutationProxy, classSwitchingProxy, diversity }
}

// ---------------------------------------------------------------------------
// 50. computeImmuneExhaustionIndex
// ---------------------------------------------------------------------------
export interface ImmuneExhaustionIndexResult {
  exhaustionIndex: number
  persistentActivation: number
  sleepDeprivationLoad: number
  metabolicStrain: number
  hormonalSuppression: number
  recoveryDeficit: number
  stage: "rested" | "fatigued" | "exhausted" | "severely_exhausted"
}

export async function computeImmuneExhaustionIndex(userId: string, since: Date, until: Date): Promise<ImmuneExhaustionIndexResult> {
  const db = getDb()
  const [crp, sleep, glucose, cortisol, hrv] = await Promise.all([
    fetchMetric(db, userId, "crp_level", since, until),
    fetchMetric(db, userId, "sleep_duration", since, until),
    fetchMetric(db, userId, "blood_glucose", since, until),
    fetchMetric(db, userId, "cortisol", since, until),
    fetchMetric(db, userId, "hrv", since, until),
  ])
  const crpVals = crp.map((r: any) => Number(r.value))
  const sleepVals = sleep.map((r: any) => Number(r.value))
  const glucoseVals = glucose.map((r: any) => Number(r.value))
  const cortisolVals = cortisol.map((r: any) => Number(r.value))
  const hrvVals = hrv.map((r: any) => Number(r.value))

  const persistentActivation = clamp(percentAboveThreshold(crpVals, 2), 0, 1)
  const sleepDeprivationLoad = clamp(1 - mean(sleepVals) / 7.5, 0, 1)
  const metabolicStrain = clamp(Math.abs(mean(glucoseVals) - 95) / 50, 0, 1)
  const hormonalSuppression = clamp(mean(cortisolVals) / 25, 0, 1)
  const recoveryDeficit = clamp(1 - mean(hrvVals) / 70, 0, 1)
  const exhaustionIndex = clamp(
    (persistentActivation * 0.25 + sleepDeprivationLoad * 0.2 + metabolicStrain * 0.15 + hormonalSuppression * 0.2 + recoveryDeficit * 0.2) * 100,
    0, 100
  )
  const stage = exhaustionIndex >= 75 ? "severely_exhausted" : exhaustionIndex >= 50 ? "exhausted" : exhaustionIndex >= 25 ? "fatigued" : "rested"
  return { exhaustionIndex, persistentActivation, sleepDeprivationLoad, metabolicStrain, hormonalSuppression, recoveryDeficit, stage }
}
