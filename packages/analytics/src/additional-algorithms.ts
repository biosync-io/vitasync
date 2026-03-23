import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, sql } from "drizzle-orm"

// ── Helpers ─────────────────────────────────────────────────────
async function fetchMetric(db: any, userId: string, metricType: string, since: Date, until: Date) {
  return db.select({ value: healthMetrics.value, recordedAt: healthMetrics.recordedAt }).from(healthMetrics)
    .where(and(eq(healthMetrics.userId, userId), eq(healthMetrics.metricType, metricType), gte(healthMetrics.recordedAt, since), lte(healthMetrics.recordedAt, until)))
    .orderBy(healthMetrics.recordedAt)
}
function mean(v: number[]): number { return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }
function stddev(v: number[]): number { const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length || 1)) }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)) }
function cv(v: number[]): number { const m = mean(v); return m > 0 ? stddev(v) / m : 0 }
function linearSlope(v: number[]): number { if (v.length < 2) return 0; const n = v.length; const sx = n * (n - 1) / 2; const sx2 = n * (n - 1) * (2 * n - 1) / 6; const sy = v.reduce((a, b) => a + b, 0); const sxy = v.reduce((a, b, i) => a + b * i, 0); return (n * sxy - sx * sy) / (n * sx2 - sx * sx || 1) }

export interface DailyWellnessResult { score: number; sleep: number; activity: number; stress: number; vitals: number; date: string }

export async function computeDailyWellnessScore(userId: string, date: Date = new Date()): Promise<DailyWellnessResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const sleep = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const activity = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const stress = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const vitals = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  return { score, sleep, activity, stress, vitals, date: date.toISOString().slice(0, 10) }
}

export interface WorkProductivityResult { productivityScore: number; score: number; level: string; date: string }

export async function assessWorkProductivityProxy(userId: string, date: Date = new Date()): Promise<WorkProductivityResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const productivityScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc1 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const level = _sc1 >= 70 ? "good" : _sc1 >= 40 ? "fair" : "poor"
  return { productivityScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface EnergyLevelResult { energyScore: number; score: number; level: string; peakHour: number; date: string }

export async function computeEnergyLevelEstimate(userId: string, date: Date = new Date()): Promise<EnergyLevelResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const energyScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc2 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const level = _sc2 >= 70 ? "good" : _sc2 >= 40 ? "fair" : "poor"
  const peakHour = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  return { energyScore, score, level, peakHour, date: date.toISOString().slice(0, 10) }
}

export interface HydrationEstimateResult { hydrationPct: number; score: number; status: string; date: string }

export async function computeHydrationEstimate(userId: string, date: Date = new Date()): Promise<HydrationEstimateResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const hydrationPct = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc3 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc3 >= 70 ? "good" : _sc3 >= 40 ? "fair" : "poor"
  return { hydrationPct, score, status, date: date.toISOString().slice(0, 10) }
}

export interface SocialWellbeingResult { socialScore: number; score: number; level: string; date: string }

export async function assessSocialWellbeing(userId: string, date: Date = new Date()): Promise<SocialWellbeingResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const socialScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc4 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const level = _sc4 >= 70 ? "good" : _sc4 >= 40 ? "fair" : "poor"
  return { socialScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface LifestyleBalanceResult { balanceScore: number; score: number; weakestArea: string; date: string }

export async function computeLifestyleBalance(userId: string, date: Date = new Date()): Promise<LifestyleBalanceResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const balanceScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc5 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const weakestArea = avgSleep < 400 ? "sleep" : avgSteps < 5000 ? "activity" : avgStress > 60 ? "stress" : "vitals"
  return { balanceScore, score, weakestArea, date: date.toISOString().slice(0, 10) }
}

export interface DigitalWellnessResult { digitalScore: number; score: number; screenTimeImpact: string; date: string }

export async function assessDigitalWellness(userId: string, date: Date = new Date()): Promise<DigitalWellnessResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const digitalScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc6 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const screenTimeImpact = _sc6 >= 60 ? "normal" : "abnormal"
  return { digitalScore, score, screenTimeImpact, date: date.toISOString().slice(0, 10) }
}

export interface MorningReadinessResult { readinessScore: number; score: number; recommendation: string; date: string }

export async function computeMorningReadiness(userId: string, date: Date = new Date()): Promise<MorningReadinessResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const readinessScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc7 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const recommendation = _sc7 >= 70 ? "good" : _sc7 >= 40 ? "fair" : "poor"
  return { readinessScore, score, recommendation, date: date.toISOString().slice(0, 10) }
}

export interface EveningWindDownResult { windDownScore: number; score: number; quality: string; date: string }

export async function computeEveningWindDown(userId: string, date: Date = new Date()): Promise<EveningWindDownResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const windDownScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc8 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const quality = _sc8 >= 70 ? "good" : _sc8 >= 40 ? "fair" : "poor"
  return { windDownScore, score, quality, date: date.toISOString().slice(0, 10) }
}

