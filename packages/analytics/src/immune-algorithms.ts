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

export interface ImmuneReadinessResult { score: number; readinessLevel: string; sleepFactor: number; stressFactor: number; activityFactor: number; date: string }

export async function computeImmuneReadiness(userId: string, date: Date = new Date()): Promise<ImmuneReadinessResult> {
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

  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t0 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const readinessLevel = _t0 >= 75 ? "low" : _t0 >= 50 ? "moderate" : "high"
  const sleepFactor = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const stressFactor = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const activityFactor = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  return { score, readinessLevel, sleepFactor, stressFactor, activityFactor, date: date.toISOString().slice(0, 10) }
}

export interface InfectionRiskResult { riskScore: number; score: number; risk: string; rhrElevation: boolean; date: string }

export async function assessInfectionRisk(userId: string, date: Date = new Date()): Promise<InfectionRiskResult> {
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

  const riskScore = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t1 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t1 >= 75 ? "low" : _t1 >= 50 ? "moderate" : "high"
  const rhrElevation = avgHRV > 30 && avgSpO2 > 95 && avgDeep > 50
  return { riskScore, score, risk, rhrElevation, date: date.toISOString().slice(0, 10) }
}

export interface InflammationLevelResult { inflammationIndex: number; score: number; level: string; date: string }

export async function computeInflammationLevel(userId: string, date: Date = new Date()): Promise<InflammationLevelResult> {
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

  const inflammationIndex = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t2 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const level = _t2 >= 75 ? "low" : _t2 >= 50 ? "moderate" : "high"
  return { inflammationIndex, score, level, date: date.toISOString().slice(0, 10) }
}

export interface ImmuneRecoveryResult { recoveryRate: number; score: number; daysToRecover: number; status: string; date: string }

export async function analyzeImmuneRecovery(userId: string, date: Date = new Date()): Promise<ImmuneRecoveryResult> {
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

  const recoveryRate = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const daysToRecover = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const _t3 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t3 >= 75 ? "optimal" : _t3 >= 50 ? "adequate" : _t3 >= 25 ? "suboptimal" : "low"
  return { recoveryRate, score, daysToRecover, status, date: date.toISOString().slice(0, 10) }
}

export interface VaccineResponseResult { responseScore: number; score: number; predicted: string; date: string }

export async function computeVaccineResponseProxy(userId: string, date: Date = new Date()): Promise<VaccineResponseResult> {
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

  const responseScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t4 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const predicted = _t4 >= 60 ? "favorable" : "unfavorable"
  return { responseScore, score, predicted, date: date.toISOString().slice(0, 10) }
}

export interface AutoimmunityRiskResult { riskScore: number; score: number; risk: string; markers: number; date: string }

export async function assessAutoimmunityRisk(userId: string, date: Date = new Date()): Promise<AutoimmunityRiskResult> {
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
  const _t5 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t5 >= 75 ? "low" : _t5 >= 50 ? "moderate" : "high"
  const markers = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  return { riskScore, score, risk, markers, date: date.toISOString().slice(0, 10) }
}

export interface ImmunosenescenceResult { immuneAge: number; score: number; agingRate: string; date: string }

export async function computeImmunosenescence(userId: string, date: Date = new Date()): Promise<ImmunosenescenceResult> {
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

  const immuneAge = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t6 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const agingRate = _t6 >= 60 ? "normal" : "abnormal"
  return { immuneAge, score, agingRate, date: date.toISOString().slice(0, 10) }
}

export interface AllergySeverityResult { severityScore: number; score: number; level: string; date: string }

