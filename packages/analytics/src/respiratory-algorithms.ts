import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, sql } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchMetric(db: any, userId: string, metricType: string, since: Date, until: Date) {
  return db.select({ value: healthMetrics.value, recordedAt: healthMetrics.recordedAt }).from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), eq(healthMetrics.metricType, metricType), gte(healthMetrics.recordedAt, since), lte(healthMetrics.recordedAt, until)))
    .orderBy(healthMetrics.recordedAt)
}

function mean(v: number[]): number { return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }
function stddev(v: number[]): number { const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length || 1)) }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)) }

function median(v: number[]): number {
  if (!v.length) return 0
  const sorted = [...v].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentile(v: number[], p: number): number {
  if (!v.length) return 0
  const sorted = [...v].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function slope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const xMean = (n - 1) / 2
  const yMean = mean(values)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean)
    den += (i - xMean) ** 2
  }
  return den ? num / den : 0
}

function daysBefore(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

function hoursBefore(date: Date, hours: number): Date {
  return new Date(date.getTime() - hours * 3600_000)
}

// ---------------------------------------------------------------------------
// 1. computeRespiratoryRateAnalysis
// ---------------------------------------------------------------------------

export interface RespiratoryRateAnalysisResult {
  meanRate: number
  medianRate: number
  minRate: number
  maxRate: number
  stdDev: number
  trend: number
  classification: "bradypnea" | "normal" | "tachypnea"
  sampleCount: number
}

export async function computeRespiratoryRateAnalysis(userId: string, date: Date = new Date()): Promise<RespiratoryRateAnalysisResult> {
  const db = getDb()
  const rows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const vals = rows.map((r: any) => Number(r.value))
  const m = mean(vals)
  return {
    meanRate: m,
    medianRate: median(vals),
    minRate: vals.length ? Math.min(...vals) : 0,
    maxRate: vals.length ? Math.max(...vals) : 0,
    stdDev: stddev(vals),
    trend: slope(vals),
    classification: m < 12 ? "bradypnea" : m > 20 ? "tachypnea" : "normal",
    sampleCount: vals.length,
  }
}

// ---------------------------------------------------------------------------
// 2. assessPulmonaryFunction
// ---------------------------------------------------------------------------

export interface PulmonaryFunctionResult {
  estimatedFEV1: number
  estimatedFVC: number
  fev1FvcRatio: number
  classification: "normal" | "mild_obstruction" | "moderate_obstruction" | "severe_obstruction" | "restriction"
  score: number
}

export async function assessPulmonaryFunction(userId: string, date: Date = new Date()): Promise<PulmonaryFunctionResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 30), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 30), date)
  const rrVals = rrRows.map((r: any) => Number(r.value))
  const spo2Vals = spo2Rows.map((r: any) => Number(r.value))
  const avgRR = mean(rrVals)
  const avgSpO2 = mean(spo2Vals)
  const estimatedFEV1 = clamp(4.5 - (avgRR - 15) * 0.08, 1.0, 5.5)
  const estimatedFVC = clamp(estimatedFEV1 * 1.25 + (avgSpO2 - 95) * 0.02, 1.5, 7.0)
  const ratio = estimatedFVC > 0 ? estimatedFEV1 / estimatedFVC : 0
  let classification: PulmonaryFunctionResult["classification"] = "normal"
  if (ratio < 0.5) classification = "severe_obstruction"
  else if (ratio < 0.6) classification = "moderate_obstruction"
  else if (ratio < 0.7) classification = "mild_obstruction"
  else if (estimatedFVC < 2.5 && ratio >= 0.7) classification = "restriction"
  const score = clamp(ratio * 100 + (avgSpO2 - 90) * 2, 0, 100)
  return { estimatedFEV1, estimatedFVC, fev1FvcRatio: ratio, classification, score }
}

// ---------------------------------------------------------------------------
// 3. computeOxygenSaturationTrend
// ---------------------------------------------------------------------------

export interface OxygenSaturationTrendResult {
  currentAvg: number
  previousAvg: number
  delta: number
  trend: "improving" | "stable" | "declining"
  lowestRecorded: number
  highestRecorded: number
  percentBelowNormal: number
}

export async function computeOxygenSaturationTrend(userId: string, date: Date = new Date()): Promise<OxygenSaturationTrendResult> {
  const db = getDb()
  const current = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const previous = await fetchMetric(db, userId, "spo2", daysBefore(date, 14), daysBefore(date, 7))
  const curVals = current.map((r: any) => Number(r.value))
  const prevVals = previous.map((r: any) => Number(r.value))
  const curAvg = mean(curVals)
  const prevAvg = mean(prevVals)
  const delta = curAvg - prevAvg
  const trend = delta > 0.5 ? "improving" : delta < -0.5 ? "declining" : "stable"
  const all = [...curVals, ...prevVals]
  return {
    currentAvg: curAvg,
    previousAvg: prevAvg,
    delta,
    trend,
    lowestRecorded: all.length ? Math.min(...all) : 0,
    highestRecorded: all.length ? Math.max(...all) : 0,
    percentBelowNormal: all.length ? (all.filter(v => v < 95).length / all.length) * 100 : 0,
  }
}

// ---------------------------------------------------------------------------
// 4. analyzeBreathingPattern
// ---------------------------------------------------------------------------

export interface BreathingPatternResult {
  dominantPattern: "regular" | "irregular" | "periodic" | "rapid_shallow" | "deep_slow"
  variabilityIndex: number
  breathingScore: number
  avgInhaledVolume: number
  avgRate: number
}

export async function analyzeBreathingPattern(userId: string, date: Date = new Date()): Promise<BreathingPatternResult> {
  const db = getDb()
  const rows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 3), date)
  const vals = rows.map((r: any) => Number(r.value))
  const avg = mean(vals)
  const sd = stddev(vals)
  const cv = avg > 0 ? sd / avg : 0
  let dominantPattern: BreathingPatternResult["dominantPattern"] = "regular"
  if (cv > 0.3) dominantPattern = "irregular"
  else if (cv > 0.2) dominantPattern = "periodic"
  else if (avg > 22 && sd < 2) dominantPattern = "rapid_shallow"
  else if (avg < 10 && sd < 2) dominantPattern = "deep_slow"
  const avgInhaledVolume = clamp(500 - (avg - 15) * 15, 200, 800)
  return {
    dominantPattern,
    variabilityIndex: cv,
    breathingScore: clamp(100 - cv * 100 - Math.abs(avg - 15) * 2, 0, 100),
    avgInhaledVolume,
    avgRate: avg,
  }
}

// ---------------------------------------------------------------------------
// 5. computeVentilationEfficiency
// ---------------------------------------------------------------------------

export interface VentilationEfficiencyResult {
  minuteVentilation: number
  alveolarVentilation: number
  deadSpaceFraction: number
  efficiencyScore: number
  classification: "efficient" | "adequate" | "inefficient"
}

export async function computeVentilationEfficiency(userId: string, date: Date = new Date()): Promise<VentilationEfficiencyResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const tidalVolume = clamp(500 - (avgRR - 15) * 20, 250, 800)
  const minuteVentilation = avgRR * tidalVolume / 1000
  const deadSpaceFraction = clamp(0.3 + (avgRR - 15) * 0.01, 0.15, 0.6)
  const alveolarVentilation = minuteVentilation * (1 - deadSpaceFraction)
  const efficiencyScore = clamp((avgSpO2 - 85) * 5 + (1 - deadSpaceFraction) * 30, 0, 100)
  return {
    minuteVentilation,
    alveolarVentilation,
    deadSpaceFraction,
    efficiencyScore,
    classification: efficiencyScore > 75 ? "efficient" : efficiencyScore > 50 ? "adequate" : "inefficient",
  }
}

// ---------------------------------------------------------------------------
// 6. assessCOPDRisk
// ---------------------------------------------------------------------------

export interface COPDRiskResult {
  riskScore: number
  riskLevel: "low" | "moderate" | "high" | "very_high"
  contributingFactors: string[]
  estimatedFEV1Decline: number
  recommendation: string
}

export async function assessCOPDRisk(userId: string, date: Date = new Date()): Promise<COPDRiskResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 30), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 30), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 30), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const factors: string[] = []
  let score = 0
  if (avgRR > 20) { score += 25; factors.push("elevated_respiratory_rate") }
  if (avgSpO2 < 94) { score += 30; factors.push("low_oxygen_saturation") }
  if (avgHR > 90) { score += 15; factors.push("elevated_resting_heart_rate") }
  if (stddev(rrRows.map((r: any) => Number(r.value))) > 4) { score += 15; factors.push("high_respiratory_variability") }
  if (slope(spo2Rows.map((r: any) => Number(r.value))) < -0.05) { score += 15; factors.push("declining_spo2_trend") }
  score = clamp(score, 0, 100)
  const riskLevel = score > 70 ? "very_high" : score > 50 ? "high" : score > 25 ? "moderate" : "low"
  return {
    riskScore: score,
    riskLevel,
    contributingFactors: factors,
    estimatedFEV1Decline: clamp(score * 0.5, 0, 50),
    recommendation: score > 50 ? "Consult a pulmonologist for spirometry testing" : "Continue monitoring respiratory metrics",
  }
}