export interface WeeklyRecoveryResult { recoveryScore: number; score: number; status: string; date: string }

export async function assessWeeklyRecovery(userId: string, date: Date = new Date()): Promise<WeeklyRecoveryResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const recoveryScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc9 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc9 >= 70 ? "good" : _sc9 >= 40 ? "fair" : "poor"
  return { recoveryScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface StressRecoveryBalanceResult { balanceRatio: number; score: number; status: string; date: string }

export async function computeStressRecoveryBalance(userId: string, date: Date = new Date()): Promise<StressRecoveryBalanceResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const balanceRatio = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc10 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc10 >= 70 ? "good" : _sc10 >= 40 ? "fair" : "poor"
  return { balanceRatio, score, status, date: date.toISOString().slice(0, 10) }
}

export interface BurnoutTrajectoryResult { trajectoryScore: number; score: number; risk: string; weeksToRisk: number; date: string }

export async function assessBurnoutTrajectory(userId: string, date: Date = new Date()): Promise<BurnoutTrajectoryResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const trajectoryScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc11 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc11 >= 75 ? "low" : _sc11 >= 45 ? "moderate" : "high"
  const weeksToRisk = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  return { trajectoryScore, score, risk, weeksToRisk, date: date.toISOString().slice(0, 10) }
}

export interface ResilienceIndexResult { resilienceScore: number; score: number; level: string; date: string }

export async function computeResilienceIndex(userId: string, date: Date = new Date()): Promise<ResilienceIndexResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const resilienceScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc12 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const level = _sc12 >= 70 ? "good" : _sc12 >= 40 ? "fair" : "poor"
  return { resilienceScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface HealthBehaviorResult { behaviorScore: number; score: number; consistency: string; date: string }

export async function assessHealthBehaviorScore(userId: string, date: Date = new Date()): Promise<HealthBehaviorResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const behaviorScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc13 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const consistency = _sc13 >= 70 ? "good" : _sc13 >= 40 ? "fair" : "poor"
  return { behaviorScore, score, consistency, date: date.toISOString().slice(0, 10) }
}

export interface WellnessTrajectoryResult { trajectory: string; velocityPerWeek: number; score: number; date: string }

export async function computeWellnessTrajectory(userId: string, date: Date = new Date()): Promise<WellnessTrajectoryResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const _sc14 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const trajectory = linearSlope(hrvVals) > 0.1 ? "improving" : linearSlope(hrvVals) < -0.1 ? "declining" : "stable"
  const velocityPerWeek = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  return { trajectory, velocityPerWeek, score, date: date.toISOString().slice(0, 10) }
}

export interface PreventiveCareResult { careIndex: number; score: number; gaps: number; date: string }

export async function assessPreventiveCareIndex(userId: string, date: Date = new Date()): Promise<PreventiveCareResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const careIndex = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const gaps = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  return { careIndex, score, gaps, date: date.toISOString().slice(0, 10) }
}

export interface SelfCareResult { selfCareScore: number; score: number; rating: string; date: string }

