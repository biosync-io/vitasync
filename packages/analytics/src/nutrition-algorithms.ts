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

// ── 1. computeCalorieAdequacy ───────────────────────────────────────────────

export interface CalorieAdequacy {
  score: number
  grade: string
  estimatedExpenditure: number
  calorieBalance: number
  adequacyRatio: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeCalorieAdequacy(
  userId: string,
  date?: Date,
): Promise<CalorieAdequacy> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const caloriesData = byType.get("calories") ?? []
  const stepsData = byType.get("steps") ?? []
  const activeData = byType.get("active_minutes") ?? []
  const weightData = byType.get("weight") ?? []
  
  const avgCalories = mean(vals(recent(caloriesData, 7)))
  const avgSteps = mean(vals(recent(stepsData, 7)))
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgWeight = weightData.length > 0 ? recent(weightData, 1)[0]!.value : 70
  
  const bmr = avgWeight * 24
  const stepCals = avgSteps * 0.04
  const activeCals = avgActive * 5
  const estimatedExpenditure = Math.round(bmr + stepCals + activeCals)
  const balance = avgCalories - estimatedExpenditure
  const adequacyRatio = estimatedExpenditure > 0 ? avgCalories / estimatedExpenditure : 1
  const score = clamp(100 - Math.abs(adequacyRatio - 1) * 200, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    estimatedExpenditure,
    calorieBalance: Math.round(balance),
    adequacyRatio: Math.round(adequacyRatio * 100) / 100,
    trend: trendDirection(caloriesData),
    detail: `Avg intake ${Math.round(avgCalories)} kcal vs est. expenditure ${estimatedExpenditure} kcal (ratio ${adequacyRatio.toFixed(2)})`,
    date: targetDate.toISOString(),
  }
}

// ── 2. assessMacronutrientBalance ───────────────────────────────────────────

export interface MacronutrientBalance {
  score: number
  grade: string
  estimatedProteinPct: number
  estimatedCarbPct: number
  estimatedFatPct: number
  optimalDeviation: number
  detail: string
  date: string
}

export async function assessMacronutrientBalance(
  userId: string,
  date?: Date,
): Promise<MacronutrientBalance> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const caloriesData = byType.get("calories") ?? []
  const weightData = byType.get("weight") ?? []
  const activeData = byType.get("active_minutes") ?? []
  const bodyFatData = byType.get("body_fat") ?? []
  
  const avgCals = mean(vals(recent(caloriesData, 7)))
  const avgWeight = weightData.length > 0 ? mean(vals(recent(weightData, 3))) : 70
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgBodyFat = bodyFatData.length > 0 ? mean(vals(recent(bodyFatData, 3))) : 20
  
  const leanMass = avgWeight * (1 - avgBodyFat / 100)
  const proteinNeed = leanMass * (avgActive > 60 ? 2.2 : 1.6)
  const proteinCals = proteinNeed * 4
  const fatCals = avgCals * 0.28
  const carbCals = Math.max(0, avgCals - proteinCals - fatCals)
  const estProteinPct = avgCals > 0 ? (proteinCals / avgCals) * 100 : 30
  const estFatPct = avgCals > 0 ? (fatCals / avgCals) * 100 : 28
  const estCarbPct = avgCals > 0 ? (carbCals / avgCals) * 100 : 42
  
  const idealP = avgActive > 60 ? 30 : 25
  const idealF = 27
  const idealC = 100 - idealP - idealF
  const deviation = Math.abs(estProteinPct - idealP) + Math.abs(estFatPct - idealF) + Math.abs(estCarbPct - idealC)
  const score = clamp(100 - deviation * 1.5, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    estimatedProteinPct: Math.round(estProteinPct * 10) / 10,
    estimatedCarbPct: Math.round(estCarbPct * 10) / 10,
    estimatedFatPct: Math.round(estFatPct * 10) / 10,
    optimalDeviation: Math.round(deviation * 10) / 10,
    detail: `Macro split P${estProteinPct.toFixed(0)}/C${estCarbPct.toFixed(0)}/F${estFatPct.toFixed(0)} vs optimal P${idealP}/C${idealC}/F${idealF}`,
    date: targetDate.toISOString(),
  }
}

// ── 3. computeProteinAdequacy ───────────────────────────────────────────────

export interface ProteinAdequacy {
  score: number
  grade: string
  estimatedNeedGrams: number
  estimatedIntakeGrams: number
  adequacyRatio: number
  activityAdjusted: boolean
  detail: string
  date: string
}

export async function computeProteinAdequacy(
  userId: string,
  date?: Date,
): Promise<ProteinAdequacy> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const weightData = byType.get("weight") ?? []
  const bodyFatData = byType.get("body_fat") ?? []
  const activeData = byType.get("active_minutes") ?? []
  const vo2Data = byType.get("vo2max") ?? []
  const caloriesData = byType.get("calories") ?? []
  
  const avgWeight = weightData.length > 0 ? mean(vals(recent(weightData, 3))) : 70
  const avgBodyFat = bodyFatData.length > 0 ? mean(vals(recent(bodyFatData, 3))) : 20
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgVo2 = vo2Data.length > 0 ? mean(vals(recent(vo2Data, 3))) : 35
  const avgCals = mean(vals(recent(caloriesData, 7)))
  
  const leanMass = avgWeight * (1 - avgBodyFat / 100)
  const actMulti = avgActive > 90 ? 2.4 : avgActive > 60 ? 2.0 : avgActive > 30 ? 1.6 : 1.2
  const fitnessBonus = avgVo2 > 50 ? 0.2 : 0
  const estimatedNeed = leanMass * (actMulti + fitnessBonus)
  const estimatedIntake = avgCals > 0 ? (avgCals * 0.25) / 4 : 0
  const ratio = estimatedNeed > 0 ? estimatedIntake / estimatedNeed : 1
  const score = clamp(100 - Math.abs(ratio - 1) * 150, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    estimatedNeedGrams: Math.round(estimatedNeed),
    estimatedIntakeGrams: Math.round(estimatedIntake),
    adequacyRatio: Math.round(ratio * 100) / 100,
    activityAdjusted: avgActive > 30,
    detail: `Protein need ${Math.round(estimatedNeed)}g vs intake ${Math.round(estimatedIntake)}g (lean mass ${leanMass.toFixed(1)}kg)`,
    date: targetDate.toISOString(),
  }
}

// ── 4. analyzeCarbohydrateUtilization ───────────────────────────────────────

export interface CarbohydrateUtilization {
  score: number
  grade: string
  estimatedCarbGrams: number
  utilizationEfficiency: number
  activityCarbDemand: number
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeCarbohydrateUtilization(
  userId: string,
  date?: Date,
): Promise<CarbohydrateUtilization> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const caloriesData = byType.get("calories") ?? []
  const activeData = byType.get("active_minutes") ?? []
  const hrData = byType.get("heart_rate") ?? []
  const rrData = byType.get("respiratory_rate") ?? []
  
  const avgCals = mean(vals(recent(caloriesData, 7)))
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgHR = mean(vals(recent(hrData, 7)))
  const avgRR = rrData.length > 0 ? mean(vals(recent(rrData, 7))) : 15
  
  const carbGrams = (avgCals * 0.50) / 4
  const activityDemand = avgActive * 0.8 + avgHR * 0.1
  const rerProxy = avgRR > 0 ? clamp(avgRR / 18, 0.7, 1.0) : 0.85
  const efficiency = rerProxy > 0.85 ? linearScale(rerProxy, 0.85, 1.0, 80, 50) : linearScale(rerProxy, 0.7, 0.85, 60, 90)
  const demandMatch = activityDemand > 0 ? clamp(carbGrams / activityDemand, 0.5, 2.0) : 1.0
  const matchScore = 100 - Math.abs(demandMatch - 1.0) * 80
  const score = clamp(efficiency * 0.6 + matchScore * 0.4, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    estimatedCarbGrams: Math.round(carbGrams),
    utilizationEfficiency: Math.round(efficiency * 10) / 10,
    activityCarbDemand: Math.round(activityDemand),
    trend: trendDirection(caloriesData),
    detail: `Est. carb intake ${Math.round(carbGrams)}g, activity demand ${Math.round(activityDemand)}g, RER proxy ${rerProxy.toFixed(2)}`,
    date: targetDate.toISOString(),
  }
}

// ── 5. computeFatIntakeOptimality ───────────────────────────────────────────

export interface FatIntakeOptimality {
  score: number
  grade: string
  estimatedFatGrams: number
  fatCaloriePct: number
  bodyCompFactor: number
  cardiovascularFactor: number
  detail: string
  date: string
}

