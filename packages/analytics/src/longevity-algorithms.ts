import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, asc, sql } from "drizzle-orm"

// ── Shared helpers ──────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

function linearSlope(values: number[]): number {
  if (values.length < 2) return 0
  const n = values.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]!; sumXY += i * values[i]!; sumX2 += i * i
  }
  const denom = n * sumX2 - sumX * sumX
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
}

function latestValue(data: Array<{ value: number }> | undefined): number | null {
  if (!data || data.length === 0) return null
  return data[data.length - 1]!.value
}

function chronoAge(birthYear: number | undefined, ref: Date): number {
  if (!birthYear) return 50
  return ref.getFullYear() - birthYear
}

type MetricMap = Map<string, Array<{ value: number; recordedAt: Date }>>

async function queryMetrics(
  userId: string,
  start: Date,
  end: Date,
): Promise<MetricMap> {
  const db = getDb()
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
        lte(healthMetrics.recordedAt, end),
      ),
    )
    .orderBy(asc(healthMetrics.recordedAt))

  const byType: MetricMap = new Map()
  for (const r of rows) {
    if (r.value == null) continue
    const arr = byType.get(r.metricType) ?? []
    arr.push({ value: r.value, recordedAt: new Date(r.recordedAt) })
    byType.set(r.metricType, arr)
  }
  return byType
}

function vals(m: MetricMap, key: string): number[] {
  return (m.get(key) ?? []).map((d) => d.value)
}

// ── 1. computeBiologicalAge ─────────────────────────────────────────────────

export interface BiologicalAgeResult {
  biologicalAge: number
  chronologicalAge: number
  ageDelta: number
  components: Record<string, { value: number | null; ageContribution: number }>
  confidence: number
  date: string
}