export async function computeSelfCareScore(userId: string, date: Date = new Date()): Promise<SelfCareResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const selfCareScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc16 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const rating = _sc16 >= 70 ? "good" : _sc16 >= 40 ? "fair" : "poor"
  return { selfCareScore, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface LifeSatisfactionResult { satisfactionScore: number; score: number; level: string; date: string }

export async function assessLifeSatisfactionProxy(userId: string, date: Date = new Date()): Promise<LifeSatisfactionResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const satisfactionScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc17 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const level = _sc17 >= 70 ? "good" : _sc17 >= 40 ? "fair" : "poor"
  return { satisfactionScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface GratitudeImpactResult { impactScore: number; score: number; effect: string; date: string }

export async function computeGratitudeImpactProxy(userId: string, date: Date = new Date()): Promise<GratitudeImpactResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const impactScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc18 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const effect = _sc18 >= 70 ? "good" : _sc18 >= 40 ? "fair" : "poor"
  return { impactScore, score, effect, date: date.toISOString().slice(0, 10) }
}

export interface PurposeScoreResult { purposeScore: number; score: number; level: string; date: string }

export async function assessPurposeScore(userId: string, date: Date = new Date()): Promise<PurposeScoreResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const purposeScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc19 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const level = _sc19 >= 70 ? "good" : _sc19 >= 40 ? "fair" : "poor"
  return { purposeScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface HRVCoherenceResult { coherenceScore: number; score: number; level: string; date: string }

export async function computeHRVCoherence(userId: string, date: Date = new Date()): Promise<HRVCoherenceResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const coherenceScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc20 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const level = _sc20 >= 70 ? "good" : _sc20 >= 40 ? "fair" : "poor"
  return { coherenceScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface AutonomicToneResult { sympatheticTone: number; parasympatheticTone: number; score: number; balance: string; date: string }

export async function computeAutonomicTone(userId: string, date: Date = new Date()): Promise<AutonomicToneResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const sympatheticTone = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const parasympatheticTone = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc21 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const balance = _sc21 >= 60 ? "normal" : "abnormal"
  return { sympatheticTone, parasympatheticTone, score, balance, date: date.toISOString().slice(0, 10) }
}

export interface BaroreflexResult { sensitivity: number; score: number; status: string; date: string }

export async function computeBaroreflexProxy(userId: string, date: Date = new Date()): Promise<BaroreflexResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const sensitivity = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc22 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc22 >= 70 ? "good" : _sc22 >= 40 ? "fair" : "poor"
  return { sensitivity, score, status, date: date.toISOString().slice(0, 10) }
}

export interface DysautonomiaResult { riskScore: number; score: number; risk: string; date: string }

export async function assessDysautonomiaRisk(userId: string, date: Date = new Date()): Promise<DysautonomiaResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc23 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc23 >= 75 ? "low" : _sc23 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface OrthostasisResult { hrChange: number; score: number; risk: string; date: string }

export async function computeOrthostasisProxy(userId: string, date: Date = new Date()): Promise<OrthostasisResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const hrChange = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc24 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc24 >= 75 ? "low" : _sc24 >= 45 ? "moderate" : "high"
  return { hrChange, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface VagalBrakingResult { brakingScore: number; score: number; capacity: string; date: string }

export async function computeVagalBrakingCapacity(userId: string, date: Date = new Date()): Promise<VagalBrakingResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const brakingScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc25 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const capacity = _sc25 >= 70 ? "good" : _sc25 >= 40 ? "fair" : "poor"
  return { brakingScore, score, capacity, date: date.toISOString().slice(0, 10) }
}

export interface ChronicFatigueResult { riskScore: number; score: number; risk: string; date: string }

export async function assessChronicFatigueRisk(userId: string, date: Date = new Date()): Promise<ChronicFatigueResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc26 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc26 >= 75 ? "low" : _sc26 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface FibromyalgiaResult { symptomScore: number; score: number; risk: string; date: string }

export async function computeFibromyalgiaProxy(userId: string, date: Date = new Date()): Promise<FibromyalgiaResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const symptomScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc27 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc27 >= 75 ? "low" : _sc27 >= 45 ? "moderate" : "high"
  return { symptomScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface PainSensitivityResult { sensitivityIndex: number; score: number; level: string; date: string }

export async function computePainSensitivityProxy(userId: string, date: Date = new Date()): Promise<PainSensitivityResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const sensitivityIndex = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc28 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const level = _sc28 >= 70 ? "good" : _sc28 >= 40 ? "fair" : "poor"
  return { sensitivityIndex, score, level, date: date.toISOString().slice(0, 10) }
}

export interface RaynaudsResult { riskScore: number; score: number; risk: string; date: string }

export async function assessRaynaudsPhenomenon(userId: string, date: Date = new Date()): Promise<RaynaudsResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc29 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc29 >= 75 ? "low" : _sc29 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface BloodVolumeResult { estimatedVolumeLiters: number; score: number; status: string; date: string }

export async function computeBloodVolumeProxy(userId: string, date: Date = new Date()): Promise<BloodVolumeResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const estimatedVolumeLiters = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc30 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc30 >= 70 ? "good" : _sc30 >= 40 ? "fair" : "poor"
  return { estimatedVolumeLiters, score, status, date: date.toISOString().slice(0, 10) }
}

export interface AnemiaRiskResult { riskScore: number; score: number; risk: string; date: string }

export async function assessAnemiaRiskProxy(userId: string, date: Date = new Date()): Promise<AnemiaRiskResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc31 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc31 >= 75 ? "low" : _sc31 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface HemoglobinResult { estimatedHgb: number; score: number; status: string; date: string }

export async function computeHemoglobinProxy(userId: string, date: Date = new Date()): Promise<HemoglobinResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const estimatedHgb = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc32 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc32 >= 70 ? "good" : _sc32 >= 40 ? "fair" : "poor"
  return { estimatedHgb, score, status, date: date.toISOString().slice(0, 10) }
}

export interface DehydrationRiskResult { riskScore: number; score: number; risk: string; urgency: string; date: string }

export async function assessDehydrationRisk(userId: string, date: Date = new Date()): Promise<DehydrationRiskResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc33 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc33 >= 75 ? "low" : _sc33 >= 45 ? "moderate" : "high"
  const _sc33 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const urgency = _sc33 >= 75 ? "low" : _sc33 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, urgency, date: date.toISOString().slice(0, 10) }
}

export interface ElectrolyteResult { imbalanceScore: number; score: number; risk: string; date: string }