export async function computeFatIntakeOptimality(
  userId: string,
  date?: Date,
): Promise<FatIntakeOptimality> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const caloriesData = byType.get("calories") ?? []
  const weightData = byType.get("weight") ?? []
  const bodyFatData = byType.get("body_fat") ?? []
  const bpData = byType.get("blood_pressure") ?? []
  
  const avgCals = mean(vals(recent(caloriesData, 7)))
  const avgBodyFat = bodyFatData.length > 0 ? mean(vals(recent(bodyFatData, 3))) : 22
  const avgBP = bpData.length > 0 ? mean(vals(recent(bpData, 7))) : 120
  
  const fatGrams = (avgCals * 0.30) / 9
  const fatPct = avgCals > 0 ? (fatGrams * 9 / avgCals) * 100 : 30
  const idealPct = avgBodyFat > 25 ? 25 : 30
  const pctDev = Math.abs(fatPct - idealPct)
  const bodyCompFactor = linearScale(avgBodyFat, 10, 35, 90, 50)
  const cvFactor = linearScale(avgBP, 90, 160, 95, 40)
  const score = clamp(100 - pctDev * 3 + (bodyCompFactor - 70) * 0.2 + (cvFactor - 70) * 0.2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    estimatedFatGrams: Math.round(fatGrams),
    fatCaloriePct: Math.round(fatPct * 10) / 10,
    bodyCompFactor: Math.round(bodyCompFactor * 10) / 10,
    cardiovascularFactor: Math.round(cvFactor * 10) / 10,
    detail: `Est. fat ${Math.round(fatGrams)}g (${fatPct.toFixed(1)}% cal), ideal ${idealPct}%, BP factor ${cvFactor.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 6. assessFiberIntakeProxy ───────────────────────────────────────────────

export interface FiberIntakeProxy {
  score: number
  grade: string
  estimatedFiberGrams: number
  recommendedGrams: number
  adequacyRatio: number
  digestiveHealthProxy: number
  detail: string
  date: string
}

export async function assessFiberIntakeProxy(
  userId: string,
  date?: Date,
): Promise<FiberIntakeProxy> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const caloriesData = byType.get("calories") ?? []
  const weightData = byType.get("weight") ?? []
  const rrData = byType.get("respiratory_rate") ?? []
  const tempData = byType.get("body_temperature") ?? []
  
  const avgCals = mean(vals(recent(caloriesData, 7)))
  const avgWeight = weightData.length > 0 ? mean(vals(recent(weightData, 3))) : 70
  const avgTemp = tempData.length > 0 ? mean(vals(recent(tempData, 3))) : 36.6
  
  const estimatedFiber = (avgCals / 1000) * 14
  const recommended = avgWeight > 80 ? 35 : avgWeight > 60 ? 30 : 25
  const ratio = recommended > 0 ? estimatedFiber / recommended : 1
  const digestiveProxy = linearScale(avgTemp, 36.0, 37.5, 85, 55)
  const score = clamp(ratio * 70 + digestiveProxy * 0.3, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    estimatedFiberGrams: Math.round(estimatedFiber),
    recommendedGrams: recommended,
    adequacyRatio: Math.round(ratio * 100) / 100,
    digestiveHealthProxy: Math.round(digestiveProxy * 10) / 10,
    detail: `Est. fiber ${Math.round(estimatedFiber)}g vs recommended ${recommended}g (ratio ${ratio.toFixed(2)})`,
    date: targetDate.toISOString(),
  }
}

// ── 7. computeHydrationNeeds ────────────────────────────────────────────────

export interface HydrationNeeds {
  score: number
  grade: string
  recommendedLiters: number
  activityAdjustmentMl: number
  heatAdjustmentMl: number
  totalRecommendedMl: number
  detail: string
  date: string
}

export async function computeHydrationNeeds(
  userId: string,
  date?: Date,
): Promise<HydrationNeeds> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const weightData = byType.get("weight") ?? []
  const activeData = byType.get("active_minutes") ?? []
  const tempData = byType.get("body_temperature") ?? []
  const stepsData = byType.get("steps") ?? []
  
  const avgWeight = weightData.length > 0 ? mean(vals(recent(weightData, 3))) : 70
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgTemp = tempData.length > 0 ? mean(vals(recent(tempData, 3))) : 36.6
  const avgSteps = mean(vals(recent(stepsData, 7)))
  
  const baseMl = avgWeight * 35
  const activityAdj = avgActive * 10 + avgSteps * 0.005
  const heatAdj = avgTemp > 37.0 ? (avgTemp - 37.0) * 500 : 0
  const totalMl = Math.round(baseMl + activityAdj + heatAdj)
  const liters = totalMl / 1000
  const score = clamp(linearScale(liters, 1.5, 4.0, 40, 95), 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    recommendedLiters: Math.round(liters * 10) / 10,
    activityAdjustmentMl: Math.round(activityAdj),
    heatAdjustmentMl: Math.round(heatAdj),
    totalRecommendedMl: totalMl,
    detail: `Base ${Math.round(baseMl)}ml + activity ${Math.round(activityAdj)}ml + heat ${Math.round(heatAdj)}ml = ${totalMl}ml`,
    date: targetDate.toISOString(),
  }
}

// ── 8. analyzeElectrolyteBalance ────────────────────────────────────────────

export interface ElectrolyteBalance {
  score: number
  grade: string
  sodiumNeedMg: number
  potassiumNeedMg: number
  magnesiumNeedMg: number
  sweatLossProxy: number
  detail: string
  date: string
}

export async function analyzeElectrolyteBalance(
  userId: string,
  date?: Date,
): Promise<ElectrolyteBalance> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const activeData = byType.get("active_minutes") ?? []
  const hrData = byType.get("heart_rate") ?? []
  const tempData = byType.get("body_temperature") ?? []
  const bpData = byType.get("blood_pressure") ?? []
  
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgHR = mean(vals(recent(hrData, 7)))
  const avgTemp = tempData.length > 0 ? mean(vals(recent(tempData, 3))) : 36.6
  const avgBP = bpData.length > 0 ? mean(vals(recent(bpData, 7))) : 120
  
  const sweatProxy = avgActive * 0.015 + (avgTemp - 36.5) * 0.5 + avgHR * 0.002
  const sodiumNeed = Math.round(1500 + avgActive * 10 + sweatProxy * 200)
  const potassiumNeed = Math.round(3500 + avgActive * 5)
  const magnesiumNeed = Math.round(400 + avgActive * 2)
  
  const bpBalance = linearScale(avgBP, 90, 160, 90, 40)
  const actBalance = linearScale(avgActive, 0, 120, 50, 90)
  const score = clamp((bpBalance * 0.4 + actBalance * 0.3 + linearScale(sweatProxy, 0, 3, 60, 85) * 0.3), 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    sodiumNeedMg: sodiumNeed,
    potassiumNeedMg: potassiumNeed,
    magnesiumNeedMg: magnesiumNeed,
    sweatLossProxy: Math.round(sweatProxy * 100) / 100,
    detail: `Na ${sodiumNeed}mg, K ${potassiumNeed}mg, Mg ${magnesiumNeed}mg (sweat proxy ${sweatProxy.toFixed(2)})`,
    date: targetDate.toISOString(),
  }
}

// ── 9. computeMealTimingOptimality ──────────────────────────────────────────

export interface MealTimingOptimality {
  score: number
  grade: string
  calorieDistributionScore: number
  sleepProximityScore: number
  activityAlignmentScore: number
  detail: string
  date: string
}

export async function computeMealTimingOptimality(
  userId: string,
  date?: Date,
): Promise<MealTimingOptimality> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const caloriesData = byType.get("calories") ?? []
  const hrData = byType.get("heart_rate") ?? []
  const sleepData = byType.get("sleep_duration") ?? []
  const activeData = byType.get("active_minutes") ?? []
  
  const avgCals = mean(vals(recent(caloriesData, 7)))
  const avgSleep = sleepData.length > 0 ? mean(vals(recent(sleepData, 7))) : 7
  const avgActive = mean(vals(recent(activeData, 7)))
  const calCV = caloriesData.length >= 3 ? stddev(vals(caloriesData)) / (mean(vals(caloriesData)) || 1) : 0.3
  
  const distScore = linearScale(calCV, 0, 0.5, 95, 40)
  const sleepScore = linearScale(avgSleep, 5, 9, 50, 95)
  const actScore = linearScale(avgActive, 0, 90, 50, 90)
  const score = clamp(distScore * 0.4 + sleepScore * 0.3 + actScore * 0.3, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    calorieDistributionScore: Math.round(distScore * 10) / 10,
    sleepProximityScore: Math.round(sleepScore * 10) / 10,
    activityAlignmentScore: Math.round(actScore * 10) / 10,
    detail: `Calorie CV ${(calCV * 100).toFixed(1)}%, sleep ${avgSleep.toFixed(1)}h, active ${avgActive.toFixed(0)}min`,
    date: targetDate.toISOString(),
  }
}

// ── 10. assessIntermittentFastingImpact ─────────────────────────────────────

export interface IntermittentFastingImpact {
  score: number
  grade: string
  metabolicBenefit: number
  stressImpact: number
  sleepImpact: number
  weightImpact: number
  netBenefit: number
  detail: string
  date: string
}

export async function assessIntermittentFastingImpact(
  userId: string,
  date?: Date,
): Promise<IntermittentFastingImpact> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const weightData = byType.get("weight") ?? []
  const bodyFatData = byType.get("body_fat") ?? []
  const rhrData = byType.get("resting_heart_rate") ?? []
  const hrvData = byType.get("hrv") ?? []
  const stressData = byType.get("stress") ?? []
  
  const weightTrend = trendDirection(weightData)
  const rhrTrend = trendDirection(rhrData)
  const avgStress = stressData.length > 0 ? mean(vals(recent(stressData, 7))) : 50
  const avgHRV = hrvData.length > 0 ? mean(vals(recent(hrvData, 7))) : 40
  
  const metabolicBenefit = rhrTrend === "improving" ? 80 : rhrTrend === "declining" ? 40 : 60
  const stressImpact = linearScale(avgStress, 20, 80, 85, 30)
  const sleepImpact = linearScale(avgHRV, 20, 80, 40, 90)
  const weightImpact = weightTrend === "declining" ? 85 : weightTrend === "improving" ? 50 : 65
  const netBenefit = (metabolicBenefit + stressImpact + sleepImpact + weightImpact) / 4
  const score = clamp(netBenefit, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    metabolicBenefit: Math.round(metabolicBenefit * 10) / 10,
    stressImpact: Math.round(stressImpact * 10) / 10,
    sleepImpact: Math.round(sleepImpact * 10) / 10,
    weightImpact: Math.round(weightImpact * 10) / 10,
    netBenefit: Math.round(netBenefit * 10) / 10,
    detail: `Metabolic ${metabolicBenefit.toFixed(0)}, stress ${stressImpact.toFixed(0)}, sleep ${sleepImpact.toFixed(0)}, weight ${weightImpact.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 11. computePostWorkoutNutrition ─────────────────────────────────────────

export interface PostWorkoutNutrition {
  score: number
  grade: string
  proteinWindowGrams: number
  carbReplenishGrams: number
  hydrationMl: number
  recoveryUrgency: "high" | "moderate" | "low"
  detail: string
  date: string
}

export async function computePostWorkoutNutrition(
  userId: string,
  date?: Date,
): Promise<PostWorkoutNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const activeData = byType.get("active_minutes") ?? []
  const hrData = byType.get("heart_rate") ?? []
  const caloriesData = byType.get("calories") ?? []
  const vo2Data = byType.get("vo2max") ?? []
  const weightData = byType.get("weight") ?? []
  
  const avgActive = mean(vals(recent(activeData, 3)))
  const avgHR = mean(vals(recent(hrData, 7)))
  const avgCals = mean(vals(recent(caloriesData, 7)))
  const avgVo2 = vo2Data.length > 0 ? mean(vals(recent(vo2Data, 3))) : 35
  const avgWeight = weightData.length > 0 ? mean(vals(recent(weightData, 3))) : 70
  
  const intensity = clamp(avgHR / 180, 0.4, 1.0)
  const proteinGrams = Math.round(avgWeight * 0.3 * intensity)
  const carbGrams = Math.round(avgActive * 0.5 * intensity)
  const hydration = Math.round(avgActive * 7 * intensity)
  const urgency: "high" | "moderate" | "low" = intensity > 0.8 ? "high" : intensity > 0.6 ? "moderate" : "low"
  const score = clamp(linearScale(avgActive, 0, 120, 40, 95) * 0.5 + linearScale(avgVo2, 20, 60, 40, 90) * 0.5, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    proteinWindowGrams: proteinGrams,
    carbReplenishGrams: carbGrams,
    hydrationMl: hydration,
    recoveryUrgency: urgency,
    detail: `Post-workout: ${proteinGrams}g protein, ${carbGrams}g carbs, ${hydration}ml fluid (intensity ${(intensity * 100).toFixed(0)}%)`,
    date: targetDate.toISOString(),
  }
}

// ── 12. analyzePreWorkoutNutrition ──────────────────────────────────────────

export interface PreWorkoutNutrition {
  score: number
  grade: string
  carbLoadGrams: number
  proteinGrams: number
  hydrationMl: number
  timingHoursBefore: number
  detail: string
  date: string
}

export async function analyzePreWorkoutNutrition(
  userId: string,
  date?: Date,
): Promise<PreWorkoutNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const caloriesData = byType.get("calories") ?? []
  const activeData = byType.get("active_minutes") ?? []
  const hrData = byType.get("heart_rate") ?? []
  const stressData = byType.get("stress") ?? []
  const weightData = byType.get("weight") ?? []
  
  const avgCals = mean(vals(recent(caloriesData, 7)))
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgStress = stressData.length > 0 ? mean(vals(recent(stressData, 7))) : 50
  const avgWeight = weightData.length > 0 ? mean(vals(recent(weightData, 3))) : 70
  
  const intensityEst = avgActive > 60 ? 0.8 : avgActive > 30 ? 0.6 : 0.4
  const carbLoad = Math.round(avgWeight * 1.0 * intensityEst)
  const protein = Math.round(avgWeight * 0.2)
  const hydration = Math.round(avgWeight * 5 + avgActive * 3)
  const timingHours = avgStress > 60 ? 2.5 : 2.0
  const readiness = linearScale(avgStress, 20, 80, 90, 40)
  const score = clamp(readiness * 0.5 + linearScale(avgActive, 0, 90, 50, 90) * 0.5, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    carbLoadGrams: carbLoad,
    proteinGrams: protein,
    hydrationMl: hydration,
    timingHoursBefore: timingHours,
    detail: `Pre-workout: ${carbLoad}g carbs, ${protein}g protein, ${hydration}ml fluid, ${timingHours}h before`,
    date: targetDate.toISOString(),
  }
}