// ---------------------------------------------------------------------------
// 7. computeRespiratoryReserve
// ---------------------------------------------------------------------------

export interface RespiratoryReserveResult {
  restingVentilation: number
  estimatedMaxVentilation: number
  reserveRatio: number
  classification: "excellent" | "good" | "fair" | "poor"
}

export async function computeRespiratoryReserve(userId: string, date: Date = new Date()): Promise<RespiratoryReserveResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const vals = rrRows.map((r: any) => Number(r.value))
  const avgRR = mean(vals)
  const tidalVolume = clamp(500 - (avgRR - 15) * 20, 250, 800)
  const restingVentilation = avgRR * tidalVolume / 1000
  const estimatedMaxVentilation = clamp(avgRR * 4 * 0.6, 40, 200)
  const reserveRatio = estimatedMaxVentilation > 0 ? 1 - restingVentilation / estimatedMaxVentilation : 0
  let classification: RespiratoryReserveResult["classification"] = "excellent"
  if (reserveRatio < 0.3) classification = "poor"
  else if (reserveRatio < 0.5) classification = "fair"
  else if (reserveRatio < 0.7) classification = "good"
  return { restingVentilation, estimatedMaxVentilation, reserveRatio, classification }
}

// ---------------------------------------------------------------------------
// 8. analyzeOxygenDesaturationEvents
// ---------------------------------------------------------------------------

export interface OxygenDesaturationEventsResult {
  totalEvents: number
  avgDesaturationDepth: number
  maxDesaturation: number
  desaturationIndex: number
  classification: "normal" | "mild" | "moderate" | "severe"
}

export async function analyzeOxygenDesaturationEvents(userId: string, date: Date = new Date()): Promise<OxygenDesaturationEventsResult> {
  const db = getDb()
  const rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 1), date)
  const vals = rows.map((r: any) => Number(r.value))
  const baseline = percentile(vals, 90)
  const events = vals.filter(v => v < baseline - 3)
  const depths = events.map(v => baseline - v)
  const hours = 24
  const desatIndex = events.length / hours
  return {
    totalEvents: events.length,
    avgDesaturationDepth: mean(depths),
    maxDesaturation: depths.length ? Math.max(...depths) : 0,
    desaturationIndex: desatIndex,
    classification: desatIndex > 30 ? "severe" : desatIndex > 15 ? "moderate" : desatIndex > 5 ? "mild" : "normal",
  }
}

// ---------------------------------------------------------------------------
// 9. computeAlveolarGasExchange
// ---------------------------------------------------------------------------

export interface AlveolarGasExchangeResult {
  estimatedPAO2: number
  estimatedPaO2: number
  aAGradient: number
  exchangeEfficiency: number
  classification: "normal" | "mildly_impaired" | "moderately_impaired" | "severely_impaired"
}

export async function computeAlveolarGasExchange(userId: string, date: Date = new Date()): Promise<AlveolarGasExchangeResult> {
  const db = getDb()
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const estimatedPAO2 = clamp(150 - (avgRR * 1.2), 80, 120)
  const estimatedPaO2 = clamp(avgSpO2 * 1.1 - 10, 50, 110)
  const aAGradient = estimatedPAO2 - estimatedPaO2
  const exchangeEfficiency = clamp(100 - aAGradient * 3, 0, 100)
  let classification: AlveolarGasExchangeResult["classification"] = "normal"
  if (aAGradient > 25) classification = "severely_impaired"
  else if (aAGradient > 15) classification = "moderately_impaired"
  else if (aAGradient > 10) classification = "mildly_impaired"
  return { estimatedPAO2, estimatedPaO2, aAGradient, exchangeEfficiency, classification }
}

// ---------------------------------------------------------------------------
// 10. assessAsthmaRisk
// ---------------------------------------------------------------------------

export interface AsthmaRiskResult {
  riskScore: number
  riskLevel: "low" | "moderate" | "high"
  peakFlowVariability: number
  nocturnalSymptomProxy: number
  contributingFactors: string[]
}

export async function assessAsthmaRisk(userId: string, date: Date = new Date()): Promise<AsthmaRiskResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 14), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 14), date)
  const vals = rrRows.map((r: any) => Number(r.value))
  const spo2Vals = spo2Rows.map((r: any) => Number(r.value))
  const rrCV = mean(vals) > 0 ? stddev(vals) / mean(vals) : 0
  const peakFlowVariability = rrCV * 100
  const nightRows = rrRows.filter((r: any) => {
    const h = new Date(r.recordedAt).getHours()
    return h >= 0 && h < 6
  })
  const nightVals = nightRows.map((r: any) => Number(r.value))
  const nocturnalSymptomProxy = nightVals.length ? nightVals.filter(v => v > 22).length / nightVals.length * 100 : 0
  const factors: string[] = []
  let score = 0
  if (peakFlowVariability > 20) { score += 30; factors.push("high_peak_flow_variability") }
  if (nocturnalSymptomProxy > 30) { score += 25; factors.push("nocturnal_symptoms") }
  if (mean(spo2Vals) < 95) { score += 20; factors.push("low_baseline_spo2") }
  if (stddev(spo2Vals) > 2) { score += 25; factors.push("variable_oxygen_saturation") }
  score = clamp(score, 0, 100)
  return {
    riskScore: score,
    riskLevel: score > 60 ? "high" : score > 30 ? "moderate" : "low",
    peakFlowVariability,
    nocturnalSymptomProxy,
    contributingFactors: factors,
  }
}

// ---------------------------------------------------------------------------
// 11. computeRespiratoryMuscleStrength
// ---------------------------------------------------------------------------

export interface RespiratoryMuscleStrengthResult {
  estimatedMIP: number
  estimatedMEP: number
  strengthIndex: number
  classification: "strong" | "normal" | "weak" | "very_weak"
}

export async function computeRespiratoryMuscleStrength(userId: string, date: Date = new Date()): Promise<RespiratoryMuscleStrengthResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 14), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 14), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const estimatedMIP = clamp(120 - avgRR * 2 - (avgHR - 70) * 0.3, 20, 150)
  const estimatedMEP = clamp(estimatedMIP * 1.3, 30, 200)
  const strengthIndex = clamp((estimatedMIP / 100) * 100, 0, 100)
  let classification: RespiratoryMuscleStrengthResult["classification"] = "strong"
  if (strengthIndex < 30) classification = "very_weak"
  else if (strengthIndex < 50) classification = "weak"
  else if (strengthIndex < 75) classification = "normal"
  return { estimatedMIP, estimatedMEP, strengthIndex, classification }
}

// ---------------------------------------------------------------------------
// 12. analyzeBreathingFrequencyVariability
// ---------------------------------------------------------------------------

export interface BreathingFrequencyVariabilityResult {
  coefficientOfVariation: number
  rmssd: number
  interQuartileRange: number
  variabilityScore: number
  classification: "low" | "normal" | "high"
}

export async function analyzeBreathingFrequencyVariability(userId: string, date: Date = new Date()): Promise<BreathingFrequencyVariabilityResult> {
  const db = getDb()
  const rows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 3), date)
  const vals = rows.map((r: any) => Number(r.value))
  const cv = mean(vals) > 0 ? stddev(vals) / mean(vals) : 0
  let rmssd = 0
  if (vals.length > 1) {
    const diffs = vals.slice(1).map((v, i) => (v - vals[i]) ** 2)
    rmssd = Math.sqrt(mean(diffs))
  }
  const iqr = percentile(vals, 75) - percentile(vals, 25)
  const variabilityScore = clamp(cv * 200, 0, 100)
  return {
    coefficientOfVariation: cv,
    rmssd,
    interQuartileRange: iqr,
    variabilityScore,
    classification: variabilityScore > 60 ? "high" : variabilityScore > 25 ? "normal" : "low",
  }
}

// ---------------------------------------------------------------------------
// 13. computeMinuteVentilation
// ---------------------------------------------------------------------------

export interface MinuteVentilationResult {
  currentMinuteVentilation: number
  avgMinuteVentilation: number
  trend: number
  classification: "hypoventilation" | "normal" | "hyperventilation"
  tidalVolumeEstimate: number
}

export async function computeMinuteVentilation(userId: string, date: Date = new Date()): Promise<MinuteVentilationResult> {
  const db = getDb()
  const rows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const vals = rows.map((r: any) => Number(r.value))
  const tidalVolumes = vals.map(rr => clamp(500 - (rr - 15) * 20, 250, 800))
  const mvs = vals.map((rr, i) => rr * tidalVolumes[i] / 1000)
  const currentMV = mvs.length ? mvs[mvs.length - 1] : 0
  const avgMV = mean(mvs)
  return {
    currentMinuteVentilation: currentMV,
    avgMinuteVentilation: avgMV,
    trend: slope(mvs),
    classification: avgMV < 4 ? "hypoventilation" : avgMV > 10 ? "hyperventilation" : "normal",
    tidalVolumeEstimate: mean(tidalVolumes),
  }
}