export async function computeElectrolyteImbalanceProxy(userId: string, date: Date = new Date()): Promise<ElectrolyteResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const imbalanceScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc34 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc34 >= 75 ? "low" : _sc34 >= 45 ? "moderate" : "high"
  return { imbalanceScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface HypoglycemiaResult { riskScore: number; score: number; risk: string; date: string }

export async function assessHypoglycemiaRisk(userId: string, date: Date = new Date()): Promise<HypoglycemiaResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc35 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc35 >= 75 ? "low" : _sc35 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface BloodSugarResult { estimatedLevel: number; score: number; status: string; date: string }

export async function computeBloodSugarProxy(userId: string, date: Date = new Date()): Promise<BloodSugarResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const estimatedLevel = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc36 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc36 >= 70 ? "good" : _sc36 >= 40 ? "fair" : "poor"
  return { estimatedLevel, score, status, date: date.toISOString().slice(0, 10) }
}

export interface PrediabetesResult { riskScore: number; score: number; risk: string; date: string }

export async function assessPrediabetesRisk(userId: string, date: Date = new Date()): Promise<PrediabetesResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc37 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc37 >= 75 ? "low" : _sc37 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface HbA1cResult { estimatedHbA1c: number; score: number; status: string; date: string }

export async function computeHbA1cProxy(userId: string, date: Date = new Date()): Promise<HbA1cResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const estimatedHbA1c = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc38 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc38 >= 70 ? "good" : _sc38 >= 40 ? "fair" : "poor"
  return { estimatedHbA1c, score, status, date: date.toISOString().slice(0, 10) }
}

export interface KidneyHealthResult { healthScore: number; score: number; status: string; date: string }