export async function computeBiologicalAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<BiologicalAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const rhr = latestValue(byType.get("resting_heart_rate"))
  const hrv = latestValue(byType.get("hrv"))
  const spo2 = latestValue(byType.get("blood_oxygen"))
  const bp = latestValue(byType.get("blood_pressure"))
  const bf = latestValue(byType.get("body_fat"))
  const vo2 = latestValue(byType.get("vo2max"))
  const stepsAvg = mean(vals(byType, "steps"))
  const sleepAvg = mean(vals(byType, "sleep_duration"))

  const components: BiologicalAgeResult["components"] = {}
  let totalW = 0
  let weightedAge = 0

  const add = (name: string, val: number | null, offset: (v: number) => number, w: number) => {
    if (val == null) { components[name] = { value: null, ageContribution: 0 }; return }
    const contrib = offset(val)
    components[name] = { value: round1(val), ageContribution: round1(contrib) }
    weightedAge += (age + contrib) * w
    totalW += w
  }

  add("restingHeartRate", rhr, (v) => (v - 65) * 0.3, 0.15)
  add("hrv", hrv, (v) => (50 - v) * 0.2, 0.18)
  add("bloodOxygen", spo2, (v) => (97 - v) * 1.5, 0.08)
  add("bloodPressure", bp, (v) => (v - 120) * 0.15, 0.12)
  add("bodyFat", bf, (v) => (v - 22) * 0.25, 0.1)
  add("vo2max", vo2, (v) => (40 - v) * 0.35, 0.15)
  add("dailySteps", stepsAvg > 0 ? stepsAvg : null, (v) => (8000 - v) / 1000, 0.12)
  add("sleepDuration", sleepAvg > 0 ? sleepAvg : null, (v) => Math.abs(v - 7.5) * 0.8, 0.1)

  const bioAge = totalW > 0 ? round1(weightedAge / totalW) : age
  return {
    biologicalAge: bioAge,
    chronologicalAge: age,
    ageDelta: round1(bioAge - age),
    components,
    confidence: round1(clamp(totalW / 1.0, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 2. assessHealthSpan ─────────────────────────────────────────────────────

export interface HealthSpanResult {
  healthSpanScore: number
  estimatedHealthyYears: number
  optimizationPotential: number
  pillars: Record<string, number>
  confidence: number
  date: string
}

export async function assessHealthSpan(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<HealthSpanResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const stepsAvg = mean(vals(byType, "steps"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const deepAvg = mean(vals(byType, "deep_sleep"))
  const rhr = mean(vals(byType, "resting_heart_rate"))
  const hrvAvg = mean(vals(byType, "hrv"))
  const stressAvg = mean(vals(byType, "stress"))
  const bfVals = vals(byType, "body_fat")
  const bf = bfVals.length > 0 ? mean(bfVals) : null

  const activity = clamp(((stepsAvg / 10000) * 50 + (activeAvg / 60) * 50), 0, 100)
  const sleep = clamp(sleepAvg > 0 ? 100 - Math.abs(sleepAvg - 7.5) * 15 - (deepAvg < 1.5 ? 15 : 0) : 40, 0, 100)
  const cardio = clamp(rhr > 0 ? 100 - (rhr - 55) * 1.5 + (hrvAvg > 0 ? (hrvAvg - 30) * 0.5 : 0) : 50, 0, 100)
  const stressPillar = clamp(stressAvg > 0 ? 100 - stressAvg * 1.2 : 50, 0, 100)
  const body = bf != null ? clamp(100 - Math.abs(bf - 20) * 2.5, 0, 100) : 50

  const pillars = {
    activity: round1(activity),
    sleep: round1(sleep),
    cardiovascular: round1(cardio),
    stress: round1(stressPillar),
    bodyComposition: round1(body),
  }

  const score = round1(
    activity * 0.25 + sleep * 0.2 + cardio * 0.25 + stressPillar * 0.15 + body * 0.15,
  )
  const baseYears = age < 40 ? 45 : age < 60 ? 30 : 20
  const estimated = round1(baseYears * (score / 100))
  const potential = round1(baseYears - estimated)

  return {
    healthSpanScore: score,
    estimatedHealthyYears: estimated,
    optimizationPotential: potential,
    pillars,
    confidence: round1(clamp(byType.size / 10, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 3. computeAllostaticLoad ────────────────────────────────────────────────

export interface AllostaticLoadResult {
  loadIndex: number
  riskLevel: string
  markers: Record<string, { value: number | null; aboveThreshold: boolean }>
  confidence: number
  date: string
}

export async function computeAllostaticLoad(
  userId: string,
  date?: Date,
): Promise<AllostaticLoadResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const thresholds: Array<[string, string, number, boolean]> = [
    ["resting_heart_rate", "restingHR", 75, true],
    ["blood_pressure", "bloodPressure", 130, true],
    ["body_fat", "bodyFat", 30, true],
    ["hrv", "hrv", 30, false],
    ["stress", "stress", 60, true],
    ["sleep_duration", "sleepDeficit", 6, false],
    ["blood_oxygen", "bloodOxygen", 95, false],
    ["respiratory_rate", "respiratoryRate", 20, true],
  ]

  const markers: AllostaticLoadResult["markers"] = {}
  let count = 0
  let available = 0

  for (const [metric, label, thresh, aboveIsBad] of thresholds) {
    const v = vals(byType, metric)
    if (v.length === 0) { markers[label] = { value: null, aboveThreshold: false }; continue }
    available++
    const avg = mean(v)
    const bad = aboveIsBad ? avg > thresh : avg < thresh
    if (bad) count++
    markers[label] = { value: round1(avg), aboveThreshold: bad }
  }

  const loadIndex = round1((count / Math.max(available, 1)) * 10)
  const riskLevel = loadIndex <= 2 ? "low" : loadIndex <= 5 ? "moderate" : loadIndex <= 7 ? "high" : "very_high"

  return {
    loadIndex,
    riskLevel,
    markers,
    confidence: round1(clamp(available / 8, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 4. analyzeAgingRate ─────────────────────────────────────────────────────

export interface AgingRateResult {
  agingRate: number
  trend: string
  dominantFactors: string[]
  components: Record<string, number>
  confidence: number
  date: string
}

export async function analyzeAgingRate(
  userId: string,
  date?: Date,
): Promise<AgingRateResult> {
  const targetDate = date ?? new Date()
  const start90 = new Date(targetDate.getTime() - 90 * 86400000)
  const byType = await queryMetrics(userId, start90, targetDate)

  const factors: Record<string, number> = {}
  const dominant: string[] = []

  const assess = (key: string, label: string, idealSlope: number) => {
    const v = vals(byType, key)
    if (v.length < 5) return
    const slope = linearSlope(v)
    const delta = idealSlope >= 0 ? slope - idealSlope : idealSlope - slope
    factors[label] = round1(delta * 100)
    if (Math.abs(delta) > 0.05) dominant.push(label)
  }

  assess("resting_heart_rate", "restingHR", 0)
  assess("hrv", "hrv", 0)
  assess("blood_oxygen", "bloodOxygen", 0)
  assess("steps", "activityLevel", 0)
  assess("sleep_duration", "sleepDuration", 0)
  assess("body_fat", "bodyFat", 0)
  assess("stress", "stress", 0)
  assess("vo2max", "vo2max", 0)

  const rates = Object.values(factors)
  const avgRate = rates.length > 0 ? mean(rates) : 0
  const agingRate = round1(1.0 + avgRate * 0.01)
  const trend = agingRate < 0.95 ? "decelerating" : agingRate > 1.05 ? "accelerating" : "normal"

  return {
    agingRate: clamp(agingRate, 0.5, 2.0),
    trend,
    dominantFactors: dominant.slice(0, 5),
    components: factors,
    confidence: round1(clamp(rates.length / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 5. computeTelomereLengthProxy ───────────────────────────────────────────

export interface TelomereProxyResult {
  estimatedPercentile: number
  protectiveFactors: string[]
  riskFactors: string[]
  score: number
  confidence: number
  date: string
}

export async function computeTelomereLengthProxy(
  userId: string,
  date?: Date,
): Promise<TelomereProxyResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const protective: string[] = []
  const risk: string[] = []
  let score = 50

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 7500) { score += 10; protective.push("high_activity") }
  else if (stepsAvg < 4000 && stepsAvg > 0) { score -= 10; risk.push("low_activity") }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 0 && stressAvg < 40) { score += 8; protective.push("low_stress") }
  else if (stressAvg > 65) { score -= 12; risk.push("high_chronic_stress") }

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg >= 7 && sleepAvg <= 8.5) { score += 8; protective.push("optimal_sleep") }
  else if (sleepAvg > 0 && sleepAvg < 6) { score -= 10; risk.push("sleep_deficit") }

  const bfAvg = mean(vals(byType, "body_fat"))
  if (bfAvg > 0 && bfAvg < 25) { score += 5; protective.push("healthy_body_composition") }
  else if (bfAvg > 35) { score -= 8; risk.push("high_body_fat") }

  const hrvAvg = mean(vals(byType, "hrv"))
  if (hrvAvg > 50) { score += 7; protective.push("high_hrv") }
  else if (hrvAvg > 0 && hrvAvg < 25) { score -= 7; risk.push("low_hrv") }

  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 1.5) { score += 5; protective.push("good_deep_sleep") }

  score = clamp(score, 0, 100)
  return {
    estimatedPercentile: round1(score),
    protectiveFactors: protective,
    riskFactors: risk,
    score: round1(score),
    confidence: round1(clamp(byType.size / 8, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 6. assessFrailtyPhenotype ───────────────────────────────────────────────

export interface FrailtyResult {
  frailtyScore: number
  phenotype: "robust" | "pre_frail" | "frail"
  criteria: Record<string, { met: boolean; value: number | null }>
  confidence: number
  date: string
}

export async function assessFrailtyPhenotype(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<FrailtyResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const criteria: FrailtyResult["criteria"] = {}
  let score = 0

  const stepsAvg = mean(vals(byType, "steps"))
  const lowActivity = stepsAvg > 0 && stepsAvg < 3000
  criteria.lowActivity = { met: lowActivity, value: stepsAvg > 0 ? round1(stepsAvg) : null }
  if (lowActivity) score++

  const activeAvg = mean(vals(byType, "active_minutes"))
  const exhaustion = activeAvg > 0 && activeAvg < 15
  criteria.exhaustion = { met: exhaustion, value: activeAvg > 0 ? round1(activeAvg) : null }
  if (exhaustion) score++

  const rhr = mean(vals(byType, "resting_heart_rate"))
  const weakness = rhr > 80
  criteria.weakness = { met: weakness, value: rhr > 0 ? round1(rhr) : null }
  if (weakness) score++

  const weightVals = vals(byType, "weight")
  const weightLoss = weightVals.length >= 5 && linearSlope(weightVals) < -0.05
  criteria.weightLoss = { met: weightLoss, value: weightVals.length > 0 ? round1(linearSlope(weightVals)) : null }
  if (weightLoss) score++

  const slowness = stepsAvg > 0 && stepsAvg / Math.max(activeAvg, 1) < 60
  criteria.slowness = { met: slowness, value: activeAvg > 0 ? round1(stepsAvg / activeAvg) : null }
  if (slowness) score++

  const phenotype = score <= 1 ? "robust" : score <= 2 ? "pre_frail" : "frail"
  return {
    frailtyScore: score,
    phenotype,
    criteria,
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 7. computeInflammagingIndex ─────────────────────────────────────────────

export interface InflammagingResult {
  index: number
  inflammatoryBurden: number
  antiInflammatoryFactors: string[]
  markers: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeInflammagingIndex(
  userId: string,
  date?: Date,
): Promise<InflammagingResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  let burden = 0
  const anti: string[] = []
  const markers: Record<string, number | null> = {}

  const rhr = mean(vals(byType, "resting_heart_rate"))
  markers.restingHR = rhr > 0 ? round1(rhr) : null
  if (rhr > 75) burden += (rhr - 75) * 0.5
  else if (rhr > 0 && rhr < 65) anti.push("low_resting_hr")

  const hrvAvg = mean(vals(byType, "hrv"))
  markers.hrv = hrvAvg > 0 ? round1(hrvAvg) : null
  if (hrvAvg > 0 && hrvAvg < 30) burden += (30 - hrvAvg) * 0.4
  else if (hrvAvg > 50) anti.push("high_hrv")

  const stressAvg = mean(vals(byType, "stress"))
  markers.stress = stressAvg > 0 ? round1(stressAvg) : null
  if (stressAvg > 60) burden += (stressAvg - 60) * 0.3
  else if (stressAvg > 0 && stressAvg < 30) anti.push("low_stress")

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  markers.sleepDuration = sleepAvg > 0 ? round1(sleepAvg) : null
  if (sleepAvg > 0 && sleepAvg < 6) burden += (6 - sleepAvg) * 3
  else if (sleepAvg >= 7) anti.push("adequate_sleep")

  const bfAvg = mean(vals(byType, "body_fat"))
  markers.bodyFat = bfAvg > 0 ? round1(bfAvg) : null
  if (bfAvg > 30) burden += (bfAvg - 30) * 0.3
  else if (bfAvg > 0 && bfAvg < 25) anti.push("healthy_body_fat")

  const stepsAvg = mean(vals(byType, "steps"))
  markers.dailySteps = stepsAvg > 0 ? round1(stepsAvg) : null
  if (stepsAvg > 8000) anti.push("high_activity")
  else if (stepsAvg > 0 && stepsAvg < 4000) burden += 5

  const index = round1(clamp(burden, 0, 100))
  return {
    index,
    inflammatoryBurden: round1(burden),
    antiInflammatoryFactors: anti,
    markers,
    confidence: round1(clamp(byType.size / 8, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 8. analyzeEpigeneticAgeProxy ────────────────────────────────────────────

export interface EpigeneticAgeResult {
  estimatedEpiAge: number
  acceleration: number
  chronologicalAge: number
  contributors: Record<string, number>
  confidence: number
  date: string
}

export async function analyzeEpigeneticAgeProxy(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<EpigeneticAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 60 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const contributors: Record<string, number> = {}
  let offset = 0
  let count = 0

  const rhr = mean(vals(byType, "resting_heart_rate"))
  if (rhr > 0) { const d = (rhr - 65) * 0.25; contributors.restingHR = round1(d); offset += d; count++ }

  const hrvAvg = mean(vals(byType, "hrv"))
  if (hrvAvg > 0) { const d = (45 - hrvAvg) * 0.2; contributors.hrv = round1(d); offset += d; count++ }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 0) { const d = (stressAvg - 40) * 0.15; contributors.stress = round1(d); offset += d; count++ }

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg > 0) { const d = Math.abs(sleepAvg - 7.5) * 1.2; contributors.sleep = round1(d); offset += d; count++ }

  const bfAvg = mean(vals(byType, "body_fat"))
  if (bfAvg > 0) { const d = (bfAvg - 22) * 0.2; contributors.bodyFat = round1(d); offset += d; count++ }

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 0) { const d = (8000 - stepsAvg) / 2000; contributors.activity = round1(d); offset += d; count++ }

  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 0) { const d = (1.5 - deepAvg) * 2; contributors.deepSleep = round1(d); offset += d; count++ }

  const epiAge = round1(age + offset)
  return {
    estimatedEpiAge: epiAge,
    acceleration: round1(offset),
    chronologicalAge: age,
    contributors,
    confidence: round1(clamp(count / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 9. computePhysiologicalReserve ──────────────────────────────────────────

export interface PhysiologicalReserveResult {
  reserveCapacity: number
  organReserves: Record<string, number>
  declineRate: number
  confidence: number
  date: string
}

export async function computePhysiologicalReserve(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<PhysiologicalReserveResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const organReserves: Record<string, number> = {}

  const vo2 = mean(vals(byType, "vo2max"))
  organReserves.aerobic = vo2 > 0 ? round1(clamp((vo2 / 60) * 100, 0, 100)) : 50

  const rhr = mean(vals(byType, "resting_heart_rate"))
  const maxHR = 220 - age
  organReserves.cardiac = rhr > 0 ? round1(clamp(((maxHR - rhr) / maxHR) * 100, 0, 100)) : 50

  const spo2 = mean(vals(byType, "blood_oxygen"))
  organReserves.pulmonary = spo2 > 0 ? round1(clamp((spo2 - 90) * 10, 0, 100)) : 50

  const hrvAvg = mean(vals(byType, "hrv"))
  organReserves.autonomic = hrvAvg > 0 ? round1(clamp((hrvAvg / 80) * 100, 0, 100)) : 50

  const stepsAvg = mean(vals(byType, "steps"))
  organReserves.musculoskeletal = stepsAvg > 0 ? round1(clamp((stepsAvg / 12000) * 100, 0, 100)) : 50

  const reserveVals = Object.values(organReserves)
  const capacity = round1(mean(reserveVals))

  const start90 = new Date(targetDate.getTime() - 90 * 86400000)
  const byType90 = await queryMetrics(userId, start90, targetDate)
  const vo2Trend = linearSlope(vals(byType90, "vo2max"))
  const stepsTrend = linearSlope(vals(byType90, "steps"))
  const declineRate = round1((vo2Trend * -1 + stepsTrend * -0.001) / 2)

  return {
    reserveCapacity: capacity,
    organReserves,
    declineRate,
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 10. assessMortalityRiskIndex ────────────────────────────────────────────

export interface MortalityRiskResult {
  riskScore: number
  riskCategory: string
  modifiableFactors: string[]
  markers: Record<string, { value: number | null; riskContribution: number }>
  confidence: number
  date: string
}

export async function assessMortalityRiskIndex(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<MortalityRiskResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const markers: MortalityRiskResult["markers"] = {}
  const modifiable: string[] = []
  let riskTotal = 0

  const rhr = mean(vals(byType, "resting_heart_rate"))
  const rhrRisk = rhr > 76 ? (rhr - 76) * 0.8 : 0
  markers.restingHR = { value: rhr > 0 ? round1(rhr) : null, riskContribution: round1(rhrRisk) }
  if (rhrRisk > 0) { riskTotal += rhrRisk; modifiable.push("reduce_resting_heart_rate") }

  const hrvAvg = mean(vals(byType, "hrv"))
  const hrvRisk = hrvAvg > 0 && hrvAvg < 30 ? (30 - hrvAvg) * 0.6 : 0
  markers.hrv = { value: hrvAvg > 0 ? round1(hrvAvg) : null, riskContribution: round1(hrvRisk) }
  if (hrvRisk > 0) { riskTotal += hrvRisk; modifiable.push("improve_hrv") }

  const vo2 = mean(vals(byType, "vo2max"))
  const vo2Risk = vo2 > 0 && vo2 < 30 ? (30 - vo2) * 1.0 : 0
  markers.vo2max = { value: vo2 > 0 ? round1(vo2) : null, riskContribution: round1(vo2Risk) }
  if (vo2Risk > 0) { riskTotal += vo2Risk; modifiable.push("increase_cardiorespiratory_fitness") }

  const stepsAvg = mean(vals(byType, "steps"))
  const stepsRisk = stepsAvg > 0 && stepsAvg < 4000 ? (4000 - stepsAvg) / 200 : 0
  markers.dailySteps = { value: stepsAvg > 0 ? round1(stepsAvg) : null, riskContribution: round1(stepsRisk) }
  if (stepsRisk > 0) { riskTotal += stepsRisk; modifiable.push("increase_daily_movement") }

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const sleepRisk = sleepAvg > 0 ? (sleepAvg < 6 ? (6 - sleepAvg) * 4 : sleepAvg > 9 ? (sleepAvg - 9) * 3 : 0) : 0
  markers.sleepDuration = { value: sleepAvg > 0 ? round1(sleepAvg) : null, riskContribution: round1(sleepRisk) }
  if (sleepRisk > 0) { riskTotal += sleepRisk; modifiable.push("optimize_sleep_duration") }

  const bp = mean(vals(byType, "blood_pressure"))
  const bpRisk = bp > 130 ? (bp - 130) * 0.5 : 0
  markers.bloodPressure = { value: bp > 0 ? round1(bp) : null, riskContribution: round1(bpRisk) }
  if (bpRisk > 0) { riskTotal += bpRisk; modifiable.push("manage_blood_pressure") }

  const riskScore = round1(clamp(riskTotal, 0, 100))
  const riskCategory = riskScore < 15 ? "low" : riskScore < 35 ? "moderate" : riskScore < 60 ? "high" : "very_high"

  return { riskScore, riskCategory, modifiableFactors: modifiable, markers, confidence: round1(clamp(byType.size / 8, 0, 1)), date: targetDate.toISOString().slice(0, 10) }
}

// ── 11. computeCardiovascularAge ────────────────────────────────────────────

export interface CardiovascularAgeResult {
  cvAge: number
  ageDelta: number
  chronologicalAge: number
  components: Record<string, { value: number | null; ageOffset: number }>
  confidence: number
  date: string
}

export async function computeCardiovascularAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<CardiovascularAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const components: CardiovascularAgeResult["components"] = {}
  let totalOffset = 0
  let count = 0

  const rhr = mean(vals(byType, "resting_heart_rate"))
  if (rhr > 0) { const o = (rhr - 65) * 0.3; components.restingHR = { value: round1(rhr), ageOffset: round1(o) }; totalOffset += o; count++ }
  else components.restingHR = { value: null, ageOffset: 0 }

  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 0) { const o = (bp - 120) * 0.2; components.bloodPressure = { value: round1(bp), ageOffset: round1(o) }; totalOffset += o; count++ }
  else components.bloodPressure = { value: null, ageOffset: 0 }

  const hrvAvg = mean(vals(byType, "hrv"))
  if (hrvAvg > 0) { const o = (50 - hrvAvg) * 0.25; components.hrv = { value: round1(hrvAvg), ageOffset: round1(o) }; totalOffset += o; count++ }
  else components.hrv = { value: null, ageOffset: 0 }

  const spo2 = mean(vals(byType, "blood_oxygen"))
  if (spo2 > 0) { const o = (97 - spo2) * 2; components.bloodOxygen = { value: round1(spo2), ageOffset: round1(o) }; totalOffset += o; count++ }
  else components.bloodOxygen = { value: null, ageOffset: 0 }

  const vo2 = mean(vals(byType, "vo2max"))
  if (vo2 > 0) { const o = (42 - vo2) * 0.4; components.vo2max = { value: round1(vo2), ageOffset: round1(o) }; totalOffset += o; count++ }
  else components.vo2max = { value: null, ageOffset: 0 }

  const cvAge = round1(age + (count > 0 ? totalOffset / count * count * 0.3 : 0))
  return {
    cvAge,
    ageDelta: round1(cvAge - age),
    chronologicalAge: age,
    components,
    confidence: round1(clamp(count / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 12. analyzeImmuneAge ────────────────────────────────────────────────────

export interface ImmuneAgeResult {
  immuneAge: number
  ageDelta: number
  immuneResilience: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeImmuneAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<ImmuneAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const stressAvg = mean(vals(byType, "stress"))
  const deepAvg = mean(vals(byType, "deep_sleep"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const bfAvg = mean(vals(byType, "body_fat"))
  const sleepAvg = mean(vals(byType, "sleep_duration"))

  let offset = 0
  if (stressAvg > 60) offset += (stressAvg - 60) * 0.15
  else if (stressAvg > 0 && stressAvg < 30) offset -= 2
  if (deepAvg > 0 && deepAvg < 1) offset += 3
  else if (deepAvg > 2) offset -= 2
  if (activeAvg > 0 && activeAvg < 20) offset += 4
  else if (activeAvg > 45) offset -= 3
  if (bfAvg > 30) offset += (bfAvg - 30) * 0.2
  if (sleepAvg > 0 && sleepAvg < 6) offset += 3

  const immuneAge = round1(age + offset)
  const resilience = round1(clamp(100 - offset * 3, 0, 100))

  return {
    immuneAge,
    ageDelta: round1(offset),
    immuneResilience: resilience,
    components: {
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      deepSleep: deepAvg > 0 ? round1(deepAvg) : null,
      activity: activeAvg > 0 ? round1(activeAvg) : null,
      bodyFat: bfAvg > 0 ? round1(bfAvg) : null,
      sleepDuration: sleepAvg > 0 ? round1(sleepAvg) : null,
    },
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 13. computeNeurologicalAge ──────────────────────────────────────────────

export interface NeurologicalAgeResult {
  neuroAge: number
  ageDelta: number
  cognitiveReserve: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeNeurologicalAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<NeurologicalAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const hrvAvg = mean(vals(byType, "hrv"))
  const deepAvg = mean(vals(byType, "deep_sleep"))
  const remAvg = mean(vals(byType, "rem_sleep"))
  const stressAvg = mean(vals(byType, "stress"))
  const stepsAvg = mean(vals(byType, "steps"))

  let offset = 0
  if (hrvAvg > 0 && hrvAvg < 30) offset += (30 - hrvAvg) * 0.2
  else if (hrvAvg > 55) offset -= 2
  if (deepAvg > 0 && deepAvg < 1) offset += 4
  else if (deepAvg > 2) offset -= 2
  if (remAvg > 0 && remAvg < 1) offset += 3
  else if (remAvg > 2) offset -= 1.5
  if (stressAvg > 65) offset += (stressAvg - 65) * 0.12
  if (stepsAvg > 8000) offset -= 2
  else if (stepsAvg > 0 && stepsAvg < 3000) offset += 3

  const neuroAge = round1(age + offset)
  const reserve = round1(clamp(100 - offset * 4, 0, 100))

  return {
    neuroAge,
    ageDelta: round1(offset),
    cognitiveReserve: reserve,
    components: {
      hrv: hrvAvg > 0 ? round1(hrvAvg) : null,
      deepSleep: deepAvg > 0 ? round1(deepAvg) : null,
      remSleep: remAvg > 0 ? round1(remAvg) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      activity: stepsAvg > 0 ? round1(stepsAvg) : null,
    },
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 14. assessMetabolicAge ──────────────────────────────────────────────────

export interface MetabolicAgeResult {
  metabolicAge: number
  ageDelta: number
  metabolicEfficiency: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessMetabolicAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<MetabolicAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const weight = mean(vals(byType, "weight"))
  const bf = mean(vals(byType, "body_fat"))
  const cal = mean(vals(byType, "calories"))
  const rhr = mean(vals(byType, "resting_heart_rate"))
  const activeAvg = mean(vals(byType, "active_minutes"))

  let offset = 0
  if (bf > 0) offset += (bf - 22) * 0.35
  if (weight > 0 && weight > 90) offset += (weight - 90) * 0.08
  if (rhr > 70) offset += (rhr - 70) * 0.2
  else if (rhr > 0 && rhr < 60) offset -= 2
  if (activeAvg > 45) offset -= 3
  else if (activeAvg > 0 && activeAvg < 15) offset += 3
  if (cal > 0) {
    const bmr = weight > 0 ? 10 * weight + 625 : 1800
    const efficiency = cal / bmr
    if (efficiency > 1.5) offset -= 1
    else if (efficiency < 0.8) offset += 2
  }

  const metabolicAge = round1(age + offset)
  const efficiency = round1(clamp(100 - Math.abs(offset) * 3, 0, 100))

  return {
    metabolicAge,
    ageDelta: round1(offset),
    metabolicEfficiency: efficiency,
    components: {
      weight: weight > 0 ? round1(weight) : null,
      bodyFat: bf > 0 ? round1(bf) : null,
      calories: cal > 0 ? round1(cal) : null,
      restingHR: rhr > 0 ? round1(rhr) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
    },
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 15. computeMusculoskeletalAge ───────────────────────────────────────────

export interface MusculoskeletalAgeResult {
  mskAge: number
  ageDelta: number
  muscleQualityProxy: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeMusculoskeletalAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<MusculoskeletalAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const stepsAvg = mean(vals(byType, "steps"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const bf = mean(vals(byType, "body_fat"))
  const weightData = vals(byType, "weight")
  const weightStability = weightData.length > 5 ? stdDev(weightData) : 0

  let offset = 0
  if (stepsAvg > 0 && stepsAvg < 5000) offset += (5000 - stepsAvg) / 1000
  else if (stepsAvg > 10000) offset -= 3
  if (activeAvg > 0 && activeAvg < 20) offset += 3
  else if (activeAvg > 50) offset -= 3
  if (bf > 30) offset += (bf - 30) * 0.2
  else if (bf > 0 && bf < 20) offset -= 1.5
  if (weightStability > 3) offset += 2

  const mskAge = round1(age + offset)
  const muscleQuality = round1(clamp(100 - offset * 4, 0, 100))

  return {
    mskAge,
    ageDelta: round1(offset),
    muscleQualityProxy: muscleQuality,
    components: {
      dailySteps: stepsAvg > 0 ? round1(stepsAvg) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
      bodyFat: bf > 0 ? round1(bf) : null,
      weightStability: weightStability > 0 ? round1(weightStability) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 16. analyzeRespiratoryAge ───────────────────────────────────────────────

export interface RespiratoryAgeResult {
  respiratoryAge: number
  ageDelta: number
  lungCapacityProxy: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeRespiratoryAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<RespiratoryAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const rr = mean(vals(byType, "respiratory_rate"))
  const spo2 = mean(vals(byType, "blood_oxygen"))
  const vo2 = mean(vals(byType, "vo2max"))

  let offset = 0
  if (rr > 18) offset += (rr - 18) * 0.8
  else if (rr > 0 && rr < 14) offset -= 2
  if (spo2 > 0 && spo2 < 96) offset += (96 - spo2) * 3
  else if (spo2 >= 98) offset -= 1.5
  if (vo2 > 0 && vo2 < 30) offset += (30 - vo2) * 0.3
  else if (vo2 > 45) offset -= 3

  const respAge = round1(age + offset)
  const lungCapacity = round1(clamp(100 - offset * 4, 0, 100))

  return {
    respiratoryAge: respAge,
    ageDelta: round1(offset),
    lungCapacityProxy: lungCapacity,
    components: {
      respiratoryRate: rr > 0 ? round1(rr) : null,
      bloodOxygen: spo2 > 0 ? round1(spo2) : null,
      vo2max: vo2 > 0 ? round1(vo2) : null,
    },
    confidence: round1(clamp(byType.size / 4, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 17. computeFunctionalCapacity ───────────────────────────────────────────

export interface FunctionalCapacityResult {
  capacityScore: number
  limitations: string[]
  trend: string
  components: Record<string, number>
  confidence: number
  date: string
}

export async function computeFunctionalCapacity(
  userId: string,
  date?: Date,
): Promise<FunctionalCapacityResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const limitations: string[] = []
  const components: Record<string, number> = {}

  const stepsAvg = mean(vals(byType, "steps"))
  const mobility = clamp((stepsAvg / 10000) * 100, 0, 100)
  components.mobility = round1(mobility)
  if (stepsAvg > 0 && stepsAvg < 3000) limitations.push("limited_mobility")

  const activeAvg = mean(vals(byType, "active_minutes"))
  const endurance = clamp((activeAvg / 60) * 100, 0, 100)
  components.endurance = round1(endurance)
  if (activeAvg > 0 && activeAvg < 15) limitations.push("low_endurance")

  const vo2 = mean(vals(byType, "vo2max"))
  const aerobic = vo2 > 0 ? clamp((vo2 / 50) * 100, 0, 100) : 50
  components.aerobicCapacity = round1(aerobic)
  if (vo2 > 0 && vo2 < 25) limitations.push("poor_aerobic_capacity")

  const spo2 = mean(vals(byType, "blood_oxygen"))
  const respiratory = spo2 > 0 ? clamp((spo2 - 90) * 10, 0, 100) : 50
  components.respiratory = round1(respiratory)
  if (spo2 > 0 && spo2 < 94) limitations.push("respiratory_limitation")

  const score = round1(mobility * 0.3 + endurance * 0.25 + aerobic * 0.25 + respiratory * 0.2)

  const stepsTrend = linearSlope(vals(byType, "steps"))
  const trend = stepsTrend > 50 ? "improving" : stepsTrend < -50 ? "declining" : "stable"

  return { capacityScore: score, limitations, trend, components, confidence: round1(clamp(byType.size / 5, 0, 1)), date: targetDate.toISOString().slice(0, 10) }
}

// ── 18. assessCognitiveDeclineRisk ──────────────────────────────────────────

export interface CognitiveDeclineResult {
  riskScore: number
  protectiveFactors: string[]
  riskFactors: string[]
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessCognitiveDeclineRisk(
  userId: string,
  date?: Date,
): Promise<CognitiveDeclineResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  let risk = 30
  const protective: string[] = []
  const riskFactors: string[] = []

  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 2) { risk -= 8; protective.push("adequate_deep_sleep") }
  else if (deepAvg > 0 && deepAvg < 1) { risk += 12; riskFactors.push("insufficient_deep_sleep") }

  const remAvg = mean(vals(byType, "rem_sleep"))
  if (remAvg > 2) { risk -= 6; protective.push("healthy_rem_sleep") }
  else if (remAvg > 0 && remAvg < 1) { risk += 10; riskFactors.push("reduced_rem_sleep") }

  const hrvAvg = mean(vals(byType, "hrv"))
  if (hrvAvg > 50) { risk -= 7; protective.push("strong_autonomic_function") }
  else if (hrvAvg > 0 && hrvAvg < 25) { risk += 10; riskFactors.push("low_autonomic_function") }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 70) { risk += 12; riskFactors.push("chronic_high_stress") }
  else if (stressAvg > 0 && stressAvg < 30) { risk -= 5; protective.push("low_stress") }

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 8000) { risk -= 10; protective.push("high_physical_activity") }
  else if (stepsAvg > 0 && stepsAvg < 3000) { risk += 8; riskFactors.push("sedentary_lifestyle") }

  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 140) { risk += 8; riskFactors.push("hypertension") }

  return {
    riskScore: round1(clamp(risk, 0, 100)),
    protectiveFactors: protective,
    riskFactors,
    components: {
      deepSleep: deepAvg > 0 ? round1(deepAvg) : null,
      remSleep: remAvg > 0 ? round1(remAvg) : null,
      hrv: hrvAvg > 0 ? round1(hrvAvg) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      steps: stepsAvg > 0 ? round1(stepsAvg) : null,
      bloodPressure: bp > 0 ? round1(bp) : null,
    },
    confidence: round1(clamp(byType.size / 7, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 19. computeGripStrengthProxy ────────────────────────────────────────────

export interface GripStrengthResult {
  estimatedKg: number
  percentile: number
  mortalityRisk: string
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeGripStrengthProxy(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<GripStrengthResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const activeAvg = mean(vals(byType, "active_minutes"))
  const weight = mean(vals(byType, "weight"))
  const bf = mean(vals(byType, "body_fat"))
  const stepsAvg = mean(vals(byType, "steps"))

  const baseGrip = weight > 0 ? weight * 0.5 : 35
  let adj = 0
  if (activeAvg > 45) adj += 4
  else if (activeAvg > 0 && activeAvg < 15) adj -= 5
  if (bf > 30) adj -= (bf - 30) * 0.3
  if (stepsAvg > 8000) adj += 2
  if (age > 60) adj -= (age - 60) * 0.3

  const leanMass = weight > 0 && bf > 0 ? weight * (1 - bf / 100) : weight * 0.75
  const estimated = round1(clamp(baseGrip + adj + (leanMass > 0 ? (leanMass - 55) * 0.15 : 0), 10, 80))
  const ageNorm = age < 40 ? 45 : age < 60 ? 40 : age < 70 ? 35 : 28
  const percentile = round1(clamp((estimated / ageNorm) * 50, 0, 100))
  const risk = estimated < ageNorm * 0.7 ? "elevated" : estimated < ageNorm * 0.85 ? "moderate" : "low"

  return {
    estimatedKg: estimated,
    percentile,
    mortalityRisk: risk,
    components: {
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
      weight: weight > 0 ? round1(weight) : null,
      bodyFat: bf > 0 ? round1(bf) : null,
      steps: stepsAvg > 0 ? round1(stepsAvg) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 20. analyzeWalkingSpeed ─────────────────────────────────────────────────

export interface WalkingSpeedResult {
  estimatedSpeedKmH: number
  agePercentile: number
  mortalityRiskCategory: string
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeWalkingSpeed(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<WalkingSpeedResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const stepsAvg = mean(vals(byType, "steps"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const strideLength = 0.00075 // km per step average

  let speedKmH = 4.0
  if (stepsAvg > 0 && activeAvg > 0) {
    const distKm = stepsAvg * strideLength
    const activeHours = activeAvg / 60
    speedKmH = activeHours > 0 ? distKm / activeHours : 4.0
  }
  speedKmH = clamp(speedKmH, 1.5, 8.0)

  const ageNormSpeed = age < 50 ? 5.0 : age < 60 ? 4.7 : age < 70 ? 4.3 : age < 80 ? 3.8 : 3.2
  const percentile = round1(clamp((speedKmH / ageNormSpeed) * 50, 0, 100))
  const msSpeed = speedKmH / 3.6
  const risk = msSpeed < 0.6 ? "high" : msSpeed < 0.8 ? "moderate" : msSpeed < 1.0 ? "low" : "very_low"

  return {
    estimatedSpeedKmH: round1(speedKmH),
    agePercentile: percentile,
    mortalityRiskCategory: risk,
    components: {
      dailySteps: stepsAvg > 0 ? round1(stepsAvg) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
    },
    confidence: round1(clamp(byType.size / 3, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 21. computeBalanceScore ─────────────────────────────────────────────────

export interface BalanceScoreResult {
  score: number
  fallRiskComponent: number
  mobilityComponent: number
  confidence: number
  date: string
}

export async function computeBalanceScore(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<BalanceScoreResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const stepsData = vals(byType, "steps")
  const stepVariability = stepsData.length > 3 ? stdDev(stepsData) / Math.max(mean(stepsData), 1) : 0.3
  const activeAvg = mean(vals(byType, "active_minutes"))
  const stepsAvg = mean(stepsData)

  const regularity = clamp(100 - stepVariability * 150, 0, 100)
  const mobility = clamp((stepsAvg / 8000) * 60 + (activeAvg / 45) * 40, 0, 100)
  const ageAdj = age > 65 ? (age - 65) * 1.5 : 0

  const fallRisk = round1(clamp(100 - regularity * 0.5 - mobility * 0.3 + ageAdj, 0, 100))
  const score = round1(clamp(regularity * 0.5 + mobility * 0.5 - ageAdj, 0, 100))

  return {
    score,
    fallRiskComponent: fallRisk,
    mobilityComponent: round1(mobility),
    confidence: round1(clamp(stepsData.length / 10, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 22. assessFallRisk ──────────────────────────────────────────────────────

export interface FallRiskResult {
  riskScore: number
  riskLevel: string
  interventions: string[]
  factors: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessFallRisk(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<FallRiskResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  let risk = age > 65 ? 20 + (age - 65) * 1.5 : 10
  const interventions: string[] = []

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 0 && stepsAvg < 3000) { risk += 15; interventions.push("increase_daily_walking") }
  else if (stepsAvg > 7000) risk -= 5

  const activeAvg = mean(vals(byType, "active_minutes"))
  if (activeAvg > 0 && activeAvg < 15) { risk += 10; interventions.push("add_balance_exercises") }

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg > 0 && sleepAvg < 5.5) { risk += 8; interventions.push("improve_sleep") }

  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 140) { risk += 8; interventions.push("manage_blood_pressure") }

  const stepsVar = vals(byType, "steps").length > 3 ? stdDev(vals(byType, "steps")) / Math.max(stepsAvg, 1) : 0.3
  if (stepsVar > 0.5) { risk += 5; interventions.push("stabilize_activity_routine") }

  risk = round1(clamp(risk, 0, 100))
  const level = risk < 20 ? "low" : risk < 40 ? "moderate" : risk < 60 ? "high" : "very_high"

  return {
    riskScore: risk,
    riskLevel: level,
    interventions,
    factors: {
      age: round1(age), steps: stepsAvg > 0 ? round1(stepsAvg) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
      sleep: sleepAvg > 0 ? round1(sleepAvg) : null,
      bloodPressure: bp > 0 ? round1(bp) : null,
    },
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 23. computeAnabolicResistance ───────────────────────────────────────────

export interface AnabolicResistanceResult {
  resistanceScore: number
  adaptationRate: number
  interventions: string[]
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeAnabolicResistance(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<AnabolicResistanceResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 60 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const activeData = vals(byType, "active_minutes")
  const stepsData = vals(byType, "steps")
  const calData = vals(byType, "calories")

  const activeSlope = linearSlope(activeData)
  const stepsSlope = linearSlope(stepsData)
  const calSlope = linearSlope(calData)

  let resistance = age > 50 ? (age - 50) * 0.8 : 0
  if (activeSlope < -0.1 && activeData.length > 10) resistance += 10
  if (stepsSlope < -20 && stepsData.length > 10) resistance += 8
  if (calSlope < -5 && calData.length > 10) resistance += 7

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg > 0 && sleepAvg < 6.5) resistance += 8

  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 0 && deepAvg < 1) resistance += 6

  const interventions: string[] = []
  if (resistance > 30) {
    interventions.push("increase_protein_intake")
    interventions.push("add_resistance_training")
    if (sleepAvg > 0 && sleepAvg < 7) interventions.push("optimize_sleep_for_recovery")
  }

  const adaptRate = round1(clamp(100 - resistance, 0, 100))

  return {
    resistanceScore: round1(clamp(resistance, 0, 100)),
    adaptationRate: adaptRate,
    interventions,
    components: {
      activityTrend: activeData.length > 5 ? round1(activeSlope) : null,
      stepsTrend: stepsData.length > 5 ? round1(stepsSlope) : null,
      sleep: sleepAvg > 0 ? round1(sleepAvg) : null,
      deepSleep: deepAvg > 0 ? round1(deepAvg) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 24. analyzeHormonalDecline ──────────────────────────────────────────────

export interface HormonalDeclineResult {
  declineIndex: number
  affectedSystems: string[]
  markers: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeHormonalDecline(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<HormonalDeclineResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 60 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  let decline = 0
  const affected: string[] = []

  const bf = mean(vals(byType, "body_fat"))
  if (bf > 30) { decline += (bf - 30) * 0.5; affected.push("body_composition") }

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 0 && deepAvg < 1) { decline += 8; affected.push("growth_hormone") }
  if (sleepAvg > 0 && sleepAvg < 6) { decline += 6; affected.push("cortisol_regulation") }

  const hrvAvg = mean(vals(byType, "hrv"))
  if (hrvAvg > 0 && hrvAvg < 25) { decline += 7; affected.push("autonomic_hormonal") }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 60) { decline += (stressAvg - 60) * 0.2; affected.push("stress_hormones") }

  const activeAvg = mean(vals(byType, "active_minutes"))
  if (activeAvg > 0 && activeAvg < 15) { decline += 5; affected.push("anabolic_hormones") }

  if (age > 50) decline += (age - 50) * 0.4

  return {
    declineIndex: round1(clamp(decline, 0, 100)),
    affectedSystems: affected,
    markers: {
      bodyFat: bf > 0 ? round1(bf) : null,
      deepSleep: deepAvg > 0 ? round1(deepAvg) : null,
      hrv: hrvAvg > 0 ? round1(hrvAvg) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
    },
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 25. computeSleepQualityDecline ──────────────────────────────────────────

export interface SleepQualityDeclineResult {
  declineScore: number
  sleepArchitectureAge: number
  recommendations: string[]
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeSleepQualityDecline(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<SleepQualityDeclineResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const deepAvg = mean(vals(byType, "deep_sleep"))
  const remAvg = mean(vals(byType, "rem_sleep"))
  const lightAvg = mean(vals(byType, "light_sleep"))

  let decline = 0
  const recs: string[] = []

  const idealDeepPct = age < 40 ? 20 : age < 60 ? 17 : 13
  const actualDeepPct = sleepAvg > 0 && deepAvg > 0 ? (deepAvg / sleepAvg) * 100 : idealDeepPct
  if (actualDeepPct < idealDeepPct) { decline += (idealDeepPct - actualDeepPct) * 1.5; recs.push("improve_deep_sleep_hygiene") }

  const idealRemPct = 22
  const actualRemPct = sleepAvg > 0 && remAvg > 0 ? (remAvg / sleepAvg) * 100 : idealRemPct
  if (actualRemPct < idealRemPct * 0.8) { decline += 10; recs.push("optimize_rem_sleep") }

  if (sleepAvg > 0 && sleepAvg < 6.5) { decline += (6.5 - sleepAvg) * 8; recs.push("increase_sleep_duration") }

  const sleepVar = stdDev(vals(byType, "sleep_duration"))
  if (sleepVar > 1.5) { decline += 8; recs.push("stabilize_sleep_schedule") }

  const archAge = round1(age + decline * 0.5)

  return {
    declineScore: round1(clamp(decline, 0, 100)),
    sleepArchitectureAge: archAge,
    recommendations: recs,
    components: {
      duration: sleepAvg > 0 ? round1(sleepAvg) : null,
      deepSleep: deepAvg > 0 ? round1(deepAvg) : null,
      remSleep: remAvg > 0 ? round1(remAvg) : null,
      lightSleep: lightAvg > 0 ? round1(lightAvg) : null,
      variability: sleepVar > 0 ? round1(sleepVar) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 26. assessSarcopeniaProgression ─────────────────────────────────────────

export interface SarcopeniaResult {
  progressionScore: number
  riskStage: "none" | "pre_sarcopenia" | "sarcopenia"
  muscleQualityProxy: number
  indicators: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessSarcopeniaProgression(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<SarcopeniaResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 60 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const stepsData = vals(byType, "steps")
  const activeData = vals(byType, "active_minutes")
  const weightData = vals(byType, "weight")
  const bf = mean(vals(byType, "body_fat"))

  const stepsSlope = linearSlope(stepsData)
  const activeSlope = linearSlope(activeData)
  const weightSlope = linearSlope(weightData)

  let score = age > 60 ? (age - 60) * 1.0 : 0
  if (stepsSlope < -30 && stepsData.length > 10) score += 12
  if (activeSlope < -0.2 && activeData.length > 10) score += 10
  if (weightSlope < -0.03 && bf > 25) score += 10
  if (mean(stepsData) > 0 && mean(stepsData) < 4000) score += 10
  if (mean(activeData) > 0 && mean(activeData) < 20) score += 8

  score = round1(clamp(score, 0, 100))
  const stage = score < 20 ? "none" : score < 45 ? "pre_sarcopenia" : "sarcopenia"
  const leanProxy = bf > 0 && mean(weightData) > 0 ? mean(weightData) * (1 - bf / 100) : 0
  const quality = round1(clamp(100 - score, 0, 100))

  return {
    progressionScore: score,
    riskStage: stage,
    muscleQualityProxy: quality,
    indicators: {
      stepsTrend: stepsData.length > 5 ? round1(stepsSlope) : null,
      activityTrend: activeData.length > 5 ? round1(activeSlope) : null,
      weightTrend: weightData.length > 5 ? round1(weightSlope) : null,
      leanMassProxy: leanProxy > 0 ? round1(leanProxy) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 27. computeOsteoporosisRiskProxy ────────────────────────────────────────

export interface OsteoporosisRiskResult {
  riskScore: number
  protectiveFactors: string[]
  riskFactors: string[]
  confidence: number
  date: string
}

export async function computeOsteoporosisRiskProxy(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<OsteoporosisRiskResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  let risk = age > 50 ? (age - 50) * 0.8 : 0
  const protective: string[] = []
  const riskF: string[] = []

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 8000) { risk -= 5; protective.push("weight_bearing_activity") }
  else if (stepsAvg > 0 && stepsAvg < 3000) { risk += 12; riskF.push("sedentary_lifestyle") }

  const activeAvg = mean(vals(byType, "active_minutes"))
  if (activeAvg > 45) { risk -= 5; protective.push("regular_exercise") }
  else if (activeAvg > 0 && activeAvg < 15) { risk += 8; riskF.push("insufficient_exercise") }

  const bf = mean(vals(byType, "body_fat"))
  if (bf > 35) { risk += 5; riskF.push("high_body_fat") }

  const weight = mean(vals(byType, "weight"))
  if (weight > 0 && weight < 55) { risk += 8; riskF.push("low_body_weight") }
  else if (weight > 70) { risk -= 3; protective.push("adequate_body_weight") }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 65) { risk += 5; riskF.push("chronic_stress") }

  return {
    riskScore: round1(clamp(risk, 0, 100)),
    protectiveFactors: protective,
    riskFactors: riskF,
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 28. analyzeVisionDeclineProxy ───────────────────────────────────────────

export interface VisionDeclineResult {
  estimatedDecline: number
  activityImpact: number
  contributors: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeVisionDeclineProxy(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<VisionDeclineResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  let decline = age > 40 ? (age - 40) * 0.5 : 0
  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 140) decline += (bp - 140) * 0.2
  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 60) decline += (stressAvg - 60) * 0.1
  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg > 0 && sleepAvg < 6) decline += 5
  const spo2 = mean(vals(byType, "blood_oxygen"))
  if (spo2 > 0 && spo2 < 95) decline += 3

  const stepsAvg = mean(vals(byType, "steps"))
  const activityImpact = stepsAvg > 0 && stepsAvg < 3000 ? round1(decline * 0.2) : 0

  return {
    estimatedDecline: round1(clamp(decline, 0, 100)),
    activityImpact,
    contributors: {
      age: round1(age), bloodPressure: bp > 0 ? round1(bp) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      sleep: sleepAvg > 0 ? round1(sleepAvg) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 29. computeHearingDeclineProxy ──────────────────────────────────────────

export interface HearingDeclineResult {
  estimatedDecline: number
  socialImpactProxy: number
  contributors: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeHearingDeclineProxy(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<HearingDeclineResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  let decline = age > 50 ? (age - 50) * 0.7 : 0
  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 60) decline += (stressAvg - 60) * 0.1
  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 140) decline += (bp - 140) * 0.15
  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg > 0 && sleepAvg < 6) decline += 4

  const socialImpact = decline > 30 ? round1(decline * 0.4) : 0

  return {
    estimatedDecline: round1(clamp(decline, 0, 100)),
    socialImpactProxy: socialImpact,
    contributors: {
      age: round1(age),
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      bloodPressure: bp > 0 ? round1(bp) : null,
      sleep: sleepAvg > 0 ? round1(sleepAvg) : null,
    },
    confidence: round1(clamp(byType.size / 4, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 30. assessKidneyFunctionProxy ───────────────────────────────────────────

export interface KidneyFunctionResult {
  functionScore: number
  estimatedGFR_proxy: number
  ageDelta: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessKidneyFunctionProxy(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<KidneyFunctionResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const bp = mean(vals(byType, "blood_pressure"))
  const weight = mean(vals(byType, "weight"))
  const tempStability = stdDev(vals(byType, "body_temperature"))
  const rhr = mean(vals(byType, "resting_heart_rate"))

  // CKD-EPI simplified proxy
  let baseGFR = 120 - (age - 30) * 0.8
  if (bp > 130) baseGFR -= (bp - 130) * 0.3
  if (weight > 100) baseGFR -= (weight - 100) * 0.2
  if (tempStability > 0.5) baseGFR -= tempStability * 5
  if (rhr > 80) baseGFR -= (rhr - 80) * 0.3

  baseGFR = clamp(baseGFR, 15, 130)
  const functionScore = round1(clamp((baseGFR / 120) * 100, 0, 100))
  const expectedGFR = 120 - (age - 30) * 0.8
  const ageDelta = round1((baseGFR - expectedGFR) / 0.8)

  return {
    functionScore,
    estimatedGFR_proxy: round1(baseGFR),
    ageDelta,
    components: {
      bloodPressure: bp > 0 ? round1(bp) : null,
      weight: weight > 0 ? round1(weight) : null,
      tempStability: tempStability > 0 ? round1(tempStability) : null,
      restingHR: rhr > 0 ? round1(rhr) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 31. computeLiverFunctionAge ─────────────────────────────────────────────

export interface LiverFunctionAgeResult {
  liverAge: number
  ageDelta: number
  metabolicLoad: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeLiverFunctionAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<LiverFunctionAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const bf = mean(vals(byType, "body_fat"))
  const weight = mean(vals(byType, "weight"))
  const weightStab = stdDev(vals(byType, "weight"))
  const calAvg = mean(vals(byType, "calories"))

  let offset = 0
  if (bf > 30) offset += (bf - 30) * 0.4
  if (weightStab > 2) offset += weightStab * 1.5
  if (weight > 100) offset += (weight - 100) * 0.1
  const bmr = weight > 0 ? 10 * weight + 625 : 1800
  const load = calAvg > 0 ? calAvg / bmr : 1.0
  if (load > 1.3) offset += (load - 1.3) * 10

  const liverAge = round1(age + offset)
  return {
    liverAge,
    ageDelta: round1(offset),
    metabolicLoad: round1(load),
    components: {
      bodyFat: bf > 0 ? round1(bf) : null,
      weight: weight > 0 ? round1(weight) : null,
      weightStability: weightStab > 0 ? round1(weightStab) : null,
      calories: calAvg > 0 ? round1(calAvg) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 32. analyzeLungFunctionAge ──────────────────────────────────────────────

export interface LungFunctionAgeResult {
  lungAge: number
  fev1Proxy: number
  ageDelta: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeLungFunctionAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<LungFunctionAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 60 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const rr = mean(vals(byType, "respiratory_rate"))
  const spo2 = mean(vals(byType, "blood_oxygen"))
  const vo2 = mean(vals(byType, "vo2max"))
  const rrSlope = linearSlope(vals(byType, "respiratory_rate"))
  const spo2Slope = linearSlope(vals(byType, "blood_oxygen"))

  let offset = 0
  if (rr > 18) offset += (rr - 18) * 0.7
  if (spo2 > 0 && spo2 < 96) offset += (96 - spo2) * 3
  if (vo2 > 0 && vo2 < 30) offset += (30 - vo2) * 0.25
  if (rrSlope > 0.02) offset += rrSlope * 50
  if (spo2Slope < -0.01) offset += Math.abs(spo2Slope) * 100

  const lungAge = round1(age + offset)
  const fev1 = round1(clamp(100 - offset * 2 - (age - 25) * 0.5, 20, 110))

  return {
    lungAge,
    fev1Proxy: fev1,
    ageDelta: round1(offset),
    components: {
      respiratoryRate: rr > 0 ? round1(rr) : null,
      bloodOxygen: spo2 > 0 ? round1(spo2) : null,
      vo2max: vo2 > 0 ? round1(vo2) : null,
    },
    confidence: round1(clamp(byType.size / 4, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 33. computeSkinAgingProxy ───────────────────────────────────────────────

export interface SkinAgingResult {
  agingScore: number
  oxidativeStress: number
  protectiveFactors: string[]
  confidence: number
  date: string
}

export async function computeSkinAgingProxy(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<SkinAgingResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  let score = age > 30 ? (age - 30) * 0.8 : 0
  let oxidative = 0
  const protective: string[] = []

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 60) { score += (stressAvg - 60) * 0.2; oxidative += 15 }
  else if (stressAvg > 0 && stressAvg < 30) protective.push("low_stress")

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg > 0 && sleepAvg < 6) { score += 8; oxidative += 10 }
  else if (sleepAvg >= 7.5) protective.push("adequate_sleep")

  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 2) protective.push("good_restorative_sleep")
  else if (deepAvg > 0 && deepAvg < 1) { score += 5; oxidative += 8 }

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 8000) protective.push("regular_exercise")
  else if (stepsAvg > 0 && stepsAvg < 3000) { score += 5; oxidative += 5 }

  const spo2 = mean(vals(byType, "blood_oxygen"))
  if (spo2 > 0 && spo2 < 95) oxidative += 8

  return {
    agingScore: round1(clamp(score, 0, 100)),
    oxidativeStress: round1(clamp(oxidative, 0, 100)),
    protectiveFactors: protective,
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 34. assessDNARepairProxy ────────────────────────────────────────────────

export interface DNARepairResult {
  repairCapacity: number
  damageRate: number
  netEffect: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessDNARepairProxy(
  userId: string,
  date?: Date,
): Promise<DNARepairResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  let repair = 50
  let damage = 20

  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 2) repair += 15
  else if (deepAvg > 0 && deepAvg < 1) repair -= 10

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg >= 7.5) repair += 10
  else if (sleepAvg > 0 && sleepAvg < 6) { repair -= 8; damage += 10 }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 65) damage += (stressAvg - 65) * 0.5
  else if (stressAvg > 0 && stressAvg < 30) damage -= 5

  const activeAvg = mean(vals(byType, "active_minutes"))
  if (activeAvg > 30 && activeAvg < 90) repair += 8
  else if (activeAvg > 120) damage += 5
  else if (activeAvg > 0 && activeAvg < 15) damage += 8

  const spo2 = mean(vals(byType, "blood_oxygen"))
  if (spo2 > 0 && spo2 < 94) damage += 10

  repair = round1(clamp(repair, 0, 100))
  damage = round1(clamp(damage, 0, 100))
  return {
    repairCapacity: repair,
    damageRate: damage,
    netEffect: round1(repair - damage),
    components: {
      deepSleep: deepAvg > 0 ? round1(deepAvg) : null,
      sleepDuration: sleepAvg > 0 ? round1(sleepAvg) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
      bloodOxygen: spo2 > 0 ? round1(spo2) : null,
    },
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 35. computeOxidativeDamageIndex ─────────────────────────────────────────

export interface OxidativeDamageResult {
  damageIndex: number
  sources: string[]
  antioxidantFactors: string[]
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeOxidativeDamageIndex(
  userId: string,
  date?: Date,
): Promise<OxidativeDamageResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  let damage = 20
  const sources: string[] = []
  const antioxidant: string[] = []

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 60) { damage += (stressAvg - 60) * 0.4; sources.push("chronic_stress") }
  else if (stressAvg > 0 && stressAvg < 25) antioxidant.push("low_stress_environment")

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg > 0 && sleepAvg < 6) { damage += 12; sources.push("sleep_deprivation") }
  else if (sleepAvg >= 7.5) antioxidant.push("restorative_sleep")

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 0 && stepsAvg < 3000) { damage += 10; sources.push("physical_inactivity") }
  else if (stepsAvg > 8000) antioxidant.push("regular_exercise")

  const rhr = mean(vals(byType, "resting_heart_rate"))
  if (rhr > 80) { damage += (rhr - 80) * 0.5; sources.push("elevated_resting_hr") }
  else if (rhr > 0 && rhr < 60) antioxidant.push("efficient_heart")

  const bf = mean(vals(byType, "body_fat"))
  if (bf > 30) { damage += (bf - 30) * 0.3; sources.push("excess_adiposity") }

  const spo2 = mean(vals(byType, "blood_oxygen"))
  if (spo2 > 0 && spo2 < 95) { damage += 8; sources.push("low_blood_oxygen") }

  return {
    damageIndex: round1(clamp(damage, 0, 100)),
    sources,
    antioxidantFactors: antioxidant,
    components: {
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      sleep: sleepAvg > 0 ? round1(sleepAvg) : null,
      steps: stepsAvg > 0 ? round1(stepsAvg) : null,
      restingHR: rhr > 0 ? round1(rhr) : null,
      bodyFat: bf > 0 ? round1(bf) : null,
    },
    confidence: round1(clamp(byType.size / 7, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 36. analyzeGlycationMarkers ─────────────────────────────────────────────

export interface GlycationResult {
  glycationIndex: number
  metabolicRisk: string
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeGlycationMarkers(
  userId: string,
  date?: Date,
): Promise<GlycationResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  let index = 20
  const bf = mean(vals(byType, "body_fat"))
  if (bf > 28) index += (bf - 28) * 0.8
  const calAvg = mean(vals(byType, "calories"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  if (calAvg > 0 && activeAvg > 0) {
    const ratio = calAvg / Math.max(activeAvg, 1)
    if (ratio > 80) index += (ratio - 80) * 0.15
  }
  if (activeAvg > 0 && activeAvg < 20) index += 10
  else if (activeAvg > 45) index -= 8
  const weight = mean(vals(byType, "weight"))
  const weightSlope = linearSlope(vals(byType, "weight"))
  if (weightSlope > 0.05) index += 5

  index = round1(clamp(index, 0, 100))
  const risk = index < 25 ? "low" : index < 50 ? "moderate" : index < 75 ? "high" : "very_high"

  return {
    glycationIndex: index,
    metabolicRisk: risk,
    components: {
      bodyFat: bf > 0 ? round1(bf) : null,
      calories: calAvg > 0 ? round1(calAvg) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
      weight: weight > 0 ? round1(weight) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 37. computeAutophagyProxy ───────────────────────────────────────────────

export interface AutophagyResult {
  autophagyScore: number
  triggers: string[]
  inhibitors: string[]
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeAutophagyProxy(
  userId: string,
  date?: Date,
): Promise<AutophagyResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  let score = 40
  const triggers: string[] = []
  const inhibitors: string[] = []

  const activeAvg = mean(vals(byType, "active_minutes"))
  if (activeAvg > 45) { score += 15; triggers.push("regular_exercise") }
  else if (activeAvg > 0 && activeAvg < 15) { score -= 10; inhibitors.push("sedentary") }

  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 2) { score += 12; triggers.push("deep_restorative_sleep") }
  else if (deepAvg > 0 && deepAvg < 1) { score -= 8; inhibitors.push("poor_deep_sleep") }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 0 && stressAvg < 30) { score += 8; triggers.push("low_stress") }
  else if (stressAvg > 70) { score -= 10; inhibitors.push("chronic_stress") }

  const calAvg = mean(vals(byType, "calories"))
  const stepsAvg = mean(vals(byType, "steps"))
  if (calAvg > 0 && stepsAvg > 0) {
    const calPerStep = calAvg / stepsAvg
    if (calPerStep < 0.3) { score += 5; triggers.push("caloric_efficiency") }
    else if (calPerStep > 0.5) { score -= 5; inhibitors.push("excess_caloric_intake") }
  }

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg >= 7.5) { score += 5; triggers.push("adequate_sleep") }

  return {
    autophagyScore: round1(clamp(score, 0, 100)),
    triggers,
    inhibitors,
    components: {
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
      deepSleep: deepAvg > 0 ? round1(deepAvg) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      calories: calAvg > 0 ? round1(calAvg) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 38. assessSenescenceMarkers ─────────────────────────────────────────────

export interface SenescenceResult {
  senescenceIndex: number
  cellularAge: number
  clearanceCapacity: number
  markers: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessSenescenceMarkers(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<SenescenceResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  let senescence = age > 40 ? (age - 40) * 0.6 : 0
  const rhr = mean(vals(byType, "resting_heart_rate"))
  if (rhr > 75) senescence += (rhr - 75) * 0.4
  const hrvAvg = mean(vals(byType, "hrv"))
  if (hrvAvg > 0 && hrvAvg < 30) senescence += (30 - hrvAvg) * 0.3
  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 60) senescence += (stressAvg - 60) * 0.2
  const activeAvg = mean(vals(byType, "active_minutes"))
  if (activeAvg > 0 && activeAvg < 15) senescence += 8

  let clearance = 60
  if (activeAvg > 45) clearance += 15
  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 2) clearance += 10
  if (stressAvg > 0 && stressAvg < 30) clearance += 5

  const cellAge = round1(age + senescence * 0.3)

  return {
    senescenceIndex: round1(clamp(senescence, 0, 100)),
    cellularAge: cellAge,
    clearanceCapacity: round1(clamp(clearance, 0, 100)),
    markers: {
      restingHR: rhr > 0 ? round1(rhr) : null,
      hrv: hrvAvg > 0 ? round1(hrvAvg) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      activity: activeAvg > 0 ? round1(activeAvg) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 39. computeStemCellReserveProxy ─────────────────────────────────────────

export interface StemCellReserveResult {
  reserveScore: number
  regenerativeCapacity: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeStemCellReserveProxy(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<StemCellReserveResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  let reserve = 80 - (age > 30 ? (age - 30) * 0.8 : 0)

  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 2) reserve += 10
  else if (deepAvg > 0 && deepAvg < 1) reserve -= 10

  const activeAvg = mean(vals(byType, "active_minutes"))
  if (activeAvg > 30 && activeAvg < 90) reserve += 8
  else if (activeAvg > 0 && activeAvg < 15) reserve -= 8

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 60) reserve -= (stressAvg - 60) * 0.3
  else if (stressAvg > 0 && stressAvg < 30) reserve += 5

  const hrvAvg = mean(vals(byType, "hrv"))
  if (hrvAvg > 50) reserve += 5
  else if (hrvAvg > 0 && hrvAvg < 25) reserve -= 8

  reserve = round1(clamp(reserve, 0, 100))
  const regen = round1(reserve * 0.85)

  return {
    reserveScore: reserve,
    regenerativeCapacity: regen,
    components: {
      deepSleep: deepAvg > 0 ? round1(deepAvg) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      hrv: hrvAvg > 0 ? round1(hrvAvg) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 40. analyzeMitochondrialAge ─────────────────────────────────────────────

export interface MitochondrialAgeResult {
  mitoAge: number
  ageDelta: number
  bioenergeticCapacity: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeMitochondrialAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<MitochondrialAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const vo2 = mean(vals(byType, "vo2max"))
  const calAvg = mean(vals(byType, "calories"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const hrvAvg = mean(vals(byType, "hrv"))

  let offset = 0
  if (vo2 > 0 && vo2 < 35) offset += (35 - vo2) * 0.4
  else if (vo2 > 50) offset -= 4

  if (activeAvg > 0 && calAvg > 0) {
    const efficiency = calAvg / Math.max(activeAvg, 1)
    if (efficiency > 60) offset += 3
    else if (efficiency < 30) offset -= 3
  }

  if (activeAvg > 60) offset -= 5
  else if (activeAvg > 0 && activeAvg < 15) offset += 6

  if (hrvAvg > 0 && hrvAvg < 25) offset += 4
  else if (hrvAvg > 55) offset -= 3

  const mitoAge = round1(age + offset)
  const bioenergetic = round1(clamp(100 - (mitoAge - age) * 3, 0, 100))

  return {
    mitoAge,
    ageDelta: round1(offset),
    bioenergeticCapacity: bioenergetic,
    components: {
      vo2max: vo2 > 0 ? round1(vo2) : null,
      calories: calAvg > 0 ? round1(calAvg) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
      hrv: hrvAvg > 0 ? round1(hrvAvg) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 41. computeBrainReserve ─────────────────────────────────────────────────

export interface BrainReserveResult {
  reserveScore: number
  protectiveFactors: string[]
  riskFactors: string[]
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeBrainReserve(
  userId: string,
  date?: Date,
): Promise<BrainReserveResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  let score = 50
  const protective: string[] = []
  const risk: string[] = []

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 8000) { score += 12; protective.push("high_physical_activity") }
  else if (stepsAvg > 0 && stepsAvg < 3000) { score -= 10; risk.push("low_physical_activity") }

  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 2) { score += 10; protective.push("adequate_deep_sleep") }
  else if (deepAvg > 0 && deepAvg < 1) { score -= 8; risk.push("insufficient_deep_sleep") }

  const remAvg = mean(vals(byType, "rem_sleep"))
  if (remAvg > 2) { score += 8; protective.push("healthy_rem_cycles") }
  else if (remAvg > 0 && remAvg < 1) { score -= 6; risk.push("reduced_rem_sleep") }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 0 && stressAvg < 30) { score += 8; protective.push("effective_stress_management") }
  else if (stressAvg > 65) { score -= 12; risk.push("chronic_high_stress") }

  const hrvAvg = mean(vals(byType, "hrv"))
  if (hrvAvg > 50) { score += 7; protective.push("strong_autonomic_tone") }
  else if (hrvAvg > 0 && hrvAvg < 25) { score -= 8; risk.push("poor_autonomic_function") }

  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 140) { score -= 8; risk.push("hypertension") }

  return {
    reserveScore: round1(clamp(score, 0, 100)),
    protectiveFactors: protective,
    riskFactors: risk,
    components: {
      steps: stepsAvg > 0 ? round1(stepsAvg) : null,
      deepSleep: deepAvg > 0 ? round1(deepAvg) : null,
      remSleep: remAvg > 0 ? round1(remAvg) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      hrv: hrvAvg > 0 ? round1(hrvAvg) : null,
      bloodPressure: bp > 0 ? round1(bp) : null,
    },
    confidence: round1(clamp(byType.size / 7, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 42. assessSocialConnectionProxy ─────────────────────────────────────────

export interface SocialConnectionResult {
  connectionScore: number
  isolationRisk: number
  healthImpact: number
  indicators: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessSocialConnectionProxy(
  userId: string,
  date?: Date,
): Promise<SocialConnectionResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const stepsData = vals(byType, "steps")
  const activeData = vals(byType, "active_minutes")
  const stepsCV = stepsData.length > 3 ? stdDev(stepsData) / Math.max(mean(stepsData), 1) : 0.5

  const activeDays = stepsData.filter((v) => v > 2000).length
  const regularity = stepsData.length > 0 ? activeDays / stepsData.length : 0.5
  const activeAvg = mean(activeData)

  let connection = 50
  if (regularity > 0.8) connection += 15
  else if (regularity < 0.4) connection -= 15
  if (stepsCV < 0.3) connection += 10
  else if (stepsCV > 0.6) connection -= 10
  if (activeAvg > 45) connection += 8
  else if (activeAvg > 0 && activeAvg < 15) connection -= 10

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 0 && stressAvg < 30) connection += 5
  else if (stressAvg > 70) connection -= 8

  connection = round1(clamp(connection, 0, 100))
  const isolation = round1(100 - connection)
  const healthImpact = round1(connection * 0.15)

  return {
    connectionScore: connection,
    isolationRisk: isolation,
    healthImpact,
    indicators: {
      activityRegularity: round1(regularity * 100),
      stepsVariability: stepsData.length > 0 ? round1(stepsCV * 100) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
    },
    confidence: round1(clamp(byType.size / 4, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 43. computeLongevityLifestyleScore ──────────────────────────────────────

export interface LongevityLifestyleResult {
  score: number
  pillars: Record<string, number>
  improvements: string[]
  confidence: number
  date: string
}

export async function computeLongevityLifestyleScore(
  userId: string,
  date?: Date,
): Promise<LongevityLifestyleResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const improvements: string[] = []

  const stepsAvg = mean(vals(byType, "steps"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const movement = clamp((stepsAvg / 8000) * 50 + (activeAvg / 45) * 50, 0, 100)
  if (movement < 60) improvements.push("increase_daily_natural_movement")

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const deepAvg = mean(vals(byType, "deep_sleep"))
  const rest = clamp(sleepAvg > 0 ? 100 - Math.abs(sleepAvg - 7.5) * 15 - (deepAvg < 1.5 ? 15 : 0) : 40, 0, 100)
  if (rest < 60) improvements.push("improve_sleep_quality_and_duration")

  const stressAvg = mean(vals(byType, "stress"))
  const purpose = clamp(stressAvg > 0 ? 100 - stressAvg * 1.0 : 50, 0, 100)
  if (purpose < 60) improvements.push("develop_stress_reduction_practices")

  const bf = mean(vals(byType, "body_fat"))
  const nutrition = bf > 0 ? clamp(100 - Math.abs(bf - 20) * 3, 0, 100) : 50
  if (nutrition < 60) improvements.push("optimize_body_composition_through_nutrition")

  const rhr = mean(vals(byType, "resting_heart_rate"))
  const hrvAvg = mean(vals(byType, "hrv"))
  const cardio = clamp(rhr > 0 ? 100 - (rhr - 55) * 1.5 + (hrvAvg > 0 ? (hrvAvg - 30) * 0.5 : 0) : 50, 0, 100)
  if (cardio < 60) improvements.push("improve_cardiovascular_health")

  const pillars = {
    naturalMovement: round1(movement),
    restAndRecovery: round1(rest),
    stressManagement: round1(purpose),
    nutrition: round1(nutrition),
    cardiovascularHealth: round1(cardio),
  }

  const score = round1(movement * 0.25 + rest * 0.2 + purpose * 0.2 + nutrition * 0.15 + cardio * 0.2)

  return {
    score,
    pillars,
    improvements,
    confidence: round1(clamp(byType.size / 8, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 44. analyzeCentenarianMarkers ───────────────────────────────────────────

export interface CentenarianResult {
  markerCount: number
  matchedPatterns: string[]
  longevityProbability: number
  confidence: number
  date: string
}

export async function analyzeCentenarianMarkers(
  userId: string,
  date?: Date,
): Promise<CentenarianResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const matched: string[] = []

  const rhr = mean(vals(byType, "resting_heart_rate"))
  if (rhr > 0 && rhr < 65) matched.push("low_resting_heart_rate")

  const hrvAvg = mean(vals(byType, "hrv"))
  if (hrvAvg > 55) matched.push("high_hrv_autonomic_resilience")

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 7000) matched.push("naturally_active_lifestyle")

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg >= 7 && sleepAvg <= 8.5) matched.push("optimal_sleep_duration")

  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 1.5) matched.push("preserved_deep_sleep")

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 0 && stressAvg < 35) matched.push("low_chronic_stress")

  const bf = mean(vals(byType, "body_fat"))
  if (bf > 0 && bf < 25) matched.push("lean_body_composition")

  const spo2 = mean(vals(byType, "blood_oxygen"))
  if (spo2 >= 97) matched.push("excellent_blood_oxygenation")

  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 0 && bp < 125) matched.push("healthy_blood_pressure")

  const vo2 = mean(vals(byType, "vo2max"))
  if (vo2 > 40) matched.push("above_average_fitness")

  const probability = round1(clamp((matched.length / 10) * 100, 0, 100))

  return {
    markerCount: matched.length,
    matchedPatterns: matched,
    longevityProbability: probability,
    confidence: round1(clamp(byType.size / 10, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 45. computeCompressionOfMorbidity ───────────────────────────────────────

export interface CompressionResult {
  compressionIndex: number
  healthyYearsRatio: number
  trajectory: string
  components: Record<string, number>
  confidence: number
  date: string
}

export async function computeCompressionOfMorbidity(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<CompressionResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 90 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const stepsAvg = mean(vals(byType, "steps"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const vo2 = mean(vals(byType, "vo2max"))
  const hrvAvg = mean(vals(byType, "hrv"))
  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const stressAvg = mean(vals(byType, "stress"))

  const functional = clamp(
    (stepsAvg > 0 ? (stepsAvg / 10000) * 25 : 12.5) +
    (activeAvg > 0 ? (activeAvg / 60) * 25 : 12.5) +
    (vo2 > 0 ? (vo2 / 50) * 25 : 12.5) +
    (hrvAvg > 0 ? (hrvAvg / 70) * 25 : 12.5), 0, 100)

  const stepsSlope = linearSlope(vals(byType, "steps"))
  const vo2Slope = linearSlope(vals(byType, "vo2max"))
  const trajectory = (stepsSlope > 20 || vo2Slope > 0.05) ? "improving" :
    (stepsSlope < -50 || vo2Slope < -0.1) ? "declining" : "stable"

  const lifeExpectancy = 80
  const healthyProportion = functional / 100
  const healthyYears = (lifeExpectancy - age) * healthyProportion
  const totalRemaining = lifeExpectancy - age
  const ratio = totalRemaining > 0 ? round1(healthyYears / totalRemaining) : 0

  return {
    compressionIndex: round1(functional),
    healthyYearsRatio: ratio,
    trajectory,
    components: {
      mobility: round1(stepsAvg > 0 ? (stepsAvg / 10000) * 100 : 50),
      fitness: round1(vo2 > 0 ? (vo2 / 50) * 100 : 50),
      autonomic: round1(hrvAvg > 0 ? (hrvAvg / 70) * 100 : 50),
      recovery: round1(sleepAvg > 0 ? (1 - Math.abs(sleepAvg - 7.5) / 3) * 100 : 50),
    },
    confidence: round1(clamp(byType.size / 7, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 46. assessDisabilityFreeYears ───────────────────────────────────────────

export interface DisabilityFreeResult {
  estimatedYears: number
  currentTrajectory: string
  optimizedTrajectory: string
  factors: Record<string, number>
  confidence: number
  date: string
}

export async function assessDisabilityFreeYears(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<DisabilityFreeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const stepsAvg = mean(vals(byType, "steps"))
  const vo2 = mean(vals(byType, "vo2max"))
  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const bf = mean(vals(byType, "body_fat"))

  let baseYears = 80 - age
  let modifier = 0
  if (stepsAvg > 8000) modifier += 3
  else if (stepsAvg > 0 && stepsAvg < 3000) modifier -= 5
  if (vo2 > 40) modifier += 4
  else if (vo2 > 0 && vo2 < 25) modifier -= 5
  if (sleepAvg >= 7 && sleepAvg <= 8.5) modifier += 2
  else if (sleepAvg > 0 && sleepAvg < 6) modifier -= 3
  if (activeAvg > 45) modifier += 2
  if (bf > 0 && bf < 25) modifier += 1
  else if (bf > 35) modifier -= 3

  const estimated = round1(Math.max(baseYears + modifier, 0))
  const optimized = round1(Math.max(baseYears + 10, 0))
  const current = modifier > 2 ? "above_average" : modifier < -2 ? "below_average" : "average"
  const optimizedTrajectory = "achievable_with_lifestyle_optimization"

  return {
    estimatedYears: estimated,
    currentTrajectory: current,
    optimizedTrajectory,
    factors: {
      physicalActivity: round1(clamp((stepsAvg / 10000) * 100, 0, 100)),
      fitness: round1(vo2 > 0 ? clamp((vo2 / 50) * 100, 0, 100) : 50),
      sleepQuality: round1(sleepAvg > 0 ? clamp(100 - Math.abs(sleepAvg - 7.5) * 20, 0, 100) : 50),
      bodyComposition: round1(bf > 0 ? clamp(100 - Math.abs(bf - 20) * 3, 0, 100) : 50),
    },
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 47. computeQALYEstimate ─────────────────────────────────────────────────

export interface QALYResult {
  qalyScore: number
  qualityIndex: number
  improvementPotential: number
  dimensions: Record<string, number>
  confidence: number
  date: string
}

export async function computeQALYEstimate(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<QALYResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const stepsAvg = mean(vals(byType, "steps"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const stressAvg = mean(vals(byType, "stress"))
  const hrvAvg = mean(vals(byType, "hrv"))

  const mobility = clamp((stepsAvg / 8000) * 100, 0, 100)
  const activity = clamp((activeAvg / 45) * 100, 0, 100)
  const rest = sleepAvg > 0 ? clamp(100 - Math.abs(sleepAvg - 7.5) * 15, 0, 100) : 50
  const mental = stressAvg > 0 ? clamp(100 - stressAvg, 0, 100) : 50
  const autonomic = hrvAvg > 0 ? clamp((hrvAvg / 60) * 100, 0, 100) : 50

  const dimensions = {
    mobility: round1(mobility),
    usualActivities: round1(activity),
    sleepRecovery: round1(rest),
    mentalHealth: round1(mental),
    vitality: round1(autonomic),
  }

  const qualityIndex = round1((mobility * 0.2 + activity * 0.2 + rest * 0.2 + mental * 0.2 + autonomic * 0.2) / 100)
  const remainingYears = Math.max(85 - age, 0)
  const qaly = round1(remainingYears * qualityIndex)
  const maxQaly = round1(remainingYears * 1.0)
  const improvement = round1(maxQaly - qaly)

  return {
    qalyScore: qaly,
    qualityIndex,
    improvementPotential: improvement,
    dimensions,
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 48. analyzeDiseaseFreeeSurvival ─────────────────────────────────────────

export interface DiseaseFreeSurvivalResult {
  survivalScore: number
  riskFactors: string[]
  protectiveFactors: string[]
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeDiseaseFreeeSurvival(
  userId: string,
  date?: Date,
): Promise<DiseaseFreeSurvivalResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  let score = 70
  const riskF: string[] = []
  const protF: string[] = []

  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 140) { score -= 12; riskF.push("hypertension") }
  else if (bp > 0 && bp < 120) { score += 5; protF.push("healthy_blood_pressure") }

  const bf = mean(vals(byType, "body_fat"))
  if (bf > 30) { score -= 8; riskF.push("excess_body_fat") }
  else if (bf > 0 && bf < 22) { score += 5; protF.push("lean_composition") }

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 8000) { score += 8; protF.push("active_lifestyle") }
  else if (stepsAvg > 0 && stepsAvg < 3000) { score -= 10; riskF.push("physical_inactivity") }

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg >= 7 && sleepAvg <= 8.5) { score += 5; protF.push("optimal_sleep") }
  else if (sleepAvg > 0 && (sleepAvg < 6 || sleepAvg > 9)) { score -= 6; riskF.push("abnormal_sleep_duration") }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 70) { score -= 8; riskF.push("chronic_stress") }
  else if (stressAvg > 0 && stressAvg < 30) { score += 5; protF.push("low_stress") }

  const rhr = mean(vals(byType, "resting_heart_rate"))
  if (rhr > 80) { score -= 6; riskF.push("elevated_resting_hr") }
  else if (rhr > 0 && rhr < 60) { score += 5; protF.push("athletic_heart_rate") }

  return {
    survivalScore: round1(clamp(score, 0, 100)),
    riskFactors: riskF,
    protectiveFactors: protF,
    components: {
      bloodPressure: bp > 0 ? round1(bp) : null,
      bodyFat: bf > 0 ? round1(bf) : null,
      steps: stepsAvg > 0 ? round1(stepsAvg) : null,
      sleep: sleepAvg > 0 ? round1(sleepAvg) : null,
      stress: stressAvg > 0 ? round1(stressAvg) : null,
      restingHR: rhr > 0 ? round1(rhr) : null,
    },
    confidence: round1(clamp(byType.size / 8, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 49. computeChronicDiseaseBurden ─────────────────────────────────────────

export interface ChronicDiseaseBurdenResult {
  burdenScore: number
  diseaseRisks: Record<string, number>
  modifiableFactors: string[]
  confidence: number
  date: string
}

export async function computeChronicDiseaseBurden(
  userId: string,
  date?: Date,
): Promise<ChronicDiseaseBurdenResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const bp = mean(vals(byType, "blood_pressure"))
  const bf = mean(vals(byType, "body_fat"))
  const stepsAvg = mean(vals(byType, "steps"))
  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const stressAvg = mean(vals(byType, "stress"))
  const rhr = mean(vals(byType, "resting_heart_rate"))

  const modifiable: string[] = []

  let cvdRisk = 10
  if (bp > 130) { cvdRisk += (bp - 130) * 0.5; modifiable.push("blood_pressure_management") }
  if (rhr > 75) cvdRisk += (rhr - 75) * 0.3
  if (bf > 30) cvdRisk += (bf - 30) * 0.3

  let diabetesRisk = 8
  if (bf > 28) { diabetesRisk += (bf - 28) * 0.6; modifiable.push("weight_management") }
  if (stepsAvg > 0 && stepsAvg < 4000) { diabetesRisk += 10; modifiable.push("increase_activity") }

  let cancerRisk = 8
  if (bf > 30) cancerRisk += (bf - 30) * 0.2
  if (stepsAvg > 0 && stepsAvg < 3000) cancerRisk += 5
  if (sleepAvg > 0 && sleepAvg < 6) { cancerRisk += 5; modifiable.push("improve_sleep") }

  let mentalRisk = 8
  if (stressAvg > 65) { mentalRisk += (stressAvg - 65) * 0.4; modifiable.push("stress_reduction") }
  if (stepsAvg > 0 && stepsAvg < 3000) mentalRisk += 5

  const burden = round1((cvdRisk + diabetesRisk + cancerRisk + mentalRisk) / 4)

  return {
    burdenScore: round1(clamp(burden, 0, 100)),
    diseaseRisks: {
      cardiovascular: round1(clamp(cvdRisk, 0, 100)),
      metabolic: round1(clamp(diabetesRisk, 0, 100)),
      cancer: round1(clamp(cancerRisk, 0, 100)),
      mentalHealth: round1(clamp(mentalRisk, 0, 100)),
    },
    modifiableFactors: [...new Set(modifiable)],
    confidence: round1(clamp(byType.size / 7, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 50. assessMultiMorbidityRisk ────────────────────────────────────────────

export interface MultiMorbidityResult {
  riskScore: number
  topRisks: string[]
  preventiveActions: string[]
  riskFactorCount: number
  confidence: number
  date: string
}

export async function assessMultiMorbidityRisk(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<MultiMorbidityResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  let factorCount = 0
  const topRisks: string[] = []
  const actions: string[] = []

  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 135) { factorCount++; topRisks.push("cardiovascular"); actions.push("manage_blood_pressure") }

  const bf = mean(vals(byType, "body_fat"))
  if (bf > 30) { factorCount++; topRisks.push("metabolic_syndrome"); actions.push("reduce_body_fat") }

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 0 && stepsAvg < 3000) { factorCount++; topRisks.push("musculoskeletal"); actions.push("increase_daily_movement") }

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  if (sleepAvg > 0 && sleepAvg < 6) { factorCount++; topRisks.push("neurological"); actions.push("prioritize_sleep") }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 70) { factorCount++; topRisks.push("mental_health"); actions.push("develop_stress_coping") }

  const rhr = mean(vals(byType, "resting_heart_rate"))
  if (rhr > 85) { factorCount++; topRisks.push("cardiac") }

  if (age > 65) factorCount++

  const riskScore = round1(clamp(factorCount * 14 + (age > 50 ? (age - 50) * 0.5 : 0), 0, 100))

  return {
    riskScore,
    topRisks,
    preventiveActions: actions,
    riskFactorCount: factorCount,
    confidence: round1(clamp(byType.size / 7, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 51. computeResilienceIndex ──────────────────────────────────────────────

export interface ResilienceResult {
  resilienceScore: number
  physicalResilience: number
  psychologicalResilience: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeResilienceIndex(
  userId: string,
  date?: Date,
): Promise<ResilienceResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const hrvData = vals(byType, "hrv")
  const hrvRecovery = hrvData.length > 5 ? 100 - (stdDev(hrvData) / Math.max(mean(hrvData), 1)) * 100 : 50
  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const sleepRebound = sleepAvg > 0 ? clamp(100 - Math.abs(sleepAvg - 7.5) * 15, 0, 100) : 50
  const stepsData = vals(byType, "steps")
  const activityConsistency = stepsData.length > 5 ? 100 - (stdDev(stepsData) / Math.max(mean(stepsData), 1)) * 80 : 50

  const physical = round1(clamp(hrvRecovery * 0.4 + sleepRebound * 0.3 + activityConsistency * 0.3, 0, 100))

  const stressAvg = mean(vals(byType, "stress"))
  const stressResilience = stressAvg > 0 ? clamp(100 - stressAvg, 0, 100) : 50
  const deepAvg = mean(vals(byType, "deep_sleep"))
  const restorativeSleep = deepAvg > 0 ? clamp((deepAvg / 2.5) * 100, 0, 100) : 50

  const psychological = round1(clamp(stressResilience * 0.5 + restorativeSleep * 0.5, 0, 100))
  const overall = round1(physical * 0.55 + psychological * 0.45)

  return {
    resilienceScore: overall,
    physicalResilience: physical,
    psychologicalResilience: psychological,
    components: {
      hrvRecovery: hrvData.length > 0 ? round1(hrvRecovery) : null,
      sleepRebound: sleepAvg > 0 ? round1(sleepRebound) : null,
      activityConsistency: stepsData.length > 0 ? round1(activityConsistency) : null,
      stressResilience: stressAvg > 0 ? round1(stressResilience) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 52. analyzeStressAccumulation ───────────────────────────────────────────

export interface StressAccumulationResult {
  accumulatedStress: number
  agingImpact: number
  recoveryDebt: number
  weeklyBreakdown: number[]
  confidence: number
  date: string
}

export async function analyzeStressAccumulation(
  userId: string,
  date?: Date,
): Promise<StressAccumulationResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 28 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const stressData = vals(byType, "stress")
  const sleepData = vals(byType, "sleep_duration")
  const hrvData = vals(byType, "hrv")

  const weeklyStress: number[] = []
  for (let w = 0; w < 4; w++) {
    const weekSlice = stressData.slice(w * 7, (w + 1) * 7)
    weeklyStress.push(weekSlice.length > 0 ? round1(mean(weekSlice)) : 0)
  }

  const avgStress = mean(stressData)
  const accumulated = round1(clamp(avgStress * 1.2, 0, 100))

  const sleepDeficit = sleepData.length > 0 ? Math.max(0, 7.5 - mean(sleepData)) : 0
  const hrvSuppression = hrvData.length > 0 && mean(hrvData) < 35 ? (35 - mean(hrvData)) * 0.5 : 0
  const agingImpact = round1(clamp(accumulated * 0.15 + sleepDeficit * 3 + hrvSuppression, 0, 50))
  const recoveryDebt = round1(clamp(sleepDeficit * 5 + avgStress * 0.3, 0, 100))

  return {
    accumulatedStress: accumulated,
    agingImpact,
    recoveryDebt,
    weeklyBreakdown: weeklyStress,
    confidence: round1(clamp(stressData.length / 20, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 53. computeRecoveryCapacityAge ──────────────────────────────────────────

export interface RecoveryCapacityResult {
  recoveryAge: number
  capacityPercent: number
  trend: string
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeRecoveryCapacityAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<RecoveryCapacityResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const hrvData = vals(byType, "hrv")
  const rhrData = vals(byType, "resting_heart_rate")
  const sleepData = vals(byType, "sleep_duration")
  const deepData = vals(byType, "deep_sleep")

  let offset = 0
  const hrvMean = mean(hrvData)
  if (hrvMean > 0 && hrvMean < 30) offset += (30 - hrvMean) * 0.3
  else if (hrvMean > 55) offset -= 3

  const rhrMean = mean(rhrData)
  if (rhrMean > 75) offset += (rhrMean - 75) * 0.2
  else if (rhrMean > 0 && rhrMean < 58) offset -= 2

  const sleepMean = mean(sleepData)
  if (sleepMean > 0 && sleepMean < 6.5) offset += 3
  const deepMean = mean(deepData)
  if (deepMean > 0 && deepMean < 1) offset += 4
  else if (deepMean > 2.5) offset -= 2

  const recoveryAge = round1(age + offset)
  const capacity = round1(clamp(100 - (recoveryAge - age) * 3, 0, 100))

  const hrvSlope = linearSlope(hrvData)
  const trend = hrvSlope > 0.1 ? "improving" : hrvSlope < -0.1 ? "declining" : "stable"

  return {
    recoveryAge,
    capacityPercent: capacity,
    trend,
    components: {
      hrv: hrvMean > 0 ? round1(hrvMean) : null,
      restingHR: rhrMean > 0 ? round1(rhrMean) : null,
      sleepDuration: sleepMean > 0 ? round1(sleepMean) : null,
      deepSleep: deepMean > 0 ? round1(deepMean) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 54. assessThermogenicCapacity ───────────────────────────────────────────

export interface ThermogenicResult {
  capacityScore: number
  ageRelatedDecline: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessThermogenicCapacity(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<ThermogenicResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const tempData = vals(byType, "body_temperature")
  const tempStability = tempData.length > 3 ? stdDev(tempData) : 0.3
  const tempMean = mean(tempData)

  const rhrData = vals(byType, "resting_heart_rate")
  const rhrMean = mean(rhrData)
  const activeAvg = mean(vals(byType, "active_minutes"))
  const bf = mean(vals(byType, "body_fat"))

  let score = 70
  if (tempStability < 0.2) score += 10
  else if (tempStability > 0.5) score -= 10
  if (tempMean >= 36.4 && tempMean <= 37.0) score += 5
  if (rhrMean > 0 && rhrMean < 65) score += 5
  if (activeAvg > 45) score += 8
  else if (activeAvg > 0 && activeAvg < 15) score -= 10
  if (bf > 35) score -= 8

  const ageDecline = age > 50 ? round1((age - 50) * 0.5) : 0
  score -= ageDecline

  return {
    capacityScore: round1(clamp(score, 0, 100)),
    ageRelatedDecline: ageDecline,
    components: {
      tempStability: tempData.length > 0 ? round1(tempStability) : null,
      meanTemp: tempMean > 0 ? round1(tempMean) : null,
      restingHR: rhrMean > 0 ? round1(rhrMean) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
    },
    confidence: round1(clamp(byType.size / 4, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 55. computeCircadianStability ───────────────────────────────────────────

export interface CircadianStabilityResult {
  stabilityScore: number
  rhythmQuality: string
  ageDelta: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeCircadianStability(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<CircadianStabilityResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 14 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const sleepData = vals(byType, "sleep_duration")
  const sleepVar = sleepData.length > 3 ? stdDev(sleepData) : 1.0
  const stepsData = vals(byType, "steps")
  const stepsVar = stepsData.length > 3 ? stdDev(stepsData) / Math.max(mean(stepsData), 1) : 0.4
  const tempData = vals(byType, "body_temperature")
  const tempVar = tempData.length > 3 ? stdDev(tempData) : 0.3

  let score = 70
  if (sleepVar < 0.5) score += 15
  else if (sleepVar > 1.5) score -= 15
  if (stepsVar < 0.25) score += 10
  else if (stepsVar > 0.5) score -= 10
  if (tempVar < 0.2) score += 5
  else if (tempVar > 0.5) score -= 5

  score = round1(clamp(score, 0, 100))
  const quality = score > 75 ? "robust" : score > 50 ? "moderate" : score > 30 ? "disrupted" : "severely_disrupted"
  const ageDelta = round1((70 - score) * 0.2)

  return {
    stabilityScore: score,
    rhythmQuality: quality,
    ageDelta,
    components: {
      sleepVariability: sleepData.length > 0 ? round1(sleepVar) : null,
      activityVariability: stepsData.length > 0 ? round1(stepsVar * 100) : null,
      temperatureVariability: tempData.length > 0 ? round1(tempVar) : null,
    },
    confidence: round1(clamp(byType.size / 4, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 56. analyzeHydrationStatus ──────────────────────────────────────────────

export interface HydrationResult {
  hydrationScore: number
  dehydrationRisk: string
  indicators: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeHydrationStatus(
  userId: string,
  date?: Date,
): Promise<HydrationResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 7 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const tempData = vals(byType, "body_temperature")
  const rhrData = vals(byType, "resting_heart_rate")
  const bpData = vals(byType, "blood_pressure")

  let score = 70
  const tempMean = mean(tempData)
  if (tempMean > 37.2) score -= (tempMean - 37.2) * 20
  else if (tempMean >= 36.4 && tempMean <= 37.0) score += 10

  const rhrMean = mean(rhrData)
  if (rhrMean > 80) score -= (rhrMean - 80) * 0.5
  else if (rhrMean > 0 && rhrMean < 70) score += 5

  const bpMean = mean(bpData)
  if (bpMean > 0 && bpMean < 100) score -= 8
  else if (bpMean >= 110 && bpMean <= 125) score += 5

  const tempVar = tempData.length > 2 ? stdDev(tempData) : 0.3
  if (tempVar > 0.4) score -= 8

  score = round1(clamp(score, 0, 100))
  const risk = score > 70 ? "low" : score > 45 ? "moderate" : "high"

  return {
    hydrationScore: score,
    dehydrationRisk: risk,
    indicators: {
      bodyTemperature: tempMean > 0 ? round1(tempMean) : null,
      restingHR: rhrMean > 0 ? round1(rhrMean) : null,
      bloodPressure: bpMean > 0 ? round1(bpMean) : null,
      temperatureVariability: tempData.length > 0 ? round1(tempVar) : null,
    },
    confidence: round1(clamp(byType.size / 4, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 57. computeNutritionalStatus ────────────────────────────────────────────

export interface NutritionalStatusResult {
  statusScore: number
  deficiencyRisk: string
  recommendations: string[]
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeNutritionalStatus(
  userId: string,
  date?: Date,
): Promise<NutritionalStatusResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const calAvg = mean(vals(byType, "calories"))
  const weight = mean(vals(byType, "weight"))
  const bf = mean(vals(byType, "body_fat"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const weightSlope = linearSlope(vals(byType, "weight"))

  const recs: string[] = []
  let score = 60

  if (weight > 0 && calAvg > 0) {
    const bmr = 10 * weight + 625
    const ratio = calAvg / bmr
    if (ratio >= 1.1 && ratio <= 1.6) score += 15
    else if (ratio < 0.8) { score -= 10; recs.push("increase_caloric_intake") }
    else if (ratio > 2.0) { score -= 10; recs.push("reduce_caloric_surplus") }
  }

  if (bf > 0 && bf < 25) score += 10
  else if (bf > 30) { score -= 8; recs.push("improve_macronutrient_balance") }

  if (Math.abs(weightSlope) < 0.02) score += 5
  else if (weightSlope > 0.1) { score -= 5; recs.push("monitor_weight_gain") }
  else if (weightSlope < -0.1) { score -= 5; recs.push("monitor_weight_loss") }

  if (activeAvg > 45) score += 5
  else if (activeAvg > 0 && activeAvg < 15) { score -= 5; recs.push("increase_activity_for_metabolic_health") }

  score = round1(clamp(score, 0, 100))
  const risk = score > 70 ? "low" : score > 45 ? "moderate" : "high"

  return {
    statusScore: score,
    deficiencyRisk: risk,
    recommendations: recs,
    components: {
      calories: calAvg > 0 ? round1(calAvg) : null,
      weight: weight > 0 ? round1(weight) : null,
      bodyFat: bf > 0 ? round1(bf) : null,
      weightTrend: vals(byType, "weight").length > 3 ? round1(weightSlope) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 58. assessCardiorespiratoriFitness ──────────────────────────────────────

export interface CRFResult {
  crfScore: number
  agePercentile: number
  mortalityRiskReduction: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessCardiorespiratoriFitness(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<CRFResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const vo2 = mean(vals(byType, "vo2max"))
  const rhr = mean(vals(byType, "resting_heart_rate"))
  const spo2 = mean(vals(byType, "blood_oxygen"))
  const activeAvg = mean(vals(byType, "active_minutes"))
  const stepsAvg = mean(vals(byType, "steps"))

  let crfEstimate = vo2 > 0 ? vo2 : 35
  if (vo2 === 0 && rhr > 0) {
    const maxHR = 220 - age
    crfEstimate = 15.3 * (maxHR / rhr)
  }
  if (activeAvg > 45) crfEstimate += 2
  if (spo2 > 97) crfEstimate += 1

  const ageNorms: Record<string, number> = {
    "20": 45, "30": 42, "40": 39, "50": 36, "60": 33, "70": 28,
  }
  const decade = Math.min(70, Math.max(20, Math.floor(age / 10) * 10))
  const norm = ageNorms[decade.toString()] ?? 35
  const percentile = round1(clamp((crfEstimate / norm) * 50, 0, 100))

  const riskReduction = crfEstimate > norm ? round1(clamp((crfEstimate - norm) * 2, 0, 50)) : 0

  return {
    crfScore: round1(crfEstimate),
    agePercentile: percentile,
    mortalityRiskReduction: riskReduction,
    components: {
      vo2max: vo2 > 0 ? round1(vo2) : null,
      restingHR: rhr > 0 ? round1(rhr) : null,
      bloodOxygen: spo2 > 0 ? round1(spo2) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 59. computeOrganReserveIndex ────────────────────────────────────────────

export interface OrganReserveResult {
  overallReserve: number
  organScores: Record<string, number>
  weakestSystem: string
  confidence: number
  date: string
}

export async function computeOrganReserveIndex(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<OrganReserveResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const rhr = mean(vals(byType, "resting_heart_rate"))
  const hrvAvg = mean(vals(byType, "hrv"))
  const spo2 = mean(vals(byType, "blood_oxygen"))
  const rr = mean(vals(byType, "respiratory_rate"))
  const vo2 = mean(vals(byType, "vo2max"))
  const stepsAvg = mean(vals(byType, "steps"))
  const deepAvg = mean(vals(byType, "deep_sleep"))
  const bp = mean(vals(byType, "blood_pressure"))

  const maxHR = 220 - age
  const cardiac = rhr > 0 ? round1(clamp(((maxHR - rhr) / maxHR) * 100, 0, 100)) : 50
  const pulmonary = round1(clamp(
    (spo2 > 0 ? (spo2 - 90) * 8 : 40) + (rr > 0 && rr < 16 ? 15 : 0) + (vo2 > 0 ? (vo2 / 50) * 30 : 15),
    0, 100,
  ))
  const neuro = round1(clamp(
    (hrvAvg > 0 ? (hrvAvg / 70) * 50 : 25) + (deepAvg > 0 ? (deepAvg / 2.5) * 30 : 15),
    0, 100,
  ))
  const msk = round1(clamp((stepsAvg / 10000) * 100, 0, 100))
  const vascular = round1(clamp(bp > 0 ? 100 - (bp - 110) * 1.5 : 50, 0, 100))

  const organScores: Record<string, number> = { cardiac, pulmonary, neurological: neuro, musculoskeletal: msk, vascular }
  const entries = Object.entries(organScores)
  const weakest = entries.reduce((min, cur) => cur[1] < min[1] ? cur : min, entries[0]!)
  const overall = round1(mean(Object.values(organScores)))

  return {
    overallReserve: overall,
    organScores,
    weakestSystem: weakest[0],
    confidence: round1(clamp(byType.size / 8, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 60. analyzeLongevityTrajectory ──────────────────────────────────────────

export interface LongevityTrajectoryResult {
  trajectory: string
  optimismScore: number
  interventionPriorities: string[]
  trends: Record<string, string>
  confidence: number
  date: string
}

export async function analyzeLongevityTrajectory(
  userId: string,
  date?: Date,
): Promise<LongevityTrajectoryResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 90 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  const trends: Record<string, string> = {}
  const priorities: string[] = []
  let optimism = 50

  const assess = (key: string, label: string, goodDir: "up" | "down") => {
    const v = vals(byType, key)
    if (v.length < 5) { trends[label] = "insufficient_data"; return }
    const slope = linearSlope(v)
    const isGood = goodDir === "up" ? slope > 0.01 : slope < -0.01
    const isBad = goodDir === "up" ? slope < -0.01 : slope > 0.01
    if (isGood) { trends[label] = "improving"; optimism += 6 }
    else if (isBad) { trends[label] = "declining"; optimism -= 6; priorities.push(`improve_${label}`) }
    else { trends[label] = "stable"; optimism += 2 }
  }

  assess("hrv", "hrv", "up")
  assess("resting_heart_rate", "restingHR", "down")
  assess("steps", "dailySteps", "up")
  assess("active_minutes", "activeMinutes", "up")
  assess("sleep_duration", "sleepDuration", "up")
  assess("deep_sleep", "deepSleep", "up")
  assess("vo2max", "vo2max", "up")
  assess("stress", "stress", "down")
  assess("body_fat", "bodyFat", "down")
  assess("blood_oxygen", "bloodOxygen", "up")

  optimism = round1(clamp(optimism, 0, 100))
  const trajectory = optimism > 65 ? "positive" : optimism > 40 ? "stable" : "concerning"

  return {
    trajectory,
    optimismScore: optimism,
    interventionPriorities: priorities.slice(0, 5),
    trends,
    confidence: round1(clamp(byType.size / 10, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 61. computeHealthyAgingScore ────────────────────────────────────────────

export interface HealthyAgingResult {
  score: number
  ageGap: number
  components: Record<string, number>
  recommendations: string[]
  confidence: number
  date: string
}

export async function computeHealthyAgingScore(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<HealthyAgingResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const recs: string[] = []

  const rhr = mean(vals(byType, "resting_heart_rate"))
  const cardio = rhr > 0 ? clamp(100 - (rhr - 55) * 2, 0, 100) : 50
  if (cardio < 50) recs.push("improve_cardiovascular_health")

  const stepsAvg = mean(vals(byType, "steps"))
  const mobility = clamp((stepsAvg / 10000) * 100, 0, 100)
  if (mobility < 40) recs.push("increase_daily_movement")

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const deepAvg = mean(vals(byType, "deep_sleep"))
  const sleep = sleepAvg > 0 ? clamp(100 - Math.abs(sleepAvg - 7.5) * 15 - (deepAvg < 1.5 ? 10 : 0), 0, 100) : 50
  if (sleep < 50) recs.push("optimize_sleep_quality")

  const stressAvg = mean(vals(byType, "stress"))
  const mental = stressAvg > 0 ? clamp(100 - stressAvg, 0, 100) : 50
  if (mental < 50) recs.push("develop_stress_management")

  const bf = mean(vals(byType, "body_fat"))
  const body = bf > 0 ? clamp(100 - Math.abs(bf - 20) * 3, 0, 100) : 50
  if (body < 50) recs.push("optimize_body_composition")

  const vo2 = mean(vals(byType, "vo2max"))
  const fitness = vo2 > 0 ? clamp((vo2 / 50) * 100, 0, 100) : 50
  if (fitness < 50) recs.push("increase_aerobic_fitness")

  const components = {
    cardiovascular: round1(cardio),
    mobility: round1(mobility),
    sleep: round1(sleep),
    mentalHealth: round1(mental),
    bodyComposition: round1(body),
    fitness: round1(fitness),
  }

  const score = round1(
    cardio * 0.2 + mobility * 0.15 + sleep * 0.2 + mental * 0.15 + body * 0.15 + fitness * 0.15,
  )
  const ageGap = round1((score - 50) * -0.3)

  return {
    score,
    ageGap,
    components,
    recommendations: recs,
    confidence: round1(clamp(byType.size / 8, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 62. assessVascularStiffnessProxy ────────────────────────────────────────

export interface VascularStiffnessResult {
  stiffnessIndex: number
  vascularAge: number
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function assessVascularStiffnessProxy(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<VascularStiffnessResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const bp = mean(vals(byType, "blood_pressure"))
  const rhr = mean(vals(byType, "resting_heart_rate"))
  const hrvAvg = mean(vals(byType, "hrv"))

  let stiffness = age > 30 ? (age - 30) * 0.5 : 0
  if (bp > 125) stiffness += (bp - 125) * 0.4
  if (rhr > 75) stiffness += (rhr - 75) * 0.3
  if (hrvAvg > 0 && hrvAvg < 30) stiffness += (30 - hrvAvg) * 0.2

  const activeAvg = mean(vals(byType, "active_minutes"))
  if (activeAvg > 45) stiffness -= 5
  else if (activeAvg > 0 && activeAvg < 15) stiffness += 5

  stiffness = round1(clamp(stiffness, 0, 100))
  const vascAge = round1(age + stiffness * 0.3)

  return {
    stiffnessIndex: stiffness,
    vascularAge: vascAge,
    components: {
      bloodPressure: bp > 0 ? round1(bp) : null,
      restingHR: rhr > 0 ? round1(rhr) : null,
      hrv: hrvAvg > 0 ? round1(hrvAvg) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
    },
    confidence: round1(clamp(byType.size / 5, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 63. computeEndothelialFunctionProxy ─────────────────────────────────────

export interface EndothelialFunctionResult {
  functionScore: number
  vascularHealth: string
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function computeEndothelialFunctionProxy(
  userId: string,
  date?: Date,
): Promise<EndothelialFunctionResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)

  let score = 60
  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 0 && bp < 120) score += 10
  else if (bp > 140) score -= 15

  const rhr = mean(vals(byType, "resting_heart_rate"))
  if (rhr > 0 && rhr < 62) score += 8
  else if (rhr > 80) score -= 8

  const hrvAvg = mean(vals(byType, "hrv"))
  if (hrvAvg > 50) score += 8
  else if (hrvAvg > 0 && hrvAvg < 25) score -= 10

  const activeAvg = mean(vals(byType, "active_minutes"))
  if (activeAvg > 45) score += 10
  else if (activeAvg > 0 && activeAvg < 15) score -= 8

  const spo2 = mean(vals(byType, "blood_oxygen"))
  if (spo2 > 97) score += 5
  else if (spo2 > 0 && spo2 < 94) score -= 8

  score = round1(clamp(score, 0, 100))
  const health = score > 75 ? "excellent" : score > 55 ? "good" : score > 35 ? "fair" : "poor"

  return {
    functionScore: score,
    vascularHealth: health,
    components: {
      bloodPressure: bp > 0 ? round1(bp) : null,
      restingHR: rhr > 0 ? round1(rhr) : null,
      hrv: hrvAvg > 0 ? round1(hrvAvg) : null,
      activeMinutes: activeAvg > 0 ? round1(activeAvg) : null,
      bloodOxygen: spo2 > 0 ? round1(spo2) : null,
    },
    confidence: round1(clamp(byType.size / 6, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 64. analyzeBodyCompositionAge ───────────────────────────────────────────

export interface BodyCompositionAgeResult {
  compositionAge: number
  ageDelta: number
  trend: string
  components: Record<string, number | null>
  confidence: number
  date: string
}

export async function analyzeBodyCompositionAge(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<BodyCompositionAgeResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 60 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const weight = mean(vals(byType, "weight"))
  const bf = mean(vals(byType, "body_fat"))
  const bfSlope = linearSlope(vals(byType, "body_fat"))
  const weightSlope = linearSlope(vals(byType, "weight"))

  let offset = 0
  if (bf > 28) offset += (bf - 28) * 0.4
  else if (bf > 0 && bf < 18) offset -= 2
  if (bfSlope > 0.05) offset += 3
  else if (bfSlope < -0.03) offset -= 2
  if (weightSlope > 0.1) offset += 2

  const leanMass = weight > 0 && bf > 0 ? weight * (1 - bf / 100) : 0
  if (leanMass > 0 && leanMass < 50) offset += 3
  else if (leanMass > 65) offset -= 2

  const compAge = round1(age + offset)
  const trend = bfSlope > 0.03 ? "worsening" : bfSlope < -0.02 ? "improving" : "stable"

  return {
    compositionAge: compAge,
    ageDelta: round1(offset),
    trend,
    components: {
      weight: weight > 0 ? round1(weight) : null,
      bodyFat: bf > 0 ? round1(bf) : null,
      leanMass: leanMass > 0 ? round1(leanMass) : null,
      bodyFatTrend: vals(byType, "body_fat").length > 5 ? round1(bfSlope) : null,
    },
    confidence: round1(clamp(byType.size / 4, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}

// ── 65. computeSuperAgerScore ───────────────────────────────────────────────

export interface SuperAgerResult {
  superAgerScore: number
  matchedTraits: string[]
  topPerformingMetrics: string[]
  percentile: number
  confidence: number
  date: string
}

export async function computeSuperAgerScore(
  userId: string,
  date?: Date,
  birthYear?: number,
): Promise<SuperAgerResult> {
  const targetDate = date ?? new Date()
  const start = new Date(targetDate.getTime() - 30 * 86400000)
  const byType = await queryMetrics(userId, start, targetDate)
  const age = chronoAge(birthYear, targetDate)

  const matched: string[] = []
  const top: string[] = []

  const youngerByYears = 20
  const youngerAge = age - youngerByYears

  const rhr = mean(vals(byType, "resting_heart_rate"))
  const rhrNormYoung = 62
  if (rhr > 0 && rhr <= rhrNormYoung) { matched.push("youthful_heart_rate"); top.push("resting_heart_rate") }

  const hrvAvg = mean(vals(byType, "hrv"))
  const hrvNormYoung = 55
  if (hrvAvg >= hrvNormYoung) { matched.push("youthful_autonomic_function"); top.push("hrv") }

  const vo2 = mean(vals(byType, "vo2max"))
  const vo2NormYoung = youngerAge < 40 ? 44 : 40
  if (vo2 >= vo2NormYoung) { matched.push("youthful_aerobic_capacity"); top.push("vo2max") }

  const stepsAvg = mean(vals(byType, "steps"))
  if (stepsAvg > 9000) { matched.push("youthful_mobility"); top.push("daily_steps") }

  const sleepAvg = mean(vals(byType, "sleep_duration"))
  const deepAvg = mean(vals(byType, "deep_sleep"))
  if (deepAvg > 2) { matched.push("youthful_sleep_architecture"); top.push("deep_sleep") }
  if (sleepAvg >= 7 && sleepAvg <= 8.5) matched.push("optimal_sleep_duration")

  const bf = mean(vals(byType, "body_fat"))
  if (bf > 0 && bf < 22) { matched.push("youthful_body_composition"); top.push("body_fat") }

  const spo2 = mean(vals(byType, "blood_oxygen"))
  if (spo2 >= 98) { matched.push("excellent_oxygenation"); top.push("blood_oxygen") }

  const stressAvg = mean(vals(byType, "stress"))
  if (stressAvg > 0 && stressAvg < 25) { matched.push("exceptional_stress_resilience"); top.push("stress") }

  const bp = mean(vals(byType, "blood_pressure"))
  if (bp > 0 && bp < 118) { matched.push("youthful_vascular_health"); top.push("blood_pressure") }

  const superScore = round1(clamp((matched.length / 10) * 100, 0, 100))
  const percentile = round1(clamp(superScore * 0.95, 0, 99))

  return {
    superAgerScore: superScore,
    matchedTraits: matched,
    topPerformingMetrics: top,
    percentile,
    confidence: round1(clamp(byType.size / 10, 0, 1)),
    date: targetDate.toISOString().slice(0, 10),
  }
}