// ---------------------------------------------------------------------------
// 14. assessPneumoniaRisk
// ---------------------------------------------------------------------------

export interface PneumoniaRiskResult {
  riskScore: number
  riskLevel: "low" | "moderate" | "high" | "critical"
  contributingFactors: string[]
  recommendation: string
}

export async function assessPneumoniaRisk(userId: string, date: Date = new Date()): Promise<PneumoniaRiskResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 7), date)
  const tempRows = await fetchMetric(db, userId, "body_temperature", daysBefore(date, 7), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const avgTemp = mean(tempRows.map((r: any) => Number(r.value)))
  const factors: string[] = []
  let score = 0
  if (avgRR > 22) { score += 20; factors.push("tachypnea") }
  if (avgSpO2 < 93) { score += 25; factors.push("hypoxemia") }
  if (avgHR > 100) { score += 15; factors.push("tachycardia") }
  if (avgTemp > 38) { score += 25; factors.push("fever") }
  if (slope(spo2Rows.map((r: any) => Number(r.value))) < -0.1) { score += 15; factors.push("declining_oxygenation") }
  score = clamp(score, 0, 100)
  return {
    riskScore: score,
    riskLevel: score > 75 ? "critical" : score > 50 ? "high" : score > 25 ? "moderate" : "low",
    contributingFactors: factors,
    recommendation: score > 50 ? "Seek medical evaluation urgently" : "Monitor symptoms and maintain hydration",
  }
}

// ---------------------------------------------------------------------------
// 15. computeOxygenDeliveryIndex
// ---------------------------------------------------------------------------

export interface OxygenDeliveryIndexResult {
  oxygenDeliveryIndex: number
  estimatedDO2: number
  hemoglobinProxy: number
  cardiacOutputProxy: number
  classification: "adequate" | "borderline" | "inadequate"
}

export async function computeOxygenDeliveryIndex(userId: string, date: Date = new Date()): Promise<OxygenDeliveryIndexResult> {
  const db = getDb()
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 7), date)
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const hemoglobinProxy = 14.0
  const strokeVolumeProxy = clamp(80 - (avgHR - 70) * 0.3, 50, 100)
  const cardiacOutputProxy = avgHR * strokeVolumeProxy / 1000
  const estimatedDO2 = cardiacOutputProxy * hemoglobinProxy * 1.34 * (avgSpO2 / 100) * 10
  const oxygenDeliveryIndex = clamp(estimatedDO2 / 10, 0, 100)
  return {
    oxygenDeliveryIndex,
    estimatedDO2,
    hemoglobinProxy,
    cardiacOutputProxy,
    classification: oxygenDeliveryIndex > 70 ? "adequate" : oxygenDeliveryIndex > 45 ? "borderline" : "inadequate",
  }
}

// ---------------------------------------------------------------------------
// 16. analyzeRespiratoryRecovery
// ---------------------------------------------------------------------------

export interface RespiratoryRecoveryResult {
  recoveryTimeMinutes: number
  recoverySlope: number
  recoveryScore: number
  classification: "rapid" | "normal" | "slow" | "impaired"
}

export async function analyzeRespiratoryRecovery(userId: string, date: Date = new Date()): Promise<RespiratoryRecoveryResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", hoursBefore(date, 4), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", hoursBefore(date, 4), date)
  const rrVals = rrRows.map((r: any) => Number(r.value))
  const hrVals = hrRows.map((r: any) => Number(r.value))
  const peakRR = rrVals.length ? Math.max(...rrVals) : 15
  const restingRR = rrVals.length ? Math.min(...rrVals) : 15
  const peakIdx = rrVals.indexOf(peakRR)
  const postPeak = rrVals.slice(peakIdx)
  const restoreIdx = postPeak.findIndex(v => v <= restingRR + 2)
  const recoveryTimeMinutes = restoreIdx > 0 ? restoreIdx * 5 : postPeak.length * 5
  const recoverySlope = postPeak.length > 1 ? slope(postPeak) : 0
  const recoveryScore = clamp(100 - recoveryTimeMinutes * 2, 0, 100)
  return {
    recoveryTimeMinutes,
    recoverySlope,
    recoveryScore,
    classification: recoveryScore > 80 ? "rapid" : recoveryScore > 60 ? "normal" : recoveryScore > 35 ? "slow" : "impaired",
  }
}

// ---------------------------------------------------------------------------
// 17. computeBreathingEfficiency
// ---------------------------------------------------------------------------

export interface BreathingEfficiencyResult {
  efficiencyIndex: number
  oxygenCostOfBreathing: number
  ventilationEffectiveness: number
  classification: "highly_efficient" | "efficient" | "moderately_efficient" | "inefficient"
}

export async function computeBreathingEfficiency(userId: string, date: Date = new Date()): Promise<BreathingEfficiencyResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const oxygenCostOfBreathing = clamp(avgRR * 0.5 + (100 - avgSpO2) * 2, 1, 50)
  const ventilationEffectiveness = clamp(avgSpO2 - 85 + (20 - avgRR) * 0.5, 0, 15)
  const efficiencyIndex = clamp(100 - oxygenCostOfBreathing * 1.5 + ventilationEffectiveness * 2, 0, 100)
  let classification: BreathingEfficiencyResult["classification"] = "highly_efficient"
  if (efficiencyIndex < 35) classification = "inefficient"
  else if (efficiencyIndex < 55) classification = "moderately_efficient"
  else if (efficiencyIndex < 80) classification = "efficient"
  return { efficiencyIndex, oxygenCostOfBreathing, ventilationEffectiveness, classification }
}

// ---------------------------------------------------------------------------
// 18. assessPulmonaryEmbolismRisk
// ---------------------------------------------------------------------------

export interface PulmonaryEmbolismRiskResult {
  riskScore: number
  riskLevel: "low" | "moderate" | "high"
  wellsScoreProxy: number
  contributingFactors: string[]
  recommendation: string
}

export async function assessPulmonaryEmbolismRisk(userId: string, date: Date = new Date()): Promise<PulmonaryEmbolismRiskResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 3), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 3), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 3), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const factors: string[] = []
  let wellsProxy = 0
  if (avgHR > 100) { wellsProxy += 1.5; factors.push("tachycardia") }
  if (avgRR > 20) { wellsProxy += 1; factors.push("tachypnea") }
  if (avgSpO2 < 92) { wellsProxy += 2; factors.push("significant_hypoxemia") }
  if (slope(spo2Rows.map((r: any) => Number(r.value))) < -0.2) { wellsProxy += 1.5; factors.push("acute_spo2_decline") }
  const score = clamp(wellsProxy * 15, 0, 100)
  return {
    riskScore: score,
    riskLevel: score > 60 ? "high" : score > 30 ? "moderate" : "low",
    wellsScoreProxy: wellsProxy,
    contributingFactors: factors,
    recommendation: score > 60 ? "Seek emergency evaluation immediately" : "Continue monitoring vitals",
  }
}

// ---------------------------------------------------------------------------
// 19. computeAirwayObstructionProxy
// ---------------------------------------------------------------------------

export interface AirwayObstructionProxyResult {
  obstructionIndex: number
  estimatedPEFR: number
  expiratoryToInspiratoryRatio: number
  classification: "no_obstruction" | "mild" | "moderate" | "severe"
}

export async function computeAirwayObstructionProxy(userId: string, date: Date = new Date()): Promise<AirwayObstructionProxyResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 14), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 14), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const rrSD = stddev(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const estimatedPEFR = clamp(600 - (avgRR - 15) * 15 - rrSD * 10, 100, 700)
  const eiRatio = clamp(1.0 + (avgRR - 15) * 0.05, 0.5, 3.0)
  const obstructionIndex = clamp((700 - estimatedPEFR) / 6 + (100 - avgSpO2) * 2, 0, 100)
  let classification: AirwayObstructionProxyResult["classification"] = "no_obstruction"
  if (obstructionIndex > 65) classification = "severe"
  else if (obstructionIndex > 40) classification = "moderate"
  else if (obstructionIndex > 20) classification = "mild"
  return { obstructionIndex, estimatedPEFR, expiratoryToInspiratoryRatio: eiRatio, classification }
}

// ---------------------------------------------------------------------------
// 20. analyzeRespiratoryCircadianPattern
// ---------------------------------------------------------------------------

export interface RespiratoryCircadianPatternResult {
  morningAvg: number
  afternoonAvg: number
  eveningAvg: number
  nightAvg: number
  peakPeriod: "morning" | "afternoon" | "evening" | "night"
  nadirPeriod: "morning" | "afternoon" | "evening" | "night"
  circadianAmplitude: number
}

