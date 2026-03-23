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

export interface SleepEfficiencyResult { score: number; efficiency: number; rating: string; date: string }

export async function computeSleepEfficiency(userId: string, date: Date = new Date()): Promise<SleepEfficiencyResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const score = clamp(Math.round((avgDeep / 90) * 40 + (avgRem / 110) * 30 + (avgHRV / 60) * 30), 0, 100)
  const efficiency = Math.round((avgDeep / 60) * 100) / 100
  const _s3 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s3 >= 75 ? "good" : _s3 >= 45 ? "moderate" : "poor"
  return { score, efficiency, rating, date: date.toISOString().slice(0, 10) }
}

export interface SleepArchitectureResult { deepPct: number; remPct: number; lightPct: number; score: number; rating: string; date: string }

export async function analyzeSleepArchitecture(userId: string, date: Date = new Date()): Promise<SleepArchitectureResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const deepPct = total > 0 ? Math.round((avgRem / total) * 100) : 0
  const remPct = total > 0 ? Math.round((avgRem / total) * 100) : 0
  const lightPct = total > 0 ? Math.round((avgRem / total) * 100) : 0
  const score = clamp(Math.round(100 - (sleepStd / (avgSleep || 1)) * 200), 0, 100)
  const _s10 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s10 >= 75 ? "good" : _s10 >= 45 ? "moderate" : "poor"
  return { deepPct, remPct, lightPct, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface SleepLatencyResult { estimatedMinutes: number; score: number; rating: string; date: string }

export async function computeSleepLatency(userId: string, date: Date = new Date()): Promise<SleepLatencyResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const estimatedMinutes = Math.round(avgSleep > 0 ? avgSleep * 0.76 : 30)
  const score = clamp(Math.round((avgSpO2 - 88) * 8 + avgHRV * 0.3), 0, 100)
  const _s17 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s17 >= 75 ? "good" : _s17 >= 45 ? "moderate" : "poor"
  return { estimatedMinutes, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface SleepFragmentationResult { wasoMinutes: number; fragmentationIndex: number; score: number; date: string }

export async function assessSleepFragmentation(userId: string, date: Date = new Date()): Promise<SleepFragmentationResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const wasoMinutes = Math.round(avgSleep > 0 ? avgSleep * 0.84 : 30)
  const fragmentationIndex = Math.round((100 - avgRHR + avgHRV * 0.5) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 50 + (avgDeep / 100) * 30 + (avgHRV / 50) * 20), 0, 100)
  return { wasoMinutes, fragmentationIndex, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepRegularityResult { sri: number; score: number; rating: string; date: string }

export async function computeSleepRegularity(userId: string, date: Date = new Date()): Promise<SleepRegularityResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const sri = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const score = clamp(Math.round(80 - avgStress * 0.8 + avgHRV * 0.3 + (avgDeep / 90) * 20), 0, 100)
  const _s31 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s31 >= 75 ? "good" : _s31 >= 45 ? "moderate" : "poor"
  return { sri, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface ChronotypeAdvancedResult { chronotype: string; confidence: number; score: number; date: string }

export async function analyzeChronotypeAdvanced(userId: string, date: Date = new Date()): Promise<ChronotypeAdvancedResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const chronotype = avgRHR < 55 ? "lion" : avgRHR < 65 ? "bear" : avgHRV > 50 ? "dolphin" : "wolf"
  const confidence = Math.round((avgDeep / 65) * 100) / 100
  const score = clamp(Math.round((total / (avgSleep || 480)) * 60 + (avgHRV / 50) * 20 + (100 - avgRHR) * 0.2), 0, 100)
  return { chronotype, confidence, score, date: date.toISOString().slice(0, 10) }
}

export interface SocialJetLagResult { jetLagMinutes: number; score: number; severity: string; date: string }

export async function computeSocialJetLagDetailed(userId: string, date: Date = new Date()): Promise<SocialJetLagResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const jetLagMinutes = Math.round(avgSleep > 0 ? avgSleep * 0.68 : 30)
  const score = clamp(Math.round((avgDeep / 90) * 40 + (avgRem / 110) * 30 + (avgHRV / 60) * 30), 0, 100)
  const _s45 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const severity = _s45 >= 75 ? "good" : _s45 >= 45 ? "moderate" : "poor"
  return { jetLagMinutes, score, severity, date: date.toISOString().slice(0, 10) }
}

export interface InsomniaSeverityResult { isiScore: number; severity: string; score: number; date: string }

export async function assessInsomniaSeverity(userId: string, date: Date = new Date()): Promise<InsomniaSeverityResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const isiScore = Math.round((avgSleep / 60 + avgDeep / 30) * 10) / 10
  const _s52 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const severity = _s52 >= 75 ? "good" : _s52 >= 45 ? "moderate" : "poor"
  const score = clamp(Math.round(100 - (sleepStd / (avgSleep || 1)) * 200), 0, 100)
  return { isiScore, severity, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepPressureResult { pressureLevel: number; score: number; hoursAwake: number; date: string }

export async function computeSleepPressure(userId: string, date: Date = new Date()): Promise<SleepPressureResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const pressureLevel = Math.round((100 - avgRHR + avgHRV * 0.5) * 10) / 10
  const score = clamp(Math.round((avgSpO2 - 88) * 8 + avgHRV * 0.3), 0, 100)
  const hoursAwake = Math.round((avgSleep / 60) * 10) / 10
  return { pressureLevel, score, hoursAwake, date: date.toISOString().slice(0, 10) }
}

export interface SleepCyclesResult { cycleCount: number; avgCycleLengthMin: number; score: number; date: string }

export async function analyzeSleepCycles(userId: string, date: Date = new Date()): Promise<SleepCyclesResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const cycleCount = Math.max(0, Math.round(avgSleep / 94))
  const avgCycleLengthMin = Math.round(avgSleep > 0 ? avgSleep * 0.92 : 30)
  const score = clamp(Math.round((avgSleep / 480) * 50 + (avgDeep / 100) * 30 + (avgHRV / 50) * 20), 0, 100)
  return { cycleCount, avgCycleLengthMin, score, date: date.toISOString().slice(0, 10) }
}

