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

export interface CyclePhaseResult { phase: string; dayOfCycle: number; score: number; confidence: number; date: string }

export async function computeMenstrualCyclePhase(userId: string, date: Date = new Date()): Promise<CyclePhaseResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const _t0 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const phase = _t0 >= 75 ? "optimal" : _t0 >= 50 ? "adequate" : _t0 >= 25 ? "suboptimal" : "low"
  const dayOfCycle = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const confidence = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  return { phase, dayOfCycle, score, confidence, date: date.toISOString().slice(0, 10) }
}

export interface FertilityWindowResult { fertile: boolean; daysToOvulation: number; score: number; window: string; date: string }

export async function assessFertilityWindow(userId: string, date: Date = new Date()): Promise<FertilityWindowResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const fertile = avgHRV > 30 && avgSpO2 > 95 && avgDeep > 50
  const daysToOvulation = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t1 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const window = _t1 >= 60 ? "favorable" : "unfavorable"
  return { fertile, daysToOvulation, score, window, date: date.toISOString().slice(0, 10) }
}

export interface OvulationProxyResult { ovulationLikely: boolean; tempShift: number; score: number; date: string }

export async function computeOvulationProxy(userId: string, date: Date = new Date()): Promise<OvulationProxyResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const ovulationLikely = avgHRV > 30 && avgSpO2 > 95 && avgDeep > 50
  const tempShift = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  return { ovulationLikely, tempShift, score, date: date.toISOString().slice(0, 10) }
}

export interface ProgesteroneCurveResult { estimatedLevel: string; lutealAdequacy: number; score: number; date: string }

export async function analyzeProgesteroneCurve(userId: string, date: Date = new Date()): Promise<ProgesteroneCurveResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const _t3 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const estimatedLevel = _t3 >= 75 ? "low" : _t3 >= 50 ? "moderate" : "high"
  const lutealAdequacy = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  return { estimatedLevel, lutealAdequacy, score, date: date.toISOString().slice(0, 10) }
}

export interface EstrogenProxyResult { estimatedPhase: string; score: number; level: string; date: string }

export async function computeEstrogenLevelProxy(userId: string, date: Date = new Date()): Promise<EstrogenProxyResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const _t4 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const estimatedPhase = _t4 >= 75 ? "optimal" : _t4 >= 50 ? "adequate" : _t4 >= 25 ? "suboptimal" : "low"
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t4 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const level = _t4 >= 75 ? "low" : _t4 >= 50 ? "moderate" : "high"
  return { estimatedPhase, score, level, date: date.toISOString().slice(0, 10) }
}

export interface PMSRiskResult { riskScore: number; severity: string; score: number; daysBeforePeriod: number; date: string }

export async function assessPMSRisk(userId: string, date: Date = new Date()): Promise<PMSRiskResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const _t5 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const severity = _t5 >= 75 ? "low" : _t5 >= 50 ? "moderate" : "high"
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const daysBeforePeriod = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  return { riskScore, severity, score, daysBeforePeriod, date: date.toISOString().slice(0, 10) }
}

export interface MenopauseStatusResult { status: string; transitionScore: number; score: number; date: string }

export async function computeMenopauseStatusProxy(userId: string, date: Date = new Date()): Promise<MenopauseStatusResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const _t6 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t6 >= 75 ? "optimal" : _t6 >= 50 ? "adequate" : _t6 >= 25 ? "suboptimal" : "low"
  const transitionScore = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  return { status, transitionScore, score, date: date.toISOString().slice(0, 10) }
}

export interface EndometriosisRiskResult { riskScore: number; score: number; risk: string; date: string }

export async function analyzeEndometriosisRisk(userId: string, date: Date = new Date()): Promise<EndometriosisRiskResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t7 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t7 >= 75 ? "low" : _t7 >= 50 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface PCOSDetailedResult { riskScore: number; metabolicComponent: number; hormonalComponent: number; score: number; date: string }

export async function computePCOSRiskDetailed(userId: string, date: Date = new Date()): Promise<PCOSDetailedResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const metabolicComponent = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const hormonalComponent = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  return { riskScore, metabolicComponent, hormonalComponent, score, date: date.toISOString().slice(0, 10) }
}

export interface BreastCancerRiskResult { riskScore: number; score: number; risk: string; date: string }