export async function analyzeRespiratoryCircadianPattern(userId: string, date: Date = new Date()): Promise<RespiratoryCircadianPatternResult> {
  const db = getDb()
  const rows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const buckets: Record<string, number[]> = { morning: [], afternoon: [], evening: [], night: [] }
  for (const r of rows) {
    const h = new Date(r.recordedAt).getHours()
    if (h >= 6 && h < 12) buckets.morning.push(Number(r.value))
    else if (h >= 12 && h < 18) buckets.afternoon.push(Number(r.value))
    else if (h >= 18 && h < 22) buckets.evening.push(Number(r.value))
    else buckets.night.push(Number(r.value))
  }
  const avgs: Record<string, number> = {
    morning: mean(buckets.morning),
    afternoon: mean(buckets.afternoon),
    evening: mean(buckets.evening),
    night: mean(buckets.night),
  }
  const periods = ["morning", "afternoon", "evening", "night"] as const
  const peakPeriod = periods.reduce((a, b) => avgs[a] >= avgs[b] ? a : b)
  const nadirPeriod = periods.reduce((a, b) => avgs[a] <= avgs[b] ? a : b)
  return {
    morningAvg: avgs.morning,
    afternoonAvg: avgs.afternoon,
    eveningAvg: avgs.evening,
    nightAvg: avgs.night,
    peakPeriod,
    nadirPeriod,
    circadianAmplitude: avgs[peakPeriod] - avgs[nadirPeriod],
  }
}

// ---------------------------------------------------------------------------
// 21. computeRespiratoryDriveIndex
// ---------------------------------------------------------------------------

export interface RespiratoryDriveIndexResult {
  driveIndex: number
  chemicalDriveProxy: number
  neuralDriveProxy: number
  classification: "depressed" | "normal" | "elevated"
}

export async function computeRespiratoryDriveIndex(userId: string, date: Date = new Date()): Promise<RespiratoryDriveIndexResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 7), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const chemicalDriveProxy = clamp((100 - avgSpO2) * 5 + (avgRR - 12) * 2, 0, 100)
  const neuralDriveProxy = clamp((avgHR - 60) * 0.8 + (avgRR - 12) * 1.5, 0, 100)
  const driveIndex = (chemicalDriveProxy + neuralDriveProxy) / 2
  return {
    driveIndex,
    chemicalDriveProxy,
    neuralDriveProxy,
    classification: driveIndex > 60 ? "elevated" : driveIndex < 20 ? "depressed" : "normal",
  }
}

// ---------------------------------------------------------------------------
// 22. analyzeRespiratorySinusArrhythmia
// ---------------------------------------------------------------------------

export interface RespiratorySinusArrhythmiaResult {
  rsaAmplitude: number
  rsaIndex: number
  vagalToneProxy: number
  classification: "high" | "normal" | "low"
}

export async function analyzeRespiratorySinusArrhythmia(userId: string, date: Date = new Date()): Promise<RespiratorySinusArrhythmiaResult> {
  const db = getDb()
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 3), date)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 3), date)
  const hrVals = hrRows.map((r: any) => Number(r.value))
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const hrRange = hrVals.length ? Math.max(...hrVals) - Math.min(...hrVals) : 0
  const rsaAmplitude = hrRange * 0.3
  const rsaIndex = clamp(rsaAmplitude * (20 / (avgRR || 15)), 0, 50)
  const vagalToneProxy = clamp(rsaIndex * 2.5, 0, 100)
  return {
    rsaAmplitude,
    rsaIndex,
    vagalToneProxy,
    classification: vagalToneProxy > 60 ? "high" : vagalToneProxy < 25 ? "low" : "normal",
  }
}

// ---------------------------------------------------------------------------
// 23. computeDeadSpaceVentilation
// ---------------------------------------------------------------------------

export interface DeadSpaceVentilationResult {
  estimatedDeadSpace: number
  deadSpaceToTidalRatio: number
  physiologicalDeadSpace: number
  classification: "normal" | "elevated" | "high"
}

export async function computeDeadSpaceVentilation(userId: string, date: Date = new Date()): Promise<DeadSpaceVentilationResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const tidalVolume = clamp(500 - (avgRR - 15) * 20, 250, 800)
  const anatomicalDeadSpace = 150
  const additionalDeadSpace = clamp((100 - avgSpO2) * 5, 0, 100)
  const physiologicalDeadSpace = anatomicalDeadSpace + additionalDeadSpace
  const ratio = tidalVolume > 0 ? physiologicalDeadSpace / tidalVolume : 0
  return {
    estimatedDeadSpace: physiologicalDeadSpace,
    deadSpaceToTidalRatio: ratio,
    physiologicalDeadSpace,
    classification: ratio > 0.5 ? "high" : ratio > 0.35 ? "elevated" : "normal",
  }
}

// ---------------------------------------------------------------------------
// 24. assessHypoxemiaRisk
// ---------------------------------------------------------------------------

export interface HypoxemiaRiskResult {
  riskScore: number
  riskLevel: "low" | "moderate" | "high" | "critical"
  lowestSpO2: number
  timeBelowThreshold: number
  avgSpO2: number
}

export async function assessHypoxemiaRisk(userId: string, date: Date = new Date()): Promise<HypoxemiaRiskResult> {
  const db = getDb()
  const rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const vals = rows.map((r: any) => Number(r.value))
  const avgSpO2 = mean(vals)
  const lowestSpO2 = vals.length ? Math.min(...vals) : 0
  const timeBelowThreshold = vals.length ? (vals.filter(v => v < 90).length / vals.length) * 100 : 0
  let score = 0
  if (avgSpO2 < 92) score += 30
  else if (avgSpO2 < 94) score += 15
  if (lowestSpO2 < 85) score += 30
  else if (lowestSpO2 < 88) score += 20
  if (timeBelowThreshold > 10) score += 25
  else if (timeBelowThreshold > 5) score += 15
  score += clamp((95 - avgSpO2) * 3, 0, 15)
  score = clamp(score, 0, 100)
  return {
    riskScore: score,
    riskLevel: score > 75 ? "critical" : score > 50 ? "high" : score > 25 ? "moderate" : "low",
    lowestSpO2,
    timeBelowThreshold,
    avgSpO2,
  }
}

// ---------------------------------------------------------------------------
// 25. computeHypercapniaProxy
// ---------------------------------------------------------------------------

export interface HypercapniaProxyResult {
  estimatedPCO2: number
  hypercapniaScore: number
  classification: "normal" | "mild_hypercapnia" | "moderate_hypercapnia" | "severe_hypercapnia"
  compensatoryResponse: number
}

export async function computeHypercapniaProxy(userId: string, date: Date = new Date()): Promise<HypercapniaProxyResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const estimatedPCO2 = clamp(40 + (15 - avgRR) * 1.5 + (95 - avgSpO2) * 0.8, 25, 80)
  const hypercapniaScore = clamp((estimatedPCO2 - 40) * 4, 0, 100)
  const compensatoryResponse = clamp((avgRR - 12) * 5, 0, 100)
  let classification: HypercapniaProxyResult["classification"] = "normal"
  if (estimatedPCO2 > 60) classification = "severe_hypercapnia"
  else if (estimatedPCO2 > 50) classification = "moderate_hypercapnia"
  else if (estimatedPCO2 > 45) classification = "mild_hypercapnia"
  return { estimatedPCO2, hypercapniaScore, classification, compensatoryResponse }
}

// ---------------------------------------------------------------------------
// 26. computeWorkOfBreathing
// ---------------------------------------------------------------------------

export interface WorkOfBreathingResult {
  workIndex: number
  elasticWork: number
  resistiveWork: number
  totalWork: number
  classification: "minimal" | "normal" | "increased" | "excessive"
}

export async function computeWorkOfBreathing(userId: string, date: Date = new Date()): Promise<WorkOfBreathingResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const tidalVolume = clamp(500 - (avgRR - 15) * 20, 250, 800)
  const elasticWork = clamp(tidalVolume * 0.005 * (avgRR / 15), 0.5, 5.0)
  const resistiveWork = clamp(avgRR * 0.02 * (100 - avgSpO2 + 5), 0.2, 4.0)
  const totalWork = elasticWork + resistiveWork
  const workIndex = clamp(totalWork * 12, 0, 100)
  let classification: WorkOfBreathingResult["classification"] = "minimal"
  if (workIndex > 70) classification = "excessive"
  else if (workIndex > 45) classification = "increased"
  else if (workIndex > 20) classification = "normal"
  return { workIndex, elasticWork, resistiveWork, totalWork, classification }
}

// ---------------------------------------------------------------------------
// 27. assessPulmonaryFibrosisRisk
// ---------------------------------------------------------------------------

export interface PulmonaryFibrosisRiskResult {
  riskScore: number
  riskLevel: "low" | "moderate" | "high"
  restrictivePatternProxy: number
  oxygenationDecline: number
  contributingFactors: string[]
}