export interface DeepSleepQualityResult { deepMinutes: number; deepPct: number; score: number; rating: string; date: string }

export async function computeDeepSleepQuality(userId: string, date: Date = new Date()): Promise<DeepSleepQualityResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const deepMinutes = Math.round(avgSleep > 0 ? avgSleep * 0.60 : 30)
  const deepPct = total > 0 ? Math.round((avgRem / total) * 100) : 0
  const score = clamp(Math.round(80 - avgStress * 0.8 + avgHRV * 0.3 + (avgDeep / 90) * 20), 0, 100)
  const _s73 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s73 >= 75 ? "good" : _s73 >= 45 ? "moderate" : "poor"
  return { deepMinutes, deepPct, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface REMAdequacyResult { remMinutes: number; remPct: number; score: number; rating: string; date: string }

export async function assessREMSleepAdequacy(userId: string, date: Date = new Date()): Promise<REMAdequacyResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const remMinutes = Math.round(avgSleep > 0 ? avgSleep * 0.68 : 30)
  const remPct = total > 0 ? Math.round((avgLight / total) * 100) : 0
  const score = clamp(Math.round((total / (avgSleep || 480)) * 60 + (avgHRV / 50) * 20 + (100 - avgRHR) * 0.2), 0, 100)
  const _s80 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s80 >= 75 ? "good" : _s80 >= 45 ? "moderate" : "poor"
  return { remMinutes, remPct, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface NocturnalAwakeningsResult { estimatedAwakenings: number; score: number; severity: string; date: string }

export async function analyzeNocturnalAwakenings(userId: string, date: Date = new Date()): Promise<NocturnalAwakeningsResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const estimatedAwakenings = Math.round((avgSleep / 60 + avgDeep / 30) * 10) / 10
  const score = clamp(Math.round((avgDeep / 90) * 40 + (avgRem / 110) * 30 + (avgHRV / 60) * 30), 0, 100)
  const _s87 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const severity = _s87 >= 75 ? "good" : _s87 >= 45 ? "moderate" : "poor"
  return { estimatedAwakenings, score, severity, date: date.toISOString().slice(0, 10) }
}

export interface SleepDebtResult { debtHours: number; dailyDeficit: number; score: number; severity: string; date: string }

export async function computeSleepDebtAccumulation(userId: string, date: Date = new Date()): Promise<SleepDebtResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const debtHours = Math.round((avgSleep / 60) * 10) / 10
  const dailyDeficit = Math.round((100 - avgRHR + avgHRV * 0.5) * 10) / 10
  const score = clamp(Math.round(100 - (sleepStd / (avgSleep || 1)) * 200), 0, 100)
  const _s94 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const severity = _s94 >= 75 ? "good" : _s94 >= 45 ? "moderate" : "poor"
  return { debtHours, dailyDeficit, score, severity, date: date.toISOString().slice(0, 10) }
}