export async function assessBreastCancerRisk(userId: string, date: Date = new Date()): Promise<BreastCancerRiskResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t9 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t9 >= 75 ? "low" : _t9 >= 50 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface PregnancyReadinessResult { readinessScore: number; score: number; status: string; factors: number; date: string }

export async function computePregnancyReadiness(userId: string, date: Date = new Date()): Promise<PregnancyReadinessResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const readinessScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t10 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t10 >= 75 ? "optimal" : _t10 >= 50 ? "adequate" : _t10 >= 25 ? "suboptimal" : "low"
  const factors = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  return { readinessScore, score, status, factors, date: date.toISOString().slice(0, 10) }
}

export interface PostpartumRecoveryResult { recoveryPct: number; score: number; phase: string; date: string }

export async function analyzePostpartumRecovery(userId: string, date: Date = new Date()): Promise<PostpartumRecoveryResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const recoveryPct = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t11 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const phase = _t11 >= 75 ? "optimal" : _t11 >= 50 ? "adequate" : _t11 >= 25 ? "suboptimal" : "low"
  return { recoveryPct, score, phase, date: date.toISOString().slice(0, 10) }
}

export interface HotFlashResult { likelihood: number; score: number; frequency: string; date: string }

export async function computeHotFlashProxy(userId: string, date: Date = new Date()): Promise<HotFlashResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const likelihood = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t12 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const frequency = _t12 >= 60 ? "favorable" : "unfavorable"
  return { likelihood, score, frequency, date: date.toISOString().slice(0, 10) }
}

export interface FemaleOsteoporosisResult { riskScore: number; score: number; risk: string; date: string }

export async function assessOsteoporosisRiskFemale(userId: string, date: Date = new Date()): Promise<FemaleOsteoporosisResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t13 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t13 >= 75 ? "low" : _t13 >= 50 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface CycleLengthVarResult { avgLengthDays: number; variabilityDays: number; score: number; regularity: string; date: string }

export async function computeCycleLengthVariability(userId: string, date: Date = new Date()): Promise<CycleLengthVarResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const avgLengthDays = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const variabilityDays = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t14 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const regularity = _t14 >= 60 ? "favorable" : "unfavorable"
  return { avgLengthDays, variabilityDays, score, regularity, date: date.toISOString().slice(0, 10) }
}

export interface HormonalMigraineResult { riskScore: number; score: number; cycleTiming: string; date: string }

export async function analyzeHormonalMigraine(userId: string, date: Date = new Date()): Promise<HormonalMigraineResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t15 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const cycleTiming = _t15 >= 60 ? "favorable" : "unfavorable"
  return { riskScore, score, cycleTiming, date: date.toISOString().slice(0, 10) }
}

export interface LutealPhaseResult { lutealLength: number; adequacy: number; score: number; status: string; date: string }

export async function computeLutealPhaseDeficiency(userId: string, date: Date = new Date()): Promise<LutealPhaseResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const lutealLength = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const adequacy = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t16 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t16 >= 75 ? "optimal" : _t16 >= 50 ? "adequate" : _t16 >= 25 ? "suboptimal" : "low"
  return { lutealLength, adequacy, score, status, date: date.toISOString().slice(0, 10) }
}

export interface IronDeficiencyResult { riskScore: number; score: number; risk: string; date: string }

export async function assessIronDeficiencyRisk(userId: string, date: Date = new Date()): Promise<IronDeficiencyResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t17 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t17 >= 75 ? "low" : _t17 >= 50 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface BBTTrendResult { preBBT: number; postBBT: number; shift: number; score: number; biphasic: boolean; date: string }

export async function computeBasalBodyTemperatureTrend(userId: string, date: Date = new Date()): Promise<BBTTrendResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const preBBT = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const postBBT = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const shift = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const biphasic = avgHRV > 30 && avgSpO2 > 95 && avgDeep > 50
  return { preBBT, postBBT, shift, score, biphasic, date: date.toISOString().slice(0, 10) }
}

export interface ExerciseCycleResult { impactScore: number; score: number; recommendation: string; date: string }

export async function analyzeExerciseCycleImpact(userId: string, date: Date = new Date()): Promise<ExerciseCycleResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const impactScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t19 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const recommendation = _t19 >= 60 ? "favorable" : "unfavorable"
  return { impactScore, score, recommendation, date: date.toISOString().slice(0, 10) }
}