export async function assessPulmonaryFibrosisRisk(userId: string, date: Date = new Date()): Promise<PulmonaryFibrosisRiskResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 30), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 30), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const spo2Slope = slope(spo2Rows.map((r: any) => Number(r.value)))
  const factors: string[] = []
  let score = 0
  const restrictivePatternProxy = clamp((avgRR - 16) * 8, 0, 100)
  if (restrictivePatternProxy > 40) { score += 25; factors.push("rapid_shallow_breathing_pattern") }
  const oxygenationDecline = clamp(-spo2Slope * 100, 0, 50)
  if (oxygenationDecline > 10) { score += 25; factors.push("progressive_oxygenation_decline") }
  if (avgSpO2 < 93) { score += 25; factors.push("chronic_hypoxemia") }
  if (stddev(rrRows.map((r: any) => Number(r.value))) < 1.5 && avgRR > 18) { score += 15; factors.push("fixed_tachypnea") }
  score = clamp(score, 0, 100)
  return {
    riskScore: score,
    riskLevel: score > 60 ? "high" : score > 30 ? "moderate" : "low",
    restrictivePatternProxy,
    oxygenationDecline,
    contributingFactors: factors,
  }
}

// ---------------------------------------------------------------------------
// 28. computeRespiratoryQuotient
// ---------------------------------------------------------------------------

export interface RespiratoryQuotientResult {
  estimatedRQ: number
  metabolicState: "fat_oxidation" | "mixed" | "carbohydrate_oxidation" | "lipogenesis"
  co2ProductionProxy: number
  o2ConsumptionProxy: number
}

export async function computeRespiratoryQuotient(userId: string, date: Date = new Date()): Promise<RespiratoryQuotientResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 7), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const o2ConsumptionProxy = clamp(avgHR * 3.5, 150, 600)
  const co2ProductionProxy = clamp(avgRR * 15 + (avgHR - 70) * 1.5, 120, 550)
  const estimatedRQ = o2ConsumptionProxy > 0 ? co2ProductionProxy / o2ConsumptionProxy : 0.8
  let metabolicState: RespiratoryQuotientResult["metabolicState"] = "mixed"
  if (estimatedRQ < 0.75) metabolicState = "fat_oxidation"
  else if (estimatedRQ > 1.0) metabolicState = "lipogenesis"
  else if (estimatedRQ > 0.9) metabolicState = "carbohydrate_oxidation"
  return { estimatedRQ, metabolicState, co2ProductionProxy, o2ConsumptionProxy }
}

// ---------------------------------------------------------------------------
// 29. computeBronchodilatorResponse
// ---------------------------------------------------------------------------

export interface BronchodilatorResponseResult {
  baselineProxy: number
  postResponseProxy: number
  changePercent: number
  significant: boolean
  classification: "positive_response" | "borderline" | "no_response"
}

export async function computeBronchodilatorResponse(userId: string, date: Date = new Date()): Promise<BronchodilatorResponseResult> {
  const db = getDb()
  const before = await fetchMetric(db, userId, "respiratory_rate", hoursBefore(date, 6), hoursBefore(date, 3))
  const after = await fetchMetric(db, userId, "respiratory_rate", hoursBefore(date, 3), date)
  const beforeVals = before.map((r: any) => Number(r.value))
  const afterVals = after.map((r: any) => Number(r.value))
  const baselineProxy = mean(beforeVals)
  const postResponseProxy = mean(afterVals)
  const change = baselineProxy > 0 ? ((baselineProxy - postResponseProxy) / baselineProxy) * 100 : 0
  return {
    baselineProxy,
    postResponseProxy,
    changePercent: change,
    significant: change >= 12,
    classification: change >= 12 ? "positive_response" : change >= 8 ? "borderline" : "no_response",
  }
}

// ---------------------------------------------------------------------------
// 30. computeExpiratoryFlowProxy
// ---------------------------------------------------------------------------

export interface ExpiratoryFlowProxyResult {
  estimatedPEF: number
  estimatedFEF2575: number
  flowLimitationIndex: number
  classification: "normal" | "mild_limitation" | "moderate_limitation" | "severe_limitation"
}

export async function computeExpiratoryFlowProxy(userId: string, date: Date = new Date()): Promise<ExpiratoryFlowProxyResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 14), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 14), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const estimatedPEF = clamp(580 - (avgRR - 14) * 12 - (96 - avgSpO2) * 8, 100, 700)
  const estimatedFEF2575 = estimatedPEF * 0.55
  const flowLimitationIndex = clamp((600 - estimatedPEF) / 5, 0, 100)
  let classification: ExpiratoryFlowProxyResult["classification"] = "normal"
  if (flowLimitationIndex > 65) classification = "severe_limitation"
  else if (flowLimitationIndex > 40) classification = "moderate_limitation"
  else if (flowLimitationIndex > 20) classification = "mild_limitation"
  return { estimatedPEF, estimatedFEF2575, flowLimitationIndex, classification }
}

// ---------------------------------------------------------------------------
// 31. analyzeInspiratoryCapacity
// ---------------------------------------------------------------------------

export interface InspiratoryCapacityResult {
  estimatedIC: number
  icToTlcRatio: number
  hyperinflationProxy: number
  classification: "normal" | "mild_hyperinflation" | "moderate_hyperinflation" | "severe_hyperinflation"
}

export async function analyzeInspiratoryCapacity(userId: string, date: Date = new Date()): Promise<InspiratoryCapacityResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 14), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 14), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const estimatedIC = clamp(3.0 - (avgRR - 15) * 0.06 + (avgSpO2 - 95) * 0.03, 1.0, 4.5)
  const estimatedTLC = 6.0
  const icToTlcRatio = estimatedIC / estimatedTLC
  const hyperinflationProxy = clamp((1 - icToTlcRatio) * 100 - 50, 0, 100)
  let classification: InspiratoryCapacityResult["classification"] = "normal"
  if (icToTlcRatio < 0.2) classification = "severe_hyperinflation"
  else if (icToTlcRatio < 0.3) classification = "moderate_hyperinflation"
  else if (icToTlcRatio < 0.4) classification = "mild_hyperinflation"
  return { estimatedIC, icToTlcRatio, hyperinflationProxy, classification }
}

// ---------------------------------------------------------------------------
// 32. computeRespiratoryMuscleEndurance
// ---------------------------------------------------------------------------

export interface RespiratoryMuscleEnduranceResult {
  enduranceIndex: number
  sustainedVentilationCapacity: number
  fatigueThreshold: number
  classification: "excellent" | "good" | "fair" | "poor"
}

export async function computeRespiratoryMuscleEndurance(userId: string, date: Date = new Date()): Promise<RespiratoryMuscleEnduranceResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 7), date)
  const rrVals = rrRows.map((r: any) => Number(r.value))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const avgRR = mean(rrVals)
  const rrTrend = slope(rrVals)
  const sustainedVentilationCapacity = clamp(100 - rrTrend * 20 - (avgHR - 70) * 0.3, 20, 100)
  const fatigueThreshold = clamp(avgRR * 3 + 20, 40, 120)
  const enduranceIndex = clamp(sustainedVentilationCapacity * 0.7 + (120 - fatigueThreshold) * 0.3, 0, 100)
  let classification: RespiratoryMuscleEnduranceResult["classification"] = "excellent"
  if (enduranceIndex < 30) classification = "poor"
  else if (enduranceIndex < 50) classification = "fair"
  else if (enduranceIndex < 75) classification = "good"
  return { enduranceIndex, sustainedVentilationCapacity, fatigueThreshold, classification }
}

// ---------------------------------------------------------------------------
// 33. computeOxygenConsumptionRate
// ---------------------------------------------------------------------------

export interface OxygenConsumptionRateResult {
  estimatedVO2: number
  vo2PerKg: number
  metabolicEquivalent: number
  classification: "resting" | "light_activity" | "moderate_activity" | "vigorous_activity"
}

export async function computeOxygenConsumptionRate(userId: string, date: Date = new Date()): Promise<OxygenConsumptionRateResult> {
  const db = getDb()
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 1), date)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 1), date)
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const estimatedVO2 = clamp(avgHR * 3.5 + avgRR * 10, 200, 4000)
  const assumedWeight = 70
  const vo2PerKg = estimatedVO2 / assumedWeight
  const met = vo2PerKg / 3.5
  let classification: OxygenConsumptionRateResult["classification"] = "resting"
  if (met > 6) classification = "vigorous_activity"
  else if (met > 3) classification = "moderate_activity"
  else if (met > 1.5) classification = "light_activity"
  return { estimatedVO2, vo2PerKg, metabolicEquivalent: met, classification }
}

// ---------------------------------------------------------------------------
// 34. analyzeRespiratoryResponse
// ---------------------------------------------------------------------------

export interface RespiratoryResponseResult {
  responseType: "proportional" | "exaggerated" | "blunted" | "paradoxical"
  hrRrCoupling: number
  responseLatency: number
  adaptationScore: number
}