export interface SleepApneaRiskResult { riskScore: number; avgNocturnalSpO2: number; score: number; risk: string; date: string }

export async function assessSleepApneaRisk(userId: string, date: Date = new Date()): Promise<SleepApneaRiskResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const riskScore = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const avgNocturnalSpO2 = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const score = clamp(Math.round((avgSpO2 - 88) * 8 + avgHRV * 0.3), 0, 100)
  const _s101 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const risk = _s101 >= 75 ? "good" : _s101 >= 45 ? "moderate" : "poor"
  return { riskScore, avgNocturnalSpO2, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface CircadianAlignmentResult { alignmentScore: number; score: number; status: string; date: string }

export async function computeCircadianAlignment(userId: string, date: Date = new Date()): Promise<CircadianAlignmentResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const alignmentScore = Math.round((avgDeep / 75) * 100) / 100
  const score = clamp(Math.round((avgSleep / 480) * 50 + (avgDeep / 100) * 30 + (avgHRV / 50) * 20), 0, 100)
  const _s108 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const status = _s108 >= 75 ? "good" : _s108 >= 45 ? "moderate" : "poor"
  return { alignmentScore, score, status, date: date.toISOString().slice(0, 10) }
}

export interface SleepQualityIndexResult { psqiProxy: number; score: number; rating: string; date: string }

export async function computeSleepQualityIndex(userId: string, date: Date = new Date()): Promise<SleepQualityIndexResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const psqiProxy = Math.round(avgHRV * 0.9) / 10
  const score = clamp(Math.round(80 - avgStress * 0.8 + avgHRV * 0.3 + (avgDeep / 90) * 20), 0, 100)
  const _s115 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s115 >= 75 ? "good" : _s115 >= 45 ? "moderate" : "poor"
  return { psqiProxy, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface SleepRecoveryRateResult { recoveryRate: number; score: number; trend: string; date: string }

export async function computeSleepRecoveryRate(userId: string, date: Date = new Date()): Promise<SleepRecoveryRateResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const recoveryRate = Math.round((avgSleep / 60 + avgDeep / 30) * 10) / 10
  const score = clamp(Math.round((total / (avgSleep || 480)) * 60 + (avgHRV / 50) * 20 + (100 - avgRHR) * 0.2), 0, 100)
  const _firstHalf = mean(sleepVals.slice(0, Math.floor(sleepVals.length / 2)))
  const _secondHalf = mean(sleepVals.slice(Math.floor(sleepVals.length / 2)))
  const trend = _secondHalf > _firstHalf * 1.05 ? "improving" : _secondHalf < _firstHalf * 0.95 ? "declining" : "stable"
  return { recoveryRate, score, trend, date: date.toISOString().slice(0, 10) }
}

export interface SWSTrendResult { avgDeepMin: number; trend: string; score: number; date: string }

export async function analyzeSlowWaveSleepTrend(userId: string, date: Date = new Date()): Promise<SWSTrendResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const avgDeepMin = Math.round(avgSleep > 0 ? avgSleep * 0.84 : 30)
  const _firstHalf = mean(sleepVals.slice(0, Math.floor(sleepVals.length / 2)))
  const _secondHalf = mean(sleepVals.slice(Math.floor(sleepVals.length / 2)))
  const trend = _secondHalf > _firstHalf * 1.05 ? "improving" : _secondHalf < _firstHalf * 0.95 ? "declining" : "stable"
  const score = clamp(Math.round((avgDeep / 90) * 40 + (avgRem / 110) * 30 + (avgHRV / 60) * 30), 0, 100)
  return { avgDeepMin, trend, score, date: date.toISOString().slice(0, 10) }
}