export async function assessKidneyHealthProxy(userId: string, date: Date = new Date()): Promise<KidneyHealthResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const healthScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc39 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc39 >= 70 ? "good" : _sc39 >= 40 ? "fair" : "poor"
  return { healthScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface LiverHealthResult { healthScore: number; score: number; status: string; date: string }

export async function computeLiverHealthProxy(userId: string, date: Date = new Date()): Promise<LiverHealthResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const healthScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc40 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc40 >= 70 ? "good" : _sc40 >= 40 ? "fair" : "poor"
  return { healthScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface CeliacResult { riskScore: number; score: number; risk: string; date: string }

export async function assessCeliacProxy(userId: string, date: Date = new Date()): Promise<CeliacResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc41 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc41 >= 75 ? "low" : _sc41 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface GallbladderResult { healthScore: number; score: number; status: string; date: string }

export async function computeGallbladderProxy(userId: string, date: Date = new Date()): Promise<GallbladderResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const healthScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc42 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc42 >= 70 ? "good" : _sc42 >= 40 ? "fair" : "poor"
  return { healthScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface AppendicitisResult { riskScore: number; score: number; risk: string; date: string }

export async function assessAppendicitisProxy(userId: string, date: Date = new Date()): Promise<AppendicitisResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc43 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc43 >= 75 ? "low" : _sc43 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface PancreaticResult { healthScore: number; score: number; status: string; date: string }

export async function computePancreaticHealthProxy(userId: string, date: Date = new Date()): Promise<PancreaticResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const healthScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc44 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc44 >= 70 ? "good" : _sc44 >= 40 ? "fair" : "poor"
  return { healthScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface DVTRiskResult { riskScore: number; score: number; risk: string; date: string }

export async function assessDVTRisk(userId: string, date: Date = new Date()): Promise<DVTRiskResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc45 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc45 >= 75 ? "low" : _sc45 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface VaricoseResult { riskScore: number; score: number; risk: string; date: string }

export async function computeVaricoseVeinRisk(userId: string, date: Date = new Date()): Promise<VaricoseResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc46 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc46 >= 75 ? "low" : _sc46 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface EdemaResult { riskScore: number; score: number; risk: string; date: string }

export async function assessEdemaPotential(userId: string, date: Date = new Date()): Promise<EdemaResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc47 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc47 >= 75 ? "low" : _sc47 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface ProstatitisResult { riskScore: number; score: number; risk: string; date: string }

export async function computeProstatitisProxy(userId: string, date: Date = new Date()): Promise<ProstatitisResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc48 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc48 >= 75 ? "low" : _sc48 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface TesticularResult { healthScore: number; score: number; status: string; date: string }

export async function assessTesticularHealthProxy(userId: string, date: Date = new Date()): Promise<TesticularResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const healthScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc49 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc49 >= 70 ? "good" : _sc49 >= 40 ? "fair" : "poor"
  return { healthScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface AdrenalHealthResult { healthScore: number; score: number; status: string; date: string }

export async function computeAdrenalHealthProxy(userId: string, date: Date = new Date()): Promise<AdrenalHealthResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const healthScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc50 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc50 >= 70 ? "good" : _sc50 >= 40 ? "fair" : "poor"
  return { healthScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface CushingsResult { riskScore: number; score: number; risk: string; date: string }

export async function assessCushingsProxy(userId: string, date: Date = new Date()): Promise<CushingsResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc51 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc51 >= 75 ? "low" : _sc51 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface AddisonsResult { riskScore: number; score: number; risk: string; date: string }

export async function computeAddisonsProxy(userId: string, date: Date = new Date()): Promise<AddisonsResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc52 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc52 >= 75 ? "low" : _sc52 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface HyperthyroidismResult { riskScore: number; score: number; risk: string; date: string }

export async function assessHyperthyroidismProxy(userId: string, date: Date = new Date()): Promise<HyperthyroidismResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc53 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc53 >= 75 ? "low" : _sc53 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface HypothyroidismResult { riskScore: number; score: number; risk: string; date: string }

export async function computeHypothyroidismProxy(userId: string, date: Date = new Date()): Promise<HypothyroidismResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc54 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc54 >= 75 ? "low" : _sc54 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface HashimotosResult { riskScore: number; score: number; risk: string; date: string }

export async function assessHashimotosProxy(userId: string, date: Date = new Date()): Promise<HashimotosResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc55 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc55 >= 75 ? "low" : _sc55 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface GravesResult { riskScore: number; score: number; risk: string; date: string }

export async function computeGravesProxy(userId: string, date: Date = new Date()): Promise<GravesResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc56 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc56 >= 75 ? "low" : _sc56 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface LupusResult { riskScore: number; score: number; risk: string; date: string }

export async function assessLupusProxy(userId: string, date: Date = new Date()): Promise<LupusResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc57 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc57 >= 75 ? "low" : _sc57 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface RheumatoidResult { riskScore: number; score: number; risk: string; date: string }

export async function computeRheumatoidProxy(userId: string, date: Date = new Date()): Promise<RheumatoidResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc58 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc58 >= 75 ? "low" : _sc58 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface AnkylosingSpondylitisResult { riskScore: number; score: number; risk: string; date: string }

export async function assessAnkylosingSpondylitisProxy(userId: string, date: Date = new Date()): Promise<AnkylosingSpondylitisResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc59 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc59 >= 75 ? "low" : _sc59 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface HealthMomentumResult { momentum: number; score: number; direction: string; date: string }

export async function computeHealthMomentum(userId: string, date: Date = new Date()): Promise<HealthMomentumResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const momentum = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc60 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const direction = linearSlope(hrvVals) > 0.1 ? "improving" : linearSlope(hrvVals) < -0.1 ? "declining" : "stable"
  return { momentum, score, direction, date: date.toISOString().slice(0, 10) }
}

export interface PlateauDetectionResult { plateauDetected: boolean; durationDays: number; score: number; date: string }

export async function assessPlateauDetection(userId: string, date: Date = new Date()): Promise<PlateauDetectionResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const plateauDetected = avgHRV > 30 && avgSpO2 > 95 && avgSleep > 360
  const durationDays = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  return { plateauDetected, durationDays, score, date: date.toISOString().slice(0, 10) }
}

export interface InterventionResponseResult { responseRate: number; score: number; responder: boolean; date: string }

export async function computeInterventionResponseRate(userId: string, date: Date = new Date()): Promise<InterventionResponseResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const responseRate = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const responder = avgHRV > 30 && avgSpO2 > 95 && avgSleep > 360
  return { responseRate, score, responder, date: date.toISOString().slice(0, 10) }
}

export interface DoseResponseResult { optimalDose: number; score: number; status: string; date: string }

export async function assessDoseResponseCurve(userId: string, date: Date = new Date()): Promise<DoseResponseResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const optimalDose = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc63 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc63 >= 70 ? "good" : _sc63 >= 40 ? "fair" : "poor"
  return { optimalDose, score, status, date: date.toISOString().slice(0, 10) }
}

export interface GoalProgressResult { progressPct: number; score: number; onTrack: boolean; date: string }

export async function computeHealthGoalProgress(userId: string, date: Date = new Date()): Promise<GoalProgressResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const progressPct = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const onTrack = avgHRV > 30 && avgSpO2 > 95 && avgSleep > 360
  return { progressPct, score, onTrack, date: date.toISOString().slice(0, 10) }
}

export interface CompensatoryResult { compensationScore: number; score: number; active: boolean; date: string }

export async function assessCompensatoryMechanisms(userId: string, date: Date = new Date()): Promise<CompensatoryResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const compensationScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const active = avgHRV > 30 && avgSpO2 > 95 && avgSleep > 360
  return { compensationScore, score, active, date: date.toISOString().slice(0, 10) }
}

export interface HealthBufferResult { bufferCapacity: number; score: number; status: string; date: string }