export interface FollicularPhaseResult { durationDays: number; quality: number; score: number; date: string }

export async function computeFollicularPhaseAnalysis(userId: string, date: Date = new Date()): Promise<FollicularPhaseResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const durationDays = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const quality = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  return { durationDays, quality, score, date: date.toISOString().slice(0, 10) }
}

export interface LutealPhaseAnalysisResult { durationDays: number; quality: number; score: number; date: string }

export async function computeLutealPhaseAnalysis(userId: string, date: Date = new Date()): Promise<LutealPhaseAnalysisResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const durationDays = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const quality = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  return { durationDays, quality, score, date: date.toISOString().slice(0, 10) }
}

export interface CervicalMucusResult { fertilitySign: string; score: number; date: string }

export async function computeCervicalMucusProxy(userId: string, date: Date = new Date()): Promise<CervicalMucusResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const _t22 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const fertilitySign = _t22 >= 60 ? "favorable" : "unfavorable"
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  return { fertilitySign, score, date: date.toISOString().slice(0, 10) }
}

export interface LibidoCycleResult { currentLevel: string; cycleDay: number; score: number; date: string }

export async function computeLibidoCycle(userId: string, date: Date = new Date()): Promise<LibidoCycleResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const _t23 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const currentLevel = _t23 >= 75 ? "low" : _t23 >= 50 ? "moderate" : "high"
  const cycleDay = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  return { currentLevel, cycleDay, score, date: date.toISOString().slice(0, 10) }
}

export interface BoneDensityCycleResult { impactScore: number; score: number; phase: string; date: string }

export async function computeBoneDensityCycle(userId: string, date: Date = new Date()): Promise<BoneDensityCycleResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const impactScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t24 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const phase = _t24 >= 75 ? "optimal" : _t24 >= 50 ? "adequate" : _t24 >= 25 ? "suboptimal" : "low"
  return { impactScore, score, phase, date: date.toISOString().slice(0, 10) }
}

export interface ImmuneVariationCycleResult { immuneModulation: number; score: number; phase: string; date: string }

export async function computeImmuneVariationCycle(userId: string, date: Date = new Date()): Promise<ImmuneVariationCycleResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const immuneModulation = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t25 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const phase = _t25 >= 75 ? "optimal" : _t25 >= 50 ? "adequate" : _t25 >= 25 ? "suboptimal" : "low"
  return { immuneModulation, score, phase, date: date.toISOString().slice(0, 10) }
}

export interface SleepQualityCycleResult { sleepImpact: number; score: number; worstPhase: string; date: string }

export async function computeSleepQualityCycle(userId: string, date: Date = new Date()): Promise<SleepQualityCycleResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const sleepImpact = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t26 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const worstPhase = _t26 >= 75 ? "optimal" : _t26 >= 50 ? "adequate" : _t26 >= 25 ? "suboptimal" : "low"
  return { sleepImpact, score, worstPhase, date: date.toISOString().slice(0, 10) }
}

export interface MoodCycleCorrResult { moodVariation: number; score: number; worstPhase: string; date: string }

export async function computeMoodCycleCorrelation(userId: string, date: Date = new Date()): Promise<MoodCycleCorrResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const moodVariation = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t27 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const worstPhase = _t27 >= 75 ? "optimal" : _t27 >= 50 ? "adequate" : _t27 >= 25 ? "suboptimal" : "low"
  return { moodVariation, score, worstPhase, date: date.toISOString().slice(0, 10) }
}

export interface WeightFlucCycleResult { fluctuationKg: number; score: number; peakPhase: string; date: string }

export async function computeWeightFluctuationCycle(userId: string, date: Date = new Date()): Promise<WeightFlucCycleResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const fluctuationKg = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t28 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const peakPhase = _t28 >= 75 ? "optimal" : _t28 >= 50 ? "adequate" : _t28 >= 25 ? "suboptimal" : "low"
  return { fluctuationKg, score, peakPhase, date: date.toISOString().slice(0, 10) }
}

export interface EnergyCycleResult { energyVariation: number; score: number; peakPhase: string; date: string }