export async function analyzeAllergySeverityProxy(userId: string, date: Date = new Date()): Promise<AllergySeverityResult> {
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

  const severityScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t7 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const level = _t7 >= 75 ? "low" : _t7 >= 50 ? "moderate" : "high"
  return { severityScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface CytokineStormResult { riskScore: number; score: number; risk: string; date: string }

export async function computeCytokineStormRisk(userId: string, date: Date = new Date()): Promise<CytokineStormResult> {
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
  const _t8 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t8 >= 75 ? "low" : _t8 >= 50 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface SepsisRiskResult { riskScore: number; score: number; risk: string; sofa: number; date: string }

export async function assessSepsisRisk(userId: string, date: Date = new Date()): Promise<SepsisRiskResult> {
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
  const sofa = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  return { riskScore, score, risk, sofa, date: date.toISOString().slice(0, 10) }
}

export interface WBCProxyResult { estimatedWBC: number; score: number; status: string; date: string }

export async function computeWhiteBloodCellProxy(userId: string, date: Date = new Date()): Promise<WBCProxyResult> {
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

  const estimatedWBC = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t10 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t10 >= 75 ? "optimal" : _t10 >= 50 ? "adequate" : _t10 >= 25 ? "suboptimal" : "low"
  return { estimatedWBC, score, status, date: date.toISOString().slice(0, 10) }
}

export interface ImmuneCircadianResult { rhythmScore: number; score: number; alignment: string; date: string }

export async function analyzeImmuneCircadianRhythm(userId: string, date: Date = new Date()): Promise<ImmuneCircadianResult> {
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

  const rhythmScore = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t11 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const alignment = _t11 >= 60 ? "favorable" : "unfavorable"
  return { rhythmScore, score, alignment, date: date.toISOString().slice(0, 10) }
}

export interface GutImmuneLinkResult { gutImmuneScore: number; score: number; rating: string; date: string }

export async function computeGutImmuneLink(userId: string, date: Date = new Date()): Promise<GutImmuneLinkResult> {
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

  const gutImmuneScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t12 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const rating = _t12 >= 70 ? "good" : _t12 >= 40 ? "fair" : "poor"
  return { gutImmuneScore, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface LymphaticFunctionResult { functionScore: number; score: number; status: string; date: string }

export async function assessLymphaticFunction(userId: string, date: Date = new Date()): Promise<LymphaticFunctionResult> {
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

  const functionScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t13 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t13 >= 75 ? "optimal" : _t13 >= 50 ? "adequate" : _t13 >= 25 ? "suboptimal" : "low"
  return { functionScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface MucosalImmunityResult { mucosalScore: number; score: number; level: string; date: string }

export async function computeMucosalImmunityProxy(userId: string, date: Date = new Date()): Promise<MucosalImmunityResult> {
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

  const mucosalScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t14 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const level = _t14 >= 75 ? "low" : _t14 >= 50 ? "moderate" : "high"
  return { mucosalScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface ComplementResult { activityScore: number; score: number; status: string; date: string }

export async function computeComplementSystemProxy(userId: string, date: Date = new Date()): Promise<ComplementResult> {
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

  const activityScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t15 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t15 >= 75 ? "optimal" : _t15 >= 50 ? "adequate" : _t15 >= 25 ? "suboptimal" : "low"
  return { activityScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface PhagocyteResult { phagocyticIndex: number; score: number; status: string; date: string }

export async function computePhagocyteFunctionProxy(userId: string, date: Date = new Date()): Promise<PhagocyteResult> {
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

  const phagocyticIndex = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t16 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t16 >= 75 ? "optimal" : _t16 >= 50 ? "adequate" : _t16 >= 25 ? "suboptimal" : "low"
  return { phagocyticIndex, score, status, date: date.toISOString().slice(0, 10) }
}

export interface NKCellResult { activityScore: number; score: number; level: string; date: string }

export async function computeNKCellActivityProxy(userId: string, date: Date = new Date()): Promise<NKCellResult> {
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

  const activityScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t17 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const level = _t17 >= 75 ? "low" : _t17 >= 50 ? "moderate" : "high"
  return { activityScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface TCellExhaustionResult { exhaustionIndex: number; score: number; risk: string; date: string }

export async function computeTCellExhaustionProxy(userId: string, date: Date = new Date()): Promise<TCellExhaustionResult> {
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

  const exhaustionIndex = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t18 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t18 >= 75 ? "low" : _t18 >= 50 ? "moderate" : "high"
  return { exhaustionIndex, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface ImmunoglobulinResult { igIndex: number; score: number; status: string; date: string }

export async function computeImmunoglobulinProxy(userId: string, date: Date = new Date()): Promise<ImmunoglobulinResult> {
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

  const igIndex = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t19 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t19 >= 75 ? "optimal" : _t19 >= 50 ? "adequate" : _t19 >= 25 ? "suboptimal" : "low"
  return { igIndex, score, status, date: date.toISOString().slice(0, 10) }
}

export interface ThymusFunctionResult { functionScore: number; score: number; ageRelatedDecline: number; date: string }

export async function computeThymusFunctionProxy(userId: string, date: Date = new Date()): Promise<ThymusFunctionResult> {
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

  const functionScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const ageRelatedDecline = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  return { functionScore, score, ageRelatedDecline, date: date.toISOString().slice(0, 10) }
}

export interface InnateImmunityResult { innateScore: number; score: number; rating: string; date: string }

export async function computeInnateImmunityScore(userId: string, date: Date = new Date()): Promise<InnateImmunityResult> {
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

  const innateScore = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t21 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const rating = _t21 >= 70 ? "good" : _t21 >= 40 ? "fair" : "poor"
  return { innateScore, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface AdaptiveImmunityResult { adaptiveScore: number; score: number; rating: string; date: string }

export async function computeAdaptiveImmunityScore(userId: string, date: Date = new Date()): Promise<AdaptiveImmunityResult> {
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

  const adaptiveScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t22 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const rating = _t22 >= 70 ? "good" : _t22 >= 40 ? "fair" : "poor"
  return { adaptiveScore, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface ImmuneToleranceResult { toleranceIndex: number; score: number; status: string; date: string }

export async function computeImmuneToleranceProxy(userId: string, date: Date = new Date()): Promise<ImmuneToleranceResult> {
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

  const toleranceIndex = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t23 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t23 >= 75 ? "optimal" : _t23 >= 50 ? "adequate" : _t23 >= 25 ? "suboptimal" : "low"
  return { toleranceIndex, score, status, date: date.toISOString().slice(0, 10) }
}

export interface ImmuneSurveillanceResult { surveillanceScore: number; score: number; effectiveness: string; date: string }

export async function computeImmuneSurveillanceProxy(userId: string, date: Date = new Date()): Promise<ImmuneSurveillanceResult> {
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

  const surveillanceScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t24 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const effectiveness = _t24 >= 70 ? "good" : _t24 >= 40 ? "fair" : "poor"
  return { surveillanceScore, score, effectiveness, date: date.toISOString().slice(0, 10) }
}

export interface CancerImmuneEscapeResult { riskScore: number; score: number; risk: string; date: string }

export async function computeCancerImmuneEscapeRisk(userId: string, date: Date = new Date()): Promise<CancerImmuneEscapeResult> {
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
  const _t25 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t25 >= 75 ? "low" : _t25 >= 50 ? "moderate" : "high"
  return { riskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface ChronicInflammationResult { chronicIndex: number; score: number; severity: string; date: string }

export async function computeChronicInflammationIndex(userId: string, date: Date = new Date()): Promise<ChronicInflammationResult> {
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

  const chronicIndex = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t26 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const severity = _t26 >= 75 ? "low" : _t26 >= 50 ? "moderate" : "high"
  return { chronicIndex, score, severity, date: date.toISOString().slice(0, 10) }
}

export interface WoundHealingResult { healingScore: number; score: number; capacity: string; date: string }

export async function computeWoundHealingCapacity(userId: string, date: Date = new Date()): Promise<WoundHealingResult> {
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

  const healingScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t27 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const capacity = _t27 >= 70 ? "good" : _t27 >= 40 ? "fair" : "poor"
  return { healingScore, score, capacity, date: date.toISOString().slice(0, 10) }
}

export interface FeverResponseResult { responseAdequacy: number; score: number; status: string; date: string }

export async function analyzeFeverResponse(userId: string, date: Date = new Date()): Promise<FeverResponseResult> {
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

  const responseAdequacy = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t28 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t28 >= 75 ? "optimal" : _t28 >= 50 ? "adequate" : _t28 >= 25 ? "suboptimal" : "low"
  return { responseAdequacy, score, status, date: date.toISOString().slice(0, 10) }
}

export interface ImmuneMemoryResult { memoryScore: number; score: number; status: string; date: string }

export async function computeImmuneMemoryProxy(userId: string, date: Date = new Date()): Promise<ImmuneMemoryResult> {
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

  const memoryScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t29 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t29 >= 75 ? "optimal" : _t29 >= 50 ? "adequate" : _t29 >= 25 ? "suboptimal" : "low"
  return { memoryScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface PostInfectionRecoveryResult { recoveryPct: number; score: number; phase: string; date: string }

export async function computePostInfectionRecovery(userId: string, date: Date = new Date()): Promise<PostInfectionRecoveryResult> {
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

  const recoveryPct = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t30 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const phase = _t30 >= 75 ? "optimal" : _t30 >= 50 ? "adequate" : _t30 >= 25 ? "suboptimal" : "low"
  return { recoveryPct, score, phase, date: date.toISOString().slice(0, 10) }
}

export interface VaccinationTimingResult { optimalScore: number; score: number; recommendation: string; date: string }

export async function computeVaccinationTimingProxy(userId: string, date: Date = new Date()): Promise<VaccinationTimingResult> {
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

  const optimalScore = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t31 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const recommendation = _t31 >= 60 ? "favorable" : "unfavorable"
  return { optimalScore, score, recommendation, date: date.toISOString().slice(0, 10) }
}

export interface ImmuneAgeResult { immuneAge: number; chronologicalDiff: number; score: number; date: string }

export async function computeImmuneAgeEstimation(userId: string, date: Date = new Date()): Promise<ImmuneAgeResult> {
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

  const immuneAge = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const chronologicalDiff = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  return { immuneAge, chronologicalDiff, score, date: date.toISOString().slice(0, 10) }
}

export interface AutoimmuneFlareResult { flareRisk: number; score: number; risk: string; date: string }

export async function assessAutoimmuneFlarePrediction(userId: string, date: Date = new Date()): Promise<AutoimmuneFlareResult> {
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

  const flareRisk = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t33 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t33 >= 75 ? "low" : _t33 >= 50 ? "moderate" : "high"
  return { flareRisk, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface HistamineResult { responseLevel: number; score: number; status: string; date: string }

export async function computeHistamineResponseProxy(userId: string, date: Date = new Date()): Promise<HistamineResult> {
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

  const responseLevel = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t34 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t34 >= 75 ? "optimal" : _t34 >= 50 ? "adequate" : _t34 >= 25 ? "suboptimal" : "low"
  return { responseLevel, score, status, date: date.toISOString().slice(0, 10) }
}

export interface MastCellResult { activationScore: number; score: number; risk: string; date: string }

export async function computeMastCellActivationProxy(userId: string, date: Date = new Date()): Promise<MastCellResult> {
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

  const activationScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t35 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t35 >= 75 ? "low" : _t35 >= 50 ? "moderate" : "high"
  return { activationScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface IBDProxyResult { ibdRiskScore: number; score: number; risk: string; date: string }

export async function computeInflammatoryBowelProxy(userId: string, date: Date = new Date()): Promise<IBDProxyResult> {
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

  const ibdRiskScore = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t36 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const risk = _t36 >= 75 ? "low" : _t36 >= 50 ? "moderate" : "high"
  return { ibdRiskScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface ImmuneCellCyclingResult { cyclingRate: number; score: number; status: string; date: string }

export async function computeImmuneCellCycling(userId: string, date: Date = new Date()): Promise<ImmuneCellCyclingResult> {
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

  const cyclingRate = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t37 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t37 >= 75 ? "optimal" : _t37 >= 50 ? "adequate" : _t37 >= 25 ? "suboptimal" : "low"
  return { cyclingRate, score, status, date: date.toISOString().slice(0, 10) }
}

export interface NeutrophilResult { functionScore: number; score: number; status: string; date: string }

export async function computeNeutrophilFunctionProxy(userId: string, date: Date = new Date()): Promise<NeutrophilResult> {
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

  const functionScore = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t38 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t38 >= 75 ? "optimal" : _t38 >= 50 ? "adequate" : _t38 >= 25 ? "suboptimal" : "low"
  return { functionScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface EosinophilResult { activityLevel: number; score: number; status: string; date: string }

export async function computeEosinophilActivityProxy(userId: string, date: Date = new Date()): Promise<EosinophilResult> {
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

  const activityLevel = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t39 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t39 >= 75 ? "optimal" : _t39 >= 50 ? "adequate" : _t39 >= 25 ? "suboptimal" : "low"
  return { activityLevel, score, status, date: date.toISOString().slice(0, 10) }
}

export interface BasophilResult { responseScore: number; score: number; status: string; date: string }

export async function computeBasophilResponseProxy(userId: string, date: Date = new Date()): Promise<BasophilResult> {
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

  const responseScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t40 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t40 >= 75 ? "optimal" : _t40 >= 50 ? "adequate" : _t40 >= 25 ? "suboptimal" : "low"
  return { responseScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface MonocyteResult { functionScore: number; score: number; status: string; date: string }

export async function computeMonocyteFunctionProxy(userId: string, date: Date = new Date()): Promise<MonocyteResult> {
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

  const functionScore = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t41 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t41 >= 75 ? "optimal" : _t41 >= 50 ? "adequate" : _t41 >= 25 ? "suboptimal" : "low"
  return { functionScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface DendriticCellResult { maturationScore: number; score: number; status: string; date: string }

export async function computeDendriticCellProxy(userId: string, date: Date = new Date()): Promise<DendriticCellResult> {
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

  const maturationScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t42 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t42 >= 75 ? "optimal" : _t42 >= 50 ? "adequate" : _t42 >= 25 ? "suboptimal" : "low"
  return { maturationScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface CytokineBalanceResult { balanceIndex: number; score: number; status: string; date: string }

export async function computeCytokineBalanceProxy(userId: string, date: Date = new Date()): Promise<CytokineBalanceResult> {
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

  const balanceIndex = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t43 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t43 >= 75 ? "optimal" : _t43 >= 50 ? "adequate" : _t43 >= 25 ? "suboptimal" : "low"
  return { balanceIndex, score, status, date: date.toISOString().slice(0, 10) }
}

export interface InterferonResult { responseScore: number; score: number; level: string; date: string }

export async function computeInterferonResponseProxy(userId: string, date: Date = new Date()): Promise<InterferonResult> {
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

  const responseScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t44 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const level = _t44 >= 75 ? "low" : _t44 >= 50 ? "moderate" : "high"
  return { responseScore, score, level, date: date.toISOString().slice(0, 10) }
}

export interface InterleukinResult { balanceScore: number; score: number; status: string; date: string }

export async function computeInterleukinBalanceProxy(userId: string, date: Date = new Date()): Promise<InterleukinResult> {
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

  const balanceScore = Math.round((avgHRV * 0.3 + (100 - avgRHR) * 0.4 + avgDeep / 4) * 10) / 10
  const score = clamp(Math.round((avgHRV / 5 + (100 - avgRHR) * 0.5 + avgDeep / 3 + (avgSpO2 - 90) * 2) * (1 - cv(rhrVals) * 0.5)), 0, 100)
  const _t45 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t45 >= 75 ? "optimal" : _t45 >= 50 ? "adequate" : _t45 >= 25 ? "suboptimal" : "low"
  return { balanceScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface TNFResult { activityLevel: number; score: number; status: string; date: string }

export async function computeTNFActivityProxy(userId: string, date: Date = new Date()): Promise<TNFResult> {
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

  const activityLevel = Math.round(avgTemp > 36 ? (avgTemp - 36.5) * 20 + avgHRV * 0.2 : avgHRV * 0.5)
  const score = clamp(Math.round(70 - avgStress * 0.5 + avgHRV * 0.3 + avgDeep / 5 + (avgSpO2 - 92) * 3), 0, 100)
  const _t46 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t46 >= 75 ? "optimal" : _t46 >= 50 ? "adequate" : _t46 >= 25 ? "suboptimal" : "low"
  return { activityLevel, score, status, date: date.toISOString().slice(0, 10) }
}

export interface ComplementCascadeResult { cascadeScore: number; score: number; status: string; date: string }

export async function computeComplementCascadeProxy(userId: string, date: Date = new Date()): Promise<ComplementCascadeResult> {
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

  const cascadeScore = Math.round((avgSteps / 1000 + avgHRV / 10 + avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 30 + (avgHRV / 50) * 30 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2), 0, 100)
  const _t47 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const status = _t47 >= 75 ? "optimal" : _t47 >= 50 ? "adequate" : _t47 >= 25 ? "suboptimal" : "low"
  return { cascadeScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface AntibodyDiversityResult { diversityIndex: number; score: number; rating: string; date: string }

export async function computeAntibodyDiversityProxy(userId: string, date: Date = new Date()): Promise<AntibodyDiversityResult> {
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

  const diversityIndex = Math.round((avgSpO2 - 90) * 5 + avgHRV * 0.15 + avgDeep / 10)
  const score = clamp(Math.round(60 + avgHRV * 0.2 - avgStress * 0.3 + (avgSpO2 - 93) * 4 - rhrStd * 2), 0, 100)
  const _t48 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const rating = _t48 >= 70 ? "good" : _t48 >= 40 ? "fair" : "poor"
  return { diversityIndex, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface ImmuneExhaustionResult { exhaustionScore: number; score: number; severity: string; date: string }

export async function computeImmuneExhaustionIndex(userId: string, date: Date = new Date()): Promise<ImmuneExhaustionResult> {
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

  const exhaustionScore = Math.round(100 - avgStress * 0.5 - rhrStd * 2 + avgHRV * 0.1)
  const score = clamp(Math.round((avgSteps / 8000) * 20 + (avgHRV / 40) * 30 + (avgDeep / 80) * 20 + (100 - avgRHR) * 0.3), 0, 100)
  const _t49 = clamp(Math.round(avgHRV * 0.4 + (100 - avgRHR) * 0.3 + (avgSpO2 - 90) * 2 + avgDeep / 5), 0, 100)
  const severity = _t49 >= 75 ? "low" : _t49 >= 50 ? "moderate" : "high"
  return { exhaustionScore, score, severity, date: date.toISOString().slice(0, 10) }
}