export async function computeHealthBufferCapacity(userId: string, date: Date = new Date()): Promise<HealthBufferResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const bufferCapacity = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc66 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc66 >= 70 ? "good" : _sc66 >= 40 ? "fair" : "poor"
  return { bufferCapacity, score, status, date: date.toISOString().slice(0, 10) }
}

export interface CascadeFailureResult { riskScore: number; score: number; risk: string; date: string }

export async function assessCascadeFailureRisk(userId: string, date: Date = new Date()): Promise<CascadeFailureResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc67 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc67 >= 75 ? "low" : _sc67 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface RecoveryDebtResult { debtLevel: number; score: number; severity: string; date: string }

export async function computeRecoveryDebtAccumulation(userId: string, date: Date = new Date()): Promise<RecoveryDebtResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const debtLevel = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc68 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const severity = _sc68 >= 75 ? "low" : _sc68 >= 45 ? "moderate" : "high"
  return { debtLevel, score, severity, date: date.toISOString().slice(0, 10) }
}

export interface MultiSystemStressResult { systemsAffected: number; score: number; severity: string; date: string }

export async function assessMultiSystemStress(userId: string, date: Date = new Date()): Promise<MultiSystemStressResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const systemsAffected = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc69 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const severity = _sc69 >= 75 ? "low" : _sc69 >= 45 ? "moderate" : "high"
  return { systemsAffected, score, severity, date: date.toISOString().slice(0, 10) }
}

export interface HealthVarianceResult { varianceIndex: number; score: number; stability: string; date: string }

export async function computeHealthVarianceAnalysis(userId: string, date: Date = new Date()): Promise<HealthVarianceResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const varianceIndex = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc70 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const stability = _sc70 >= 70 ? "good" : _sc70 >= 40 ? "fair" : "poor"
  return { varianceIndex, score, stability, date: date.toISOString().slice(0, 10) }
}

export interface RhythmCoherenceResult { coherenceScore: number; score: number; status: string; date: string }

export async function assessBiologicalRhythmCoherence(userId: string, date: Date = new Date()): Promise<RhythmCoherenceResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const coherenceScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc71 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc71 >= 70 ? "good" : _sc71 >= 40 ? "fair" : "poor"
  return { coherenceScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface PhysiologicalAgeResult { bioAge: number; chronoDiff: number; score: number; date: string }

export async function computePhysiologicalAge(userId: string, date: Date = new Date()): Promise<PhysiologicalAgeResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const bioAge = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const chronoDiff = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  return { bioAge, chronoDiff, score, date: date.toISOString().slice(0, 10) }
}

export interface HealthComplexityResult { complexityScore: number; score: number; status: string; date: string }

export async function assessHealthComplexityIndex(userId: string, date: Date = new Date()): Promise<HealthComplexityResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const complexityScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc73 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc73 >= 70 ? "good" : _sc73 >= 40 ? "fair" : "poor"
  return { complexityScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface AdaptationReserveResult { reserveScore: number; score: number; level: string; date: string }

export async function computeAdaptationReserve(userId: string, date: Date = new Date()): Promise<AdaptationReserveResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const reserveScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc74 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const level = _sc74 >= 70 ? "good" : _sc74 >= 40 ? "fair" : "poor"
  return { reserveScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface FunctionalDeclineResult { riskScore: number; score: number; risk: string; date: string }

export async function assessFunctionalDeclineRisk(userId: string, date: Date = new Date()): Promise<FunctionalDeclineResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc75 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc75 >= 75 ? "low" : _sc75 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface VitalityIndexResult { vitalityScore: number; score: number; level: string; date: string }

export async function computeVitalityIndex(userId: string, date: Date = new Date()): Promise<VitalityIndexResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const vitalityScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc76 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const level = _sc76 >= 70 ? "good" : _sc76 >= 40 ? "fair" : "poor"
  return { vitalityScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface PrognosticResult { prognosisScore: number; score: number; outlook: string; date: string }

export async function assessPrognosticScore(userId: string, date: Date = new Date()): Promise<PrognosticResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const prognosisScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc77 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const outlook = linearSlope(hrvVals) > 0.1 ? "improving" : linearSlope(hrvVals) < -0.1 ? "declining" : "stable"
  return { prognosisScore, score, outlook, date: date.toISOString().slice(0, 10) }
}

export interface HealthInertiaResult { inertiaScore: number; score: number; changeability: string; date: string }

export async function computeHealthInertia(userId: string, date: Date = new Date()): Promise<HealthInertiaResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const inertiaScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc78 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const changeability = _sc78 >= 70 ? "good" : _sc78 >= 40 ? "fair" : "poor"
  return { inertiaScore, score, changeability, date: date.toISOString().slice(0, 10) }
}

export interface TimeToEventResult { estimatedDays: number; score: number; confidence: number; date: string }

export async function assessTimeToEventEstimate(userId: string, date: Date = new Date()): Promise<TimeToEventResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const estimatedDays = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const confidence = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  return { estimatedDays, score, confidence, date: date.toISOString().slice(0, 10) }
}