export async function analyzeRespiratoryResponse(userId: string, date: Date = new Date()): Promise<RespiratoryResponseResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 3), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 3), date)
  const rrVals = rrRows.map((r: any) => Number(r.value))
  const hrVals = hrRows.map((r: any) => Number(r.value))
  const minLen = Math.min(rrVals.length, hrVals.length)
  let coupling = 0
  if (minLen > 1) {
    const rrNorm = rrVals.slice(0, minLen).map(v => v / (mean(rrVals) || 1))
    const hrNorm = hrVals.slice(0, minLen).map(v => v / (mean(hrVals) || 1))
    const diffs = rrNorm.map((v, i) => Math.abs(v - hrNorm[i]))
    coupling = clamp(1 - mean(diffs), 0, 1)
  }
  const rrSlope = slope(rrVals)
  const hrSlope = slope(hrVals)
  let responseType: RespiratoryResponseResult["responseType"] = "proportional"
  if (rrSlope > 0 && hrSlope < 0) responseType = "paradoxical"
  else if (Math.abs(rrSlope) > Math.abs(hrSlope) * 2) responseType = "exaggerated"
  else if (Math.abs(rrSlope) < Math.abs(hrSlope) * 0.3) responseType = "blunted"
  const responseLatency = clamp(Math.abs(rrSlope - hrSlope) * 10, 0, 30)
  return {
    responseType,
    hrRrCoupling: coupling,
    responseLatency,
    adaptationScore: clamp(coupling * 70 + (responseType === "proportional" ? 30 : 0), 0, 100),
  }
}

// ---------------------------------------------------------------------------
// 35. computeVentilationPerfusionRatio
// ---------------------------------------------------------------------------

export interface VentilationPerfusionRatioResult {
  estimatedVQRatio: number
  shuntFractionProxy: number
  deadSpaceFractionProxy: number
  classification: "normal" | "low_vq" | "high_vq" | "mixed"
}

export async function computeVentilationPerfusionRatio(userId: string, date: Date = new Date()): Promise<VentilationPerfusionRatioResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 7), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const ventilationProxy = avgRR * 0.5
  const perfusionProxy = avgHR * 0.07
  const estimatedVQRatio = perfusionProxy > 0 ? ventilationProxy / perfusionProxy : 0.8
  const shuntFractionProxy = clamp((95 - avgSpO2) * 3, 0, 50)
  const deadSpaceFractionProxy = clamp((avgRR - 12) * 3, 0, 50)
  let classification: VentilationPerfusionRatioResult["classification"] = "normal"
  if (shuntFractionProxy > 20 && deadSpaceFractionProxy > 20) classification = "mixed"
  else if (estimatedVQRatio < 0.6) classification = "low_vq"
  else if (estimatedVQRatio > 1.2) classification = "high_vq"
  return { estimatedVQRatio, shuntFractionProxy, deadSpaceFractionProxy, classification }
}

// ---------------------------------------------------------------------------
// 36. assessSleepDisorderedBreathing
// ---------------------------------------------------------------------------

export interface SleepDisorderedBreathingResult {
  estimatedAHI: number
  severityLevel: "normal" | "mild" | "moderate" | "severe"
  desaturationEvents: number
  periodicBreathingScore: number
  recommendation: string
}

export async function assessSleepDisorderedBreathing(userId: string, date: Date = new Date()): Promise<SleepDisorderedBreathingResult> {
  const db = getDb()
  const nightStart = new Date(date)
  nightStart.setHours(22, 0, 0, 0)
  nightStart.setDate(nightStart.getDate() - 1)
  const nightEnd = new Date(date)
  nightEnd.setHours(6, 0, 0, 0)
  const spo2Rows = await fetchMetric(db, userId, "spo2", nightStart, nightEnd)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", nightStart, nightEnd)
  const spo2Vals = spo2Rows.map((r: any) => Number(r.value))
  const rrVals = rrRows.map((r: any) => Number(r.value))
  const baseline = percentile(spo2Vals, 90)
  const desatEvents = spo2Vals.filter(v => v < baseline - 3).length
  const estimatedAHI = desatEvents * (60 / (spo2Vals.length || 1)) * 8
  const rrCV = mean(rrVals) > 0 ? stddev(rrVals) / mean(rrVals) : 0
  const periodicBreathingScore = clamp(rrCV * 200, 0, 100)
  let severityLevel: SleepDisorderedBreathingResult["severityLevel"] = "normal"
  if (estimatedAHI > 30) severityLevel = "severe"
  else if (estimatedAHI > 15) severityLevel = "moderate"
  else if (estimatedAHI > 5) severityLevel = "mild"
  return {
    estimatedAHI,
    severityLevel,
    desaturationEvents: desatEvents,
    periodicBreathingScore,
    recommendation: estimatedAHI > 15 ? "Consider a formal sleep study" : "No immediate intervention required",
  }
}

// ---------------------------------------------------------------------------
// 37. computeRespiratoryFatigue
// ---------------------------------------------------------------------------

export interface RespiratoryFatigueResult {
  fatigueIndex: number
  rateOfRateIncrease: number
  efficiencyDecline: number
  classification: "none" | "mild" | "moderate" | "severe"
}

export async function computeRespiratoryFatigue(userId: string, date: Date = new Date()): Promise<RespiratoryFatigueResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 1), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 1), date)
  const rrVals = rrRows.map((r: any) => Number(r.value))
  const spo2Vals = spo2Rows.map((r: any) => Number(r.value))
  const rrTrend = slope(rrVals)
  const spo2Trend = slope(spo2Vals)
  const rateOfRateIncrease = clamp(rrTrend * 10, -5, 10)
  const efficiencyDecline = clamp(-spo2Trend * 50, 0, 100)
  const fatigueIndex = clamp(rateOfRateIncrease * 8 + efficiencyDecline * 0.6, 0, 100)
  let classification: RespiratoryFatigueResult["classification"] = "none"
  if (fatigueIndex > 65) classification = "severe"
  else if (fatigueIndex > 40) classification = "moderate"
  else if (fatigueIndex > 15) classification = "mild"
  return { fatigueIndex, rateOfRateIncrease, efficiencyDecline, classification }
}

// ---------------------------------------------------------------------------
// 38. computeOxygenExtractionRatio
// ---------------------------------------------------------------------------

export interface OxygenExtractionRatioResult {
  extractionRatio: number
  estimatedSvO2: number
  tissueOxygenationProxy: number
  classification: "normal" | "compensated" | "critical"
}

export async function computeOxygenExtractionRatio(userId: string, date: Date = new Date()): Promise<OxygenExtractionRatioResult> {
  const db = getDb()
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 7), date)
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const estimatedSvO2 = clamp(avgSpO2 - 25 - (avgHR - 70) * 0.15, 40, 85)
  const extractionRatio = avgSpO2 > 0 ? (avgSpO2 - estimatedSvO2) / avgSpO2 : 0.25
  const tissueOxygenationProxy = clamp(estimatedSvO2 * 1.1, 0, 100)
  let classification: OxygenExtractionRatioResult["classification"] = "normal"
  if (extractionRatio > 0.5) classification = "critical"
  else if (extractionRatio > 0.35) classification = "compensated"
  return { extractionRatio, estimatedSvO2, tissueOxygenationProxy, classification }
}

// ---------------------------------------------------------------------------
// 39. analyzeRespiratoryAdaptation
// ---------------------------------------------------------------------------

export interface RespiratoryAdaptationResult {
  adaptationScore: number
  shortTermAdaptation: number
  longTermAdaptation: number
  resilienceIndex: number
  classification: "well_adapted" | "adapting" | "maladapted"
}

export async function analyzeRespiratoryAdaptation(userId: string, date: Date = new Date()): Promise<RespiratoryAdaptationResult> {
  const db = getDb()
  const recentRR = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const olderRR = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 30), daysBefore(date, 7))
  const recentSpo2 = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const olderSpo2 = await fetchMetric(db, userId, "spo2", daysBefore(date, 30), daysBefore(date, 7))
  const recentRRVals = recentRR.map((r: any) => Number(r.value))
  const olderRRVals = olderRR.map((r: any) => Number(r.value))
  const recentSpO2Vals = recentSpo2.map((r: any) => Number(r.value))
  const olderSpO2Vals = olderSpo2.map((r: any) => Number(r.value))
  const rrImprovement = mean(olderRRVals) - mean(recentRRVals)
  const spo2Improvement = mean(recentSpO2Vals) - mean(olderSpO2Vals)
  const shortTermAdaptation = clamp(50 + rrImprovement * 5 + spo2Improvement * 10, 0, 100)
  const longTermAdaptation = clamp(50 + slope(recentRRVals) * -20 + slope(recentSpO2Vals.map(Number)) * 30, 0, 100)
  const resilienceIndex = clamp(stddev(recentRRVals) < stddev(olderRRVals) ? 70 + (stddev(olderRRVals) - stddev(recentRRVals)) * 10 : 50, 0, 100)
  const adaptationScore = (shortTermAdaptation + longTermAdaptation + resilienceIndex) / 3
  return {
    adaptationScore,
    shortTermAdaptation,
    longTermAdaptation,
    resilienceIndex,
    classification: adaptationScore > 65 ? "well_adapted" : adaptationScore > 40 ? "adapting" : "maladapted",
  }
}