// ── 13. computeProteinTimingOptimization ────────────────────────────────────

export interface ProteinTimingOptimization {
  score: number
  grade: string
  recommendedDoses: number
  gramsPerDose: number
  totalDailyGrams: number
  mpsWindowHours: number
  detail: string
  date: string
}

export async function computeProteinTimingOptimization(
  userId: string,
  date?: Date,
): Promise<ProteinTimingOptimization> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const activeData = byType.get("active_minutes") ?? []
  const caloriesData = byType.get("calories") ?? []
  const weightData = byType.get("weight") ?? []
  const sleepData = byType.get("sleep_duration") ?? []
  
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgCals = mean(vals(recent(caloriesData, 7)))
  const avgWeight = weightData.length > 0 ? mean(vals(recent(weightData, 3))) : 70
  const avgSleep = sleepData.length > 0 ? mean(vals(recent(sleepData, 7))) : 7
  
  const totalProtein = Math.round(avgWeight * (avgActive > 60 ? 2.0 : 1.6))
  const doses = avgActive > 60 ? 5 : 4
  const perDose = Math.round(totalProtein / doses)
  const mpsWindow = avgSleep > 7 ? 3 : 4
  const distributionScore = linearScale(doses, 2, 6, 40, 95)
  const score = clamp(distributionScore * 0.6 + linearScale(totalProtein / avgWeight, 1.2, 2.2, 50, 95) * 0.4, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    recommendedDoses: doses,
    gramsPerDose: perDose,
    totalDailyGrams: totalProtein,
    mpsWindowHours: mpsWindow,
    detail: `${totalProtein}g daily protein in ${doses} doses of ${perDose}g, MPS window ${mpsWindow}h`,
    date: targetDate.toISOString(),
  }
}

// ── 14. assessGlycogenReplenishment ─────────────────────────────────────────

export interface GlycogenReplenishment {
  score: number
  grade: string
  depletionEstimate: number
  replenishmentCarbGrams: number
  replenishmentTimeHours: number
  urgency: "immediate" | "moderate" | "low"
  detail: string
  date: string
}

export async function assessGlycogenReplenishment(
  userId: string,
  date?: Date,
): Promise<GlycogenReplenishment> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const activeData = byType.get("active_minutes") ?? []
  const hrData = byType.get("heart_rate") ?? []
  const caloriesData = byType.get("calories") ?? []
  const stepsData = byType.get("steps") ?? []
  
  const avgActive = mean(vals(recent(activeData, 3)))
  const avgHR = mean(vals(recent(hrData, 7)))
  const avgCals = mean(vals(recent(caloriesData, 3)))
  const avgSteps = mean(vals(recent(stepsData, 3)))
  
  const intensityFactor = clamp(avgHR / 170, 0.3, 1.0)
  const depletion = clamp(avgActive * intensityFactor * 0.5 + avgSteps * 0.001, 0, 100)
  const carbsNeeded = Math.round(depletion * 5)
  const timeNeeded = Math.round((100 - depletion) * 0.3 * 10) / 10
  const urgency: "immediate" | "moderate" | "low" = depletion > 70 ? "immediate" : depletion > 40 ? "moderate" : "low"
  const score = clamp(100 - depletion, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    depletionEstimate: Math.round(depletion * 10) / 10,
    replenishmentCarbGrams: carbsNeeded,
    replenishmentTimeHours: timeNeeded,
    urgency,
    detail: `Glycogen depletion est. ${depletion.toFixed(0)}%, need ${carbsNeeded}g carbs over ${timeNeeded}h`,
    date: targetDate.toISOString(),
  }
}

// ── 15. computeCaffeineSensitivityProxy ─────────────────────────────────────

export interface CaffeineSensitivityProxy {
  score: number
  grade: string
  sensitivityLevel: "high" | "moderate" | "low"
  estimatedHalfLifeHours: number
  maxRecommendedMg: number
  lastCutoffHoursBefore: number
  detail: string
  date: string
}

export async function computeCaffeineSensitivityProxy(
  userId: string,
  date?: Date,
): Promise<CaffeineSensitivityProxy> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const rhrData = byType.get("resting_heart_rate") ?? []
  const hrvData = byType.get("hrv") ?? []
  const sleepData = byType.get("sleep_duration") ?? []
  const stressData = byType.get("stress") ?? []
  
  const avgRHR = rhrData.length > 0 ? mean(vals(recent(rhrData, 7))) : 65
  const avgHRV = hrvData.length > 0 ? mean(vals(recent(hrvData, 7))) : 40
  const avgSleep = sleepData.length > 0 ? mean(vals(recent(sleepData, 7))) : 7
  const avgStress = stressData.length > 0 ? mean(vals(recent(stressData, 7))) : 50
  
  const autonomicSensitivity = (avgRHR / 80) * 50 + (1 - avgHRV / 80) * 30 + (avgStress / 100) * 20
  const sensitivity: "high" | "moderate" | "low" = autonomicSensitivity > 60 ? "high" : autonomicSensitivity > 40 ? "moderate" : "low"
  const halfLife = sensitivity === "high" ? 7 : sensitivity === "moderate" ? 5 : 4
  const maxMg = sensitivity === "high" ? 200 : sensitivity === "moderate" ? 300 : 400
  const cutoff = sensitivity === "high" ? 10 : sensitivity === "moderate" ? 8 : 6
  const score = clamp(linearScale(autonomicSensitivity, 0, 100, 90, 30), 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    sensitivityLevel: sensitivity,
    estimatedHalfLifeHours: halfLife,
    maxRecommendedMg: maxMg,
    lastCutoffHoursBefore: cutoff,
    detail: `Caffeine sensitivity ${sensitivity}: max ${maxMg}mg, half-life ~${halfLife}h, cutoff ${cutoff}h before sleep`,
    date: targetDate.toISOString(),
  }
}

// ── 16. analyzeSugarImpactProxy ─────────────────────────────────────────────

export interface SugarImpactProxy {
  score: number
  grade: string
  glycemicImpact: number
  cardiovascularImpact: number
  weightImpact: number
  inflammationRisk: number
  detail: string
  date: string
}