export interface MicrobiomeResult { diversityProxy: number; score: number; status: string; date: string }

export async function computeMicrobiomeHealthProxy(userId: string, date: Date = new Date()): Promise<MicrobiomeResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const diversityProxy = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc80 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc80 >= 70 ? "good" : _sc80 >= 40 ? "fair" : "poor"
  return { diversityProxy, score, status, date: date.toISOString().slice(0, 10) }
}

export interface ChronicPainResult { riskScore: number; score: number; risk: string; date: string }

export async function assessChronicPainRisk(userId: string, date: Date = new Date()): Promise<ChronicPainResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc81 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc81 >= 75 ? "low" : _sc81 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface NeuroinflammationResult { inflammationIndex: number; score: number; risk: string; date: string }

export async function computeNeuroinflammationProxy(userId: string, date: Date = new Date()): Promise<NeuroinflammationResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const inflammationIndex = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc82 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc82 >= 75 ? "low" : _sc82 >= 45 ? "moderate" : "high"
  return { inflammationIndex, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface LongCovidResult { riskScore: number; score: number; risk: string; date: string }

export async function assessLongCovidRisk(userId: string, date: Date = new Date()): Promise<LongCovidResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const riskScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc83 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc83 >= 75 ? "low" : _sc83 >= 45 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface EpigeneticDriftResult { driftRate: number; score: number; status: string; date: string }

export async function computeEpigeneticDriftProxy(userId: string, date: Date = new Date()): Promise<EpigeneticDriftResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const driftRate = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc84 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc84 >= 70 ? "good" : _sc84 >= 40 ? "fair" : "poor"
  return { driftRate, score, status, date: date.toISOString().slice(0, 10) }
}

export interface MitoDysfunctionResult { dysfunctionScore: number; score: number; risk: string; date: string }

export async function assessMitochondrialDysfunction(userId: string, date: Date = new Date()): Promise<MitoDysfunctionResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const dysfunctionScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc85 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc85 >= 75 ? "low" : _sc85 >= 45 ? "moderate" : "high"
  return { dysfunctionScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface SenescenceResult { senescenceIndex: number; score: number; status: string; date: string }

export async function computeCellularSenescenceProxy(userId: string, date: Date = new Date()): Promise<SenescenceResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const senescenceIndex = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc86 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc86 >= 70 ? "good" : _sc86 >= 40 ? "fair" : "poor"
  return { senescenceIndex, score, status, date: date.toISOString().slice(0, 10) }
}

export interface AutophagyResult { autophagyScore: number; score: number; capacity: string; date: string }

export async function assessAutophagyCapacity(userId: string, date: Date = new Date()): Promise<AutophagyResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const autophagyScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc87 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const capacity = _sc87 >= 70 ? "good" : _sc87 >= 40 ? "fair" : "poor"
  return { autophagyScore, score, capacity, date: date.toISOString().slice(0, 10) }
}

export interface ProteostasisResult { proteostasisIndex: number; score: number; status: string; date: string }

export async function computeProteostasisProxy(userId: string, date: Date = new Date()): Promise<ProteostasisResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const proteostasisIndex = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc88 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc88 >= 70 ? "good" : _sc88 >= 40 ? "fair" : "poor"
  return { proteostasisIndex, score, status, date: date.toISOString().slice(0, 10) }
}

export interface GenomicInstabilityResult { instabilityIndex: number; score: number; risk: string; date: string }