export interface REMLatencyResult { estimatedMinutes: number; score: number; normalRange: boolean; date: string }

export async function computeREMLatency(userId: string, date: Date = new Date()): Promise<REMLatencyResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const estimatedMinutes = Math.round(avgSleep > 0 ? avgSleep * 0.92 : 30)
  const score = clamp(Math.round(100 - (sleepStd / (avgSleep || 1)) * 200), 0, 100)
  const normalRange = avgDeep > 60 && avgHRV > 25
  return { estimatedMinutes, score, normalRange, date: date.toISOString().slice(0, 10) }
}

export interface SleepTransitionsResult { transitionQuality: number; score: number; date: string }

export async function computeSleepStageTransitions(userId: string, date: Date = new Date()): Promise<SleepTransitionsResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const transitionQuality = Math.round((avgDeep / 80) * 100) / 100
  const score = clamp(Math.round((avgSpO2 - 88) * 8 + avgHRV * 0.3), 0, 100)
  return { transitionQuality, score, date: date.toISOString().slice(0, 10) }
}

export interface NocturnalHRVResult { avgNightHRV: number; dayNightRatio: number; score: number; date: string }

export async function computeNocturnalHRVariability(userId: string, date: Date = new Date()): Promise<NocturnalHRVResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const avgNightHRV = Math.round(avgHRV * 0.4) / 10
  const dayNightRatio = Math.round(clamp(avgHRV > 0 ? avgDeep / avgHRV : 0.5, -1, 1) * 100) / 100
  const score = clamp(Math.round((avgSleep / 480) * 50 + (avgDeep / 100) * 30 + (avgHRV / 50) * 20), 0, 100)
  return { avgNightHRV, dayNightRatio, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepInertiaResult { inertiaScore: number; estimatedDurationMin: number; score: number; date: string }

export async function computeSleepInertia(userId: string, date: Date = new Date()): Promise<SleepInertiaResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const inertiaScore = Math.round((avgSleep / 60 + avgDeep / 30) * 10) / 10
  const estimatedDurationMin = Math.round(avgSleep > 0 ? avgSleep * 0.76 : 30)
  const score = clamp(Math.round(80 - avgStress * 0.8 + avgHRV * 0.3 + (avgDeep / 90) * 20), 0, 100)
  return { inertiaScore, estimatedDurationMin, score, date: date.toISOString().slice(0, 10) }
}

export interface GlymphaticResult { clearanceScore: number; score: number; rating: string; date: string }

export async function computeGlymphaticClearance(userId: string, date: Date = new Date()): Promise<GlymphaticResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const clearanceScore = Math.round((100 - avgRHR + avgHRV * 0.5) * 10) / 10
  const score = clamp(Math.round((total / (avgSleep || 480)) * 60 + (avgHRV / 50) * 20 + (100 - avgRHR) * 0.2), 0, 100)
  const _s164 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s164 >= 75 ? "good" : _s164 >= 45 ? "moderate" : "poor"
  return { clearanceScore, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface SleepTempResult { tempDropDegC: number; regulationScore: number; score: number; date: string }

export async function computeSleepTempRegulation(userId: string, date: Date = new Date()): Promise<SleepTempResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const tempDropDegC = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const regulationScore = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const score = clamp(Math.round((avgDeep / 90) * 40 + (avgRem / 110) * 30 + (avgHRV / 60) * 30), 0, 100)
  return { tempDropDegC, regulationScore, score, date: date.toISOString().slice(0, 10) }
}

export interface UltradianResult { periodMinutes: number; regularity: number; score: number; date: string }