export async function computeEnergyCycle(userId: string, date: Date = new Date()): Promise<EnergyCycleResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const energyVariation = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t29 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const peakPhase = _t29 >= 75 ? "optimal" : _t29 >= 50 ? "adequate" : _t29 >= 25 ? "suboptimal" : "low"
  return { energyVariation, score, peakPhase, date: date.toISOString().slice(0, 10) }
}

export interface BreastHealthResult { healthScore: number; score: number; status: string; date: string }

export async function computeBreastHealthProxy(userId: string, date: Date = new Date()): Promise<BreastHealthResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const healthScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t30 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t30 >= 75 ? "optimal" : _t30 >= 50 ? "adequate" : _t30 >= 25 ? "suboptimal" : "low"
  return { healthScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface UterineHealthResult { healthScore: number; score: number; status: string; date: string }

export async function computeUterineHealthProxy(userId: string, date: Date = new Date()): Promise<UterineHealthResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const healthScore = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t31 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t31 >= 75 ? "optimal" : _t31 >= 50 ? "adequate" : _t31 >= 25 ? "suboptimal" : "low"
  return { healthScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface PelvicFloorResult { functionScore: number; score: number; status: string; date: string }

export async function computePelvicFloorFunction(userId: string, date: Date = new Date()): Promise<PelvicFloorResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const functionScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t32 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t32 >= 75 ? "optimal" : _t32 >= 50 ? "adequate" : _t32 >= 25 ? "suboptimal" : "low"
  return { functionScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface PrenatalHealthResult { healthScore: number; score: number; readiness: string; date: string }

export async function computePrenatalHealthScore(userId: string, date: Date = new Date()): Promise<PrenatalHealthResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const healthScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t33 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const readiness = _t33 >= 60 ? "normal" : "abnormal"
  return { healthScore, score, readiness, date: date.toISOString().slice(0, 10) }
}

export interface LactationSupportResult { supportScore: number; score: number; adequacy: string; date: string }

export async function computeLactationSupportScore(userId: string, date: Date = new Date()): Promise<LactationSupportResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const supportScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t34 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const adequacy = _t34 >= 70 ? "good" : _t34 >= 40 ? "fair" : "poor"
  return { supportScore, score, adequacy, date: date.toISOString().slice(0, 10) }
}

export interface ContraceptiveImpactResult { impactScore: number; score: number; effect: string; date: string }

export async function computeHormonalContraceptiveImpact(userId: string, date: Date = new Date()): Promise<ContraceptiveImpactResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const impactScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t35 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const effect = _t35 >= 60 ? "favorable" : "unfavorable"
  return { impactScore, score, effect, date: date.toISOString().slice(0, 10) }
}

export interface ThyroidCycleResult { interactionScore: number; score: number; status: string; date: string }

export async function computeThyroidCycleInteraction(userId: string, date: Date = new Date()): Promise<ThyroidCycleResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const interactionScore = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t36 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t36 >= 75 ? "optimal" : _t36 >= 50 ? "adequate" : _t36 >= 25 ? "suboptimal" : "low"
  return { interactionScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface CortisolCycleResult { interactionScore: number; score: number; status: string; date: string }

export async function computeCortisolCycleInteraction(userId: string, date: Date = new Date()): Promise<CortisolCycleResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const interactionScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t37 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t37 >= 75 ? "optimal" : _t37 >= 50 ? "adequate" : _t37 >= 25 ? "suboptimal" : "low"
  return { interactionScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface InsulinSensCycleResult { sensitivityVariation: number; score: number; worstPhase: string; date: string }

export async function computeInsulinSensitivityCycle(userId: string, date: Date = new Date()): Promise<InsulinSensCycleResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const sensitivityVariation = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t38 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const worstPhase = _t38 >= 75 ? "optimal" : _t38 >= 50 ? "adequate" : _t38 >= 25 ? "suboptimal" : "low"
  return { sensitivityVariation, score, worstPhase, date: date.toISOString().slice(0, 10) }
}

export interface PMDDRiskResult { riskScore: number; score: number; risk: string; date: string }

export async function assessPMDDRisk(userId: string, date: Date = new Date()): Promise<PMDDRiskResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t39 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t39 >= 75 ? "low" : _t39 >= 50 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface AmenorrheaRiskResult { riskScore: number; score: number; risk: string; energyDeficit: boolean; date: string }

export async function assessAmenorrheaRisk(userId: string, date: Date = new Date()): Promise<AmenorrheaRiskResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t40 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t40 >= 75 ? "low" : _t40 >= 50 ? "moderate" : "high"
  const energyDeficit = avgHRV > 30 && avgSpO2 > 95 && avgDeep > 50
  return { riskScore, score, risk, energyDeficit, date: date.toISOString().slice(0, 10) }
}