export async function assessGenomicInstabilityProxy(userId: string, date: Date = new Date()): Promise<GenomicInstabilityResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const instabilityIndex = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc89 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc89 >= 75 ? "low" : _sc89 >= 45 ? "moderate" : "high"
  return { instabilityIndex, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface TelomereMaintenanceResult { maintenanceScore: number; score: number; status: string; date: string }

export async function computeTelomereMaintenanceProxy(userId: string, date: Date = new Date()): Promise<TelomereMaintenanceResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const maintenanceScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc90 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc90 >= 70 ? "good" : _sc90 >= 40 ? "fair" : "poor"
  return { maintenanceScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface StemCellExhaustionResult { exhaustionIndex: number; score: number; risk: string; date: string }

export async function assessStemCellExhaustionProxy(userId: string, date: Date = new Date()): Promise<StemCellExhaustionResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const exhaustionIndex = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc91 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const risk = _sc91 >= 75 ? "low" : _sc91 >= 45 ? "moderate" : "high"
  return { exhaustionIndex, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface IntercellularCommResult { communicationScore: number; score: number; status: string; date: string }

export async function computeIntercellularCommunication(userId: string, date: Date = new Date()): Promise<IntercellularCommResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const communicationScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc92 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc92 >= 70 ? "good" : _sc92 >= 40 ? "fair" : "poor"
  return { communicationScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface NutrientSensingResult { pathwayScore: number; score: number; status: string; date: string }

export async function assessNutrientSensingPathway(userId: string, date: Date = new Date()): Promise<NutrientSensingResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const pathwayScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc93 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc93 >= 70 ? "good" : _sc93 >= 40 ? "fair" : "poor"
  return { pathwayScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface CircadianClockResult { clockHealthScore: number; score: number; alignment: string; date: string }

export async function computeCircadianClockHealth(userId: string, date: Date = new Date()): Promise<CircadianClockResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const clockHealthScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const _sc94 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const alignment = _sc94 >= 70 ? "good" : _sc94 >= 40 ? "fair" : "poor"
  return { clockHealthScore, score, alignment, date: date.toISOString().slice(0, 10) }
}

export interface EpithelialBarrierResult { barrierScore: number; score: number; status: string; date: string }

export async function assessEpithelialBarrierFunction(userId: string, date: Date = new Date()): Promise<EpithelialBarrierResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const barrierScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2 + avgActive / 10 - avgStress * 0.3)), 0, 100)
  const _sc95 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc95 >= 70 ? "good" : _sc95 >= 40 ? "fair" : "poor"
  return { barrierScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface VascularIntegrityResult { integrityScore: number; score: number; status: string; date: string }

export async function computeVascularIntegrity(userId: string, date: Date = new Date()): Promise<VascularIntegrityResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const integrityScore = Math.round(avgSteps / 100 + avgHRV * 0.2 + avgActive / 5)
  const score = clamp(Math.round(50 + avgHRV * 0.3 - avgStress * 0.4 + (avgSpO2 - 93) * 3 + avgDeep / 8 + avgSteps / 2000), 0, 100)
  const _sc96 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const status = _sc96 >= 70 ? "good" : _sc96 >= 40 ? "fair" : "poor"
  return { integrityScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface NeuralPlasticityCapResult { plasticityScore: number; score: number; capacity: string; date: string }

export async function assessNeuralPlasticityCapacity(userId: string, date: Date = new Date()): Promise<NeuralPlasticityCapResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const plasticityScore = Math.round((avgSleep / 60 + avgDeep / 30 + avgHRV / 10) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 25 + (avgHRV / 50) * 25 + (100 - avgRHR) * 0.25 + (avgSpO2 - 90) * 2 + avgActive / 8), 0, 100)
  const _sc97 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const capacity = _sc97 >= 70 ? "good" : _sc97 >= 40 ? "fair" : "poor"
  return { plasticityScore, score, capacity, date: date.toISOString().slice(0, 10) }
}

export interface HormesisResult { responseScore: number; score: number; adaptability: string; date: string }

export async function computeHormesisResponse(userId: string, date: Date = new Date()): Promise<HormesisResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const responseScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 + linearSlope(hrvVals) * 50), 0, 100)
  const _sc98 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const adaptability = _sc98 >= 70 ? "good" : _sc98 >= 40 ? "fair" : "poor"
  return { responseScore, score, adaptability, date: date.toISOString().slice(0, 10) }
}

export interface OverallHealthGradeResult { overallScore: number; grade: string; score: number; percentile: number; date: string }

export async function assessOverallHealthGrade(userId: string, date: Date = new Date()): Promise<OverallHealthGradeResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const stepsRows = await fetchMetric(db, userId, "steps", since, until)
  const weightRows = await fetchMetric(db, userId, "weight", since, until)
  const activeRows = await fetchMetric(db, userId, "active_minutes", since, until)
  const calRows = await fetchMetric(db, userId, "calories", since, until)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const stepsVals = stepsRows.map((r: any) => r.value)
  const weightVals = weightRows.map((r: any) => r.value)
  const activeVals = activeRows.map((r: any) => r.value)
  const calVals = calRows.map((r: any) => r.value)
  const avgRHR = mean(rhrVals); const avgHRV = mean(hrvVals); const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals); const avgRR = mean(rrVals); const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals); const avgDeep = mean(deepVals); const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals); const avgActive = mean(activeVals); const avgCal = mean(calVals)

  const overallScore = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  const _sc99 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 2), 0, 100)
  const grade = _sc99 >= 90 ? "A" : _sc99 >= 80 ? "B" : _sc99 >= 70 ? "C" : _sc99 >= 60 ? "D" : "F"
  const score = clamp(Math.round((avgSteps / 10000) * 20 + (avgHRV / 50) * 25 + (avgDeep / 90) * 20 + (100 - avgRHR) * 0.2 + avgSleep / 50), 0, 100)
  const percentile = Math.round(100 - avgStress * 0.5 + avgHRV * 0.1 + avgActive / 10)
  return { overallScore, grade, score, percentile, date: date.toISOString().slice(0, 10) }
}