export async function analyzeSugarImpactProxy(
  userId: string,
  date?: Date,
): Promise<SugarImpactProxy> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const hrData = byType.get("heart_rate") ?? []
  const bpData = byType.get("blood_pressure") ?? []
  const weightData = byType.get("weight") ?? []
  const bodyFatData = byType.get("body_fat") ?? []
  const stressData = byType.get("stress") ?? []
  
  const avgHR = mean(vals(recent(hrData, 7)))
  const avgBP = bpData.length > 0 ? mean(vals(recent(bpData, 7))) : 120
  const avgBodyFat = bodyFatData.length > 0 ? mean(vals(recent(bodyFatData, 3))) : 22
  const avgStress = stressData.length > 0 ? mean(vals(recent(stressData, 7))) : 50
  
  const hrVariability = hrData.length >= 5 ? stddev(vals(hrData)) : 10
  const glycemicImpact = linearScale(hrVariability, 5, 25, 30, 90)
  const cvImpact = linearScale(avgBP, 110, 150, 30, 85)
  const weightImpact = linearScale(avgBodyFat, 15, 35, 30, 80)
  const inflammationRisk = linearScale(avgStress, 20, 80, 25, 85)
  const score = clamp(100 - (glycemicImpact + cvImpact + weightImpact + inflammationRisk) / 4, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    glycemicImpact: Math.round(glycemicImpact * 10) / 10,
    cardiovascularImpact: Math.round(cvImpact * 10) / 10,
    weightImpact: Math.round(weightImpact * 10) / 10,
    inflammationRisk: Math.round(inflammationRisk * 10) / 10,
    detail: `Sugar impact — glycemic ${glycemicImpact.toFixed(0)}, CV ${cvImpact.toFixed(0)}, weight ${weightImpact.toFixed(0)}, inflammation ${inflammationRisk.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 17. computeOmega3Requirements ───────────────────────────────────────────

export interface Omega3Requirements {
  score: number
  grade: string
  recommendedDailyMg: number
  cardiacBenefit: number
  inflammationBenefit: number
  priority: "high" | "moderate" | "low"
  detail: string
  date: string
}

export async function computeOmega3Requirements(
  userId: string,
  date?: Date,
): Promise<Omega3Requirements> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const rhrData = byType.get("resting_heart_rate") ?? []
  const hrvData = byType.get("hrv") ?? []
  const bpData = byType.get("blood_pressure") ?? []
  const stressData = byType.get("stress") ?? []
  
  const avgRHR = rhrData.length > 0 ? mean(vals(recent(rhrData, 7))) : 65
  const avgHRV = hrvData.length > 0 ? mean(vals(recent(hrvData, 7))) : 40
  const avgBP = bpData.length > 0 ? mean(vals(recent(bpData, 7))) : 120
  const avgStress = stressData.length > 0 ? mean(vals(recent(stressData, 7))) : 50
  
  const cardiacNeed = linearScale(avgRHR, 55, 85, 30, 80) + linearScale(avgBP, 100, 150, 20, 70)
  const inflammationNeed = linearScale(avgStress, 20, 80, 20, 70) + linearScale(avgHRV, 60, 20, 20, 70)
  const totalNeed = (cardiacNeed + inflammationNeed) / 4
  const recommendedMg = Math.round(1000 + totalNeed * 20)
  const priority: "high" | "moderate" | "low" = totalNeed > 60 ? "high" : totalNeed > 40 ? "moderate" : "low"
  const score = clamp(100 - totalNeed, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    recommendedDailyMg: recommendedMg,
    cardiacBenefit: Math.round(cardiacNeed / 2 * 10) / 10,
    inflammationBenefit: Math.round(inflammationNeed / 2 * 10) / 10,
    priority,
    detail: `Omega-3 need ${recommendedMg}mg/day, priority ${priority} (cardiac ${(cardiacNeed/2).toFixed(0)}, inflammation ${(inflammationNeed/2).toFixed(0)})`,
    date: targetDate.toISOString(),
  }
}

// ── 18. assessVitaminDNeeds ─────────────────────────────────────────────────

export interface VitaminDNeeds {
  score: number
  grade: string
  recommendedIU: number
  outdoorActivityScore: number
  bodyCompFactor: number
  sleepInfluence: number
  detail: string
  date: string
}

export async function assessVitaminDNeeds(
  userId: string,
  date?: Date,
): Promise<VitaminDNeeds> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const activeData = byType.get("active_minutes") ?? []
  const stepsData = byType.get("steps") ?? []
  const bodyFatData = byType.get("body_fat") ?? []
  const weightData = byType.get("weight") ?? []
  const sleepData = byType.get("sleep_duration") ?? []
  
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgSteps = mean(vals(recent(stepsData, 7)))
  const avgBodyFat = bodyFatData.length > 0 ? mean(vals(recent(bodyFatData, 3))) : 22
  const avgSleep = sleepData.length > 0 ? mean(vals(recent(sleepData, 7))) : 7
  
  const outdoorProxy = linearScale(avgSteps, 2000, 12000, 20, 90)
  const bodyFatFactor = linearScale(avgBodyFat, 10, 35, 80, 40)
  const sleepFactor = linearScale(avgSleep, 5, 9, 50, 85)
  const baseIU = 1000
  const adjustedIU = Math.round(baseIU + (100 - outdoorProxy) * 10 + (100 - bodyFatFactor) * 8)
  const score = clamp((outdoorProxy + bodyFatFactor + sleepFactor) / 3, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    recommendedIU: adjustedIU,
    outdoorActivityScore: Math.round(outdoorProxy * 10) / 10,
    bodyCompFactor: Math.round(bodyFatFactor * 10) / 10,
    sleepInfluence: Math.round(sleepFactor * 10) / 10,
    detail: `Vitamin D need ${adjustedIU} IU/day — outdoor ${outdoorProxy.toFixed(0)}, body comp ${bodyFatFactor.toFixed(0)}, sleep ${sleepFactor.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 19. computeIronRequirements ─────────────────────────────────────────────

export interface IronRequirements {
  score: number
  grade: string
  estimatedNeedMg: number
  oxygenCarryingScore: number
  activityDemand: number
  fitnessLevel: number
  detail: string
  date: string
}

export async function computeIronRequirements(
  userId: string,
  date?: Date,
): Promise<IronRequirements> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const rhrData = byType.get("resting_heart_rate") ?? []
  const spo2Data = byType.get("blood_oxygen") ?? []
  const activeData = byType.get("active_minutes") ?? []
  const vo2Data = byType.get("vo2max") ?? []
  
  const avgRHR = rhrData.length > 0 ? mean(vals(recent(rhrData, 7))) : 65
  const avgSpO2 = spo2Data.length > 0 ? mean(vals(recent(spo2Data, 7))) : 97
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgVo2 = vo2Data.length > 0 ? mean(vals(recent(vo2Data, 3))) : 35
  
  const o2Score = linearScale(avgSpO2, 92, 100, 30, 95)
  const actDemand = linearScale(avgActive, 0, 120, 30, 90)
  const fitnessLevel = linearScale(avgVo2, 20, 60, 30, 90)
  const baseIron = 18
  const adjustedIron = Math.round(baseIron + (100 - o2Score) * 0.1 + avgActive * 0.05)
  const score = clamp((o2Score + actDemand + fitnessLevel) / 3, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    estimatedNeedMg: adjustedIron,
    oxygenCarryingScore: Math.round(o2Score * 10) / 10,
    activityDemand: Math.round(actDemand * 10) / 10,
    fitnessLevel: Math.round(fitnessLevel * 10) / 10,
    detail: `Iron need ${adjustedIron}mg/day — O2 score ${o2Score.toFixed(0)}, activity ${actDemand.toFixed(0)}, fitness ${fitnessLevel.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 20. analyzeCalciumAdequacy ──────────────────────────────────────────────

export interface CalciumAdequacy {
  score: number
  grade: string
  recommendedMg: number
  boneLoadScore: number
  activityFactor: number
  detail: string
  date: string
}

export async function analyzeCalciumAdequacy(
  userId: string,
  date?: Date,
): Promise<CalciumAdequacy> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const weightData = byType.get("weight") ?? []
  const bodyFatData = byType.get("body_fat") ?? []
  const activeData = byType.get("active_minutes") ?? []
  const stepsData = byType.get("steps") ?? []
  
  const avgWeight = weightData.length > 0 ? mean(vals(recent(weightData, 3))) : 70
  const avgBodyFat = bodyFatData.length > 0 ? mean(vals(recent(bodyFatData, 3))) : 22
  const avgActive = mean(vals(recent(activeData, 7)))
  const avgSteps = mean(vals(recent(stepsData, 7)))
  
  const boneLoad = linearScale(avgWeight * (1 - avgBodyFat / 100), 40, 80, 50, 90)
  const actFactor = linearScale(avgActive, 0, 90, 40, 90) * 0.5 + linearScale(avgSteps, 2000, 12000, 40, 85) * 0.5
  const baseCa = 1000
  const adjustedCa = Math.round(baseCa + (100 - boneLoad) * 3 + avgActive * 1)
  const score = clamp((boneLoad + actFactor) / 2, 0, 100)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    recommendedMg: adjustedCa,
    boneLoadScore: Math.round(boneLoad * 10) / 10,
    activityFactor: Math.round(actFactor * 10) / 10,
    detail: `Calcium need ${adjustedCa}mg/day — bone load ${boneLoad.toFixed(0)}, activity ${actFactor.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 21. computeMagnesiumStatus ──────────────────────────────────────────────

export interface MagnesiumStatus {
  score: number
  grade: string
  components: { hrv: number; stress: number; sleep_duration: number; resting_heart_rate: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeMagnesiumStatus(
  userId: string,
  date?: Date,
): Promise<MagnesiumStatus> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("resting_heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 65
  
  const s0 = linearScale(avg0, 40, 80, 90, 20)
  const s1 = linearScale(avg1, 50, 80, 20, 80)
  const s2 = linearScale(avg2, 7, 9, 50, 90)
  const s3 = linearScale(avg3, 65, 85, 95, 40)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      hrv: Math.round(s0 * 10) / 10,
      stress: Math.round(s1 * 10) / 10,
      sleep_duration: Math.round(s2 * 10) / 10,
      resting_heart_rate: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `Mg score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, resting_heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 22. assessZincNeeds ─────────────────────────────────────────────────────

export interface ZincNeeds {
  score: number
  grade: string
  components: { active_minutes: number; stress: number; sleep_duration: number; body_temperature: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessZincNeeds(
  userId: string,
  date?: Date,
): Promise<ZincNeeds> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("active_minutes") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("body_temperature") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 30
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 36.2
  
  const s0 = linearScale(avg0, 30, 120, 40, 95)
  const s1 = linearScale(avg1, 50, 80, 20, 80)
  const s2 = linearScale(avg2, 7, 9, 50, 90)
  const s3 = linearScale(avg3, 36.2, 37.5, 90, 50)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      active_minutes: Math.round(s0 * 10) / 10,
      stress: Math.round(s1 * 10) / 10,
      sleep_duration: Math.round(s2 * 10) / 10,
      body_temperature: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `Zn score ${score.toFixed(1)} — active_minutes ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, body_temperature ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 23. computeBVitaminAdequacy ─────────────────────────────────────────────

export interface BVitaminAdequacy {
  score: number
  grade: string
  components: { calories: number; active_minutes: number; stress: number; heart_rate: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeBVitaminAdequacy(
  userId: string,
  date?: Date,
): Promise<BVitaminAdequacy> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("calories") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("stress") ?? []
  const d3 = byType.get("heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 1800
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 50
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 70
  
  const s0 = linearScale(avg0, 1800, 3000, 40, 90)
  const s1 = linearScale(avg1, 30, 120, 40, 95)
  const s2 = linearScale(avg2, 50, 80, 20, 80)
  const s3 = linearScale(avg3, 70, 180, 90, 50)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      calories: Math.round(s0 * 10) / 10,
      active_minutes: Math.round(s1 * 10) / 10,
      stress: Math.round(s2 * 10) / 10,
      heart_rate: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `B-vit score ${score.toFixed(1)} — calories ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, stress ${s2.toFixed(0)}, heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 24. analyzeAntioxidantNeeds ─────────────────────────────────────────────

export interface AntioxidantNeeds {
  score: number
  grade: string
  components: { active_minutes: number; stress: number; heart_rate: number; vo2max: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeAntioxidantNeeds(
  userId: string,
  date?: Date,
): Promise<AntioxidantNeeds> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("active_minutes") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("heart_rate") ?? []
  const d3 = byType.get("vo2max") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 30
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 70
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 25
  
  const s0 = linearScale(avg0, 30, 120, 40, 95)
  const s1 = linearScale(avg1, 50, 80, 20, 80)
  const s2 = linearScale(avg2, 70, 180, 90, 50)
  const s3 = linearScale(avg3, 25, 60, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      active_minutes: Math.round(s0 * 10) / 10,
      stress: Math.round(s1 * 10) / 10,
      heart_rate: Math.round(s2 * 10) / 10,
      vo2max: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `AO score ${score.toFixed(1)} — active_minutes ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, heart_rate ${s2.toFixed(0)}, vo2max ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 25. computeAntiInflammatoryDietScore ────────────────────────────────────

export interface AntiInflammatoryDietScore {
  score: number
  grade: string
  components: { resting_heart_rate: number; hrv: number; stress: number; body_temperature: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeAntiInflammatoryDietScore(
  userId: string,
  date?: Date,
): Promise<AntiInflammatoryDietScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("stress") ?? []
  const d3 = byType.get("body_temperature") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 50
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 36.2
  
  const s0 = linearScale(avg0, 65, 85, 95, 40)
  const s1 = linearScale(avg1, 40, 80, 90, 20)
  const s2 = linearScale(avg2, 50, 80, 20, 80)
  const s3 = linearScale(avg3, 36.2, 37.5, 90, 50)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      resting_heart_rate: Math.round(s0 * 10) / 10,
      hrv: Math.round(s1 * 10) / 10,
      stress: Math.round(s2 * 10) / 10,
      body_temperature: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `AI-diet score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, stress ${s2.toFixed(0)}, body_temperature ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 26. assessGlycemicOptimization ──────────────────────────────────────────

export interface GlycemicOptimization {
  score: number
  grade: string
  components: { calories: number; weight: number; body_fat: number; active_minutes: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessGlycemicOptimization(
  userId: string,
  date?: Date,
): Promise<GlycemicOptimization> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("calories") ?? []
  const d1 = byType.get("weight") ?? []
  const d2 = byType.get("body_fat") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 1800
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 60
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 15
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 1800, 3000, 40, 90)
  const s1 = linearScale(avg1, 60, 100, 50, 85)
  const s2 = linearScale(avg2, 15, 35, 85, 40)
  const s3 = linearScale(avg3, 30, 120, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      calories: Math.round(s0 * 10) / 10,
      weight: Math.round(s1 * 10) / 10,
      body_fat: Math.round(s2 * 10) / 10,
      active_minutes: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `GI score ${score.toFixed(1)} — calories ${s0.toFixed(0)}, weight ${s1.toFixed(0)}, body_fat ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 27. computeThermogenicFoodImpact ────────────────────────────────────────

export interface ThermogenicFoodImpact {
  score: number
  grade: string
  components: { body_temperature: number; calories: number; weight: number; resting_heart_rate: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeThermogenicFoodImpact(
  userId: string,
  date?: Date,
): Promise<ThermogenicFoodImpact> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("body_temperature") ?? []
  const d1 = byType.get("calories") ?? []
  const d2 = byType.get("weight") ?? []
  const d3 = byType.get("resting_heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 36.2
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 1800
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 60
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 65
  
  const s0 = linearScale(avg0, 36.2, 37.5, 90, 50)
  const s1 = linearScale(avg1, 1800, 3000, 40, 90)
  const s2 = linearScale(avg2, 60, 100, 50, 85)
  const s3 = linearScale(avg3, 65, 85, 95, 40)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      body_temperature: Math.round(s0 * 10) / 10,
      calories: Math.round(s1 * 10) / 10,
      weight: Math.round(s2 * 10) / 10,
      resting_heart_rate: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `TEF score ${score.toFixed(1)} — body_temperature ${s0.toFixed(0)}, calories ${s1.toFixed(0)}, weight ${s2.toFixed(0)}, resting_heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 28. analyzePrebioticNeeds ───────────────────────────────────────────────

export interface PrebioticNeeds {
  score: number
  grade: string
  components: { weight: number; body_fat: number; stress: number; sleep_duration: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzePrebioticNeeds(
  userId: string,
  date?: Date,
): Promise<PrebioticNeeds> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("weight") ?? []
  const d1 = byType.get("body_fat") ?? []
  const d2 = byType.get("stress") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 60
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 15
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 50
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  
  const s0 = linearScale(avg0, 60, 100, 50, 85)
  const s1 = linearScale(avg1, 15, 35, 85, 40)
  const s2 = linearScale(avg2, 50, 80, 20, 80)
  const s3 = linearScale(avg3, 7, 9, 50, 90)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      weight: Math.round(s0 * 10) / 10,
      body_fat: Math.round(s1 * 10) / 10,
      stress: Math.round(s2 * 10) / 10,
      sleep_duration: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `Prebiotic score ${score.toFixed(1)} — weight ${s0.toFixed(0)}, body_fat ${s1.toFixed(0)}, stress ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 29. assessProbioticBenefit ──────────────────────────────────────────────

export interface ProbioticBenefit {
  score: number
  grade: string
  components: { body_temperature: number; stress: number; sleep_duration: number; active_minutes: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessProbioticBenefit(
  userId: string,
  date?: Date,
): Promise<ProbioticBenefit> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("body_temperature") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 36.2
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 36.2, 37.5, 90, 50)
  const s1 = linearScale(avg1, 50, 80, 20, 80)
  const s2 = linearScale(avg2, 7, 9, 50, 90)
  const s3 = linearScale(avg3, 30, 120, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      body_temperature: Math.round(s0 * 10) / 10,
      stress: Math.round(s1 * 10) / 10,
      sleep_duration: Math.round(s2 * 10) / 10,
      active_minutes: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `Probiotic score ${score.toFixed(1)} — body_temperature ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 30. computeGutHealthNutritionScore ──────────────────────────────────────

export interface GutHealthNutritionScore {
  score: number
  grade: string
  components: { body_temperature: number; stress: number; sleep_duration: number; weight: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeGutHealthNutritionScore(
  userId: string,
  date?: Date,
): Promise<GutHealthNutritionScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("body_temperature") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("weight") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 36.2
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 60
  
  const s0 = linearScale(avg0, 36.2, 37.5, 90, 50)
  const s1 = linearScale(avg1, 50, 80, 20, 80)
  const s2 = linearScale(avg2, 7, 9, 50, 90)
  const s3 = linearScale(avg3, 60, 100, 50, 85)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      body_temperature: Math.round(s0 * 10) / 10,
      stress: Math.round(s1 * 10) / 10,
      sleep_duration: Math.round(s2 * 10) / 10,
      weight: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `Gut score ${score.toFixed(1)} — body_temperature ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, weight ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 31. analyzeMuscleProteinSynthesisWindow ─────────────────────────────────

export interface MuscleProteinSynthesisWindow {
  score: number
  grade: string
  components: { active_minutes: number; calories: number; weight: number; sleep_duration: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeMuscleProteinSynthesisWindow(
  userId: string,
  date?: Date,
): Promise<MuscleProteinSynthesisWindow> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("active_minutes") ?? []
  const d1 = byType.get("calories") ?? []
  const d2 = byType.get("weight") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 30
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 1800
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 60
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  
  const s0 = linearScale(avg0, 30, 120, 40, 95)
  const s1 = linearScale(avg1, 1800, 3000, 40, 90)
  const s2 = linearScale(avg2, 60, 100, 50, 85)
  const s3 = linearScale(avg3, 7, 9, 50, 90)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      active_minutes: Math.round(s0 * 10) / 10,
      calories: Math.round(s1 * 10) / 10,
      weight: Math.round(s2 * 10) / 10,
      sleep_duration: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `MPS score ${score.toFixed(1)} — active_minutes ${s0.toFixed(0)}, calories ${s1.toFixed(0)}, weight ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 32. computeBoneHealthNutrition ──────────────────────────────────────────

export interface BoneHealthNutrition {
  score: number
  grade: string
  components: { weight: number; active_minutes: number; steps: number; body_fat: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeBoneHealthNutrition(
  userId: string,
  date?: Date,
): Promise<BoneHealthNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("weight") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("steps") ?? []
  const d3 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 60
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 3000
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 15
  
  const s0 = linearScale(avg0, 60, 100, 50, 85)
  const s1 = linearScale(avg1, 30, 120, 40, 95)
  const s2 = linearScale(avg2, 3000, 12000, 40, 95)
  const s3 = linearScale(avg3, 15, 35, 85, 40)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      weight: Math.round(s0 * 10) / 10,
      active_minutes: Math.round(s1 * 10) / 10,
      steps: Math.round(s2 * 10) / 10,
      body_fat: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `Bone score ${score.toFixed(1)} — weight ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, steps ${s2.toFixed(0)}, body_fat ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 33. assessBrainNutritionScore ───────────────────────────────────────────

export interface BrainNutritionScore {
  score: number
  grade: string
  components: { hrv: number; sleep_duration: number; deep_sleep: number; stress: number; blood_oxygen: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessBrainNutritionScore(
  userId: string,
  date?: Date,
): Promise<BrainNutritionScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("sleep_duration") ?? []
  const d2 = byType.get("deep_sleep") ?? []
  const d3 = byType.get("stress") ?? []
  const d4 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 0.8
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 93
  
  const s0 = linearScale(avg0, 40, 80, 90, 20)
  const s1 = linearScale(avg1, 7, 9, 50, 90)
  const s2 = linearScale(avg2, 0.8, 2.5, 40, 95)
  const s3 = linearScale(avg3, 50, 80, 20, 80)
  const s4 = linearScale(avg4, 93, 100, 30, 98)
  const componentAvg = (s0 + s1 + s2 + s3 + s4) / 5
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      hrv: Math.round(s0 * 10) / 10,
      sleep_duration: Math.round(s1 * 10) / 10,
      deep_sleep: Math.round(s2 * 10) / 10,
      stress: Math.round(s3 * 10) / 10,
      blood_oxygen: Math.round(s4 * 10) / 10,
    },
    trend,
    detail: `Brain score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, sleep_duration ${s1.toFixed(0)}, deep_sleep ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 34. computeHeartHealthyDietScore ────────────────────────────────────────

export interface HeartHealthyDietScore {
  score: number
  grade: string
  components: { resting_heart_rate: number; blood_pressure: number; hrv: number; weight: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeHeartHealthyDietScore(
  userId: string,
  date?: Date,
): Promise<HeartHealthyDietScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("blood_pressure") ?? []
  const d2 = byType.get("hrv") ?? []
  const d3 = byType.get("weight") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 110
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 40
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 60
  
  const s0 = linearScale(avg0, 65, 85, 95, 40)
  const s1 = linearScale(avg1, 110, 150, 95, 35)
  const s2 = linearScale(avg2, 40, 80, 90, 20)
  const s3 = linearScale(avg3, 60, 100, 50, 85)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      resting_heart_rate: Math.round(s0 * 10) / 10,
      blood_pressure: Math.round(s1 * 10) / 10,
      hrv: Math.round(s2 * 10) / 10,
      weight: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `Heart-diet score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, blood_pressure ${s1.toFixed(0)}, hrv ${s2.toFixed(0)}, weight ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 35. analyzeDASHDietAdherence ────────────────────────────────────────────

export interface DASHDietAdherence {
  score: number
  grade: string
  components: { blood_pressure: number; weight: number; calories: number; active_minutes: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeDASHDietAdherence(
  userId: string,
  date?: Date,
): Promise<DASHDietAdherence> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("blood_pressure") ?? []
  const d1 = byType.get("weight") ?? []
  const d2 = byType.get("calories") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 110
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 60
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 1800
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 110, 150, 95, 35)
  const s1 = linearScale(avg1, 60, 100, 50, 85)
  const s2 = linearScale(avg2, 1800, 3000, 40, 90)
  const s3 = linearScale(avg3, 30, 120, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      blood_pressure: Math.round(s0 * 10) / 10,
      weight: Math.round(s1 * 10) / 10,
      calories: Math.round(s2 * 10) / 10,
      active_minutes: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `DASH score ${score.toFixed(1)} — blood_pressure ${s0.toFixed(0)}, weight ${s1.toFixed(0)}, calories ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 36. computeMediterraneanDietScore ───────────────────────────────────────

export interface MediterraneanDietScore {
  score: number
  grade: string
  components: { resting_heart_rate: number; hrv: number; weight: number; blood_pressure: number; stress: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeMediterraneanDietScore(
  userId: string,
  date?: Date,
): Promise<MediterraneanDietScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("weight") ?? []
  const d3 = byType.get("blood_pressure") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 60
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 110
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 65, 85, 95, 40)
  const s1 = linearScale(avg1, 40, 80, 90, 20)
  const s2 = linearScale(avg2, 60, 100, 50, 85)
  const s3 = linearScale(avg3, 110, 150, 95, 35)
  const s4 = linearScale(avg4, 50, 80, 20, 80)
  const componentAvg = (s0 + s1 + s2 + s3 + s4) / 5
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      resting_heart_rate: Math.round(s0 * 10) / 10,
      hrv: Math.round(s1 * 10) / 10,
      weight: Math.round(s2 * 10) / 10,
      blood_pressure: Math.round(s3 * 10) / 10,
      stress: Math.round(s4 * 10) / 10,
    },
    trend,
    detail: `MedDiet score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, weight ${s2.toFixed(0)}, blood_pressure ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 37. assessAntiAgingNutrition ────────────────────────────────────────────

export interface AntiAgingNutrition {
  score: number
  grade: string
  components: { hrv: number; resting_heart_rate: number; body_fat: number; blood_oxygen: number; stress: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessAntiAgingNutrition(
  userId: string,
  date?: Date,
): Promise<AntiAgingNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("resting_heart_rate") ?? []
  const d2 = byType.get("body_fat") ?? []
  const d3 = byType.get("blood_oxygen") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 65
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 15
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 93
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 40, 80, 90, 20)
  const s1 = linearScale(avg1, 65, 85, 95, 40)
  const s2 = linearScale(avg2, 15, 35, 85, 40)
  const s3 = linearScale(avg3, 93, 100, 30, 98)
  const s4 = linearScale(avg4, 50, 80, 20, 80)
  const componentAvg = (s0 + s1 + s2 + s3 + s4) / 5
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      hrv: Math.round(s0 * 10) / 10,
      resting_heart_rate: Math.round(s1 * 10) / 10,
      body_fat: Math.round(s2 * 10) / 10,
      blood_oxygen: Math.round(s3 * 10) / 10,
      stress: Math.round(s4 * 10) / 10,
    },
    trend,
    detail: `AntiAge score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, resting_heart_rate ${s1.toFixed(0)}, body_fat ${s2.toFixed(0)}, blood_oxygen ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 38. computeRecoveryNutrition ────────────────────────────────────────────

export interface RecoveryNutrition {
  score: number
  grade: string
  components: { active_minutes: number; heart_rate: number; hrv: number; sleep_duration: number; calories: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeRecoveryNutrition(
  userId: string,
  date?: Date,
): Promise<RecoveryNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("active_minutes") ?? []
  const d1 = byType.get("heart_rate") ?? []
  const d2 = byType.get("hrv") ?? []
  const d3 = byType.get("sleep_duration") ?? []
  const d4 = byType.get("calories") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 30
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 70
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 40
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 7
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 1800
  
  const s0 = linearScale(avg0, 30, 120, 40, 95)
  const s1 = linearScale(avg1, 70, 180, 90, 50)
  const s2 = linearScale(avg2, 40, 80, 90, 20)
  const s3 = linearScale(avg3, 7, 9, 50, 90)
  const s4 = linearScale(avg4, 1800, 3000, 40, 90)
  const componentAvg = (s0 + s1 + s2 + s3 + s4) / 5
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      active_minutes: Math.round(s0 * 10) / 10,
      heart_rate: Math.round(s1 * 10) / 10,
      hrv: Math.round(s2 * 10) / 10,
      sleep_duration: Math.round(s3 * 10) / 10,
      calories: Math.round(s4 * 10) / 10,
    },
    trend,
    detail: `Recovery score ${score.toFixed(1)} — active_minutes ${s0.toFixed(0)}, heart_rate ${s1.toFixed(0)}, hrv ${s2.toFixed(0)}, sleep_duration ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 39. analyzeWeightManagementNutrition ────────────────────────────────────

export interface WeightManagementNutrition {
  score: number
  grade: string
  components: { weight: number; body_fat: number; calories: number; active_minutes: number; steps: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeWeightManagementNutrition(
  userId: string,
  date?: Date,
): Promise<WeightManagementNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("weight") ?? []
  const d1 = byType.get("body_fat") ?? []
  const d2 = byType.get("calories") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("steps") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 60
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 15
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 1800
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 3000
  
  const s0 = linearScale(avg0, 60, 100, 50, 85)
  const s1 = linearScale(avg1, 15, 35, 85, 40)
  const s2 = linearScale(avg2, 1800, 3000, 40, 90)
  const s3 = linearScale(avg3, 30, 120, 40, 95)
  const s4 = linearScale(avg4, 3000, 12000, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3 + s4) / 5
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      weight: Math.round(s0 * 10) / 10,
      body_fat: Math.round(s1 * 10) / 10,
      calories: Math.round(s2 * 10) / 10,
      active_minutes: Math.round(s3 * 10) / 10,
      steps: Math.round(s4 * 10) / 10,
    },
    trend,
    detail: `WtMgmt score ${score.toFixed(1)} — weight ${s0.toFixed(0)}, body_fat ${s1.toFixed(0)}, calories ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 40. computeEnergyOptimizationNutrition ──────────────────────────────────

export interface EnergyOptimizationNutrition {
  score: number
  grade: string
  components: { calories: number; active_minutes: number; sleep_duration: number; stress: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeEnergyOptimizationNutrition(
  userId: string,
  date?: Date,
): Promise<EnergyOptimizationNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("calories") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 1800
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  
  const s0 = linearScale(avg0, 1800, 3000, 40, 90)
  const s1 = linearScale(avg1, 30, 120, 40, 95)
  const s2 = linearScale(avg2, 7, 9, 50, 90)
  const s3 = linearScale(avg3, 50, 80, 20, 80)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      calories: Math.round(s0 * 10) / 10,
      active_minutes: Math.round(s1 * 10) / 10,
      sleep_duration: Math.round(s2 * 10) / 10,
      stress: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `Energy score ${score.toFixed(1)} — calories ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 41. assessMicronutrientDensity ──────────────────────────────────────────

export interface MicronutrientDensity {
  score: number
  grade: string
  components: { calories: number; weight: number; active_minutes: number; body_fat: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessMicronutrientDensity(
  userId: string,
  date?: Date,
): Promise<MicronutrientDensity> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("calories") ?? []
  const d1 = byType.get("weight") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 1800
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 60
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 15
  
  const s0 = linearScale(avg0, 1800, 3000, 40, 90)
  const s1 = linearScale(avg1, 60, 100, 50, 85)
  const s2 = linearScale(avg2, 30, 120, 40, 95)
  const s3 = linearScale(avg3, 15, 35, 85, 40)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      calories: Math.round(s0 * 10) / 10,
      weight: Math.round(s1 * 10) / 10,
      active_minutes: Math.round(s2 * 10) / 10,
      body_fat: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `MicroD score ${score.toFixed(1)} — calories ${s0.toFixed(0)}, weight ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, body_fat ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 42. computeProteinQualityScore ──────────────────────────────────────────

export interface ProteinQualityScore {
  score: number
  grade: string
  components: { weight: number; body_fat: number; active_minutes: number; vo2max: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeProteinQualityScore(
  userId: string,
  date?: Date,
): Promise<ProteinQualityScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("weight") ?? []
  const d1 = byType.get("body_fat") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("vo2max") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 60
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 15
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 25
  
  const s0 = linearScale(avg0, 60, 100, 50, 85)
  const s1 = linearScale(avg1, 15, 35, 85, 40)
  const s2 = linearScale(avg2, 30, 120, 40, 95)
  const s3 = linearScale(avg3, 25, 60, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      weight: Math.round(s0 * 10) / 10,
      body_fat: Math.round(s1 * 10) / 10,
      active_minutes: Math.round(s2 * 10) / 10,
      vo2max: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `PQ score ${score.toFixed(1)} — weight ${s0.toFixed(0)}, body_fat ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, vo2max ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 43. analyzeNutrientTimingEfficiency ─────────────────────────────────────

export interface NutrientTimingEfficiency {
  score: number
  grade: string
  components: { calories: number; active_minutes: number; sleep_duration: number; heart_rate: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeNutrientTimingEfficiency(
  userId: string,
  date?: Date,
): Promise<NutrientTimingEfficiency> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("calories") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("heart_rate") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 1800
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 70
  
  const s0 = linearScale(avg0, 1800, 3000, 40, 90)
  const s1 = linearScale(avg1, 30, 120, 40, 95)
  const s2 = linearScale(avg2, 7, 9, 50, 90)
  const s3 = linearScale(avg3, 70, 180, 90, 50)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      calories: Math.round(s0 * 10) / 10,
      active_minutes: Math.round(s1 * 10) / 10,
      sleep_duration: Math.round(s2 * 10) / 10,
      heart_rate: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `NTiming score ${score.toFixed(1)} — calories ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, heart_rate ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 44. computeMetabolicNutritionSync ───────────────────────────────────────

export interface MetabolicNutritionSync {
  score: number
  grade: string
  components: { resting_heart_rate: number; calories: number; weight: number; body_temperature: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeMetabolicNutritionSync(
  userId: string,
  date?: Date,
): Promise<MetabolicNutritionSync> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("calories") ?? []
  const d2 = byType.get("weight") ?? []
  const d3 = byType.get("body_temperature") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 1800
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 60
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 36.2
  
  const s0 = linearScale(avg0, 65, 85, 95, 40)
  const s1 = linearScale(avg1, 1800, 3000, 40, 90)
  const s2 = linearScale(avg2, 60, 100, 50, 85)
  const s3 = linearScale(avg3, 36.2, 37.5, 90, 50)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      resting_heart_rate: Math.round(s0 * 10) / 10,
      calories: Math.round(s1 * 10) / 10,
      weight: Math.round(s2 * 10) / 10,
      body_temperature: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `MetSync score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, calories ${s1.toFixed(0)}, weight ${s2.toFixed(0)}, body_temperature ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 45. assessSportNutritionReadiness ───────────────────────────────────────

export interface SportNutritionReadiness {
  score: number
  grade: string
  components: { vo2max: number; active_minutes: number; heart_rate: number; calories: number; weight: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessSportNutritionReadiness(
  userId: string,
  date?: Date,
): Promise<SportNutritionReadiness> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("vo2max") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("heart_rate") ?? []
  const d3 = byType.get("calories") ?? []
  const d4 = byType.get("weight") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 25
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 70
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 1800
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 60
  
  const s0 = linearScale(avg0, 25, 60, 40, 95)
  const s1 = linearScale(avg1, 30, 120, 40, 95)
  const s2 = linearScale(avg2, 70, 180, 90, 50)
  const s3 = linearScale(avg3, 1800, 3000, 40, 90)
  const s4 = linearScale(avg4, 60, 100, 50, 85)
  const componentAvg = (s0 + s1 + s2 + s3 + s4) / 5
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      vo2max: Math.round(s0 * 10) / 10,
      active_minutes: Math.round(s1 * 10) / 10,
      heart_rate: Math.round(s2 * 10) / 10,
      calories: Math.round(s3 * 10) / 10,
      weight: Math.round(s4 * 10) / 10,
    },
    trend,
    detail: `SportNut score ${score.toFixed(1)} — vo2max ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, heart_rate ${s2.toFixed(0)}, calories ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 46. computeEnduranceNutritionScore ──────────────────────────────────────

export interface EnduranceNutritionScore {
  score: number
  grade: string
  components: { vo2max: number; active_minutes: number; heart_rate: number; calories: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeEnduranceNutritionScore(
  userId: string,
  date?: Date,
): Promise<EnduranceNutritionScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("vo2max") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("heart_rate") ?? []
  const d3 = byType.get("calories") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 25
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 70
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 1800
  
  const s0 = linearScale(avg0, 25, 60, 40, 95)
  const s1 = linearScale(avg1, 30, 120, 40, 95)
  const s2 = linearScale(avg2, 70, 180, 90, 50)
  const s3 = linearScale(avg3, 1800, 3000, 40, 90)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      vo2max: Math.round(s0 * 10) / 10,
      active_minutes: Math.round(s1 * 10) / 10,
      heart_rate: Math.round(s2 * 10) / 10,
      calories: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `EndNut score ${score.toFixed(1)} — vo2max ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, heart_rate ${s2.toFixed(0)}, calories ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 47. analyzeStrengthNutritionScore ───────────────────────────────────────

export interface StrengthNutritionScore {
  score: number
  grade: string
  components: { weight: number; body_fat: number; active_minutes: number; calories: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeStrengthNutritionScore(
  userId: string,
  date?: Date,
): Promise<StrengthNutritionScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("weight") ?? []
  const d1 = byType.get("body_fat") ?? []
  const d2 = byType.get("active_minutes") ?? []
  const d3 = byType.get("calories") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 60
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 15
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 30
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 1800
  
  const s0 = linearScale(avg0, 60, 100, 50, 85)
  const s1 = linearScale(avg1, 15, 35, 85, 40)
  const s2 = linearScale(avg2, 30, 120, 40, 95)
  const s3 = linearScale(avg3, 1800, 3000, 40, 90)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      weight: Math.round(s0 * 10) / 10,
      body_fat: Math.round(s1 * 10) / 10,
      active_minutes: Math.round(s2 * 10) / 10,
      calories: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `StrNut score ${score.toFixed(1)} — weight ${s0.toFixed(0)}, body_fat ${s1.toFixed(0)}, active_minutes ${s2.toFixed(0)}, calories ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 48. computeImmuneNutritionScore ─────────────────────────────────────────

export interface ImmuneNutritionScore {
  score: number
  grade: string
  components: { body_temperature: number; sleep_duration: number; stress: number; active_minutes: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeImmuneNutritionScore(
  userId: string,
  date?: Date,
): Promise<ImmuneNutritionScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("body_temperature") ?? []
  const d1 = byType.get("sleep_duration") ?? []
  const d2 = byType.get("stress") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 36.2
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 50
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 36.2, 37.5, 90, 50)
  const s1 = linearScale(avg1, 7, 9, 50, 90)
  const s2 = linearScale(avg2, 50, 80, 20, 80)
  const s3 = linearScale(avg3, 30, 120, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      body_temperature: Math.round(s0 * 10) / 10,
      sleep_duration: Math.round(s1 * 10) / 10,
      stress: Math.round(s2 * 10) / 10,
      active_minutes: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `ImmuneNut score ${score.toFixed(1)} — body_temperature ${s0.toFixed(0)}, sleep_duration ${s1.toFixed(0)}, stress ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 49. assessCognitiveNutritionScore ───────────────────────────────────────

export interface CognitiveNutritionScore {
  score: number
  grade: string
  components: { deep_sleep: number; hrv: number; stress: number; blood_oxygen: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessCognitiveNutritionScore(
  userId: string,
  date?: Date,
): Promise<CognitiveNutritionScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("deep_sleep") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("stress") ?? []
  const d3 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 0.8
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 50
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 93
  
  const s0 = linearScale(avg0, 0.8, 2.5, 40, 95)
  const s1 = linearScale(avg1, 40, 80, 90, 20)
  const s2 = linearScale(avg2, 50, 80, 20, 80)
  const s3 = linearScale(avg3, 93, 100, 30, 98)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      deep_sleep: Math.round(s0 * 10) / 10,
      hrv: Math.round(s1 * 10) / 10,
      stress: Math.round(s2 * 10) / 10,
      blood_oxygen: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `CogNut score ${score.toFixed(1)} — deep_sleep ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, stress ${s2.toFixed(0)}, blood_oxygen ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 50. computeHormonalNutritionBalance ─────────────────────────────────────

export interface HormonalNutritionBalance {
  score: number
  grade: string
  components: { sleep_duration: number; stress: number; body_fat: number; active_minutes: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeHormonalNutritionBalance(
  userId: string,
  date?: Date,
): Promise<HormonalNutritionBalance> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("sleep_duration") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("body_fat") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 7
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 15
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 7, 9, 50, 90)
  const s1 = linearScale(avg1, 50, 80, 20, 80)
  const s2 = linearScale(avg2, 15, 35, 85, 40)
  const s3 = linearScale(avg3, 30, 120, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      sleep_duration: Math.round(s0 * 10) / 10,
      stress: Math.round(s1 * 10) / 10,
      body_fat: Math.round(s2 * 10) / 10,
      active_minutes: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `HormNut score ${score.toFixed(1)} — sleep_duration ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, body_fat ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 51. analyzeInflammationNutritionScore ───────────────────────────────────

export interface InflammationNutritionScore {
  score: number
  grade: string
  components: { resting_heart_rate: number; hrv: number; body_temperature: number; stress: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeInflammationNutritionScore(
  userId: string,
  date?: Date,
): Promise<InflammationNutritionScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("body_temperature") ?? []
  const d3 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 36.2
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  
  const s0 = linearScale(avg0, 65, 85, 95, 40)
  const s1 = linearScale(avg1, 40, 80, 90, 20)
  const s2 = linearScale(avg2, 36.2, 37.5, 90, 50)
  const s3 = linearScale(avg3, 50, 80, 20, 80)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      resting_heart_rate: Math.round(s0 * 10) / 10,
      hrv: Math.round(s1 * 10) / 10,
      body_temperature: Math.round(s2 * 10) / 10,
      stress: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `InflamNut score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, body_temperature ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 52. computeDetoxNutritionScore ──────────────────────────────────────────

export interface DetoxNutritionScore {
  score: number
  grade: string
  components: { weight: number; body_fat: number; calories: number; active_minutes: number; stress: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeDetoxNutritionScore(
  userId: string,
  date?: Date,
): Promise<DetoxNutritionScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("weight") ?? []
  const d1 = byType.get("body_fat") ?? []
  const d2 = byType.get("calories") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("stress") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 60
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 15
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 1800
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 50
  
  const s0 = linearScale(avg0, 60, 100, 50, 85)
  const s1 = linearScale(avg1, 15, 35, 85, 40)
  const s2 = linearScale(avg2, 1800, 3000, 40, 90)
  const s3 = linearScale(avg3, 30, 120, 40, 95)
  const s4 = linearScale(avg4, 50, 80, 20, 80)
  const componentAvg = (s0 + s1 + s2 + s3 + s4) / 5
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      weight: Math.round(s0 * 10) / 10,
      body_fat: Math.round(s1 * 10) / 10,
      calories: Math.round(s2 * 10) / 10,
      active_minutes: Math.round(s3 * 10) / 10,
      stress: Math.round(s4 * 10) / 10,
    },
    trend,
    detail: `DetoxNut score ${score.toFixed(1)} — weight ${s0.toFixed(0)}, body_fat ${s1.toFixed(0)}, calories ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 53. assessJointHealthNutrition ──────────────────────────────────────────

export interface JointHealthNutrition {
  score: number
  grade: string
  components: { active_minutes: number; steps: number; weight: number; body_fat: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessJointHealthNutrition(
  userId: string,
  date?: Date,
): Promise<JointHealthNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("active_minutes") ?? []
  const d1 = byType.get("steps") ?? []
  const d2 = byType.get("weight") ?? []
  const d3 = byType.get("body_fat") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 30
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 3000
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 60
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 15
  
  const s0 = linearScale(avg0, 30, 120, 40, 95)
  const s1 = linearScale(avg1, 3000, 12000, 40, 95)
  const s2 = linearScale(avg2, 60, 100, 50, 85)
  const s3 = linearScale(avg3, 15, 35, 85, 40)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      active_minutes: Math.round(s0 * 10) / 10,
      steps: Math.round(s1 * 10) / 10,
      weight: Math.round(s2 * 10) / 10,
      body_fat: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `JointNut score ${score.toFixed(1)} — active_minutes ${s0.toFixed(0)}, steps ${s1.toFixed(0)}, weight ${s2.toFixed(0)}, body_fat ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 54. computeSkinHealthNutrition ──────────────────────────────────────────

export interface SkinHealthNutrition {
  score: number
  grade: string
  components: { body_temperature: number; stress: number; sleep_duration: number; blood_oxygen: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeSkinHealthNutrition(
  userId: string,
  date?: Date,
): Promise<SkinHealthNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("body_temperature") ?? []
  const d1 = byType.get("stress") ?? []
  const d2 = byType.get("sleep_duration") ?? []
  const d3 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 36.2
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 50
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 7
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 93
  
  const s0 = linearScale(avg0, 36.2, 37.5, 90, 50)
  const s1 = linearScale(avg1, 50, 80, 20, 80)
  const s2 = linearScale(avg2, 7, 9, 50, 90)
  const s3 = linearScale(avg3, 93, 100, 30, 98)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      body_temperature: Math.round(s0 * 10) / 10,
      stress: Math.round(s1 * 10) / 10,
      sleep_duration: Math.round(s2 * 10) / 10,
      blood_oxygen: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `SkinNut score ${score.toFixed(1)} — body_temperature ${s0.toFixed(0)}, stress ${s1.toFixed(0)}, sleep_duration ${s2.toFixed(0)}, blood_oxygen ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 55. analyzeEyeHealthNutrition ───────────────────────────────────────────

export interface EyeHealthNutrition {
  score: number
  grade: string
  components: { stress: number; sleep_duration: number; deep_sleep: number; active_minutes: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeEyeHealthNutrition(
  userId: string,
  date?: Date,
): Promise<EyeHealthNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("stress") ?? []
  const d1 = byType.get("sleep_duration") ?? []
  const d2 = byType.get("deep_sleep") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 50
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 7
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 0.8
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 50, 80, 20, 80)
  const s1 = linearScale(avg1, 7, 9, 50, 90)
  const s2 = linearScale(avg2, 0.8, 2.5, 40, 95)
  const s3 = linearScale(avg3, 30, 120, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      stress: Math.round(s0 * 10) / 10,
      sleep_duration: Math.round(s1 * 10) / 10,
      deep_sleep: Math.round(s2 * 10) / 10,
      active_minutes: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `EyeNut score ${score.toFixed(1)} — stress ${s0.toFixed(0)}, sleep_duration ${s1.toFixed(0)}, deep_sleep ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 56. computeRespiratoryNutrition ─────────────────────────────────────────

export interface RespiratoryNutrition {
  score: number
  grade: string
  components: { respiratory_rate: number; blood_oxygen: number; vo2max: number; active_minutes: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeRespiratoryNutrition(
  userId: string,
  date?: Date,
): Promise<RespiratoryNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("respiratory_rate") ?? []
  const d1 = byType.get("blood_oxygen") ?? []
  const d2 = byType.get("vo2max") ?? []
  const d3 = byType.get("active_minutes") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 12
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 93
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 25
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  
  const s0 = linearScale(avg0, 12, 20, 90, 50)
  const s1 = linearScale(avg1, 93, 100, 30, 98)
  const s2 = linearScale(avg2, 25, 60, 40, 95)
  const s3 = linearScale(avg3, 30, 120, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      respiratory_rate: Math.round(s0 * 10) / 10,
      blood_oxygen: Math.round(s1 * 10) / 10,
      vo2max: Math.round(s2 * 10) / 10,
      active_minutes: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `RespNut score ${score.toFixed(1)} — respiratory_rate ${s0.toFixed(0)}, blood_oxygen ${s1.toFixed(0)}, vo2max ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 57. assessCardiovascularNutrition ───────────────────────────────────────

export interface CardiovascularNutrition {
  score: number
  grade: string
  components: { resting_heart_rate: number; hrv: number; blood_pressure: number; blood_oxygen: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function assessCardiovascularNutrition(
  userId: string,
  date?: Date,
): Promise<CardiovascularNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("resting_heart_rate") ?? []
  const d1 = byType.get("hrv") ?? []
  const d2 = byType.get("blood_pressure") ?? []
  const d3 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 65
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 40
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 110
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 93
  
  const s0 = linearScale(avg0, 65, 85, 95, 40)
  const s1 = linearScale(avg1, 40, 80, 90, 20)
  const s2 = linearScale(avg2, 110, 150, 95, 35)
  const s3 = linearScale(avg3, 93, 100, 30, 98)
  const componentAvg = (s0 + s1 + s2 + s3) / 4
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      resting_heart_rate: Math.round(s0 * 10) / 10,
      hrv: Math.round(s1 * 10) / 10,
      blood_pressure: Math.round(s2 * 10) / 10,
      blood_oxygen: Math.round(s3 * 10) / 10,
    },
    trend,
    detail: `CVNut score ${score.toFixed(1)} — resting_heart_rate ${s0.toFixed(0)}, hrv ${s1.toFixed(0)}, blood_pressure ${s2.toFixed(0)}, blood_oxygen ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 58. computeNeurologicalNutrition ────────────────────────────────────────

export interface NeurologicalNutrition {
  score: number
  grade: string
  components: { hrv: number; deep_sleep: number; rem_sleep: number; stress: number; blood_oxygen: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeNeurologicalNutrition(
  userId: string,
  date?: Date,
): Promise<NeurologicalNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("hrv") ?? []
  const d1 = byType.get("deep_sleep") ?? []
  const d2 = byType.get("rem_sleep") ?? []
  const d3 = byType.get("stress") ?? []
  const d4 = byType.get("blood_oxygen") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 40
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 0.8
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 1.0
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 50
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 93
  
  const s0 = linearScale(avg0, 40, 80, 90, 20)
  const s1 = linearScale(avg1, 0.8, 2.5, 40, 95)
  const s2 = linearScale(avg2, 1.0, 2.5, 40, 90)
  const s3 = linearScale(avg3, 50, 80, 20, 80)
  const s4 = linearScale(avg4, 93, 100, 30, 98)
  const componentAvg = (s0 + s1 + s2 + s3 + s4) / 5
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      hrv: Math.round(s0 * 10) / 10,
      deep_sleep: Math.round(s1 * 10) / 10,
      rem_sleep: Math.round(s2 * 10) / 10,
      stress: Math.round(s3 * 10) / 10,
      blood_oxygen: Math.round(s4 * 10) / 10,
    },
    trend,
    detail: `NeuroNut score ${score.toFixed(1)} — hrv ${s0.toFixed(0)}, deep_sleep ${s1.toFixed(0)}, rem_sleep ${s2.toFixed(0)}, stress ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 59. analyzeMusculoskeletalNutrition ─────────────────────────────────────

export interface MusculoskeletalNutrition {
  score: number
  grade: string
  components: { weight: number; active_minutes: number; steps: number; body_fat: number; calories: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function analyzeMusculoskeletalNutrition(
  userId: string,
  date?: Date,
): Promise<MusculoskeletalNutrition> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("weight") ?? []
  const d1 = byType.get("active_minutes") ?? []
  const d2 = byType.get("steps") ?? []
  const d3 = byType.get("body_fat") ?? []
  const d4 = byType.get("calories") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 60
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 30
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 3000
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 15
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 1800
  
  const s0 = linearScale(avg0, 60, 100, 50, 85)
  const s1 = linearScale(avg1, 30, 120, 40, 95)
  const s2 = linearScale(avg2, 3000, 12000, 40, 95)
  const s3 = linearScale(avg3, 15, 35, 85, 40)
  const s4 = linearScale(avg4, 1800, 3000, 40, 90)
  const componentAvg = (s0 + s1 + s2 + s3 + s4) / 5
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      weight: Math.round(s0 * 10) / 10,
      active_minutes: Math.round(s1 * 10) / 10,
      steps: Math.round(s2 * 10) / 10,
      body_fat: Math.round(s3 * 10) / 10,
      calories: Math.round(s4 * 10) / 10,
    },
    trend,
    detail: `MSKNut score ${score.toFixed(1)} — weight ${s0.toFixed(0)}, active_minutes ${s1.toFixed(0)}, steps ${s2.toFixed(0)}, body_fat ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}

// ── 60. computeNutritionComplianceScore ─────────────────────────────────────

export interface NutritionComplianceScore {
  score: number
  grade: string
  components: { calories: number; weight: number; body_fat: number; active_minutes: number; steps: number }
  trend: "improving" | "declining" | "stable"
  detail: string
  date: string
}

export async function computeNutritionComplianceScore(
  userId: string,
  date?: Date,
): Promise<NutritionComplianceScore> {
  const db = getDb()
  const targetDate = date ?? new Date()
  const lookback = new Date(targetDate.getTime() - 14 * 86400000)

  const byType = await fetchMetrics(db, userId, lookback, targetDate)
  const d0 = byType.get("calories") ?? []
  const d1 = byType.get("weight") ?? []
  const d2 = byType.get("body_fat") ?? []
  const d3 = byType.get("active_minutes") ?? []
  const d4 = byType.get("steps") ?? []
  
  const avg0 = d0.length > 0 ? mean(vals(recent(d0, 7))) : 1800
  const avg1 = d1.length > 0 ? mean(vals(recent(d1, 7))) : 60
  const avg2 = d2.length > 0 ? mean(vals(recent(d2, 7))) : 15
  const avg3 = d3.length > 0 ? mean(vals(recent(d3, 7))) : 30
  const avg4 = d4.length > 0 ? mean(vals(recent(d4, 7))) : 3000
  
  const s0 = linearScale(avg0, 1800, 3000, 40, 90)
  const s1 = linearScale(avg1, 60, 100, 50, 85)
  const s2 = linearScale(avg2, 15, 35, 85, 40)
  const s3 = linearScale(avg3, 30, 120, 40, 95)
  const s4 = linearScale(avg4, 3000, 12000, 40, 95)
  const componentAvg = (s0 + s1 + s2 + s3 + s4) / 5
  const score = clamp(componentAvg, 0, 100)
  const trend = trendDirection(d0)
  
  return {
    score: Math.round(score * 10) / 10,
    grade: scoreToGrade(score),
    components: {
      calories: Math.round(s0 * 10) / 10,
      weight: Math.round(s1 * 10) / 10,
      body_fat: Math.round(s2 * 10) / 10,
      active_minutes: Math.round(s3 * 10) / 10,
      steps: Math.round(s4 * 10) / 10,
    },
    trend,
    detail: `Compliance score ${score.toFixed(1)} — calories ${s0.toFixed(0)}, weight ${s1.toFixed(0)}, body_fat ${s2.toFixed(0)}, active_minutes ${s3.toFixed(0)}`,
    date: targetDate.toISOString(),
  }
}