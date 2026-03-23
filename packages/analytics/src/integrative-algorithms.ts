import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, asc, sql } from "drizzle-orm"

// ── helpers ──────────────────────────────────────────────────────────────────

function mean(vals: number[]): number {
  return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0
  const m = mean(vals)
  return Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function scoreToGrade(score: number): string {
  if (score >= 95) return "A+"
  if (score >= 90) return "A"
  if (score >= 85) return "B+"
  if (score >= 80) return "B"
  if (score >= 75) return "C+"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  return "F"
}

function linearScale(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2
  return clamp(outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin), outMin, outMax)
}

function vals(data: Array<{ value: number }>): number[] {
  return data.map((d) => d.value)
}

function recent(data: Array<{ value: number; date: Date }>, n: number): Array<{ value: number; date: Date }> {
  return data.slice(-n)
}

function trendDirection(data: Array<{ value: number; date: Date }>): "improving" | "declining" | "stable" {
  if (data.length < 6) return "stable"
  const half = Math.floor(data.length / 2)
  const first = mean(data.slice(0, half).map((d) => d.value))
  const second = mean(data.slice(half).map((d) => d.value))
  const pct = first > 0 ? ((second - first) / first) * 100 : 0
  if (pct > 5) return "improving"
  if (pct < -5) return "declining"
  return "stable"
}

function coefficientOfVariation(data: number[]): number {
  const m = mean(data)
  return m > 0 ? stddev(data) / m : 0
}

async function fetchMetrics(
  db: ReturnType<typeof getDb>,
  userId: string,
  lookback: Date,
  targetDate: Date,
) {
  const metrics = await db
    .select({
      metricType: healthMetrics.metricType,
      value: healthMetrics.value,
      recordedAt: healthMetrics.recordedAt,
    })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        gte(healthMetrics.recordedAt, lookback),
        lte(healthMetrics.recordedAt, targetDate),
      ),
    )
    .orderBy(asc(healthMetrics.recordedAt))

  const byType = new Map<string, Array<{ value: number; date: Date }>>()
  for (const m of metrics) {
    if (m.value == null) continue
    const arr = byType.get(m.metricType) ?? []
    arr.push({ value: m.value, date: new Date(m.recordedAt) })
    byType.set(m.metricType, arr)
  }
  return byType
}

// ── 1. computeOverallWellnessScore ──────────────────────────────────────────

export interface OverallWellnessScore {
  score: number
  grade: string
  cardiovascularScore: number
  sleepScore: number
  activityScore: number
  stressScore: number
  bodyCompScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeOverallWellnessScore(
  userId: string,
  date?: Date,
): Promise<OverallWellnessScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const rhrData = byType.get("resting_heart_rate") ?? []
  const hrvData = byType.get("hrv") ?? []
  const sleepData = byType.get("sleep_duration") ?? []
  const deepData = byType.get("deep_sleep") ?? []
  const stepsData = byType.get("steps") ?? []
  const activeData = byType.get("active_minutes") ?? []
  const stressData = byType.get("stress") ?? []
  const spo2Data = byType.get("blood_oxygen") ?? []
  const weightData = byType.get("weight") ?? []
  const bfData = byType.get("body_fat") ?? []
  
  const avgRHR = rhrData.length > 0 ? mean(vals(recent(rhrData, 7))) : 65
  const avgHRV = hrvData.length > 0 ? mean(vals(recent(hrvData, 7))) : 40
  const avgSleep = sleepData.length > 0 ? mean(vals(recent(sleepData, 7))) : 7
  const avgDeep = deepData.length > 0 ? mean(vals(recent(deepData, 7))) : 1.2
  const avgSteps = mean(vals(recent(stepsData, 7)))
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgStress = stressData.length > 0 ? mean(vals(recent(stressData, 7))) : 50
  const avgSpO2 = spo2Data.length > 0 ? mean(vals(recent(spo2Data, 7))) : 97
  const avgBF = bfData.length > 0 ? mean(vals(recent(bfData, 3))) : 22
  
  const cvScore = linearScale(avgRHR, 80, 50, 30, 95) * 0.5 + linearScale(avgHRV, 20, 80, 30, 95) * 0.5
  const sleepScore = linearScale(avgSleep, 5, 8.5, 30, 95) * 0.6 + linearScale(avgDeep, 0.5, 2.0, 30, 95) * 0.4
  const actScore = linearScale(avgSteps, 3000, 12000, 30, 90) * 0.5 + linearScale(avgActive, 10, 90, 30, 95) * 0.5
  const stressScore = linearScale(avgStress, 80, 20, 30, 95)
  const bodyScore = linearScale(avgBF, 35, 12, 30, 95)
  