// ---------------------------------------------------------------------------
// 40. computeAirwayResistanceProxy
// ---------------------------------------------------------------------------

export interface AirwayResistanceProxyResult {
  resistanceIndex: number
  estimatedRaw: number
  conductanceProxy: number
  classification: "low_resistance" | "normal" | "elevated" | "high_resistance"
}

export async function computeAirwayResistanceProxy(userId: string, date: Date = new Date()): Promise<AirwayResistanceProxyResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 14), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 14), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const rrSD = stddev(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const estimatedRaw = clamp(2.0 + (avgRR - 15) * 0.3 + rrSD * 0.2 + (96 - avgSpO2) * 0.1, 0.5, 10.0)
  const conductanceProxy = estimatedRaw > 0 ? 1 / estimatedRaw : 0
  const resistanceIndex = clamp((estimatedRaw - 1.5) * 20, 0, 100)
  let classification: AirwayResistanceProxyResult["classification"] = "normal"
  if (resistanceIndex > 70) classification = "high_resistance"
  else if (resistanceIndex > 40) classification = "elevated"
  else if (resistanceIndex < 10) classification = "low_resistance"
  return { resistanceIndex, estimatedRaw, conductanceProxy, classification }
}

// ---------------------------------------------------------------------------
// 41. analyzeRespiratoryRateVariability
// ---------------------------------------------------------------------------

export interface RespiratoryRateVariabilityResult {
  rrv: number
  sdnn: number
  rmssd: number
  pnn50: number
  complexityIndex: number
  classification: "low" | "normal" | "high"
}

export async function analyzeRespiratoryRateVariability(userId: string, date: Date = new Date()): Promise<RespiratoryRateVariabilityResult> {
  const db = getDb()
  const rows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 3), date)
  const vals = rows.map((r: any) => Number(r.value))
  const sdnn = stddev(vals)
  let rmssd = 0
  let pnn50 = 0
  if (vals.length > 1) {
    const diffs = vals.slice(1).map((v, i) => v - vals[i])
    rmssd = Math.sqrt(mean(diffs.map(d => d ** 2)))
    pnn50 = (diffs.filter(d => Math.abs(d) > 0.5).length / diffs.length) * 100
  }
  const rrv = sdnn + rmssd * 0.5
  const complexityIndex = clamp(pnn50 * 0.5 + sdnn * 5, 0, 100)
  return {
    rrv,
    sdnn,
    rmssd,
    pnn50,
    complexityIndex,
    classification: rrv > 5 ? "high" : rrv > 2 ? "normal" : "low",
  }
}

// ---------------------------------------------------------------------------
// 42. computeAlveolarOxygenPressure
// ---------------------------------------------------------------------------

export interface AlveolarOxygenPressureResult {
  estimatedPAO2: number
  estimatedFiO2: number
  alveolarVentilationProxy: number
  classification: "normal" | "mildly_reduced" | "moderately_reduced" | "severely_reduced"
}

export async function computeAlveolarOxygenPressure(userId: string, date: Date = new Date()): Promise<AlveolarOxygenPressureResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 7), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 7), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const estimatedFiO2 = 0.21
  const patm = 760
  const ph2o = 47
  const estimatedPaCO2 = clamp(40 + (15 - avgRR) * 1.2, 25, 70)
  const estimatedPAO2 = estimatedFiO2 * (patm - ph2o) - estimatedPaCO2 / 0.8
  const alveolarVentilationProxy = clamp(avgRR * 0.35, 2, 12)
  let classification: AlveolarOxygenPressureResult["classification"] = "normal"
  if (estimatedPAO2 < 60) classification = "severely_reduced"
  else if (estimatedPAO2 < 80) classification = "moderately_reduced"
  else if (estimatedPAO2 < 95) classification = "mildly_reduced"
  return { estimatedPAO2, estimatedFiO2, alveolarVentilationProxy, classification }
}

// ---------------------------------------------------------------------------
// 43. computeRespiratoryCoherence
// ---------------------------------------------------------------------------

export interface RespiratoryCoherenceResult {
  coherenceScore: number
  breathingRegularity: number
  cardioRespiratorySync: number
  classification: "high_coherence" | "moderate_coherence" | "low_coherence"
}

export async function computeRespiratoryCoherence(userId: string, date: Date = new Date()): Promise<RespiratoryCoherenceResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 3), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 3), date)
  const rrVals = rrRows.map((r: any) => Number(r.value))
  const hrVals = hrRows.map((r: any) => Number(r.value))
  const rrCV = mean(rrVals) > 0 ? stddev(rrVals) / mean(rrVals) : 0
  const breathingRegularity = clamp(100 - rrCV * 200, 0, 100)
  const minLen = Math.min(rrVals.length, hrVals.length)
  let cardioRespiratorySync = 50
  if (minLen > 2) {
    const rrNorm = rrVals.slice(0, minLen).map(v => v / (mean(rrVals) || 1))
    const hrNorm = hrVals.slice(0, minLen).map(v => v / (mean(hrVals) || 1))
    const correlation = mean(rrNorm.map((v, i) => v * hrNorm[i])) - mean(rrNorm) * mean(hrNorm)
    cardioRespiratorySync = clamp(50 + correlation * 100, 0, 100)
  }
  const coherenceScore = (breathingRegularity + cardioRespiratorySync) / 2
  return {
    coherenceScore,
    breathingRegularity,
    cardioRespiratorySync,
    classification: coherenceScore > 70 ? "high_coherence" : coherenceScore > 40 ? "moderate_coherence" : "low_coherence",
  }
}

// ---------------------------------------------------------------------------
// 44. computeDiaphragmaticFunction
// ---------------------------------------------------------------------------

export interface DiaphragmaticFunctionResult {
  functionIndex: number
  excursionProxy: number
  strengthProxy: number
  classification: "normal" | "mildly_impaired" | "moderately_impaired" | "severely_impaired"
}

export async function computeDiaphragmaticFunction(userId: string, date: Date = new Date()): Promise<DiaphragmaticFunctionResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 14), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 14), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 14), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const excursionProxy = clamp(6.0 - (avgRR - 14) * 0.15 - (avgHR - 70) * 0.02, 1.0, 8.0)
  const strengthProxy = clamp(100 - (avgRR - 14) * 3 - (96 - avgSpO2) * 5, 20, 100)
  const functionIndex = (excursionProxy / 8.0) * 50 + (strengthProxy / 100) * 50
  let classification: DiaphragmaticFunctionResult["classification"] = "normal"
  if (functionIndex < 30) classification = "severely_impaired"
  else if (functionIndex < 50) classification = "moderately_impaired"
  else if (functionIndex < 70) classification = "mildly_impaired"
  return { functionIndex, excursionProxy, strengthProxy, classification }
}

// ---------------------------------------------------------------------------
// 45. computeRespiratoryResilience
// ---------------------------------------------------------------------------

export interface RespiratoryResilienceResult {
  resilienceScore: number
  stressResponseQuality: number
  recoveryCapacity: number
  baselineStability: number
  classification: "resilient" | "moderate" | "fragile"
}

export async function computeRespiratoryResilience(userId: string, date: Date = new Date()): Promise<RespiratoryResilienceResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 14), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 14), date)
  const rrVals = rrRows.map((r: any) => Number(r.value))
  const spo2Vals = spo2Rows.map((r: any) => Number(r.value))
  const peakRR = rrVals.length ? Math.max(...rrVals) : 15
  const baseRR = rrVals.length ? percentile(rrVals, 25) : 15
  const stressResponseQuality = clamp(100 - (peakRR - baseRR) * 3, 0, 100)
  const spo2Range = spo2Vals.length ? Math.max(...spo2Vals) - Math.min(...spo2Vals) : 0
  const recoveryCapacity = clamp(100 - spo2Range * 5, 0, 100)
  const baselineStability = clamp(100 - stddev(rrVals) * 10, 0, 100)
  const resilienceScore = (stressResponseQuality * 0.4 + recoveryCapacity * 0.3 + baselineStability * 0.3)
  return {
    resilienceScore,
    stressResponseQuality,
    recoveryCapacity,
    baselineStability,
    classification: resilienceScore > 70 ? "resilient" : resilienceScore > 40 ? "moderate" : "fragile",
  }
}

// ---------------------------------------------------------------------------
// 46. analyzeAirQualityImpactResp
// ---------------------------------------------------------------------------

export interface AirQualityImpactRespResult {
  impactScore: number
  respiratoryRateImpact: number
  oxygenationImpact: number
  sensitivityIndex: number
  classification: "no_impact" | "mild_impact" | "moderate_impact" | "significant_impact"
}