export async function analyzeUltradianRhythm(userId: string, date: Date = new Date()): Promise<UltradianResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const periodMinutes = Math.round(avgSleep > 0 ? avgSleep * 0.60 : 30)
  const regularity = Math.round((avgDeep / 85) * 100) / 100
  const score = clamp(Math.round(100 - (sleepStd / (avgSleep || 1)) * 200), 0, 100)
  return { periodMinutes, regularity, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepConsistencyResult { consistencyScore: number; durationCV: number; score: number; rating: string; date: string }

export async function computeSleepConsistencyScore(userId: string, date: Date = new Date()): Promise<SleepConsistencyResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const consistencyScore = Math.round(avgHRV * 0.9) / 10
  const durationCV = Math.round(avgSleep > 0 ? avgSleep * 0.68 : 30)
  const score = clamp(Math.round((avgSpO2 - 88) * 8 + avgHRV * 0.3), 0, 100)
  const _s185 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s185 >= 75 ? "good" : _s185 >= 45 ? "moderate" : "poor"
  return { consistencyScore, durationCV, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface SleepRestorationResult { restorationScore: number; hrvRecovery: number; score: number; rating: string; date: string }

export async function computeSleepRestorationIndex(userId: string, date: Date = new Date()): Promise<SleepRestorationResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const restorationScore = Math.round(clamp(avgHRV > 0 ? avgDeep / avgHRV : 0.5, -1, 1) * 100) / 100
  const hrvRecovery = Math.round((avgSleep / 60 + avgDeep / 30) * 10) / 10
  const score = clamp(Math.round((avgSleep / 480) * 50 + (avgDeep / 100) * 30 + (avgHRV / 50) * 20), 0, 100)
  const _s192 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s192 >= 75 ? "good" : _s192 >= 45 ? "moderate" : "poor"
  return { restorationScore, hrvRecovery, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface WASOResult { wasoMinutes: number; wasoPercent: number; score: number; date: string }

export async function computeWakeAfterSleepOnset(userId: string, date: Date = new Date()): Promise<WASOResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const wasoMinutes = Math.round(avgSleep > 0 ? avgSleep * 0.84 : 30)
  const wasoPercent = total > 0 ? Math.round((avgRem / total) * 100) : 0
  const score = clamp(Math.round(80 - avgStress * 0.8 + avgHRV * 0.3 + (avgDeep / 90) * 20), 0, 100)
  return { wasoMinutes, wasoPercent, score, date: date.toISOString().slice(0, 10) }
}

export interface NocturnalDesatResult { avgSpO2: number; minSpO2: number; desatEvents: number; score: number; date: string }

export async function computeNocturnalOxygenDesat(userId: string, date: Date = new Date()): Promise<NocturnalDesatResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  let avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  avgSpO2 = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const minSpO2 = Math.round(avgSleep > 0 ? avgSleep * 0.92 : 30)
  const desatEvents = Math.max(0, Math.round(avgSleep / 94))
  const score = clamp(Math.round((total / (avgSleep || 480)) * 60 + (avgHRV / 50) * 20 + (100 - avgRHR) * 0.2), 0, 100)
  return { avgSpO2, minSpO2, desatEvents, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepMacroResult { firstHalfDeepPct: number; secondHalfRemPct: number; score: number; date: string }

export async function analyzeSleepMacrostructure(userId: string, date: Date = new Date()): Promise<SleepMacroResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const firstHalfDeepPct = total > 0 ? Math.round((avgDeep / total) * 100) : 0
  const secondHalfRemPct = total > 0 ? Math.round((avgDeep / total) * 100) : 0
  const score = clamp(Math.round((avgDeep / 90) * 40 + (avgRem / 110) * 30 + (avgHRV / 60) * 30), 0, 100)
  return { firstHalfDeepPct, secondHalfRemPct, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepMaintInsomniaResult { fragmentationScore: number; score: number; risk: string; date: string }

export async function computeSleepMaintenanceInsomnia(userId: string, date: Date = new Date()): Promise<SleepMaintInsomniaResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const fragmentationScore = Math.round(avgHRV * 0.4) / 10
  const score = clamp(Math.round(100 - (sleepStd / (avgSleep || 1)) * 200), 0, 100)
  const _s220 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const risk = _s220 >= 75 ? "good" : _s220 >= 45 ? "moderate" : "poor"
  return { fragmentationScore, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface SleepOnsetInsomniaResult { onsetDelayMin: number; score: number; risk: string; date: string }

export async function computeSleepOnsetInsomnia(userId: string, date: Date = new Date()): Promise<SleepOnsetInsomniaResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const onsetDelayMin = Math.round(avgSleep > 0 ? avgSleep * 0.76 : 30)
  const score = clamp(Math.round((avgSpO2 - 88) * 8 + avgHRV * 0.3), 0, 100)
  const _s227 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const risk = _s227 >= 75 ? "good" : _s227 >= 45 ? "moderate" : "poor"
  return { onsetDelayMin, score, risk, date: date.toISOString().slice(0, 10) }
}

export interface CircadianPhaseShiftResult { shiftMinutes: number; direction: string; score: number; date: string }

export async function computeCircadianPhaseShift(userId: string, date: Date = new Date()): Promise<CircadianPhaseShiftResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const shiftMinutes = Math.round(avgSleep > 0 ? avgSleep * 0.84 : 30)
  const direction = avgSleep > 440 ? "advance" : "delay"
  const score = clamp(Math.round((avgSleep / 480) * 50 + (avgDeep / 100) * 30 + (avgHRV / 50) * 20), 0, 100)
  return { shiftMinutes, direction, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepHomeostasisResult { processS: number; processC: number; score: number; date: string }

export async function computeSleepHomeostasis(userId: string, date: Date = new Date()): Promise<SleepHomeostasisResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const processS = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const processC = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const score = clamp(Math.round(80 - avgStress * 0.8 + avgHRV * 0.3 + (avgDeep / 90) * 20), 0, 100)
  return { processS, processC, score, date: date.toISOString().slice(0, 10) }
}

export interface OptimalSleepDurationResult { optimalHours: number; currentAvgHours: number; score: number; date: string }

export async function computeOptimalSleepDuration(userId: string, date: Date = new Date()): Promise<OptimalSleepDurationResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const optimalHours = Math.round((avgSleep / 60) * 10) / 10
  const currentAvgHours = Math.round((avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((total / (avgSleep || 480)) * 60 + (avgHRV / 50) * 20 + (100 - avgRHR) * 0.2), 0, 100)
  return { optimalHours, currentAvgHours, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepImmunityResult { immuneImpactScore: number; score: number; rating: string; date: string }

export async function computeSleepImmunityLink(userId: string, date: Date = new Date()): Promise<SleepImmunityResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const immuneImpactScore = Math.round(avgHRV * 0.9) / 10
  const score = clamp(Math.round((avgDeep / 90) * 40 + (avgRem / 110) * 30 + (avgHRV / 60) * 30), 0, 100)
  const _s255 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s255 >= 75 ? "good" : _s255 >= 45 ? "moderate" : "poor"
  return { immuneImpactScore, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface SleepCVRecoveryResult { hrDropPct: number; hrvIncreasePct: number; score: number; date: string }

export async function computeSleepCVRecovery(userId: string, date: Date = new Date()): Promise<SleepCVRecoveryResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const hrDropPct = total > 0 ? Math.round((avgRem / total) * 100) : 0
  const hrvIncreasePct = total > 0 ? Math.round((avgRem / total) * 100) : 0
  const score = clamp(Math.round(100 - (sleepStd / (avgSleep || 1)) * 200), 0, 100)
  return { hrDropPct, hrvIncreasePct, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepRespResult { avgNightRR: number; rrVariability: number; score: number; date: string }

export async function analyzeSleepRespiratoryPattern(userId: string, date: Date = new Date()): Promise<SleepRespResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const avgNightRR = Math.round((100 - avgRHR + avgHRV * 0.5) * 10) / 10
  const rrVariability = Math.round((100 - avgRHR + avgHRV * 0.5) * 10) / 10
  const score = clamp(Math.round((avgSpO2 - 88) * 8 + avgHRV * 0.3), 0, 100)
  return { avgNightRR, rrVariability, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepMovementResult { movementScore: number; score: number; rating: string; date: string }

export async function computeSleepMovementIndex(userId: string, date: Date = new Date()): Promise<SleepMovementResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const movementScore = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const score = clamp(Math.round((avgSleep / 480) * 50 + (avgDeep / 100) * 30 + (avgHRV / 50) * 20), 0, 100)
  const _s276 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const rating = _s276 >= 75 ? "good" : _s276 >= 45 ? "moderate" : "poor"
  return { movementScore, score, rating, date: date.toISOString().slice(0, 10) }
}

export interface SleepPhaseAdvanceResult { riskScore: number; score: number; detected: boolean; date: string }

export async function computeSleepPhaseAdvance(userId: string, date: Date = new Date()): Promise<SleepPhaseAdvanceResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const riskScore = Math.round((avgDeep / 60) * 100) / 100
  const score = clamp(Math.round(80 - avgStress * 0.8 + avgHRV * 0.3 + (avgDeep / 90) * 20), 0, 100)
  const detected = avgDeep > 60 && avgHRV > 25
  return { riskScore, score, detected, date: date.toISOString().slice(0, 10) }
}

export interface SleepPhaseDelayResult { riskScore: number; score: number; detected: boolean; date: string }

export async function computeSleepPhaseDelay(userId: string, date: Date = new Date()): Promise<SleepPhaseDelayResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const riskScore = Math.round(avgHRV * 0.4) / 10
  const score = clamp(Math.round((total / (avgSleep || 480)) * 60 + (avgHRV / 50) * 20 + (100 - avgRHR) * 0.2), 0, 100)
  const detected = avgDeep > 60 && avgHRV > 25
  return { riskScore, score, detected, date: date.toISOString().slice(0, 10) }
}

export interface SleepWeekendResult { weekdayAvgHours: number; weekendAvgHours: number; catchUpHours: number; score: number; date: string }

export async function analyzeSleepWeekendEffect(userId: string, date: Date = new Date()): Promise<SleepWeekendResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const weekdayAvgHours = Math.round((avgSleep / 60) * 10) / 10
  const weekendAvgHours = Math.round((avgSleep / 60) * 10) / 10
  const catchUpHours = Math.round((avgSleep / 60) * 10) / 10
  const score = clamp(Math.round((avgDeep / 90) * 40 + (avgRem / 110) * 30 + (avgHRV / 60) * 30), 0, 100)
  return { weekdayAvgHours, weekendAvgHours, catchUpHours, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepSeasonalResult { variationIndex: number; score: number; date: string }

export async function computeSleepSeasonalVariation(userId: string, date: Date = new Date()): Promise<SleepSeasonalResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const variationIndex = Math.round((100 - avgRHR + avgHRV * 0.5) * 10) / 10
  const score = clamp(Math.round(100 - (sleepStd / (avgSleep || 1)) * 200), 0, 100)
  return { variationIndex, score, date: date.toISOString().slice(0, 10) }
}

export interface NapOptResult { optimalNapDuration: number; napBenefit: number; score: number; date: string }

export async function computeNapOptimization(userId: string, date: Date = new Date()): Promise<NapOptResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const optimalNapDuration = Math.round(avgSleep > 0 ? avgSleep * 0.92 : 30)
  const napBenefit = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const score = clamp(Math.round((avgSpO2 - 88) * 8 + avgHRV * 0.3), 0, 100)
  return { optimalNapDuration, napBenefit, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepMoodCorrResult { correlation: number; strength: string; score: number; date: string }

export async function computeSleepMoodCorrelation(userId: string, date: Date = new Date()): Promise<SleepMoodCorrResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const correlation = Math.round(clamp(avgHRV > 0 ? avgDeep / avgHRV : 0.5, -1, 1) * 100) / 100
  const _corr = Math.abs(avgDeep - avgHRV) / (avgHRV || 1)
  const strength = _corr < 0.3 ? "strong" : _corr < 0.7 ? "moderate" : "weak"
  const score = clamp(Math.round((avgSleep / 480) * 50 + (avgDeep / 100) * 30 + (avgHRV / 50) * 20), 0, 100)
  return { correlation, strength, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepCognitiveResult { cognitiveScore: number; memoryConsolidation: number; score: number; date: string }

export async function computeSleepCognitiveImpact(userId: string, date: Date = new Date()): Promise<SleepCognitiveResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const cognitiveScore = Math.round(avgHRV * 0.9) / 10
  const memoryConsolidation = Math.round(avgHRV * 0.9) / 10
  const score = clamp(Math.round(80 - avgStress * 0.8 + avgHRV * 0.3 + (avgDeep / 90) * 20), 0, 100)
  return { cognitiveScore, memoryConsolidation, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepMetabolicResult { metabolicImpactScore: number; score: number; date: string }

export async function computeSleepMetabolicImpact(userId: string, date: Date = new Date()): Promise<SleepMetabolicResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const metabolicImpactScore = Math.round((avgSleep / 60 + avgDeep / 30) * 10) / 10
  const score = clamp(Math.round((total / (avgSleep || 480)) * 60 + (avgHRV / 50) * 20 + (100 - avgRHR) * 0.2), 0, 100)
  return { metabolicImpactScore, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepHormonalResult { ghReleaseProxy: number; cortisolSuppression: number; score: number; date: string }

export async function computeSleepHormonalProxy(userId: string, date: Date = new Date()): Promise<SleepHormonalResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const ghReleaseProxy = Math.round((100 - avgRHR + avgHRV * 0.5) * 10) / 10
  const cortisolSuppression = Math.round((100 - avgRHR + avgHRV * 0.5) * 10) / 10
  const score = clamp(Math.round((avgDeep / 90) * 40 + (avgRem / 110) * 30 + (avgHRV / 60) * 30), 0, 100)
  return { ghReleaseProxy, cortisolSuppression, score, date: date.toISOString().slice(0, 10) }
}

export interface SleepAnxietyResult { anxietyImpactScore: number; score: number; severity: string; date: string }

export async function computeSleepAnxietyLink(userId: string, date: Date = new Date()): Promise<SleepAnxietyResult> {
  const db = getDb()
  const since = new Date(date.getTime() - 30 * 86_400_000)
  const until = date
  const sleepRows = await fetchMetric(db, userId, "sleep_duration", since, until)
  const deepRows = await fetchMetric(db, userId, "deep_sleep", since, until)
  const remRows = await fetchMetric(db, userId, "rem_sleep", since, until)
  const lightRows = await fetchMetric(db, userId, "light_sleep", since, until)
  const hrvRows = await fetchMetric(db, userId, "hrv", since, until)
  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", since, until)
  const spo2Rows = await fetchMetric(db, userId, "blood_oxygen", since, until)
  const rrRows = await fetchMetric(db, userId, "respiratory_rate", since, until)
  const tempRows = await fetchMetric(db, userId, "body_temperature", since, until)
  const stressRows = await fetchMetric(db, userId, "stress", since, until)
  const sleepVals = sleepRows.map((r: any) => r.value)
  const deepVals = deepRows.map((r: any) => r.value)
  const remVals = remRows.map((r: any) => r.value)
  const lightVals = lightRows.map((r: any) => r.value)
  const hrvVals = hrvRows.map((r: any) => r.value)
  const rhrVals = rhrRows.map((r: any) => r.value)
  const spo2Vals = spo2Rows.map((r: any) => r.value)
  const rrVals = rrRows.map((r: any) => r.value)
  const tempVals = tempRows.map((r: any) => r.value)
  const stressVals = stressRows.map((r: any) => r.value)
  const avgSleep = mean(sleepVals)
  const avgDeep = mean(deepVals)
  const avgRem = mean(remVals)
  const avgLight = mean(lightVals)
  const avgHRV = mean(hrvVals)
  const avgRHR = mean(rhrVals)
  const avgSpO2 = mean(spo2Vals)
  const avgRR = mean(rrVals)
  const avgTemp = mean(tempVals)
  const avgStress = mean(stressVals)
  const sleepStd = stddev(sleepVals)
  const total = avgDeep + avgRem + avgLight
  const anxietyImpactScore = Math.round(avgSpO2 > 0 ? avgSpO2 - 90 + avgDeep / 20 : 5)
  const score = clamp(Math.round(100 - (sleepStd / (avgSleep || 1)) * 200), 0, 100)
  const _s346 = clamp(Math.round((avgDeep / 90) * 40 + (avgHRV / 50) * 30 + (avgSpO2 - 90) * 3), 0, 100)
  const severity = _s346 >= 75 ? "good" : _s346 >= 45 ? "moderate" : "poor"
  return { anxietyImpactScore, score, severity, date: date.toISOString().slice(0, 10) }
}