  const score = clamp(cvScore * 0.25 + sleepScore * 0.25 + actScore * 0.20 + stressScore * 0.15 + bodyScore * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    cardiovascularScore: Math.round(cvScore * 10) / 10,
    sleepScore: Math.round(sleepScore * 10) / 10,
    activityScore: Math.round(actScore * 10) / 10,
    stressScore: Math.round(stressScore * 10) / 10,
    bodyCompScore: Math.round(bodyScore * 10) / 10,
    trend: trendDirection(hrvData),
    detail: `Wellness ${score.toFixed(1)} — CV ${cvScore.toFixed(0)}, sleep ${sleepScore.toFixed(0)}, activity ${actScore.toFixed(0)}, stress ${stressScore.toFixed(0)}, body ${bodyScore.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 2. assessHealthRiskProfile ──────────────────────────────────────────────

export interface HealthRiskProfile {
  score: number
  grade: string
  cardiovascularRisk: number
  metabolicRisk: number
  stressRisk: number
  sleepRisk: number
  overallRiskLevel: "low" | "moderate" | "high" | "very_high"
  detail: string
  date: string
}

export async function assessHealthRiskProfile(
  userId: string,
  date?: Date,
): Promise<HealthRiskProfile> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const rhrData = byType.get("resting_heart_rate") ?? []
  const bpData = byType.get("blood_pressure") ?? []
  const bfData = byType.get("body_fat") ?? []
  const weightData = byType.get("weight") ?? []
  const stressData = byType.get("stress") ?? []
  const spo2Data = byType.get("blood_oxygen") ?? []
  const hrvData = byType.get("hrv") ?? []
  const sleepData = byType.get("sleep_duration") ?? []
  
  const avgRHR = rhrData.length > 0 ? mean(vals(recent(rhrData, 7))) : 65
  const avgBP = bpData.length > 0 ? mean(vals(recent(bpData, 7))) : 120
  const avgBF = bfData.length > 0 ? mean(vals(recent(bfData, 3))) : 22
  const avgStress = stressData.length > 0 ? mean(vals(recent(stressData, 7))) : 50
  const avgSpO2 = spo2Data.length > 0 ? mean(vals(recent(spo2Data, 7))) : 97
  const avgHRV = hrvData.length > 0 ? mean(vals(recent(hrvData, 7))) : 40
  const avgSleep = sleepData.length > 0 ? mean(vals(recent(sleepData, 7))) : 7
  
  const cvRisk = linearScale(avgRHR, 55, 90, 10, 80) * 0.4 + linearScale(avgBP, 100, 160, 10, 90) * 0.4 + linearScale(avgSpO2, 99, 92, 10, 80) * 0.2
  const metabRisk = linearScale(avgBF, 12, 38, 10, 85)
  const stressRisk = linearScale(avgStress, 20, 85, 10, 90) * 0.6 + linearScale(avgHRV, 70, 15, 10, 80) * 0.4
  const sleepRisk = linearScale(avgSleep, 8, 4.5, 10, 90)
  
  const avgRisk = (cvRisk + metabRisk + stressRisk + sleepRisk) / 4
  const score = clamp(100 - avgRisk, 0, 100)
  const riskLevel: "low" | "moderate" | "high" | "very_high" = avgRisk < 25 ? "low" : avgRisk < 45 ? "moderate" : avgRisk < 65 ? "high" : "very_high"
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    cardiovascularRisk: Math.round(cvRisk * 10) / 10,
    metabolicRisk: Math.round(metabRisk * 10) / 10,
    stressRisk: Math.round(stressRisk * 10) / 10,
    sleepRisk: Math.round(sleepRisk * 10) / 10,
    overallRiskLevel: riskLevel,
    detail: `Risk profile ${riskLevel} — CV ${cvRisk.toFixed(0)}, metabolic ${metabRisk.toFixed(0)}, stress ${stressRisk.toFixed(0)}, sleep ${sleepRisk.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 3. computeRecoveryCapacity ──────────────────────────────────────────────

export interface RecoveryCapacity {
  score: number
  grade: string
  autonomicRecovery: number
  sleepRecovery: number
  stressRecovery: number
  activityRecovery: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeRecoveryCapacity(
  userId: string,
  date?: Date,
): Promise<RecoveryCapacity> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const hrvData = byType.get("hrv") ?? []
  const rhrData = byType.get("resting_heart_rate") ?? []
  const sleepData = byType.get("sleep_duration") ?? []
  const deepData = byType.get("deep_sleep") ?? []
  const stressData = byType.get("stress") ?? []
  const activeData = byType.get("active_minutes") ?? []
  
  const avgHRV = hrvData.length > 0 ? mean(vals(recent(hrvData, 7))) : 40
  const avgRHR = rhrData.length > 0 ? mean(vals(recent(rhrData, 7))) : 65
  const avgSleep = sleepData.length > 0 ? mean(vals(recent(sleepData, 7))) : 7
  const avgDeep = deepData.length > 0 ? mean(vals(recent(deepData, 7))) : 1.2
  const avgStress = stressData.length > 0 ? mean(vals(recent(stressData, 7))) : 50
  const avgActive = mean(vals(recent(activeData, 7)))
  
  const hrvCV = hrvData.length >= 5 ? coefficientOfVariation(vals(hrvData)) : 0.2
  const autonomic = linearScale(avgHRV, 20, 80, 30, 95) * 0.6 + linearScale(avgRHR, 80, 50, 30, 90) * 0.4
  const sleepRec = linearScale(avgSleep, 5, 8.5, 30, 90) * 0.5 + linearScale(avgDeep, 0.5, 2.0, 30, 95) * 0.5
  const stressRec = linearScale(avgStress, 80, 20, 30, 95)
  const actRec = avgActive > 120 ? linearScale(avgActive, 120, 180, 70, 40) : linearScale(avgActive, 0, 120, 40, 80)
  
  const score = clamp(autonomic * 0.35 + sleepRec * 0.30 + stressRec * 0.20 + actRec * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    autonomicRecovery: Math.round(autonomic * 10) / 10,
    sleepRecovery: Math.round(sleepRec * 10) / 10,
    stressRecovery: Math.round(stressRec * 10) / 10,
    activityRecovery: Math.round(actRec * 10) / 10,
    trend: trendDirection(hrvData),
    detail: `Recovery capacity ${score.toFixed(1)} — autonomic ${autonomic.toFixed(0)}, sleep ${sleepRec.toFixed(0)}, stress ${stressRec.toFixed(0)}, activity ${actRec.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 4. analyzeHealthTrajectory ──────────────────────────────────────────────

export interface HealthTrajectory {
  score: number
  grade: string
  overallTrend: "improving" | "declining" | "stable"
  cardiovascularTrend: "improving" | "declining" | "stable"
  sleepTrend: "improving" | "declining" | "stable"
  activityTrend: "improving" | "declining" | "stable"
  momentumScore: number
  detail: string
  date: string
}

export async function analyzeHealthTrajectory(
  userId: string,
  date?: Date,
): Promise<HealthTrajectory> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const hrvData = byType.get("hrv") ?? []
  const rhrData = byType.get("resting_heart_rate") ?? []
  const sleepData = byType.get("sleep_duration") ?? []
  const stepsData = byType.get("steps") ?? []
  const activeData = byType.get("active_minutes") ?? []
  const stressData = byType.get("stress") ?? []
  const weightData = byType.get("weight") ?? []
  
  const cvTrend = trendDirection(hrvData)
  const sleepTrend = trendDirection(sleepData)
  const actTrend = trendDirection(stepsData)
  
  const trendScore = (t: "improving" | "declining" | "stable") => t === "improving" ? 80 : t === "declining" ? 30 : 55
  const cvS = trendScore(cvTrend)
  const slS = trendScore(sleepTrend)
  const acS = trendScore(actTrend)
  const wtTrend = trendDirection(weightData)
  const wtS = trendScore(wtTrend)
  
  const momentum = (cvS + slS + acS + wtS) / 4
  const score = clamp(momentum, 0, 100)
  const overall: "improving" | "declining" | "stable" = momentum > 65 ? "improving" : momentum < 45 ? "declining" : "stable"
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    overallTrend: overall,
    cardiovascularTrend: cvTrend,
    sleepTrend,
    activityTrend: actTrend,
    momentumScore: Math.round(momentum * 10) / 10,
    detail: `Health trajectory ${overall} — CV ${cvTrend}, sleep ${sleepTrend}, activity ${actTrend}, momentum ${momentum.toFixed(1)}`,
    date: targetDate.toISOString(),
  }
}

// ── 5. computeStressAllostasis ──────────────────────────────────────────────

export interface StressAllostasis {
  score: number
  grade: string
  allostasisLoad: number
  autonomicBurden: number
  cardiovascularBurden: number
  sleepBurden: number
  thermalBurden: number
  riskLevel: "low" | "moderate" | "high"
  detail: string
  date: string
}

export async function computeStressAllostasis(
  userId: string,
  date?: Date,
): Promise<StressAllostasis> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const stressData = byType.get("stress") ?? []
  const hrvData = byType.get("hrv") ?? []
  const rhrData = byType.get("resting_heart_rate") ?? []
  const bpData = byType.get("blood_pressure") ?? []
  const sleepData = byType.get("sleep_duration") ?? []
  const tempData = byType.get("body_temperature") ?? []
  
  const avgStress = stressData.length > 0 ? mean(vals(recent(stressData, 7))) : 50
  const avgHRV = hrvData.length > 0 ? mean(vals(recent(hrvData, 7))) : 40
  const avgRHR = rhrData.length > 0 ? mean(vals(recent(rhrData, 7))) : 65
  const avgBP = bpData.length > 0 ? mean(vals(recent(bpData, 7))) : 120
  const avgSleep = sleepData.length > 0 ? mean(vals(recent(sleepData, 7))) : 7
  const avgTemp = tempData.length > 0 ? mean(vals(recent(tempData, 7))) : 36.6
  
  const autonomicBurden = linearScale(avgStress, 20, 80, 10, 80) * 0.5 + linearScale(avgHRV, 70, 15, 10, 80) * 0.5
  const cvBurden = linearScale(avgRHR, 55, 90, 10, 75) * 0.5 + linearScale(avgBP, 100, 160, 10, 80) * 0.5
  const sleepBurden = linearScale(avgSleep, 8, 4.5, 10, 85)
  const thermalBurden = linearScale(Math.abs(avgTemp - 36.6), 0, 1.5, 10, 70)
  
  const allostasis = (autonomicBurden + cvBurden + sleepBurden + thermalBurden) / 4
  const score = clamp(100 - allostasis, 0, 100)
  const riskLevel: "low" | "moderate" | "high" = allostasis < 30 ? "low" : allostasis < 55 ? "moderate" : "high"
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    allostasisLoad: Math.round(allostasis * 10) / 10,
    autonomicBurden: Math.round(autonomicBurden * 10) / 10,
    cardiovascularBurden: Math.round(cvBurden * 10) / 10,
    sleepBurden: Math.round(sleepBurden * 10) / 10,
    thermalBurden: Math.round(thermalBurden * 10) / 10,
    riskLevel,
    detail: `Allostatic load ${allostasis.toFixed(1)} (${riskLevel}) — autonomic ${autonomicBurden.toFixed(0)}, CV ${cvBurden.toFixed(0)}, sleep ${sleepBurden.toFixed(0)}, thermal ${thermalBurden.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 6. assessHealthOptimizationPotential ────────────────────────────────────

export interface HealthOptimizationPotential {
  score: number
  grade: string
  resting_heart_rateScore: number
  hrvScore: number
  sleep_durationScore: number
  active_minutesScore: number
  stressScore: number
  body_fatScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessHealthOptimizationPotential(
  userId: string,
  date?: Date,
): Promise<HealthOptimizationPotential> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("stress") ?? []
  const d5 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  const avg5 = d5.length > 0 ? mean(vals(recent(d5, 7))) : 22
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  const s5 = linearScale(avg5, 35, 12, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.15 + s4 * 0.15 + s5 * 0.1, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    body_fatScore: Math.round(s5 * 10) / 10,
    trend: trendDirection(d0),
    detail: `potential score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 7. computeDailyReadinessComposite ───────────────────────────────────────

export interface DailyReadinessComposite {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  sleep_durationScore: number
  deep_sleepScore: number
  stressScore: number
  body_temperatureScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeDailyReadinessComposite(
  userId: string,
  date?: Date,
): Promise<DailyReadinessComposite> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("deep_sleep") ?? []
  const d4 = byType.get("stress") ?? []
  const d5 = byType.get("body_temperature") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 1.2
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  const avg5 = d5.length > 0 ? mean(vals(recent(d5, 7))) : 36.6
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 0.5, 2.0, 30, 95)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  const s5 = linearScale(avg5, 37.5, 36.2, 40, 90)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.15 + s4 * 0.1 + s5 * 0.1, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    deep_sleepScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    body_temperatureScore: Math.round(s5 * 10) / 10,
    trend: trendDirection(d0),
    detail: `readiness score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, deep_sleep ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 8. analyzeHealthSynchronicity ───────────────────────────────────────────

export interface HealthSynchronicity {
  score: number
  grade: string
  hrvScore: number
  respiratory_rateScore: number
  heart_rateScore: number
  sleep_durationScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeHealthSynchronicity(
  userId: string,
  date?: Date,
): Promise<HealthSynchronicity> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("respiratory_rate") ?? []
  const d2 = byType.get("heart_rate") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 15
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 75
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 18, 12, 40, 95)
  const s2 = linearScale(avg2, 50, 100, 85, 50)
  const s3 = linearScale(avg3, 5, 8.5, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    respiratory_rateScore: Math.round(s1 * 10) / 10,
    heart_rateScore: Math.round(s2 * 10) / 10,
    sleep_durationScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `synchronicity score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, respiratory_rate ${s1.toFixed(0)}, heart_rate ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 9. computeAdaptationCapacity ────────────────────────────────────────────

export interface AdaptationCapacity {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  vo2maxScore: number
  active_minutesScore: number
  sleep_durationScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeAdaptationCapacity(
  userId: string,
  date?: Date,
): Promise<AdaptationCapacity> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("vo2max") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 35
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 7
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 20, 60, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  const s4 = linearScale(avg4, 5, 8.5, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    vo2maxScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    sleep_durationScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `adaptation score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, vo2max ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 10. assessChronicDiseaseRisk ────────────────────────────────────────────

export interface ChronicDiseaseRisk {
  score: number
  grade: string
  blood_pressureScore: number
  resting_heart_rateScore: number
  body_fatScore: number
  weightScore: number
  blood_oxygenScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessChronicDiseaseRisk(
  userId: string,
  date?: Date,
): Promise<ChronicDiseaseRisk> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("blood_pressure") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("body_fat") ?? []
  const d3 = byType.get("weight") ?? []
  const d4 = byType.get("blood_oxygen") ?? []
  const d5 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 120
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 22
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 72
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 97
  const avg5 = d5.length > 0 ? mean(vals(recent(d5, 7))) : 50
  
  const s0 = linearScale(avg0, 150, 100, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 35, 12, 30, 95)
  const s3 = linearScale(avg3, 100, 60, 40, 85)
  const s4 = linearScale(avg4, 92, 100, 30, 98)
  const s5 = linearScale(avg5, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.15 + s2 * 0.2 + s3 * 0.1 + s4 * 0.15 + s5 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    blood_pressureScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    body_fatScore: Math.round(s2 * 10) / 10,
    weightScore: Math.round(s3 * 10) / 10,
    blood_oxygenScore: Math.round(s4 * 10) / 10,
    stressScore: Math.round(s5 * 10) / 10,
    trend: trendDirection(d0),
    detail: `disease_risk score ${score.toFixed(1)} — blood_pressure ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, body_fat ${s2.toFixed(0)}, weight ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 11. computeLifestyleScore ───────────────────────────────────────────────

export interface LifestyleScore {
  score: number
  grade: string
  stepsScore: number
  active_minutesScore: number
  sleep_durationScore: number
  caloriesScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeLifestyleScore(
  userId: string,
  date?: Date,
): Promise<LifestyleScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("steps") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("calories") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7000
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 2000
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 2000, 12000, 30, 95)
  const s1 = linearScale(avg1, 10, 90, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 1500, 3000, 50, 85)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.25 + s2 * 0.25 + s3 * 0.15 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stepsScore: Math.round(s0 * 10) / 10,
    active_minutesScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    caloriesScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `lifestyle score ${score.toFixed(1)} — steps ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, calories ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 12. analyzeHealthCoherenceIndex ─────────────────────────────────────────

export interface HealthCoherenceIndex {
  score: number
  grade: string
  hrvScore: number
  respiratory_rateScore: number
  heart_rateScore: number
  resting_heart_rateScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeHealthCoherenceIndex(
  userId: string,
  date?: Date,
): Promise<HealthCoherenceIndex> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("respiratory_rate") ?? []
  const d2 = byType.get("heart_rate") ?? []
  const d3 = byType.get("resting_heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 15
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 75
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 65
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 18, 12, 40, 95)
  const s2 = linearScale(avg2, 50, 100, 85, 50)
  const s3 = linearScale(avg3, 80, 50, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.2 + s3 * 0.25, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    respiratory_rateScore: Math.round(s1 * 10) / 10,
    heart_rateScore: Math.round(s2 * 10) / 10,
    resting_heart_rateScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `coherence score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, respiratory_rate ${s1.toFixed(0)}, heart_rate ${s2.toFixed(0)}, resting_heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 13. computePhysiologicalComplexity ──────────────────────────────────────

export interface PhysiologicalComplexity {
  score: number
  grade: string
  hrvScore: number
  heart_rateScore: number
  sleep_durationScore: number
  deep_sleepScore: number
  rem_sleepScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computePhysiologicalComplexity(
  userId: string,
  date?: Date,
): Promise<PhysiologicalComplexity> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("heart_rate") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("deep_sleep") ?? []
  const d4 = byType.get("rem_sleep") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 75
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 1.2
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 1.5
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 50, 100, 85, 50)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 0.5, 2.0, 30, 95)
  const s4 = linearScale(avg4, 0.8, 2.5, 30, 90)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    heart_rateScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    deep_sleepScore: Math.round(s3 * 10) / 10,
    rem_sleepScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `complexity score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, heart_rate ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, deep_sleep ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 14. assessWellbeingIndex ────────────────────────────────────────────────

export interface WellbeingIndex {
  score: number
  grade: string
  sleep_durationScore: number
  stressScore: number
  active_minutesScore: number
  hrvScore: number
  stepsScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessWellbeingIndex(
  userId: string,
  date?: Date,
): Promise<WellbeingIndex> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("sleep_duration") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("hrv") ?? []
  const d4 = byType.get("steps") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 40
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 7000
  
  const s0 = linearScale(avg0, 5, 8.5, 30, 95)
  const s1 = linearScale(avg1, 80, 20, 30, 95)
  const s2 = linearScale(avg2, 10, 90, 30, 95)
  const s3 = linearScale(avg3, 20, 80, 30, 95)
  const s4 = linearScale(avg4, 2000, 12000, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.25 + s2 * 0.2 + s3 * 0.15 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    sleep_durationScore: Math.round(s0 * 10) / 10,
    stressScore: Math.round(s1 * 10) / 10,
    active_minutesScore: Math.round(s2 * 10) / 10,
    hrvScore: Math.round(s3 * 10) / 10,
    stepsScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `wellbeing score ${score.toFixed(1)} — sleep_duration ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, hrv ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 15. computeHealthAge ────────────────────────────────────────────────────

export interface HealthAge {
  score: number
  grade: string
  resting_heart_rateScore: number
  vo2maxScore: number
  body_fatScore: number
  hrvScore: number
  blood_pressureScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeHealthAge(
  userId: string,
  date?: Date,
): Promise<HealthAge> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("vo2max") ?? []
  const d2 = byType.get("body_fat") ?? []
  const d3 = byType.get("hrv") ?? []
  const d4 = byType.get("blood_pressure") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 35
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 22
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 40
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 120
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 20, 60, 30, 95)
  const s2 = linearScale(avg2, 35, 12, 30, 95)
  const s3 = linearScale(avg3, 20, 80, 30, 95)
  const s4 = linearScale(avg4, 150, 100, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.25 + s2 * 0.2 + s3 * 0.2 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    vo2maxScore: Math.round(s1 * 10) / 10,
    body_fatScore: Math.round(s2 * 10) / 10,
    hrvScore: Math.round(s3 * 10) / 10,
    blood_pressureScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `health_age score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, vo2max ${s1.toFixed(0)}, body_fat ${s2.toFixed(0)}, hrv ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 16. analyzeSystemicInflammation ─────────────────────────────────────────

export interface SystemicInflammation {
  score: number
  grade: string
  resting_heart_rateScore: number
  body_temperatureScore: number
  hrvScore: number
  sleep_durationScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeSystemicInflammation(
  userId: string,
  date?: Date,
): Promise<SystemicInflammation> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("body_temperature") ?? []
  const d2 = byType.get("hrv") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 36.6
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 40
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 37.5, 36.2, 40, 90)
  const s2 = linearScale(avg2, 20, 80, 30, 95)
  const s3 = linearScale(avg3, 5, 8.5, 30, 95)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    body_temperatureScore: Math.round(s1 * 10) / 10,
    hrvScore: Math.round(s2 * 10) / 10,
    sleep_durationScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `inflammation score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, body_temperature ${s1.toFixed(0)}, hrv ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 17. computeNeuroCardiacCoupling ─────────────────────────────────────────

export interface NeuroCardiacCoupling {
  score: number
  grade: string
  hrvScore: number
  deep_sleepScore: number
  rem_sleepScore: number
  stressScore: number
  resting_heart_rateScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeNeuroCardiacCoupling(
  userId: string,
  date?: Date,
): Promise<NeuroCardiacCoupling> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("deep_sleep") ?? []
  const d2 = byType.get("rem_sleep") ?? []
  const d3 = byType.get("stress") ?? []
  const d4 = byType.get("resting_heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 1.2
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 1.5
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 65
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 0.5, 2.0, 30, 95)
  const s2 = linearScale(avg2, 0.8, 2.5, 30, 90)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  const s4 = linearScale(avg4, 80, 50, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.15 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    deep_sleepScore: Math.round(s1 * 10) / 10,
    rem_sleepScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    resting_heart_rateScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `neurocardiac score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, deep_sleep ${s1.toFixed(0)}, rem_sleep ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 18. assessSleepActivityBalance ──────────────────────────────────────────

export interface SleepActivityBalance {
  score: number
  grade: string
  sleep_durationScore: number
  deep_sleepScore: number
  active_minutesScore: number
  stepsScore: number
  caloriesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessSleepActivityBalance(
  userId: string,
  date?: Date,
): Promise<SleepActivityBalance> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("sleep_duration") ?? []
  const d1 = byType.get("deep_sleep") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("steps") ?? []
  const d4 = byType.get("calories") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 1.2
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7000
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 2000
  
  const s0 = linearScale(avg0, 5, 8.5, 30, 95)
  const s1 = linearScale(avg1, 0.5, 2.0, 30, 95)
  const s2 = linearScale(avg2, 10, 90, 30, 95)
  const s3 = linearScale(avg3, 2000, 12000, 30, 95)
  const s4 = linearScale(avg4, 1500, 3000, 50, 85)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.25 + s3 * 0.15 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    sleep_durationScore: Math.round(s0 * 10) / 10,
    deep_sleepScore: Math.round(s1 * 10) / 10,
    active_minutesScore: Math.round(s2 * 10) / 10,
    stepsScore: Math.round(s3 * 10) / 10,
    caloriesScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `sleep_activity score ${score.toFixed(1)} — sleep_duration ${s0.toFixed(0)}, deep_sleep ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, steps ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 19. computeNutritionActivitySync ────────────────────────────────────────

export interface NutritionActivitySync {
  score: number
  grade: string
  caloriesScore: number
  active_minutesScore: number
  weightScore: number
  body_fatScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeNutritionActivitySync(
  userId: string,
  date?: Date,
): Promise<NutritionActivitySync> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("calories") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("weight") ?? []
  const d3 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 2000
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 72
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 22
  
  const s0 = linearScale(avg0, 1500, 3000, 50, 85)
  const s1 = linearScale(avg1, 10, 90, 30, 95)
  const s2 = linearScale(avg2, 100, 60, 40, 85)
  const s3 = linearScale(avg3, 35, 12, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.3 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    caloriesScore: Math.round(s0 * 10) / 10,
    active_minutesScore: Math.round(s1 * 10) / 10,
    weightScore: Math.round(s2 * 10) / 10,
    body_fatScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `nutrition_activity score ${score.toFixed(1)} — calories ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, weight ${s2.toFixed(0)}, body_fat ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 20. analyzeHormonalHealthOverall ────────────────────────────────────────

export interface HormonalHealthOverall {
  score: number
  grade: string
  sleep_durationScore: number
  deep_sleepScore: number
  stressScore: number
  body_temperatureScore: number
  body_fatScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeHormonalHealthOverall(
  userId: string,
  date?: Date,
): Promise<HormonalHealthOverall> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("sleep_duration") ?? []
  const d1 = byType.get("deep_sleep") ?? []
  const d2 = byType.get("stress") ?? []
  const d3 = byType.get("body_temperature") ?? []
  const d4 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 1.2
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 50
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 36.6
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 22
  
  const s0 = linearScale(avg0, 5, 8.5, 30, 95)
  const s1 = linearScale(avg1, 0.5, 2.0, 30, 95)
  const s2 = linearScale(avg2, 80, 20, 30, 95)
  const s3 = linearScale(avg3, 37.5, 36.2, 40, 90)
  const s4 = linearScale(avg4, 35, 12, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.25 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    sleep_durationScore: Math.round(s0 * 10) / 10,
    deep_sleepScore: Math.round(s1 * 10) / 10,
    stressScore: Math.round(s2 * 10) / 10,
    body_temperatureScore: Math.round(s3 * 10) / 10,
    body_fatScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `hormonal score ${score.toFixed(1)} — sleep_duration ${s0.toFixed(0)}, deep_sleep ${s1.toFixed(0)}, stress ${s2.toFixed(0)}, body_temperature ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 21. computeImmuneSleepLink ──────────────────────────────────────────────

export interface ImmuneSleepLink {
  score: number
  grade: string
  body_temperatureScore: number
  sleep_durationScore: number
  deep_sleepScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeImmuneSleepLink(
  userId: string,
  date?: Date,
): Promise<ImmuneSleepLink> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("body_temperature") ?? []
  const d1 = byType.get("sleep_duration") ?? []
  const d2 = byType.get("deep_sleep") ?? []
  const d3 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 36.6
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 1.2
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  
  const s0 = linearScale(avg0, 37.5, 36.2, 40, 90)
  const s1 = linearScale(avg1, 5, 8.5, 30, 95)
  const s2 = linearScale(avg2, 0.5, 2.0, 30, 95)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.3 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    body_temperatureScore: Math.round(s0 * 10) / 10,
    sleep_durationScore: Math.round(s1 * 10) / 10,
    deep_sleepScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `immune_sleep score ${score.toFixed(1)} — body_temperature ${s0.toFixed(0)}, sleep_duration ${s1.toFixed(0)}, deep_sleep ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 22. assessMetabolismActivityCoupling ────────────────────────────────────

export interface MetabolismActivityCoupling {
  score: number
  grade: string
  caloriesScore: number
  active_minutesScore: number
  weightScore: number
  resting_heart_rateScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessMetabolismActivityCoupling(
  userId: string,
  date?: Date,
): Promise<MetabolismActivityCoupling> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("calories") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("weight") ?? []
  const d3 = byType.get("resting_heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 2000
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 72
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 65
  
  const s0 = linearScale(avg0, 1500, 3000, 50, 85)
  const s1 = linearScale(avg1, 10, 90, 30, 95)
  const s2 = linearScale(avg2, 100, 60, 40, 85)
  const s3 = linearScale(avg3, 80, 50, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.3 + s2 * 0.2 + s3 * 0.25, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    caloriesScore: Math.round(s0 * 10) / 10,
    active_minutesScore: Math.round(s1 * 10) / 10,
    weightScore: Math.round(s2 * 10) / 10,
    resting_heart_rateScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `metab_activity score ${score.toFixed(1)} — calories ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, weight ${s2.toFixed(0)}, resting_heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 23. computeStressRecoveryBalance ────────────────────────────────────────

export interface StressRecoveryBalance {
  score: number
  grade: string
  stressScore: number
  hrvScore: number
  sleep_durationScore: number
  active_minutesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeStressRecoveryBalance(
  userId: string,
  date?: Date,
): Promise<StressRecoveryBalance> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("stress") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 50
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 80, 20, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stressScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `stress_recovery score ${score.toFixed(1)} — stress ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 24. analyzeCardiacRespiratoryCoupling ───────────────────────────────────

export interface CardiacRespiratoryCoupling {
  score: number
  grade: string
  heart_rateScore: number
  respiratory_rateScore: number
  blood_oxygenScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeCardiacRespiratoryCoupling(
  userId: string,
  date?: Date,
): Promise<CardiacRespiratoryCoupling> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("heart_rate") ?? []
  const d1 = byType.get("respiratory_rate") ?? []
  const d2 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 75
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 15
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 97
  
  const s0 = linearScale(avg0, 50, 100, 85, 50)
  const s1 = linearScale(avg1, 18, 12, 40, 95)
  const s2 = linearScale(avg2, 92, 100, 30, 98)
  
  const score = clamp(s0 * 0.35 + s1 * 0.35 + s2 * 0.3, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    heart_rateScore: Math.round(s0 * 10) / 10,
    respiratory_rateScore: Math.round(s1 * 10) / 10,
    blood_oxygenScore: Math.round(s2 * 10) / 10,
    trend: trendDirection(d0),
    detail: `cardiac_resp score ${score.toFixed(1)} — heart_rate ${s0.toFixed(0)}, respiratory_rate ${s1.toFixed(0)}, blood_oxygen ${s2.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 25. computeSleepImmuneFunction ──────────────────────────────────────────

export interface SleepImmuneFunction {
  score: number
  grade: string
  sleep_durationScore: number
  deep_sleepScore: number
  body_temperatureScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeSleepImmuneFunction(
  userId: string,
  date?: Date,
): Promise<SleepImmuneFunction> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("sleep_duration") ?? []
  const d1 = byType.get("deep_sleep") ?? []
  const d2 = byType.get("body_temperature") ?? []
  const d3 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 1.2
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 36.6
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  
  const s0 = linearScale(avg0, 5, 8.5, 30, 95)
  const s1 = linearScale(avg1, 0.5, 2.0, 30, 95)
  const s2 = linearScale(avg2, 37.5, 36.2, 40, 90)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    sleep_durationScore: Math.round(s0 * 10) / 10,
    deep_sleepScore: Math.round(s1 * 10) / 10,
    body_temperatureScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `sleep_immune score ${score.toFixed(1)} — sleep_duration ${s0.toFixed(0)}, deep_sleep ${s1.toFixed(0)}, body_temperature ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 26. assessExerciseMoodConnection ────────────────────────────────────────

export interface ExerciseMoodConnection {
  score: number
  grade: string
  active_minutesScore: number
  stepsScore: number
  stressScore: number
  hrvScore: number
  sleep_durationScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessExerciseMoodConnection(
  userId: string,
  date?: Date,
): Promise<ExerciseMoodConnection> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("active_minutes") ?? []
  const d1 = byType.get("steps") ?? []
  const d2 = byType.get("stress") ?? []
  const d3 = byType.get("hrv") ?? []
  const d4 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 30
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7000
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 50
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 40
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 7
  
  const s0 = linearScale(avg0, 10, 90, 30, 95)
  const s1 = linearScale(avg1, 2000, 12000, 30, 95)
  const s2 = linearScale(avg2, 80, 20, 30, 95)
  const s3 = linearScale(avg3, 20, 80, 30, 95)
  const s4 = linearScale(avg4, 5, 8.5, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.15 + s2 * 0.25 + s3 * 0.2 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    active_minutesScore: Math.round(s0 * 10) / 10,
    stepsScore: Math.round(s1 * 10) / 10,
    stressScore: Math.round(s2 * 10) / 10,
    hrvScore: Math.round(s3 * 10) / 10,
    sleep_durationScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `exercise_mood score ${score.toFixed(1)} — active_minutes ${s0.toFixed(0)}, steps ${s1.toFixed(0)}, stress ${s2.toFixed(0)}, hrv ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 27. computeNutritionRecoverySynergy ─────────────────────────────────────

export interface NutritionRecoverySynergy {
  score: number
  grade: string
  caloriesScore: number
  sleep_durationScore: number
  hrvScore: number
  active_minutesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeNutritionRecoverySynergy(
  userId: string,
  date?: Date,
): Promise<NutritionRecoverySynergy> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("calories") ?? []
  const d1 = byType.get("sleep_duration") ?? []
  const d2 = byType.get("hrv") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 2000
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 40
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 1500, 3000, 50, 85)
  const s1 = linearScale(avg1, 5, 8.5, 30, 95)
  const s2 = linearScale(avg2, 20, 80, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.25 + s2 * 0.25 + s3 * 0.25, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    caloriesScore: Math.round(s0 * 10) / 10,
    sleep_durationScore: Math.round(s1 * 10) / 10,
    hrvScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `nutrition_recovery score ${score.toFixed(1)} — calories ${s0.toFixed(0)}, sleep_duration ${s1.toFixed(0)}, hrv ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 28. analyzeCircadianHealthComposite ─────────────────────────────────────

export interface CircadianHealthComposite {
  score: number
  grade: string
  sleep_durationScore: number
  body_temperatureScore: number
  resting_heart_rateScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeCircadianHealthComposite(
  userId: string,
  date?: Date,
): Promise<CircadianHealthComposite> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("sleep_duration") ?? []
  const d1 = byType.get("body_temperature") ?? []
  const d2 = byType.get("resting_heart_rate") ?? []
  const d3 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 36.6
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 65
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  
  const s0 = linearScale(avg0, 5, 8.5, 30, 95)
  const s1 = linearScale(avg1, 37.5, 36.2, 40, 90)
  const s2 = linearScale(avg2, 80, 50, 30, 95)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.2 + s2 * 0.25 + s3 * 0.25, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    sleep_durationScore: Math.round(s0 * 10) / 10,
    body_temperatureScore: Math.round(s1 * 10) / 10,
    resting_heart_rateScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `circadian score ${score.toFixed(1)} — sleep_duration ${s0.toFixed(0)}, body_temperature ${s1.toFixed(0)}, resting_heart_rate ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 29. computeAutonomicHealthScore ─────────────────────────────────────────

export interface AutonomicHealthScore {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  blood_pressureScore: number
  respiratory_rateScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeAutonomicHealthScore(
  userId: string,
  date?: Date,
): Promise<AutonomicHealthScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("blood_pressure") ?? []
  const d3 = byType.get("respiratory_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 120
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 15
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 150, 100, 30, 95)
  const s3 = linearScale(avg3, 18, 12, 40, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    blood_pressureScore: Math.round(s2 * 10) / 10,
    respiratory_rateScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `autonomic score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, blood_pressure ${s2.toFixed(0)}, respiratory_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 30. assessPsychophysiologicalCoherence ──────────────────────────────────

export interface PsychophysiologicalCoherence {
  score: number
  grade: string
  hrvScore: number
  stressScore: number
  respiratory_rateScore: number
  heart_rateScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessPsychophysiologicalCoherence(
  userId: string,
  date?: Date,
): Promise<PsychophysiologicalCoherence> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("respiratory_rate") ?? []
  const d3 = byType.get("heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 15
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 75
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 20, 30, 95)
  const s2 = linearScale(avg2, 18, 12, 40, 95)
  const s3 = linearScale(avg3, 50, 100, 85, 50)
  
  const score = clamp(s0 * 0.3 + s1 * 0.3 + s2 * 0.2 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    stressScore: Math.round(s1 * 10) / 10,
    respiratory_rateScore: Math.round(s2 * 10) / 10,
    heart_rateScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `psychophysio score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, respiratory_rate ${s2.toFixed(0)}, heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 31. computeBodySystemsHarmony ───────────────────────────────────────────

export interface BodySystemsHarmony {
  score: number
  grade: string
  resting_heart_rateScore: number
  respiratory_rateScore: number
  body_temperatureScore: number
  blood_oxygenScore: number
  sleep_durationScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeBodySystemsHarmony(
  userId: string,
  date?: Date,
): Promise<BodySystemsHarmony> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("respiratory_rate") ?? []
  const d2 = byType.get("body_temperature") ?? []
  const d3 = byType.get("blood_oxygen") ?? []
  const d4 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 15
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 36.6
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 97
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 7
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 18, 12, 40, 95)
  const s2 = linearScale(avg2, 37.5, 36.2, 40, 90)
  const s3 = linearScale(avg3, 92, 100, 30, 98)
  const s4 = linearScale(avg4, 5, 8.5, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    respiratory_rateScore: Math.round(s1 * 10) / 10,
    body_temperatureScore: Math.round(s2 * 10) / 10,
    blood_oxygenScore: Math.round(s3 * 10) / 10,
    sleep_durationScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `systems_harmony score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, respiratory_rate ${s1.toFixed(0)}, body_temperature ${s2.toFixed(0)}, blood_oxygen ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 32. analyzeHealthBehaviorScore ──────────────────────────────────────────

export interface HealthBehaviorScore {
  score: number
  grade: string
  stepsScore: number
  active_minutesScore: number
  sleep_durationScore: number
  caloriesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeHealthBehaviorScore(
  userId: string,
  date?: Date,
): Promise<HealthBehaviorScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("steps") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("calories") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7000
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 2000
  
  const s0 = linearScale(avg0, 2000, 12000, 30, 95)
  const s1 = linearScale(avg1, 10, 90, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 1500, 3000, 50, 85)
  
  const score = clamp(s0 * 0.25 + s1 * 0.25 + s2 * 0.3 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stepsScore: Math.round(s0 * 10) / 10,
    active_minutesScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    caloriesScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `behavior score ${score.toFixed(1)} — steps ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, calories ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 33. computePreventiveHealthIndex ────────────────────────────────────────

export interface PreventiveHealthIndex {
  score: number
  grade: string
  blood_pressureScore: number
  resting_heart_rateScore: number
  body_fatScore: number
  active_minutesScore: number
  blood_oxygenScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computePreventiveHealthIndex(
  userId: string,
  date?: Date,
): Promise<PreventiveHealthIndex> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("blood_pressure") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("body_fat") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 120
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 22
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 97
  
  const s0 = linearScale(avg0, 150, 100, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 35, 12, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  const s4 = linearScale(avg4, 92, 100, 30, 98)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    blood_pressureScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    body_fatScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    blood_oxygenScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `preventive score ${score.toFixed(1)} — blood_pressure ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, body_fat ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 34. assessPersonalizedHealthBaseline ────────────────────────────────────

export interface PersonalizedHealthBaseline {
  score: number
  grade: string
  resting_heart_rateScore: number
  hrvScore: number
  sleep_durationScore: number
  stepsScore: number
  stressScore: number
  body_temperatureScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessPersonalizedHealthBaseline(
  userId: string,
  date?: Date,
): Promise<PersonalizedHealthBaseline> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("steps") ?? []
  const d4 = byType.get("stress") ?? []
  const d5 = byType.get("body_temperature") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7000
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  const avg5 = d5.length > 0 ? mean(vals(recent(d5, 7))) : 36.6
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 2000, 12000, 30, 95)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  const s5 = linearScale(avg5, 37.5, 36.2, 40, 90)
  
  const score = clamp(s0 * 0.18 + s1 * 0.18 + s2 * 0.18 + s3 * 0.15 + s4 * 0.16 + s5 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    stepsScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    body_temperatureScore: Math.round(s5 * 10) / 10,
    trend: trendDirection(d0),
    detail: `baseline score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, steps ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 35. computeDeviationDetection ───────────────────────────────────────────

export interface DeviationDetection {
  score: number
  grade: string
  resting_heart_rateScore: number
  hrvScore: number
  sleep_durationScore: number
  body_temperatureScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeDeviationDetection(
  userId: string,
  date?: Date,
): Promise<DeviationDetection> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("body_temperature") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 36.6
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 37.5, 36.2, 40, 90)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    body_temperatureScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `deviation score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, body_temperature ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 36. analyzeAnomalyClustering ────────────────────────────────────────────

export interface AnomalyClustering {
  score: number
  grade: string
  resting_heart_rateScore: number
  hrvScore: number
  blood_pressureScore: number
  body_temperatureScore: number
  sleep_durationScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeAnomalyClustering(
  userId: string,
  date?: Date,
): Promise<AnomalyClustering> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("blood_pressure") ?? []
  const d3 = byType.get("body_temperature") ?? []
  const d4 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 120
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 36.6
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 7
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 150, 100, 30, 95)
  const s3 = linearScale(avg3, 37.5, 36.2, 40, 90)
  const s4 = linearScale(avg4, 5, 8.5, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    blood_pressureScore: Math.round(s2 * 10) / 10,
    body_temperatureScore: Math.round(s3 * 10) / 10,
    sleep_durationScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `anomaly score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, blood_pressure ${s2.toFixed(0)}, body_temperature ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 37. computeHealthPatternRecognition ─────────────────────────────────────

export interface HealthPatternRecognition {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  sleep_durationScore: number
  stepsScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeHealthPatternRecognition(
  userId: string,
  date?: Date,
): Promise<HealthPatternRecognition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("steps") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7000
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 2000, 12000, 30, 95)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    stepsScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `pattern score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, steps ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 38. assessRiskFactorClustering ──────────────────────────────────────────

export interface RiskFactorClustering {
  score: number
  grade: string
  blood_pressureScore: number
  body_fatScore: number
  stressScore: number
  resting_heart_rateScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessRiskFactorClustering(
  userId: string,
  date?: Date,
): Promise<RiskFactorClustering> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("blood_pressure") ?? []
  const d1 = byType.get("body_fat") ?? []
  const d2 = byType.get("stress") ?? []
  const d3 = byType.get("resting_heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 120
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 22
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 50
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 65
  
  const s0 = linearScale(avg0, 150, 100, 30, 95)
  const s1 = linearScale(avg1, 35, 12, 30, 95)
  const s2 = linearScale(avg2, 80, 20, 30, 95)
  const s3 = linearScale(avg3, 80, 50, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    blood_pressureScore: Math.round(s0 * 10) / 10,
    body_fatScore: Math.round(s1 * 10) / 10,
    stressScore: Math.round(s2 * 10) / 10,
    resting_heart_rateScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `risk_cluster score ${score.toFixed(1)} — blood_pressure ${s0.toFixed(0)}, body_fat ${s1.toFixed(0)}, stress ${s2.toFixed(0)}, resting_heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 39. computeProtectiveFactorScoring ──────────────────────────────────────

export interface ProtectiveFactorScoring {
  score: number
  grade: string
  hrvScore: number
  vo2maxScore: number
  active_minutesScore: number
  sleep_durationScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeProtectiveFactorScoring(
  userId: string,
  date?: Date,
): Promise<ProtectiveFactorScoring> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("vo2max") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 35
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 20, 60, 30, 95)
  const s2 = linearScale(avg2, 10, 90, 30, 95)
  const s3 = linearScale(avg3, 5, 8.5, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.25 + s2 * 0.25 + s3 * 0.25, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    vo2maxScore: Math.round(s1 * 10) / 10,
    active_minutesScore: Math.round(s2 * 10) / 10,
    sleep_durationScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `protective score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, vo2max ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 40. analyzeHealthMomentum ───────────────────────────────────────────────

export interface HealthMomentum {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  weightScore: number
  stepsScore: number
  sleep_durationScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeHealthMomentum(
  userId: string,
  date?: Date,
): Promise<HealthMomentum> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("weight") ?? []
  const d3 = byType.get("steps") ?? []
  const d4 = byType.get("sleep_duration") ?? []
  const d5 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 72
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7000
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 7
  const avg5 = d5.length > 0 ? mean(vals(recent(d5, 7))) : 50
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 100, 60, 40, 85)
  const s3 = linearScale(avg3, 2000, 12000, 30, 95)
  const s4 = linearScale(avg4, 5, 8.5, 30, 95)
  const s5 = linearScale(avg5, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.15 + s2 * 0.15 + s3 * 0.15 + s4 * 0.2 + s5 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    weightScore: Math.round(s2 * 10) / 10,
    stepsScore: Math.round(s3 * 10) / 10,
    sleep_durationScore: Math.round(s4 * 10) / 10,
    stressScore: Math.round(s5 * 10) / 10,
    trend: trendDirection(d0),
    detail: `momentum score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, weight ${s2.toFixed(0)}, steps ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 41. computeInterventionResponsePrediction ───────────────────────────────

export interface InterventionResponsePrediction {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  sleep_durationScore: number
  active_minutesScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeInterventionResponsePrediction(
  userId: string,
  date?: Date,
): Promise<InterventionResponsePrediction> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `intervention score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 42. assessDoseResponseEstimation ────────────────────────────────────────

export interface DoseResponseEstimation {
  score: number
  grade: string
  active_minutesScore: number
  sleep_durationScore: number
  hrvScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessDoseResponseEstimation(
  userId: string,
  date?: Date,
): Promise<DoseResponseEstimation> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("active_minutes") ?? []
  const d1 = byType.get("sleep_duration") ?? []
  const d2 = byType.get("hrv") ?? []
  const d3 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 30
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 40
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  
  const s0 = linearScale(avg0, 10, 90, 30, 95)
  const s1 = linearScale(avg1, 5, 8.5, 30, 95)
  const s2 = linearScale(avg2, 20, 80, 30, 95)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.3 + s2 * 0.2 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    active_minutesScore: Math.round(s0 * 10) / 10,
    sleep_durationScore: Math.round(s1 * 10) / 10,
    hrvScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `dose_response score ${score.toFixed(1)} — active_minutes ${s0.toFixed(0)}, sleep_duration ${s1.toFixed(0)}, hrv ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 43. computeHealthGoalTracking ───────────────────────────────────────────

export interface HealthGoalTracking {
  score: number
  grade: string
  stepsScore: number
  active_minutesScore: number
  sleep_durationScore: number
  weightScore: number
  body_fatScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeHealthGoalTracking(
  userId: string,
  date?: Date,
): Promise<HealthGoalTracking> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("steps") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("weight") ?? []
  const d4 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7000
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 72
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 22
  
  const s0 = linearScale(avg0, 2000, 12000, 30, 95)
  const s1 = linearScale(avg1, 10, 90, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 100, 60, 40, 85)
  const s4 = linearScale(avg4, 35, 12, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stepsScore: Math.round(s0 * 10) / 10,
    active_minutesScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    weightScore: Math.round(s3 * 10) / 10,
    body_fatScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `goal_tracking score ${score.toFixed(1)} — steps ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, weight ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 44. analyzeProgressVelocity ─────────────────────────────────────────────

export interface ProgressVelocity {
  score: number
  grade: string
  weightScore: number
  body_fatScore: number
  vo2maxScore: number
  resting_heart_rateScore: number
  active_minutesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeProgressVelocity(
  userId: string,
  date?: Date,
): Promise<ProgressVelocity> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("weight") ?? []
  const d1 = byType.get("body_fat") ?? []
  const d2 = byType.get("vo2max") ?? []
  const d3 = byType.get("resting_heart_rate") ?? []
  const d4 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 72
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 22
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 35
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 65
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 30
  
  const s0 = linearScale(avg0, 100, 60, 40, 85)
  const s1 = linearScale(avg1, 35, 12, 30, 95)
  const s2 = linearScale(avg2, 20, 60, 30, 95)
  const s3 = linearScale(avg3, 80, 50, 30, 95)
  const s4 = linearScale(avg4, 10, 90, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    weightScore: Math.round(s0 * 10) / 10,
    body_fatScore: Math.round(s1 * 10) / 10,
    vo2maxScore: Math.round(s2 * 10) / 10,
    resting_heart_rateScore: Math.round(s3 * 10) / 10,
    active_minutesScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `velocity score ${score.toFixed(1)} — weight ${s0.toFixed(0)}, body_fat ${s1.toFixed(0)}, vo2max ${s2.toFixed(0)}, resting_heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 45. computePlateauDetection ─────────────────────────────────────────────

export interface PlateauDetection {
  score: number
  grade: string
  weightScore: number
  body_fatScore: number
  vo2maxScore: number
  resting_heart_rateScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computePlateauDetection(
  userId: string,
  date?: Date,
): Promise<PlateauDetection> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("weight") ?? []
  const d1 = byType.get("body_fat") ?? []
  const d2 = byType.get("vo2max") ?? []
  const d3 = byType.get("resting_heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 72
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 22
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 35
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 65
  
  const s0 = linearScale(avg0, 100, 60, 40, 85)
  const s1 = linearScale(avg1, 35, 12, 30, 95)
  const s2 = linearScale(avg2, 20, 60, 30, 95)
  const s3 = linearScale(avg3, 80, 50, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.25 + s2 * 0.25 + s3 * 0.25, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    weightScore: Math.round(s0 * 10) / 10,
    body_fatScore: Math.round(s1 * 10) / 10,
    vo2maxScore: Math.round(s2 * 10) / 10,
    resting_heart_rateScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `plateau score ${score.toFixed(1)} — weight ${s0.toFixed(0)}, body_fat ${s1.toFixed(0)}, vo2max ${s2.toFixed(0)}, resting_heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 46. assessSeasonalHealthVariation ───────────────────────────────────────

export interface SeasonalHealthVariation {
  score: number
  grade: string
  stepsScore: number
  active_minutesScore: number
  sleep_durationScore: number
  stressScore: number
  body_temperatureScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessSeasonalHealthVariation(
  userId: string,
  date?: Date,
): Promise<SeasonalHealthVariation> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("steps") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("stress") ?? []
  const d4 = byType.get("body_temperature") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7000
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 36.6
  
  const s0 = linearScale(avg0, 2000, 12000, 30, 95)
  const s1 = linearScale(avg1, 10, 90, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  const s4 = linearScale(avg4, 37.5, 36.2, 40, 90)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.25 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stepsScore: Math.round(s0 * 10) / 10,
    active_minutesScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    body_temperatureScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `seasonal score ${score.toFixed(1)} — steps ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 47. computeTimeOfDayOptimization ────────────────────────────────────────

export interface TimeOfDayOptimization {
  score: number
  grade: string
  heart_rateScore: number
  stressScore: number
  active_minutesScore: number
  caloriesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeTimeOfDayOptimization(
  userId: string,
  date?: Date,
): Promise<TimeOfDayOptimization> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("heart_rate") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("calories") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 75
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 2000
  
  const s0 = linearScale(avg0, 50, 100, 85, 50)
  const s1 = linearScale(avg1, 80, 20, 30, 95)
  const s2 = linearScale(avg2, 10, 90, 30, 95)
  const s3 = linearScale(avg3, 1500, 3000, 50, 85)
  
  const score = clamp(s0 * 0.25 + s1 * 0.25 + s2 * 0.25 + s3 * 0.25, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    heart_rateScore: Math.round(s0 * 10) / 10,
    stressScore: Math.round(s1 * 10) / 10,
    active_minutesScore: Math.round(s2 * 10) / 10,
    caloriesScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `time_of_day score ${score.toFixed(1)} — heart_rate ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, calories ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 48. analyzeWeekdayWeekendHealthGap ──────────────────────────────────────

export interface WeekdayWeekendHealthGap {
  score: number
  grade: string
  stepsScore: number
  sleep_durationScore: number
  active_minutesScore: number
  stressScore: number
  caloriesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeWeekdayWeekendHealthGap(
  userId: string,
  date?: Date,
): Promise<WeekdayWeekendHealthGap> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("steps") ?? []
  const d1 = byType.get("sleep_duration") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("stress") ?? []
  const d4 = byType.get("calories") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7000
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 2000
  
  const s0 = linearScale(avg0, 2000, 12000, 30, 95)
  const s1 = linearScale(avg1, 5, 8.5, 30, 95)
  const s2 = linearScale(avg2, 10, 90, 30, 95)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  const s4 = linearScale(avg4, 1500, 3000, 50, 85)
  
  const score = clamp(s0 * 0.2 + s1 * 0.25 + s2 * 0.2 + s3 * 0.2 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stepsScore: Math.round(s0 * 10) / 10,
    sleep_durationScore: Math.round(s1 * 10) / 10,
    active_minutesScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    caloriesScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `weekend_gap score ${score.toFixed(1)} — steps ${s0.toFixed(0)}, sleep_duration ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 49. computeHealthConsistencyIndex ───────────────────────────────────────

export interface HealthConsistencyIndex {
  score: number
  grade: string
  stepsScore: number
  sleep_durationScore: number
  active_minutesScore: number
  caloriesScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeHealthConsistencyIndex(
  userId: string,
  date?: Date,
): Promise<HealthConsistencyIndex> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("steps") ?? []
  const d1 = byType.get("sleep_duration") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("calories") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7000
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 2000
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 2000, 12000, 30, 95)
  const s1 = linearScale(avg1, 5, 8.5, 30, 95)
  const s2 = linearScale(avg2, 10, 90, 30, 95)
  const s3 = linearScale(avg3, 1500, 3000, 50, 85)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.25 + s2 * 0.2 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stepsScore: Math.round(s0 * 10) / 10,
    sleep_durationScore: Math.round(s1 * 10) / 10,
    active_minutesScore: Math.round(s2 * 10) / 10,
    caloriesScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `consistency score ${score.toFixed(1)} — steps ${s0.toFixed(0)}, sleep_duration ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, calories ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 50. assessMultiSystemResilience ─────────────────────────────────────────

export interface MultiSystemResilience {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  blood_pressureScore: number
  sleep_durationScore: number
  stressScore: number
  body_temperatureScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessMultiSystemResilience(
  userId: string,
  date?: Date,
): Promise<MultiSystemResilience> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("blood_pressure") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  const d4 = byType.get("stress") ?? []
  const d5 = byType.get("body_temperature") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 120
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  const avg5 = d5.length > 0 ? mean(vals(recent(d5, 7))) : 36.6
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 150, 100, 30, 95)
  const s3 = linearScale(avg3, 5, 8.5, 30, 95)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  const s5 = linearScale(avg5, 37.5, 36.2, 40, 90)
  
  const score = clamp(s0 * 0.2 + s1 * 0.15 + s2 * 0.15 + s3 * 0.2 + s4 * 0.15 + s5 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    blood_pressureScore: Math.round(s2 * 10) / 10,
    sleep_durationScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    body_temperatureScore: Math.round(s5 * 10) / 10,
    trend: trendDirection(d0),
    detail: `resilience score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, blood_pressure ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 51. computeCascadeFailureRisk ───────────────────────────────────────────

export interface CascadeFailureRisk {
  score: number
  grade: string
  stressScore: number
  sleep_durationScore: number
  hrvScore: number
  resting_heart_rateScore: number
  blood_pressureScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeCascadeFailureRisk(
  userId: string,
  date?: Date,
): Promise<CascadeFailureRisk> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("stress") ?? []
  const d1 = byType.get("sleep_duration") ?? []
  const d2 = byType.get("hrv") ?? []
  const d3 = byType.get("resting_heart_rate") ?? []
  const d4 = byType.get("blood_pressure") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 50
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 40
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 65
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 120
  
  const s0 = linearScale(avg0, 80, 20, 30, 95)
  const s1 = linearScale(avg1, 5, 8.5, 30, 95)
  const s2 = linearScale(avg2, 20, 80, 30, 95)
  const s3 = linearScale(avg3, 80, 50, 30, 95)
  const s4 = linearScale(avg4, 150, 100, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stressScore: Math.round(s0 * 10) / 10,
    sleep_durationScore: Math.round(s1 * 10) / 10,
    hrvScore: Math.round(s2 * 10) / 10,
    resting_heart_rateScore: Math.round(s3 * 10) / 10,
    blood_pressureScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `cascade score ${score.toFixed(1)} — stress ${s0.toFixed(0)}, sleep_duration ${s1.toFixed(0)}, hrv ${s2.toFixed(0)}, resting_heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 52. analyzeCompensatoryResponseDetection ────────────────────────────────

export interface CompensatoryResponseDetection {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  respiratory_rateScore: number
  blood_oxygenScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeCompensatoryResponseDetection(
  userId: string,
  date?: Date,
): Promise<CompensatoryResponseDetection> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("respiratory_rate") ?? []
  const d3 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 15
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 97
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 18, 12, 40, 95)
  const s3 = linearScale(avg3, 92, 100, 30, 98)
  
  const score = clamp(s0 * 0.25 + s1 * 0.25 + s2 * 0.25 + s3 * 0.25, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    respiratory_rateScore: Math.round(s2 * 10) / 10,
    blood_oxygenScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `compensatory score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, respiratory_rate ${s2.toFixed(0)}, blood_oxygen ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 53. computeHealthBufferCapacity ─────────────────────────────────────────

export interface HealthBufferCapacity {
  score: number
  grade: string
  hrvScore: number
  vo2maxScore: number
  blood_oxygenScore: number
  sleep_durationScore: number
  active_minutesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeHealthBufferCapacity(
  userId: string,
  date?: Date,
): Promise<HealthBufferCapacity> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("vo2max") ?? []
  const d2 = byType.get("blood_oxygen") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  const d4 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 35
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 97
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 30
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 20, 60, 30, 95)
  const s2 = linearScale(avg2, 92, 100, 30, 98)
  const s3 = linearScale(avg3, 5, 8.5, 30, 95)
  const s4 = linearScale(avg4, 10, 90, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.15 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    vo2maxScore: Math.round(s1 * 10) / 10,
    blood_oxygenScore: Math.round(s2 * 10) / 10,
    sleep_durationScore: Math.round(s3 * 10) / 10,
    active_minutesScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `buffer score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, vo2max ${s1.toFixed(0)}, blood_oxygen ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 54. assessRecoveryDebtAccumulation ──────────────────────────────────────

export interface RecoveryDebtAccumulation {
  score: number
  grade: string
  sleep_durationScore: number
  deep_sleepScore: number
  stressScore: number
  active_minutesScore: number
  hrvScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessRecoveryDebtAccumulation(
  userId: string,
  date?: Date,
): Promise<RecoveryDebtAccumulation> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("sleep_duration") ?? []
  const d1 = byType.get("deep_sleep") ?? []
  const d2 = byType.get("stress") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("hrv") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 1.2
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 50
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 40
  
  const s0 = linearScale(avg0, 5, 8.5, 30, 95)
  const s1 = linearScale(avg1, 0.5, 2.0, 30, 95)
  const s2 = linearScale(avg2, 80, 20, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  const s4 = linearScale(avg4, 20, 80, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    sleep_durationScore: Math.round(s0 * 10) / 10,
    deep_sleepScore: Math.round(s1 * 10) / 10,
    stressScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    hrvScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `recovery_debt score ${score.toFixed(1)} — sleep_duration ${s0.toFixed(0)}, deep_sleep ${s1.toFixed(0)}, stress ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 55. computeCardioMetabolicRisk ──────────────────────────────────────────

export interface CardioMetabolicRisk {
  score: number
  grade: string
  resting_heart_rateScore: number
  blood_pressureScore: number
  body_fatScore: number
  weightScore: number
  blood_oxygenScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeCardioMetabolicRisk(
  userId: string,
  date?: Date,
): Promise<CardioMetabolicRisk> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("blood_pressure") ?? []
  const d2 = byType.get("body_fat") ?? []
  const d3 = byType.get("weight") ?? []
  const d4 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 120
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 22
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 72
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 97
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 150, 100, 30, 95)
  const s2 = linearScale(avg2, 35, 12, 30, 95)
  const s3 = linearScale(avg3, 100, 60, 40, 85)
  const s4 = linearScale(avg4, 92, 100, 30, 98)
  
  const score = clamp(s0 * 0.2 + s1 * 0.25 + s2 * 0.25 + s3 * 0.15 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    blood_pressureScore: Math.round(s1 * 10) / 10,
    body_fatScore: Math.round(s2 * 10) / 10,
    weightScore: Math.round(s3 * 10) / 10,
    blood_oxygenScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `cardiometabolic score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, blood_pressure ${s1.toFixed(0)}, body_fat ${s2.toFixed(0)}, weight ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 56. analyzeNeuroEndocrineBalance ────────────────────────────────────────

export interface NeuroEndocrineBalance {
  score: number
  grade: string
  stressScore: number
  hrvScore: number
  sleep_durationScore: number
  body_temperatureScore: number
  deep_sleepScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeNeuroEndocrineBalance(
  userId: string,
  date?: Date,
): Promise<NeuroEndocrineBalance> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("stress") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("body_temperature") ?? []
  const d4 = byType.get("deep_sleep") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 50
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 36.6
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 1.2
  
  const s0 = linearScale(avg0, 80, 20, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 37.5, 36.2, 40, 90)
  const s4 = linearScale(avg4, 0.5, 2.0, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stressScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    body_temperatureScore: Math.round(s3 * 10) / 10,
    deep_sleepScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `neuroendocrine score ${score.toFixed(1)} — stress ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, body_temperature ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 57. computeMusculoskeletalHealth ────────────────────────────────────────

export interface MusculoskeletalHealth {
  score: number
  grade: string
  stepsScore: number
  active_minutesScore: number
  weightScore: number
  body_fatScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeMusculoskeletalHealth(
  userId: string,
  date?: Date,
): Promise<MusculoskeletalHealth> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("steps") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("weight") ?? []
  const d3 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7000
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 72
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 22
  
  const s0 = linearScale(avg0, 2000, 12000, 30, 95)
  const s1 = linearScale(avg1, 10, 90, 30, 95)
  const s2 = linearScale(avg2, 100, 60, 40, 85)
  const s3 = linearScale(avg3, 35, 12, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.3 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stepsScore: Math.round(s0 * 10) / 10,
    active_minutesScore: Math.round(s1 * 10) / 10,
    weightScore: Math.round(s2 * 10) / 10,
    body_fatScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `msk score ${score.toFixed(1)} — steps ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, weight ${s2.toFixed(0)}, body_fat ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 58. assessRespiratoryFitness ────────────────────────────────────────────

export interface RespiratoryFitness {
  score: number
  grade: string
  respiratory_rateScore: number
  blood_oxygenScore: number
  vo2maxScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessRespiratoryFitness(
  userId: string,
  date?: Date,
): Promise<RespiratoryFitness> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("respiratory_rate") ?? []
  const d1 = byType.get("blood_oxygen") ?? []
  const d2 = byType.get("vo2max") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 15
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 97
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 35
  
  const s0 = linearScale(avg0, 18, 12, 40, 95)
  const s1 = linearScale(avg1, 92, 100, 30, 98)
  const s2 = linearScale(avg2, 20, 60, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.35 + s2 * 0.35, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    respiratory_rateScore: Math.round(s0 * 10) / 10,
    blood_oxygenScore: Math.round(s1 * 10) / 10,
    vo2maxScore: Math.round(s2 * 10) / 10,
    trend: trendDirection(d0),
    detail: `respiratory score ${score.toFixed(1)} — respiratory_rate ${s0.toFixed(0)}, blood_oxygen ${s1.toFixed(0)}, vo2max ${s2.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 59. computeVascularHealth ───────────────────────────────────────────────

export interface VascularHealth {
  score: number
  grade: string
  blood_pressureScore: number
  resting_heart_rateScore: number
  blood_oxygenScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeVascularHealth(
  userId: string,
  date?: Date,
): Promise<VascularHealth> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("blood_pressure") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 120
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 97
  
  const s0 = linearScale(avg0, 150, 100, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 92, 100, 30, 98)
  
  const score = clamp(s0 * 0.4 + s1 * 0.3 + s2 * 0.3, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    blood_pressureScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    blood_oxygenScore: Math.round(s2 * 10) / 10,
    trend: trendDirection(d0),
    detail: `vascular score ${score.toFixed(1)} — blood_pressure ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, blood_oxygen ${s2.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 60. analyzeBodyCompositionTrend ─────────────────────────────────────────

export interface BodyCompositionTrend {
  score: number
  grade: string
  weightScore: number
  body_fatScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeBodyCompositionTrend(
  userId: string,
  date?: Date,
): Promise<BodyCompositionTrend> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("weight") ?? []
  const d1 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 72
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 22
  
  const s0 = linearScale(avg0, 100, 60, 40, 85)
  const s1 = linearScale(avg1, 35, 12, 30, 95)
  
  const score = clamp(s0 * 0.5 + s1 * 0.5, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    weightScore: Math.round(s0 * 10) / 10,
    body_fatScore: Math.round(s1 * 10) / 10,
    trend: trendDirection(d0),
    detail: `body_comp score ${score.toFixed(1)} — weight ${s0.toFixed(0)}, body_fat ${s1.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 61. computeSleepArchitectureQuality ─────────────────────────────────────

export interface SleepArchitectureQuality {
  score: number
  grade: string
  deep_sleepScore: number
  rem_sleepScore: number
  light_sleepScore: number
  sleep_durationScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeSleepArchitectureQuality(
  userId: string,
  date?: Date,
): Promise<SleepArchitectureQuality> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("deep_sleep") ?? []
  const d1 = byType.get("rem_sleep") ?? []
  const d2 = byType.get("light_sleep") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 1.2
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 1.5
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 3.0
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  
  const s0 = linearScale(avg0, 0.5, 2.0, 30, 95)
  const s1 = linearScale(avg1, 0.8, 2.5, 30, 90)
  const s2 = linearScale(avg2, 2.0, 5.0, 50, 80)
  const s3 = linearScale(avg3, 5, 8.5, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.15 + s3 * 0.3, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    deep_sleepScore: Math.round(s0 * 10) / 10,
    rem_sleepScore: Math.round(s1 * 10) / 10,
    light_sleepScore: Math.round(s2 * 10) / 10,
    sleep_durationScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `sleep_arch score ${score.toFixed(1)} — deep_sleep ${s0.toFixed(0)}, rem_sleep ${s1.toFixed(0)}, light_sleep ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 62. assessFitnessReadiness ──────────────────────────────────────────────

export interface FitnessReadiness {
  score: number
  grade: string
  vo2maxScore: number
  hrvScore: number
  resting_heart_rateScore: number
  active_minutesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessFitnessReadiness(
  userId: string,
  date?: Date,
): Promise<FitnessReadiness> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("vo2max") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("resting_heart_rate") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 35
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 65
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 20, 60, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 80, 50, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    vo2maxScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    resting_heart_rateScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `fitness_ready score ${score.toFixed(1)} — vo2max ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, resting_heart_rate ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 63. computeTrainingLoadBalance ──────────────────────────────────────────

export interface TrainingLoadBalance {
  score: number
  grade: string
  active_minutesScore: number
  heart_rateScore: number
  caloriesScore: number
  hrvScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeTrainingLoadBalance(
  userId: string,
  date?: Date,
): Promise<TrainingLoadBalance> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("active_minutes") ?? []
  const d1 = byType.get("heart_rate") ?? []
  const d2 = byType.get("calories") ?? []
  const d3 = byType.get("hrv") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 30
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 75
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 2000
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 40
  
  const s0 = linearScale(avg0, 10, 90, 30, 95)
  const s1 = linearScale(avg1, 50, 100, 85, 50)
  const s2 = linearScale(avg2, 1500, 3000, 50, 85)
  const s3 = linearScale(avg3, 20, 80, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.2 + s3 * 0.25, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    active_minutesScore: Math.round(s0 * 10) / 10,
    heart_rateScore: Math.round(s1 * 10) / 10,
    caloriesScore: Math.round(s2 * 10) / 10,
    hrvScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `training_load score ${score.toFixed(1)} — active_minutes ${s0.toFixed(0)}, heart_rate ${s1.toFixed(0)}, calories ${s2.toFixed(0)}, hrv ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 64. analyzeRecoveryEfficiency ───────────────────────────────────────────

export interface RecoveryEfficiency {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  sleep_durationScore: number
  deep_sleepScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeRecoveryEfficiency(
  userId: string,
  date?: Date,
): Promise<RecoveryEfficiency> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("deep_sleep") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 1.2
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 0.5, 2.0, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    deep_sleepScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `recovery_eff score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, deep_sleep ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 65. computeHealthRhythmStability ────────────────────────────────────────

export interface HealthRhythmStability {
  score: number
  grade: string
  sleep_durationScore: number
  resting_heart_rateScore: number
  body_temperatureScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeHealthRhythmStability(
  userId: string,
  date?: Date,
): Promise<HealthRhythmStability> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("sleep_duration") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("body_temperature") ?? []
  const d3 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 36.6
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  
  const s0 = linearScale(avg0, 5, 8.5, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 37.5, 36.2, 40, 90)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.2 + s3 * 0.25, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    sleep_durationScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    body_temperatureScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `rhythm score ${score.toFixed(1)} — sleep_duration ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, body_temperature ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 66. assessBiomarkerTrendAlignment ───────────────────────────────────────

export interface BiomarkerTrendAlignment {
  score: number
  grade: string
  resting_heart_rateScore: number
  hrvScore: number
  blood_pressureScore: number
  body_fatScore: number
  weightScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessBiomarkerTrendAlignment(
  userId: string,
  date?: Date,
): Promise<BiomarkerTrendAlignment> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("blood_pressure") ?? []
  const d3 = byType.get("body_fat") ?? []
  const d4 = byType.get("weight") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 120
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 22
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 72
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 150, 100, 30, 95)
  const s3 = linearScale(avg3, 35, 12, 30, 95)
  const s4 = linearScale(avg4, 100, 60, 40, 85)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    blood_pressureScore: Math.round(s2 * 10) / 10,
    body_fatScore: Math.round(s3 * 10) / 10,
    weightScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `biomarker score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, blood_pressure ${s2.toFixed(0)}, body_fat ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 67. computeWellnessTrajectoryForecast ───────────────────────────────────

export interface WellnessTrajectoryForecast {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  sleep_durationScore: number
  active_minutesScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeWellnessTrajectoryForecast(
  userId: string,
  date?: Date,
): Promise<WellnessTrajectoryForecast> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `forecast score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 68. analyzeHealthDomainBalance ──────────────────────────────────────────

export interface HealthDomainBalance {
  score: number
  grade: string
  resting_heart_rateScore: number
  sleep_durationScore: number
  active_minutesScore: number
  stressScore: number
  body_fatScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeHealthDomainBalance(
  userId: string,
  date?: Date,
): Promise<HealthDomainBalance> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("sleep_duration") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("stress") ?? []
  const d4 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 22
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 5, 8.5, 30, 95)
  const s2 = linearScale(avg2, 10, 90, 30, 95)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  const s4 = linearScale(avg4, 35, 12, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    sleep_durationScore: Math.round(s1 * 10) / 10,
    active_minutesScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    body_fatScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `domain_balance score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, sleep_duration ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 69. computeStressCapacityRatio ──────────────────────────────────────────

export interface StressCapacityRatio {
  score: number
  grade: string
  stressScore: number
  hrvScore: number
  sleep_durationScore: number
  active_minutesScore: number
  vo2maxScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeStressCapacityRatio(
  userId: string,
  date?: Date,
): Promise<StressCapacityRatio> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("stress") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("vo2max") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 50
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 35
  
  const s0 = linearScale(avg0, 80, 20, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  const s4 = linearScale(avg4, 20, 60, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    stressScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    vo2maxScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `stress_capacity score ${score.toFixed(1)} — stress ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 70. assessFunctionalReserve ─────────────────────────────────────────────

export interface FunctionalReserve {
  score: number
  grade: string
  vo2maxScore: number
  hrvScore: number
  blood_oxygenScore: number
  active_minutesScore: number
  sleep_durationScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessFunctionalReserve(
  userId: string,
  date?: Date,
): Promise<FunctionalReserve> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("vo2max") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("blood_oxygen") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 35
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 97
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 7
  
  const s0 = linearScale(avg0, 20, 60, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 92, 100, 30, 98)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  const s4 = linearScale(avg4, 5, 8.5, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    vo2maxScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    blood_oxygenScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    sleep_durationScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `functional_reserve score ${score.toFixed(1)} — vo2max ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, blood_oxygen ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 71. computeHealthEntropy ────────────────────────────────────────────────

export interface HealthEntropy {
  score: number
  grade: string
  hrvScore: number
  heart_rateScore: number
  respiratory_rateScore: number
  sleep_durationScore: number
  body_temperatureScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeHealthEntropy(
  userId: string,
  date?: Date,
): Promise<HealthEntropy> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("heart_rate") ?? []
  const d2 = byType.get("respiratory_rate") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  const d4 = byType.get("body_temperature") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 75
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 15
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 36.6
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 50, 100, 85, 50)
  const s2 = linearScale(avg2, 18, 12, 40, 95)
  const s3 = linearScale(avg3, 5, 8.5, 30, 95)
  const s4 = linearScale(avg4, 37.5, 36.2, 40, 90)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    heart_rateScore: Math.round(s1 * 10) / 10,
    respiratory_rateScore: Math.round(s2 * 10) / 10,
    sleep_durationScore: Math.round(s3 * 10) / 10,
    body_temperatureScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `entropy score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, heart_rate ${s1.toFixed(0)}, respiratory_rate ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 72. analyzeRecoveryPatternEfficiency ────────────────────────────────────

export interface RecoveryPatternEfficiency {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  deep_sleepScore: number
  stressScore: number
  active_minutesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeRecoveryPatternEfficiency(
  userId: string,
  date?: Date,
): Promise<RecoveryPatternEfficiency> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("deep_sleep") ?? []
  const d3 = byType.get("stress") ?? []
  const d4 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 1.2
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 30
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 0.5, 2.0, 30, 95)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  const s4 = linearScale(avg4, 10, 90, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    deep_sleepScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    active_minutesScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `recovery_pattern score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, deep_sleep ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 73. computePhysiologicalAge ─────────────────────────────────────────────

export interface PhysiologicalAge {
  score: number
  grade: string
  resting_heart_rateScore: number
  vo2maxScore: number
  hrvScore: number
  body_fatScore: number
  blood_pressureScore: number
  blood_oxygenScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computePhysiologicalAge(
  userId: string,
  date?: Date,
): Promise<PhysiologicalAge> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("vo2max") ?? []
  const d2 = byType.get("hrv") ?? []
  const d3 = byType.get("body_fat") ?? []
  const d4 = byType.get("blood_pressure") ?? []
  const d5 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 35
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 40
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 22
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 120
  const avg5 = d5.length > 0 ? mean(vals(recent(d5, 7))) : 97
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 20, 60, 30, 95)
  const s2 = linearScale(avg2, 20, 80, 30, 95)
  const s3 = linearScale(avg3, 35, 12, 30, 95)
  const s4 = linearScale(avg4, 150, 100, 30, 95)
  const s5 = linearScale(avg5, 92, 100, 30, 98)
  
  const score = clamp(s0 * 0.18 + s1 * 0.2 + s2 * 0.18 + s3 * 0.18 + s4 * 0.14 + s5 * 0.12, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    vo2maxScore: Math.round(s1 * 10) / 10,
    hrvScore: Math.round(s2 * 10) / 10,
    body_fatScore: Math.round(s3 * 10) / 10,
    blood_pressureScore: Math.round(s4 * 10) / 10,
    blood_oxygenScore: Math.round(s5 * 10) / 10,
    trend: trendDirection(d0),
    detail: `physio_age score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, vo2max ${s1.toFixed(0)}, hrv ${s2.toFixed(0)}, body_fat ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 74. assessTrainingAdaptation ────────────────────────────────────────────

export interface TrainingAdaptation {
  score: number
  grade: string
  vo2maxScore: number
  resting_heart_rateScore: number
  hrvScore: number
  active_minutesScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessTrainingAdaptation(
  userId: string,
  date?: Date,
): Promise<TrainingAdaptation> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("vo2max") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("hrv") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 35
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 40
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 20, 60, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 20, 80, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  
  const score = clamp(s0 * 0.3 + s1 * 0.25 + s2 * 0.25 + s3 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    vo2maxScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    hrvScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    trend: trendDirection(d0),
    detail: `training_adapt score ${score.toFixed(1)} — vo2max ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, hrv ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 75. computeWellnessCoherenceScore ───────────────────────────────────────

export interface WellnessCoherenceScore {
  score: number
  grade: string
  hrvScore: number
  stressScore: number
  sleep_durationScore: number
  active_minutesScore: number
  resting_heart_rateScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeWellnessCoherenceScore(
  userId: string,
  date?: Date,
): Promise<WellnessCoherenceScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("resting_heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 65
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 20, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  const s4 = linearScale(avg4, 80, 50, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    stressScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    resting_heart_rateScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `wellness_coherence score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 76. analyzeHealthClusterRisk ────────────────────────────────────────────

export interface HealthClusterRisk {
  score: number
  grade: string
  blood_pressureScore: number
  body_fatScore: number
  resting_heart_rateScore: number
  stressScore: number
  sleep_durationScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeHealthClusterRisk(
  userId: string,
  date?: Date,
): Promise<HealthClusterRisk> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("blood_pressure") ?? []
  const d1 = byType.get("body_fat") ?? []
  const d2 = byType.get("resting_heart_rate") ?? []
  const d3 = byType.get("stress") ?? []
  const d4 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 120
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 22
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 65
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 7
  
  const s0 = linearScale(avg0, 150, 100, 30, 95)
  const s1 = linearScale(avg1, 35, 12, 30, 95)
  const s2 = linearScale(avg2, 80, 50, 30, 95)
  const s3 = linearScale(avg3, 80, 20, 30, 95)
  const s4 = linearScale(avg4, 5, 8.5, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    blood_pressureScore: Math.round(s0 * 10) / 10,
    body_fatScore: Math.round(s1 * 10) / 10,
    resting_heart_rateScore: Math.round(s2 * 10) / 10,
    stressScore: Math.round(s3 * 10) / 10,
    sleep_durationScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `cluster_risk score ${score.toFixed(1)} — blood_pressure ${s0.toFixed(0)}, body_fat ${s1.toFixed(0)}, resting_heart_rate ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 77. computeSystemicRecoveryIndex ────────────────────────────────────────

export interface SystemicRecoveryIndex {
  score: number
  grade: string
  hrvScore: number
  resting_heart_rateScore: number
  sleep_durationScore: number
  deep_sleepScore: number
  stressScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeSystemicRecoveryIndex(
  userId: string,
  date?: Date,
): Promise<SystemicRecoveryIndex> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("deep_sleep") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 1.2
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 80, 50, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 0.5, 2.0, 30, 95)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  
  const score = clamp(s0 * 0.25 + s1 * 0.2 + s2 * 0.2 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    resting_heart_rateScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    deep_sleepScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `systemic_recovery score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, deep_sleep ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 78. assessMetabolicFlexibility ──────────────────────────────────────────

export interface MetabolicFlexibility {
  score: number
  grade: string
  resting_heart_rateScore: number
  active_minutesScore: number
  caloriesScore: number
  weightScore: number
  body_fatScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessMetabolicFlexibility(
  userId: string,
  date?: Date,
): Promise<MetabolicFlexibility> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("calories") ?? []
  const d3 = byType.get("weight") ?? []
  const d4 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 2000
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 72
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 22
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 10, 90, 30, 95)
  const s2 = linearScale(avg2, 1500, 3000, 50, 85)
  const s3 = linearScale(avg3, 100, 60, 40, 85)
  const s4 = linearScale(avg4, 35, 12, 30, 95)
  
  const score = clamp(s0 * 0.2 + s1 * 0.25 + s2 * 0.2 + s3 * 0.15 + s4 * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    active_minutesScore: Math.round(s1 * 10) / 10,
    caloriesScore: Math.round(s2 * 10) / 10,
    weightScore: Math.round(s3 * 10) / 10,
    body_fatScore: Math.round(s4 * 10) / 10,
    trend: trendDirection(d0),
    detail: `metab_flex score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, calories ${s2.toFixed(0)}, weight ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 79. computeIntegrativeVitalityScore ─────────────────────────────────────

export interface IntegrativeVitalityScore {
  score: number
  grade: string
  hrvScore: number
  vo2maxScore: number
  active_minutesScore: number
  sleep_durationScore: number
  stressScore: number
  blood_oxygenScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeIntegrativeVitalityScore(
  userId: string,
  date?: Date,
): Promise<IntegrativeVitalityScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("vo2max") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  const d4 = byType.get("stress") ?? []
  const d5 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 35
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  const avg5 = d5.length > 0 ? mean(vals(recent(d5, 7))) : 97
  
  const s0 = linearScale(avg0, 20, 80, 30, 95)
  const s1 = linearScale(avg1, 20, 60, 30, 95)
  const s2 = linearScale(avg2, 10, 90, 30, 95)
  const s3 = linearScale(avg3, 5, 8.5, 30, 95)
  const s4 = linearScale(avg4, 80, 20, 30, 95)
  const s5 = linearScale(avg5, 92, 100, 30, 98)
  
  const score = clamp(s0 * 0.2 + s1 * 0.18 + s2 * 0.18 + s3 * 0.18 + s4 * 0.14 + s5 * 0.12, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    hrvScore: Math.round(s0 * 10) / 10,
    vo2maxScore: Math.round(s1 * 10) / 10,
    active_minutesScore: Math.round(s2 * 10) / 10,
    sleep_durationScore: Math.round(s3 * 10) / 10,
    stressScore: Math.round(s4 * 10) / 10,
    blood_oxygenScore: Math.round(s5 * 10) / 10,
    trend: trendDirection(d0),
    detail: `vitality score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, vo2max ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 80. analyzeHealthOptimizationGap ────────────────────────────────────────

export interface HealthOptimizationGap {
  score: number
  grade: string
  resting_heart_rateScore: number
  hrvScore: number
  sleep_durationScore: number
  active_minutesScore: number
  body_fatScore: number
  stressScore: number
  vo2maxScore: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeHealthOptimizationGap(
  userId: string,
  date?: Date,
): Promise<HealthOptimizationGap> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 30 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("body_fat") ?? []
  const d5 = byType.get("stress") ?? []
  const d6 = byType.get("vo2max") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 22
  const avg5 = d5.length > 0 ? mean(vals(recent(d5, 7))) : 50
  const avg6 = d6.length > 0 ? mean(vals(recent(d6, 7))) : 35
  
  const s0 = linearScale(avg0, 80, 50, 30, 95)
  const s1 = linearScale(avg1, 20, 80, 30, 95)
  const s2 = linearScale(avg2, 5, 8.5, 30, 95)
  const s3 = linearScale(avg3, 10, 90, 30, 95)
  const s4 = linearScale(avg4, 35, 12, 30, 95)
  const s5 = linearScale(avg5, 80, 20, 30, 95)
  const s6 = linearScale(avg6, 20, 60, 30, 95)
  
  const score = clamp(s0 * 0.15 + s1 * 0.15 + s2 * 0.15 + s3 * 0.15 + s4 * 0.1 + s5 * 0.15 + s6 * 0.15, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    resting_heart_rateScore: Math.round(s0 * 10) / 10,
    hrvScore: Math.round(s1 * 10) / 10,
    sleep_durationScore: Math.round(s2 * 10) / 10,
    active_minutesScore: Math.round(s3 * 10) / 10,
    body_fatScore: Math.round(s4 * 10) / 10,
    stressScore: Math.round(s5 * 10) / 10,
    vo2maxScore: Math.round(s6 * 10) / 10,
    trend: trendDirection(d0),
    detail: `optimization_gap score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}