export async function analyzeAirQualityImpactResp(userId: string, date: Date = new Date()): Promise<AirQualityImpactRespResult> {
  const db = getDb()
  const aqRows = await fetchMetric(db, userId, "air_quality_index", daysBefore(date, 14), date)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 14), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 14), date)
  const avgAQ = mean(aqRows.map((r: any) => Number(r.value)))
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const respiratoryRateImpact = clamp((avgAQ - 50) * 0.3, 0, 30)
  const oxygenationImpact = clamp((avgAQ - 50) * 0.2 + (96 - avgSpO2) * 2, 0, 30)
  const sensitivityIndex = clamp((avgRR - 14) * 5 + (avgAQ - 50) * 0.5, 0, 100)
  const impactScore = clamp(respiratoryRateImpact + oxygenationImpact + sensitivityIndex * 0.4, 0, 100)
  let classification: AirQualityImpactRespResult["classification"] = "no_impact"
  if (impactScore > 65) classification = "significant_impact"
  else if (impactScore > 40) classification = "moderate_impact"
  else if (impactScore > 20) classification = "mild_impact"
  return { impactScore, respiratoryRateImpact, oxygenationImpact, sensitivityIndex, classification }
}

// ---------------------------------------------------------------------------
// 47. computeLungAgeEstimation
// ---------------------------------------------------------------------------

export interface LungAgeEstimationResult {
  estimatedLungAge: number
  lungAgeDelta: number
  primaryFactors: string[]
  classification: "younger_than_actual" | "age_appropriate" | "older_than_actual"
}

export async function computeLungAgeEstimation(userId: string, date: Date = new Date()): Promise<LungAgeEstimationResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 30), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 30), date)
  const ageRows = await fetchMetric(db, userId, "age", daysBefore(date, 365), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const chronologicalAge = ageRows.length ? Number(ageRows[ageRows.length - 1].value) : 40
  const factors: string[] = []
  let ageDelta = 0
  if (avgRR > 18) { ageDelta += (avgRR - 18) * 2; factors.push("elevated_respiratory_rate") }
  if (avgRR < 12) { ageDelta -= (12 - avgRR) * 1.5; factors.push("low_respiratory_rate") }
  if (avgSpO2 < 95) { ageDelta += (95 - avgSpO2) * 3; factors.push("reduced_oxygenation") }
  if (avgSpO2 > 97) { ageDelta -= 2; factors.push("excellent_oxygenation") }
  const estimatedLungAge = clamp(chronologicalAge + ageDelta, 15, 120)
  return {
    estimatedLungAge,
    lungAgeDelta: ageDelta,
    primaryFactors: factors,
    classification: ageDelta < -3 ? "younger_than_actual" : ageDelta > 3 ? "older_than_actual" : "age_appropriate",
  }
}

// ---------------------------------------------------------------------------
// 48. assessRespiratoryInfectionRisk
// ---------------------------------------------------------------------------

export interface RespiratoryInfectionRiskResult {
  riskScore: number
  riskLevel: "low" | "moderate" | "high" | "critical"
  earlyWarningSignals: string[]
  trendAnalysis: { rrTrend: number; spo2Trend: number; hrTrend: number }
  recommendation: string
}

export async function assessRespiratoryInfectionRisk(userId: string, date: Date = new Date()): Promise<RespiratoryInfectionRiskResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 5), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 5), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 5), date)
  const tempRows = await fetchMetric(db, userId, "body_temperature", daysBefore(date, 5), date)
  const rrVals = rrRows.map((r: any) => Number(r.value))
  const spo2Vals = spo2Rows.map((r: any) => Number(r.value))
  const hrVals = hrRows.map((r: any) => Number(r.value))
  const tempVals = tempRows.map((r: any) => Number(r.value))
  const signals: string[] = []
  let score = 0
  const rrTrend = slope(rrVals)
  const spo2Trend = slope(spo2Vals)
  const hrTrend = slope(hrVals)
  if (rrTrend > 0.5) { score += 20; signals.push("increasing_respiratory_rate") }
  if (spo2Trend < -0.1) { score += 20; signals.push("declining_oxygen_saturation") }
  if (hrTrend > 0.5) { score += 15; signals.push("rising_heart_rate") }
  if (tempVals.length && mean(tempVals) > 37.5) { score += 25; signals.push("elevated_temperature") }
  if (mean(rrVals) > 20) { score += 10; signals.push("tachypnea") }
  if (mean(spo2Vals) < 94) { score += 10; signals.push("hypoxemia") }
  score = clamp(score, 0, 100)
  return {
    riskScore: score,
    riskLevel: score > 70 ? "critical" : score > 50 ? "high" : score > 25 ? "moderate" : "low",
    earlyWarningSignals: signals,
    trendAnalysis: { rrTrend, spo2Trend, hrTrend },
    recommendation: score > 50 ? "Seek medical evaluation — possible respiratory infection" : "Continue monitoring; maintain good hygiene",
  }
}

// ---------------------------------------------------------------------------
// 49. computeDyspneaIndex
// ---------------------------------------------------------------------------

export interface DyspneaIndexResult {
  dyspneaScore: number
  perceivedEffort: number
  ventilationDemand: number
  ventilationCapacity: number
  classification: "none" | "mild" | "moderate" | "severe" | "very_severe"
}

export async function computeDyspneaIndex(userId: string, date: Date = new Date()): Promise<DyspneaIndexResult> {
  const db = getDb()
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", daysBefore(date, 3), date)
  const hrRows = await fetchMetric(db, userId, "heart_rate", daysBefore(date, 3), date)
  const spo2Rows = await fetchMetric(db, userId, "spo2", daysBefore(date, 3), date)
  const avgRR = mean(rrRows.map((r: any) => Number(r.value)))
  const avgHR = mean(hrRows.map((r: any) => Number(r.value)))
  const avgSpO2 = mean(spo2Rows.map((r: any) => Number(r.value)))
  const ventilationDemand = clamp(avgRR * avgHR / 100, 5, 50)
  const ventilationCapacity = clamp(avgSpO2 * 0.8, 50, 85)
  const perceivedEffort = clamp((ventilationDemand / ventilationCapacity) * 50, 0, 100)
  const dyspneaScore = clamp(perceivedEffort + (100 - avgSpO2) * 2 + (avgRR - 15) * 1.5, 0, 100)
  let classification: DyspneaIndexResult["classification"] = "none"
  if (dyspneaScore > 80) classification = "very_severe"
  else if (dyspneaScore > 60) classification = "severe"
  else if (dyspneaScore > 40) classification = "moderate"
  else if (dyspneaScore > 20) classification = "mild"
  return { dyspneaScore, perceivedEffort, ventilationDemand, ventilationCapacity, classification }
}

// ---------------------------------------------------------------------------
// 50. assessExerciseInducedBronchoconstriction
// ---------------------------------------------------------------------------

export interface ExerciseInducedBronchoconstrictionResult {
  eibScore: number
  preExerciseRR: number
  postExerciseRR: number
  rrChangePercent: number
  spo2Drop: number
  classification: "negative" | "borderline" | "positive"
  recommendation: string
}

export async function assessExerciseInducedBronchoconstriction(userId: string, date: Date = new Date()): Promise<ExerciseInducedBronchoconstrictionResult> {
  const db = getDb()
  const preRows = await fetchMetric(db, userId, "respiratory_rate", hoursBefore(date, 4), hoursBefore(date, 2))
  const postRows = await fetchMetric(db, userId, "respiratory_rate", hoursBefore(date, 2), date)
  const preSpo2 = await fetchMetric(db, userId, "spo2", hoursBefore(date, 4), hoursBefore(date, 2))
  const postSpo2 = await fetchMetric(db, userId, "spo2", hoursBefore(date, 2), date)
  const preRR = mean(preRows.map((r: any) => Number(r.value)))
  const postRR = mean(postRows.map((r: any) => Number(r.value)))
  const preSpO2 = mean(preSpo2.map((r: any) => Number(r.value)))
  const postSpO2 = mean(postSpo2.map((r: any) => Number(r.value)))
  const rrChange = preRR > 0 ? ((postRR - preRR) / preRR) * 100 : 0
  const spo2Drop = preSpO2 - postSpO2
  const eibScore = clamp(rrChange * 1.5 + spo2Drop * 5, 0, 100)
  let classification: ExerciseInducedBronchoconstrictionResult["classification"] = "negative"
  if (eibScore > 50 || rrChange > 25) classification = "positive"
  else if (eibScore > 25 || rrChange > 15) classification = "borderline"
  return {
    eibScore,
    preExerciseRR: preRR,
    postExerciseRR: postRR,
    rrChangePercent: rrChange,
    spo2Drop,
    classification,
    recommendation: classification === "positive"
      ? "Consider pre-exercise bronchodilator use and consult a physician"
      : classification === "borderline"
        ? "Monitor symptoms during exercise; consider formal challenge testing"
        : "No evidence of exercise-induced bronchoconstriction",
  }
}