export interface DysmenorrheaResult { severityScore: number; score: number; severity: string; date: string }

export async function computeDysmenorrheaSeverity(userId: string, date: Date = new Date()): Promise<DysmenorrheaResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const severityScore = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t41 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const severity = _t41 >= 75 ? "low" : _t41 >= 50 ? "moderate" : "high"
  return { severityScore, score, severity, date: date.toISOString().slice(0, 10) }
}

export interface MenorrhagiaResult { riskScore: number; score: number; risk: string; date: string }

export async function assessMenorrhagiaRisk(userId: string, date: Date = new Date()): Promise<MenorrhagiaResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t42 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t42 >= 75 ? "low" : _t42 >= 50 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface OligomenorrheaResult { avgCycleDays: number; detected: boolean; score: number; date: string }

export async function computeOligomenorrheaDetection(userId: string, date: Date = new Date()): Promise<OligomenorrheaResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const avgCycleDays = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const detected = avgHRV > 30 && avgSpO2 > 95 && avgDeep > 50
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  return { avgCycleDays, detected, score, date: date.toISOString().slice(0, 10) }
}

export interface PolycysticOvaryResult { rotterdamScore: number; score: number; criteria: number; date: string }

export async function computePolycysticOvaryScoring(userId: string, date: Date = new Date()): Promise<PolycysticOvaryResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const rotterdamScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const criteria = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  return { rotterdamScore, score, criteria, date: date.toISOString().slice(0, 10) }
}

export interface HirsutismResult { riskScore: number; score: number; level: string; date: string }

export async function computeHirsutismProxy(userId: string, date: Date = new Date()): Promise<HirsutismResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t45 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const level = _t45 >= 75 ? "low" : _t45 >= 50 ? "moderate" : "high"
  return { riskScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface AcneHormonalResult { hormonalComponent: number; score: number; pattern: string; date: string }

export async function computeAcneHormonalPattern(userId: string, date: Date = new Date()): Promise<AcneHormonalResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const hormonalComponent = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t46 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const pattern = _t46 >= 60 ? "favorable" : "unfavorable"
  return { hormonalComponent, score, pattern, date: date.toISOString().slice(0, 10) }
}

export interface HairLossHormonalResult { riskScore: number; score: number; risk: string; date: string }

export async function computeHairLossHormonal(userId: string, date: Date = new Date()): Promise<HairLossHormonalResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const riskScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t47 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t47 >= 75 ? "low" : _t47 >= 50 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface PerimenopausalResult { transitionStage: string; symptomScore: number; score: number; date: string }

export async function computePerimenopausalTransition(userId: string, date: Date = new Date()): Promise<PerimenopausalResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const _t48 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const transitionStage = _t48 >= 75 ? "optimal" : _t48 >= 50 ? "adequate" : _t48 >= 25 ? "suboptimal" : "low"
  const symptomScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  return { transitionStage, symptomScore, score, date: date.toISOString().slice(0, 10) }
}

export interface HRTOptResult { benefitScore: number; score: number; recommendation: string; date: string }

export async function computeHRTOptimizationProxy(userId: string, date: Date = new Date()): Promise<HRTOptResult> {
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
  const avgRHR = mean(rhrVals)
  const avgHRV = mean(hrvVals)
  const avgSpO2 = mean(spo2Vals)
  const avgTemp = mean(tempVals)
  const avgRR = mean(rrVals)
  const avgStress = mean(stressVals)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgSteps = mean(stepsVals)
  const avgWeight = mean(weightVals)
  const rhrStd = stddev(rhrVals)
  const tempStd = stddev(tempVals)

  const benefitScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t49 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const recommendation = _t49 >= 60 ? "favorable" : "unfavorable"
  return { benefitScore, score, recommendation, date: date.toISOString().slice(0, 10) }
}
