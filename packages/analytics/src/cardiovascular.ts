import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, asc, sql } from "drizzle-orm"

// ── Statistical Helpers ─────────────────────────────────────────

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const frac = idx - lower
  if (lower + 1 >= sorted.length) return sorted[lower]!
  return sorted[lower]! + frac * (sorted[lower + 1]! - sorted[lower]!)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function linearRegression(values: number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 }
  const xMean = (n - 1) / 2
  const yMean = mean(values)
  let num = 0, den = 0, ssTot = 0, ssRes = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i]! - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = yMean - slope * xMean
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i
    ssRes += (values[i]! - predicted) ** 2
    ssTot += (values[i]! - yMean) ** 2
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot
  return { slope, intercept, r2 }
}

function coefficientOfVariation(values: number[]): number {
  const m = mean(values)
  return m === 0 ? 0 : stddev(values) / m
}

function rmssd(values: number[]): number {
  if (values.length < 2) return 0
  let sumSqDiff = 0
  for (let i = 1; i < values.length; i++) {
    sumSqDiff += (values[i]! - values[i - 1]!) ** 2
  }
  return Math.sqrt(sumSqDiff / (values.length - 1))
}

function sampleEntropy(values: number[], m: number = 2, r?: number): number {
  const tolerance = r ?? 0.2 * stddev(values)
  if (values.length < m + 2 || tolerance === 0) return 0
  const n = values.length

  function countMatches(templateLen: number): number {
    let count = 0
    for (let i = 0; i <= n - templateLen; i++) {
      for (let j = i + 1; j <= n - templateLen; j++) {
        let match = true
        for (let k = 0; k < templateLen; k++) {
          if (Math.abs(values[i + k]! - values[j + k]!) > tolerance) {
            match = false
            break
          }
        }
        if (match) count++
      }
    }
    return count
  }

  const a = countMatches(m + 1)
  const b = countMatches(m)
  if (b === 0 || a === 0) return 0
  return -Math.log(a / b)
}

type Db = ReturnType<typeof getDb>

async function fetchMetric(
  db: Db,
  userId: string,
  metricType: string,
  from: Date,
  to: Date,
  limit?: number,
): Promise<{ value: number; recordedAt: Date }[]> {
  let query = db
    .select({ value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, metricType),
        gte(healthMetrics.recordedAt, from),
        lte(healthMetrics.recordedAt, to),
      ),
    )
    .orderBy(desc(healthMetrics.recordedAt))
    .$dynamic()

  if (limit) query = query.limit(limit)

  const rows = await query
  return rows
    .filter((r): r is { value: number; recordedAt: Date } => r.value != null)
}

async function fetchLatestMetric(
  db: Db,
  userId: string,
  metricType: string,
  from: Date,
  to: Date,
): Promise<number | null> {
  const rows = await fetchMetric(db, userId, metricType, from, to, 1)
  return rows.length > 0 ? rows[0]!.value : null
}

function daysAgo(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

function dayStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

// ── Types ───────────────────────────────────────────────────────

export interface HeartRateZonesResult {
  maxHR: number
  restingHR: number
  zones: { zone: number; name: string; minBPM: number; maxBPM: number; percentage: number }[]
  timeInZones: { zone: number; minutes: number; percentage: number }[]
  date: string
}

export interface VO2MaxResult {
  vo2max: number
  method: string
  fitnessLevel: string
  percentileForAge: number | null
  date: string
}

export interface CardiacOutputResult {
  estimatedCardiacOutput: number
  heartRate: number
  estimatedStrokeVolume: number
  cardiacIndex: number | null
  rating: string
  date: string
}

export interface HRVAnalysisResult {
  rmssd: number
  sdnn: number
  pnn50: number
  meanRR: number
  triangularIndex: number
  stressIndex: number
  autonomicBalance: string
  date: string
}

export interface HRVFrequencyDomainResult {
  lfPower: number
  hfPower: number
  lfHfRatio: number
  totalPower: number
  normalizedLF: number
  normalizedHF: number
  dominantBranch: string
  date: string
}

export interface CardiovascularRiskResult {
  riskScore: number
  riskCategory: string
  tenYearRisk: number
  factors: { factor: string; contribution: number; status: string }[]
  recommendations: string[]
  date: string
}

export interface CardiacEfficiencyResult {
  efficiencyScore: number
  ratePressureProduct: number
  heartRateReserveUtilization: number
  oxygenPulseProxy: number
  rating: string
  date: string
}

export interface HeartRateRecoveryResult {
  recovery1Min: number | null
  recovery2Min: number | null
  peakHR: number
  recoveryRate: string
  autonomicHealth: string
  date: string
}

export interface ArterialStiffnessResult {
  stiffnessIndex: number
  pulsePressure: number
  augmentationProxy: number
  category: string
  vascularAge: number
  date: string
}

export interface AutonomicBalanceResult {
  sympatheticScore: number
  parasympatheticScore: number
  balanceRatio: number
  dominance: string
  overallStatus: string
  date: string
}

export interface CardiacStrainResult {
  strainScore: number
  highHRDuration: number
  averageExcessHR: number
  cumulativeLoad: number
  riskLevel: string
  date: string
}

export interface RestingHRTrendResult {
  currentRHR: number
  thirtyDayAvg: number
  ninetyDayAvg: number
  trend: string
  trendSlope: number
  changePercent: number
  date: string
}

export interface AerobicCapacityResult {
  aerobicCapacity: number
  mets: number
  fitnessCategory: string
  reserveCapacity: number
  date: string
}

export interface HypertensionRiskResult {
  riskScore: number
  riskCategory: string
  systolicAvg: number
  diastolicAvg: number
  bpCategory: string
  variabilityScore: number
  date: string
}

export interface PulseWaveVelocityResult {
  estimatedPWV: number
  category: string
  ageAdjustedPercentile: number | null
  arterialHealthScore: number
  date: string
}

export interface BloodPressureVariabilityResult {
  systolicVariability: number
  diastolicVariability: number
  averageSystolic: number
  averageDiastolic: number
  dippingStatus: string | null
  variabilityCategory: string
  date: string
}

export interface HeartRateComplexityResult {
  sampleEntropy: number
  complexityIndex: number
  category: string
  healthImplication: string
  date: string
}

export interface AtrialFibrillationRiskResult {
  riskScore: number
  riskCategory: string
  factors: { factor: string; present: boolean; weight: number }[]
  recommendation: string
  date: string
}

export interface MyocardialWorkloadResult {
  ratePressureProduct: number
  myocardialOxygenDemand: string
  workloadCategory: string
  restingWorkload: number
  peakWorkload: number | null
  date: string
}

export interface OrthostaticResult {
  hrChange: number | null
  bpChange: number | null
  orthostaticIntolerance: boolean
  severity: string
  date: string
}
export interface VascularAgeResult {
  vascularAge: number
  chronologicalAge: number | null
  ageDifference: number | null
  factors: { factor: string; impact: string }[]
  date: string
}

export interface EndothelialFunctionResult {
  functionScore: number
  bpReactivity: number
  pulseAmplitudeRatio: number
  category: string
  date: string
}

export interface CoronaryAgeResult {
  coronaryAge: number
  riskFactorBurden: number
  category: string
  date: string
}

export interface HeartRateAsymmetryResult {
  accelerationCapacity: number
  decelerationCapacity: number
  asymmetryIndex: number
  category: string
  date: string
}

export interface BradycardiaRiskResult {
  riskScore: number
  bradycardiaEpisodes: number
  lowestHR: number
  averageRestingHR: number
  riskCategory: string
  date: string
}

export interface TachycardiaRiskResult {
  riskScore: number
  tachycardiaEpisodes: number
  highestRestingHR: number
  averageRestingHR: number
  riskCategory: string
  date: string
}

export interface ValvularHealthProxyResult {
  healthScore: number
  pulsePressureRatio: number
  hrRegularity: number
  category: string
  date: string
}

export interface CardiacReserveResult {
  restingHR: number
  maxHR: number
  heartRateReserve: number
  percentReserveUsed: number
  reserveCategory: string
  date: string
}

export interface CirculatoryEfficiencyResult {
  efficiencyScore: number
  components: { name: string; score: number; weight: number }[]
  category: string
  date: string
}

export interface BloodPressureLoadResult {
  systolicLoad: number
  diastolicLoad: number
  overallLoad: number
  totalReadings: number
  aboveThreshold: number
  category: string
  date: string
}

export interface LVHRiskResult {
  riskScore: number
  cornellProduct: number | null
  bpContribution: number
  hrContribution: number
  riskCategory: string
  date: string
}

export interface AnkleBrachialIndexResult {
  estimatedABI: number
  padRisk: string
  peripheralCirculation: string
  date: string
}

export interface HeartRateTurbulenceResult {
  turbulenceOnset: number
  turbulenceSlope: number
  category: string
  prognosticValue: string
  date: string
}

export interface DiastolicFunctionResult {
  functionScore: number
  diastolicBP: number
  pulsePressure: number
  category: string
  date: string
}

export interface StrokeRiskResult {
  riskScore: number
  riskCategory: string
  factors: { factor: string; points: number; present: boolean }[]
  annualRiskPercent: number
  date: string
}

export interface PeripheralResistanceResult {
  estimatedSVR: number
  category: string
  meanArterialPressure: number
  estimatedCardiacOutput: number
  date: string
}

export interface BloodPressureDippingResult {
  daytimeAvgSystolic: number
  nighttimeAvgSystolic: number
  dippingPercent: number
  dippingCategory: string
  clinicalSignificance: string
  date: string
}

export interface CardiacFitnessAgeResult {
  fitnessAge: number
  chronologicalAge: number | null
  ageDelta: number | null
  fitnessCategory: string
  date: string
}

export interface MetabolicSyndromeResult {
  riskScore: number
  criteriaCount: number
  criteria: { criterion: string; met: boolean; value: number | null }[]
  riskCategory: string
  date: string
}

export interface MaxHeartRateResult {
  foxFormula: number
  tanakaFormula: number
  gulatiFormula: number
  observedMax: number | null
  recommendedMax: number
  date: string
}

export interface ExerciseHypertensionResult {
  restingSystolic: number
  peakSystolic: number
  systolicRise: number
  excessiveResponse: boolean
  category: string
  date: string
}

export interface RPEResult {
  estimatedRPE: number
  hrPercentMax: number
  category: string
  date: string
}

export interface SCDRiskResult {
  riskScore: number
  riskCategory: string
  markers: { marker: string; status: string; contribution: number }[]
  date: string
}

export interface CoronaryFlowReserveResult {
  estimatedCFR: number
  category: string
  microvascularFunction: string
  date: string
}

export interface ChronotropicCompetenceResult {
  competenceIndex: number
  maxAchievedHR: number
  predictedMaxHR: number
  category: string
  isIncompetent: boolean
  date: string
}

export interface VagalToneResult {
  vagalToneIndex: number
  rmssd: number
  hfPowerProxy: number
  category: string
  date: string
}

export interface PericardialHealthProxyResult {
  healthScore: number
  hrVariabilityFactor: number
  bpFactor: number
  category: string
  date: string
}

export interface PostExerciseRecoveryResult {
  peakHR: number
  recovery1Min: number | null
  recovery2Min: number | null
  recovery5Min: number | null
  halfLifeSeconds: number | null
  recoveryQuality: string
  date: string
}

export interface NocturnalHeartRateResult {
  nighttimeAvg: number
  nighttimeMin: number
  daytimeAvg: number
  dipPercent: number
  pattern: string
  date: string
}

export interface CardiovascularDriftResult {
  driftIndex: number
  hrIncrease: number
  driftRate: number
  category: string
  date: string
}

export interface AtherosclerosisRiskResult {
  riskScore: number
  riskCategory: string
  markers: { marker: string; value: number; contribution: number }[]
  date: string
}

export interface HeartRateReserveResult {
  restingHR: number
  maxHR: number
  hrReserve: number
  targetHR60: number
  targetHR70: number
  targetHR80: number
  targetHR85: number
  date: string
}

export interface CardiacRhythmStabilityResult {
  stabilityScore: number
  rrIntervalCV: number
  arrhythmiaProxy: number
  category: string
  date: string
}

export interface EnduranceIndexResult {
  enduranceIndex: number
  vo2maxContribution: number
  hrRecoveryContribution: number
  restingHRContribution: number
  category: string
  date: string
}

export interface PADRiskResult {
  riskScore: number
  riskCategory: string
  estimatedABI: number
  peripheralPerfusion: string
  date: string
}

export interface AorticStiffnessResult {
  stiffnessIndex: number
  pulsePressure: number
  augmentationIndex: number
  category: string
  date: string
}

export interface ExerciseCapacityResult {
  estimatedMETs: number
  exerciseCapacity: string
  functionalClass: string
  date: string
}

export interface CardiacPowerOutputResult {
  cardiacPowerOutput: number
  cardiacPowerIndex: number
  category: string
  date: string
}

export interface CardiomyopathyRiskResult {
  riskScore: number
  riskCategory: string
  indicators: { indicator: string; value: number; abnormal: boolean }[]
  date: string
}

export interface BloodViscosityProxyResult {
  viscosityIndex: number
  hematocritProxy: number
  category: string
  date: string
}

export interface BaroreflexSensitivityResult {
  brsIndex: number
  sensitivity: string
  hrBpCoupling: number
  category: string
  date: string
}

export interface VentricularCouplingResult {
  couplingRatio: number
  arterialElastance: number
  ventricularElastance: number
  efficiency: string
  date: string
}

export interface HeartFailureRiskResult {
  riskScore: number
  riskCategory: string
  markers: { marker: string; value: number; abnormal: boolean }[]
  date: string
}

export interface PulmonaryVascularResistanceResult {
  estimatedPVR: number
  category: string
  rightHeartStress: string
  date: string
}

export interface CardiacRemodelingResult {
  remodelingIndex: number
  category: string
  indicators: { indicator: string; trend: string; significance: string }[]
  date: string
}

export interface MeanArterialPressureResult {
  map: number
  systolic: number
  diastolic: number
  category: string
  perfusionAdequacy: string
  date: string
}

export interface ThromboembolismRiskResult {
  riskScore: number
  riskCategory: string
  factors: { factor: string; points: number }[]
  date: string
}

export interface CoronaryCalciumProxyResult {
  cacProxy: number
  riskCategory: string
  contributors: { factor: string; weight: number }[]
  date: string
}

export interface HeartRateFragmentationResult {
  fragmentationIndex: number
  pip: number
  ials: number
  pss: number
  category: string
  date: string
}

export interface CardiacOutputReserveResult {
  restingCO: number
  peakCO: number
  coReserve: number
  reserveRatio: number
  category: string
  date: string
}

export interface AneurysmRiskResult {
  riskScore: number
  riskCategory: string
  contributors: { factor: string; contribution: number }[]
  date: string
}

export interface SystemicVascularResistanceResult {
  svr: number
  svrIndex: number
  category: string
  date: string
}

export interface ElectrophysiologicalProxyResult {
  epScore: number
  conductionProxy: number
  repolarizationProxy: number
  arrhythmiaRisk: string
  date: string
}

export interface MicrovascularFunctionResult {
  functionScore: number
  perfusionIndex: number
  endothelialHealth: string
  date: string
}

export interface CardiacSarcopeniaRiskResult {
  riskScore: number
  riskCategory: string
  indicators: { indicator: string; value: number; status: string }[]
  date: string
}

export interface VenousThrombosisRiskResult {
  riskScore: number
  riskCategory: string
  wellsScoreProxy: number
  factors: { factor: string; points: number }[]
  date: string
}

export interface HeartRateOscillationsResult {
  oscillationAmplitude: number
  oscillationFrequency: number
  dominantPeriod: number
  regularity: string
  date: string
}

export interface CardiovascularResilienceResult {
  resilienceScore: number
  components: { name: string; score: number }[]
  category: string
  date: string
}

export interface PulmonaryHypertensionProxyResult {
  riskScore: number
  riskCategory: string
  indicators: { indicator: string; value: number; abnormal: boolean }[]
  date: string
}

export interface CardiacBioageResult {
  bioAge: number
  chronologicalAge: number | null
  ageDelta: number | null
  contributors: { factor: string; impact: number }[]
  category: string
  date: string
}

// ── Algorithm Implementations ───────────────────────────────────

/**
 * 1. Compute heart rate training zones (Karvonen method) based on
 * resting HR and estimated/observed max HR. Calculates time spent
 * in each zone from recent HR data.
 */
export async function computeHeartRateZones(
  userId: string,
  date: Date = new Date(),
): Promise<HeartRateZonesResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)
  const start90 = daysAgo(end, 90)

  const [restingRows, hrRows, maxRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start7, end, 1),
    fetchMetric(db, userId, "heart_rate", start7, end),
    fetchMetric(db, userId, "heart_rate", start90, end),
  ])

  const restingHR = restingRows.length > 0 ? restingRows[0]!.value : 60
  const observedMax = maxRows.length > 0 ? Math.max(...maxRows.map((r) => r.value)) : null
  // Tanaka formula: 208 - 0.7 * age; fallback to 190 if no age data
  const estimatedMax = 190
  const maxHR = observedMax ? Math.max(observedMax, estimatedMax) : estimatedMax

  const zones = [
    { zone: 1, name: "Recovery", minPct: 0.50, maxPct: 0.60 },
    { zone: 2, name: "Aerobic Base", minPct: 0.60, maxPct: 0.70 },
    { zone: 3, name: "Tempo", minPct: 0.70, maxPct: 0.80 },
    { zone: 4, name: "Threshold", minPct: 0.80, maxPct: 0.90 },
    { zone: 5, name: "VO2max", minPct: 0.90, maxPct: 1.00 },
  ]

  const hrReserve = maxHR - restingHR
  const zoneRanges = zones.map((z) => ({
    zone: z.zone,
    name: z.name,
    minBPM: Math.round(restingHR + hrReserve * z.minPct),
    maxBPM: Math.round(restingHR + hrReserve * z.maxPct),
    percentage: (z.maxPct - z.minPct) * 100,
  }))

  const hrValues = hrRows.map((r) => r.value)
  const totalReadings = hrValues.length
  const timeInZones = zoneRanges.map((z) => {
    const inZone = hrValues.filter((v) => v >= z.minBPM && v < z.maxBPM).length
    return {
      zone: z.zone,
      minutes: totalReadings > 0 ? Math.round((inZone / totalReadings) * 7 * 24 * 60) : 0,
      percentage: totalReadings > 0 ? Math.round((inZone / totalReadings) * 1000) / 10 : 0,
    }
  })

  return {
    maxHR,
    restingHR,
    zones: zoneRanges,
    timeInZones,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 2. Estimate VO2max using the Uth–Sørensen–Overgaard–Pedersen formula:
 *    VO2max ≈ 15.3 × (MHR / RHR)
 * Falls back to HR-based estimation if VO2max metric not directly available.
 */
export async function estimateVO2Max(
  userId: string,
  date: Date = new Date(),
): Promise<VO2MaxResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)
  const start90 = daysAgo(end, 90)

  const [vo2Rows, rhrRows, maxHRRows] = await Promise.all([
    fetchMetric(db, userId, "vo2max", start30, end, 1),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "heart_rate", start90, end),
  ])

  let vo2max: number
  let method: string

  if (vo2Rows.length > 0) {
    vo2max = vo2Rows[0]!.value
    method = "device_measured"
  } else {
    const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 65
    const maxHR = maxHRRows.length > 0 ? Math.max(...maxHRRows.map((r) => r.value)) : 190
    // Uth–Sørensen–Overgaard–Pedersen formula
    vo2max = 15.3 * (maxHR / rhr)
    method = "uth_sorensen_overgaard"
  }

  vo2max = Math.round(vo2max * 10) / 10

  let fitnessLevel: string
  if (vo2max >= 55) fitnessLevel = "excellent"
  else if (vo2max >= 45) fitnessLevel = "good"
  else if (vo2max >= 35) fitnessLevel = "average"
  else if (vo2max >= 25) fitnessLevel = "below_average"
  else fitnessLevel = "poor"

  return {
    vo2max,
    method,
    fitnessLevel,
    percentileForAge: null,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 3. Estimate cardiac output (CO = HR × SV). Stroke volume is estimated
 * from pulse pressure (systolic - diastolic) using the Liljestrand-Zander method.
 */
export async function computeCardiacOutput(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacOutputResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [hrRows, bpRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start7, end, 1),
    fetchMetric(db, userId, "blood_pressure", start7, end, 5),
  ])

  const hr = hrRows.length > 0 ? hrRows[0]!.value : 70

  // Estimate stroke volume from pulse pressure (Liljestrand-Zander approximation)
  // SV ∝ PP / (SBP + DBP) × k, simplified estimation
  let estimatedSV = 70 // default mL
  if (bpRows.length > 0) {
    // BP stored as systolic in value, diastolic often in data field
    const systolic = bpRows[0]!.value
    const diastolic = systolic * 0.6 // rough estimate if diastolic not available
    const pulsePressure = systolic - diastolic
    // Liljestrand-Zander: SV = k × PP / (SBP + DBP), k empirically ~1000
    estimatedSV = clamp(1000 * pulsePressure / (systolic + diastolic), 40, 130)
  }

  const cardiacOutput = (hr * estimatedSV) / 1000 // L/min
  const bsa = 1.9 // average body surface area m²
  const cardiacIndex = Math.round((cardiacOutput / bsa) * 100) / 100

  let rating: string
  if (cardiacOutput >= 4.0 && cardiacOutput <= 8.0) rating = "normal"
  else if (cardiacOutput < 4.0) rating = "low"
  else rating = "elevated"

  return {
    estimatedCardiacOutput: Math.round(cardiacOutput * 100) / 100,
    heartRate: hr,
    estimatedStrokeVolume: Math.round(estimatedSV),
    cardiacIndex,
    rating,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 4. Detailed HRV analysis computing RMSSD, SDNN, pNN50, mean RR interval,
 * HRV Triangular Index, and Baevsky stress index from inter-beat intervals
 * derived from heart rate data.
 */
export async function analyzeHeartRateVariability(
  userId: string,
  date: Date = new Date(),
): Promise<HRVAnalysisResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [hrvRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "hrv", start7, end),
    fetchMetric(db, userId, "heart_rate", start7, end),
  ])

  // Convert HR readings to approximate RR intervals (ms)
  const rrIntervals = hrRows
    .filter((r) => r.value > 0)
    .map((r) => 60000 / r.value)

  const hrvValues = hrvRows.map((r) => r.value)

  // RMSSD - from HRV device data or computed from RR intervals
  const rmssdValue = hrvValues.length > 0
    ? mean(hrvValues)
    : rrIntervals.length > 1
      ? rmssd(rrIntervals)
      : 0

  // SDNN - standard deviation of NN intervals
  const sdnnValue = rrIntervals.length > 1 ? stddev(rrIntervals) : 0

  // pNN50 - percentage of successive RR differences > 50ms
  let pnn50 = 0
  if (rrIntervals.length > 1) {
    let count50 = 0
    for (let i = 1; i < rrIntervals.length; i++) {
      if (Math.abs(rrIntervals[i]! - rrIntervals[i - 1]!) > 50) count50++
    }
    pnn50 = (count50 / (rrIntervals.length - 1)) * 100
  }

  const meanRR = rrIntervals.length > 0 ? mean(rrIntervals) : 857 // ~70bpm

  // HRV Triangular Index - total NN intervals / max of NN interval histogram
  let triangularIndex = 0
  if (rrIntervals.length > 10) {
    const binWidth = 7.8125 // ms (1/128 s standard)
    const bins = new Map<number, number>()
    for (const rr of rrIntervals) {
      const bin = Math.floor(rr / binWidth)
      bins.set(bin, (bins.get(bin) ?? 0) + 1)
    }
    const maxBinCount = Math.max(...bins.values())
    triangularIndex = maxBinCount > 0 ? rrIntervals.length / maxBinCount : 0
  }

  // Baevsky Stress Index = AMo / (2 × Mo × MxDMn)
  let stressIndex = 50
  if (rrIntervals.length > 10) {
    const mo = median(rrIntervals)
    const amo = 100 / rrIntervals.length // simplified amplitude of mode
    const mxdmn = Math.max(...rrIntervals) - Math.min(...rrIntervals)
    if (mo > 0 && mxdmn > 0) {
      stressIndex = clamp((amo * 100) / (2 * mo * mxdmn / 1000), 0, 500)
    }
  }

  let autonomicBalance: string
  if (rmssdValue > 50) autonomicBalance = "parasympathetic_dominant"
  else if (rmssdValue > 20) autonomicBalance = "balanced"
  else autonomicBalance = "sympathetic_dominant"

  return {
    rmssd: Math.round(rmssdValue * 10) / 10,
    sdnn: Math.round(sdnnValue * 10) / 10,
    pnn50: Math.round(pnn50 * 10) / 10,
    meanRR: Math.round(meanRR),
    triangularIndex: Math.round(triangularIndex * 10) / 10,
    stressIndex: Math.round(stressIndex),
    autonomicBalance,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 5. HRV frequency domain proxy analysis. Approximates LF/HF power
 * ratio from RR interval variability patterns without full FFT.
 * Uses variance decomposition as a spectral proxy.
 */
export async function computeHrvFrequencyDomain(
  userId: string,
  date: Date = new Date(),
): Promise<HRVFrequencyDomainResult> {
  const db = getDb()
  const end = dayStart(date)
  const start1 = daysAgo(end, 1)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start1, end)
  const rrIntervals = hrRows.filter((r) => r.value > 0).map((r) => 60000 / r.value)

  let lfPower = 0, hfPower = 0, totalPower = 0

  if (rrIntervals.length > 10) {
    // Proxy: slow variations (LF 0.04-0.15 Hz) vs fast variations (HF 0.15-0.4 Hz)
    // Use moving average decomposition as spectral proxy
    const windowSlow = Math.min(25, Math.floor(rrIntervals.length / 4)) // ~LF band
    const windowFast = Math.min(5, Math.floor(rrIntervals.length / 10)) // ~HF band

    // Slow component (LF proxy) - variance of slow-moving average
    const slowMA: number[] = []
    for (let i = windowSlow; i < rrIntervals.length; i++) {
      const window = rrIntervals.slice(i - windowSlow, i)
      slowMA.push(mean(window))
    }

    // Fast component (HF proxy) - variance of residuals from slow MA
    const fastResiduals: number[] = []
    for (let i = 0; i < slowMA.length; i++) {
      fastResiduals.push(rrIntervals[i + windowSlow]! - slowMA[i]!)
    }

    const totalVariance = rrIntervals.length > 1
      ? rrIntervals.reduce((s, v) => s + (v - mean(rrIntervals)) ** 2, 0) / rrIntervals.length
      : 0

    lfPower = slowMA.length > 1 ? stddev(slowMA) ** 2 : totalVariance * 0.4
    hfPower = fastResiduals.length > 1 ? stddev(fastResiduals) ** 2 : totalVariance * 0.3
    totalPower = totalVariance
  }

  const lfHfRatio = hfPower > 0 ? lfPower / hfPower : 1
  const normalizedLF = totalPower > 0 ? (lfPower / (lfPower + hfPower)) * 100 : 50
  const normalizedHF = totalPower > 0 ? (hfPower / (lfPower + hfPower)) * 100 : 50

  let dominantBranch: string
  if (lfHfRatio > 2) dominantBranch = "sympathetic"
  else if (lfHfRatio < 0.5) dominantBranch = "parasympathetic"
  else dominantBranch = "balanced"

  return {
    lfPower: Math.round(lfPower * 100) / 100,
    hfPower: Math.round(hfPower * 100) / 100,
    lfHfRatio: Math.round(lfHfRatio * 100) / 100,
    totalPower: Math.round(totalPower * 100) / 100,
    normalizedLF: Math.round(normalizedLF * 10) / 10,
    normalizedHF: Math.round(normalizedHF * 10) / 10,
    dominantBranch,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 6. Framingham-style cardiovascular risk assessment using available
 * biometric data. Calculates 10-year CVD risk using modified
 * Framingham Risk Score factors.
 */
export async function assessCardiovascularRisk(
  userId: string,
  date: Date = new Date(),
): Promise<CardiovascularRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, rhrRows, spo2Rows, stressRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
    fetchMetric(db, userId, "stress", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
  ])

  const factors: { factor: string; contribution: number; status: string }[] = []
  let totalRisk = 0

  // Blood pressure factor (Framingham: SBP is major predictor)
  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  let bpRisk = 0
  if (systolicAvg >= 180) { bpRisk = 3; factors.push({ factor: "Severe hypertension", contribution: 3, status: "critical" }) }
  else if (systolicAvg >= 160) { bpRisk = 2; factors.push({ factor: "Stage 2 hypertension", contribution: 2, status: "high" }) }
  else if (systolicAvg >= 140) { bpRisk = 1.5; factors.push({ factor: "Stage 1 hypertension", contribution: 1.5, status: "elevated" }) }
  else if (systolicAvg >= 130) { bpRisk = 1; factors.push({ factor: "Elevated blood pressure", contribution: 1, status: "borderline" }) }
  else { bpRisk = 0; factors.push({ factor: "Normal blood pressure", contribution: 0, status: "optimal" }) }
  totalRisk += bpRisk

  // Resting heart rate factor
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  let hrRisk = 0
  if (rhr > 100) { hrRisk = 2; factors.push({ factor: "Tachycardia at rest", contribution: 2, status: "high" }) }
  else if (rhr > 80) { hrRisk = 1; factors.push({ factor: "Elevated resting HR", contribution: 1, status: "moderate" }) }
  else if (rhr > 60) { hrRisk = 0; factors.push({ factor: "Normal resting HR", contribution: 0, status: "normal" }) }
  else { hrRisk = -0.5; factors.push({ factor: "Athletic resting HR", contribution: -0.5, status: "optimal" }) }
  totalRisk += hrRisk

  // HRV / Autonomic function proxy
  const hrValues = hrRows.map((r) => r.value)
  const rrIntervals = hrValues.filter((v) => v > 0).map((v) => 60000 / v)
  const hrvProxy = rrIntervals.length > 2 ? stddev(rrIntervals) : 50
  if (hrvProxy < 20) { totalRisk += 1.5; factors.push({ factor: "Low HRV", contribution: 1.5, status: "high" }) }
  else if (hrvProxy < 40) { totalRisk += 0.5; factors.push({ factor: "Moderate HRV", contribution: 0.5, status: "moderate" }) }
  else { factors.push({ factor: "Good HRV", contribution: 0, status: "normal" }) }

  // Blood oxygen factor
  const spo2Avg = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  if (spo2Avg < 92) { totalRisk += 2; factors.push({ factor: "Low blood oxygen", contribution: 2, status: "critical" }) }
  else if (spo2Avg < 95) { totalRisk += 1; factors.push({ factor: "Borderline oxygen", contribution: 1, status: "moderate" }) }
  else { factors.push({ factor: "Normal oxygen saturation", contribution: 0, status: "normal" }) }

  // Chronic stress factor
  const stressAvg = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : 40
  if (stressAvg > 75) { totalRisk += 1.5; factors.push({ factor: "High chronic stress", contribution: 1.5, status: "high" }) }
  else if (stressAvg > 50) { totalRisk += 0.5; factors.push({ factor: "Moderate stress", contribution: 0.5, status: "moderate" }) }
  else { factors.push({ factor: "Low stress", contribution: 0, status: "normal" }) }

  const riskScore = clamp(Math.round(totalRisk * 10), 0, 100)
  const tenYearRisk = clamp(Math.round(totalRisk * 2.5 * 10) / 10, 0, 50)

  let riskCategory: string
  if (riskScore >= 60) riskCategory = "high"
  else if (riskScore >= 40) riskCategory = "moderate"
  else if (riskScore >= 20) riskCategory = "borderline"
  else riskCategory = "low"

  const recommendations: string[] = []
  if (systolicAvg >= 130) recommendations.push("Monitor blood pressure regularly; consider dietary sodium reduction")
  if (rhr > 80) recommendations.push("Increase aerobic exercise to lower resting heart rate")
  if (hrvProxy < 30) recommendations.push("Practice stress management and deep breathing exercises")
  if (spo2Avg < 95) recommendations.push("Consult physician regarding oxygen saturation levels")
  if (recommendations.length === 0) recommendations.push("Maintain current cardiovascular health habits")

  return {
    riskScore,
    riskCategory,
    tenYearRisk,
    factors,
    recommendations,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 7. Cardiac efficiency score based on rate-pressure product,
 * heart rate reserve utilization, and oxygen pulse proxy.
 */
export async function computeCardiacEfficiency(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacEfficiencyResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)
  const start30 = daysAgo(end, 30)

  const [rhrRows, bpRows, hrRows, vo2Rows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start7, end, 1),
    fetchMetric(db, userId, "blood_pressure", start7, end, 1),
    fetchMetric(db, userId, "heart_rate", start30, end),
    fetchMetric(db, userId, "vo2max", start30, end, 1),
  ])

  const rhr = rhrRows.length > 0 ? rhrRows[0]!.value : 70
  const sbp = bpRows.length > 0 ? bpRows[0]!.value : 120
  const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 180
  const vo2max = vo2Rows.length > 0 ? vo2Rows[0]!.value : null

  // Rate-Pressure Product (RPP) = HR × SBP / 1000 (myocardial oxygen demand indicator)
  // Normal resting RPP: 6-12, lower is more efficient
  const rpp = (rhr * sbp) / 1000

  // HR Reserve utilization - how efficiently the heart uses its reserve
  const hrReserve = maxHR - rhr
  const hrReserveUtil = hrReserve > 0 ? (hrReserve / maxHR) * 100 : 50

  // Oxygen pulse proxy = VO2max / maxHR (mL O2 per heartbeat)
  const o2Pulse = vo2max ? (vo2max * 1000 / 200) / maxHR : (rhr < 65 ? 15 : 12)

  // Composite efficiency score
  // Lower RPP = more efficient (score inversely proportional)
  const rppScore = clamp(100 - (rpp - 6) * 10, 0, 100)
  // Higher HR reserve utilization = better
  const reserveScore = clamp(hrReserveUtil * 1.2, 0, 100)
  // Higher O2 pulse = better
  const o2Score = clamp(o2Pulse * 5, 0, 100)

  const efficiencyScore = Math.round((rppScore * 0.4 + reserveScore * 0.3 + o2Score * 0.3) * 10) / 10

  let rating: string
  if (efficiencyScore >= 80) rating = "excellent"
  else if (efficiencyScore >= 60) rating = "good"
  else if (efficiencyScore >= 40) rating = "average"
  else rating = "below_average"

  return {
    efficiencyScore,
    ratePressureProduct: Math.round(rpp * 100) / 100,
    heartRateReserveUtilization: Math.round(hrReserveUtil * 10) / 10,
    oxygenPulseProxy: Math.round(o2Pulse * 10) / 10,
    rating,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 8. Post-exercise heart rate recovery analysis. Measures HR drop
 * at 1-min and 2-min post peak. Recovery < 12 bpm at 1 min is
 * associated with increased mortality risk (Cole et al., NEJM 1999).
 */
export async function analyzeHeartRateRecovery(
  userId: string,
  date: Date = new Date(),
): Promise<HeartRateRecoveryResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start7, end)

  if (hrRows.length < 10) {
    return {
      recovery1Min: null,
      recovery2Min: null,
      peakHR: 0,
      recoveryRate: "insufficient_data",
      autonomicHealth: "unknown",
      date: end.toISOString().slice(0, 10),
    }
  }

  // Sort chronologically
  const sorted = [...hrRows].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  )

  // Find peak HR and subsequent recovery pattern
  let peakIdx = 0
  let peakHR = 0
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.value > peakHR) {
      peakHR = sorted[i]!.value
      peakIdx = i
    }
  }

  // Look for recovery readings after peak (within ~5 min window)
  const peakTime = new Date(sorted[peakIdx]!.recordedAt).getTime()
  const postPeakReadings = sorted
    .filter((r) => {
      const t = new Date(r.recordedAt).getTime()
      return t > peakTime && t <= peakTime + 5 * 60 * 1000
    })
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())

  let recovery1Min: number | null = null
  let recovery2Min: number | null = null

  for (const r of postPeakReadings) {
    const elapsed = (new Date(r.recordedAt).getTime() - peakTime) / 1000
    if (elapsed >= 50 && elapsed <= 70 && recovery1Min === null) {
      recovery1Min = peakHR - r.value
    }
    if (elapsed >= 110 && elapsed <= 130 && recovery2Min === null) {
      recovery2Min = peakHR - r.value
    }
  }

  // If no exact timing, estimate from available data
  if (recovery1Min === null && postPeakReadings.length >= 1) {
    recovery1Min = peakHR - postPeakReadings[0]!.value
  }
  if (recovery2Min === null && postPeakReadings.length >= 2) {
    recovery2Min = peakHR - postPeakReadings[Math.min(1, postPeakReadings.length - 1)]!.value
  }

  let recoveryRate: string
  let autonomicHealth: string
  if (recovery1Min !== null) {
    if (recovery1Min >= 25) { recoveryRate = "excellent"; autonomicHealth = "strong_vagal_reactivation" }
    else if (recovery1Min >= 18) { recoveryRate = "good"; autonomicHealth = "normal_vagal_tone" }
    else if (recovery1Min >= 12) { recoveryRate = "average"; autonomicHealth = "adequate" }
    else { recoveryRate = "impaired"; autonomicHealth = "reduced_vagal_tone" }
  } else {
    recoveryRate = "insufficient_data"
    autonomicHealth = "unknown"
  }

  return {
    recovery1Min,
    recovery2Min,
    peakHR,
    recoveryRate,
    autonomicHealth,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 9. Arterial stiffness index derived from pulse pressure and HR data.
 * Higher pulse pressure relative to mean arterial pressure indicates
 * increased arterial stiffness (reference: Laurent et al., European Heart Journal).
 */
export async function computeArterialStiffness(
  userId: string,
  date: Date = new Date(),
): Promise<ArterialStiffnessResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const bpRows = await fetchMetric(db, userId, "blood_pressure", start30, end)

  const systolicValues = bpRows.map((r) => r.value)
  const systolicAvg = systolicValues.length > 0 ? mean(systolicValues) : 120
  // Estimate diastolic as ~60-65% of systolic if not separately stored
  const diastolicAvg = systolicAvg * 0.625

  const pulsePressure = systolicAvg - diastolicAvg
  const map = diastolicAvg + pulsePressure / 3

  // Stiffness index = PP / MAP (higher = stiffer arteries)
  const stiffnessIndex = map > 0 ? (pulsePressure / map) * 100 : 0

  // Augmentation proxy from pulse pressure ratio
  const augmentationProxy = pulsePressure > 0
    ? ((systolicAvg - map) / pulsePressure) * 100
    : 0

  let category: string
  if (stiffnessIndex > 55) category = "severe_stiffness"
  else if (stiffnessIndex > 45) category = "moderate_stiffness"
  else if (stiffnessIndex > 35) category = "mild_stiffness"
  else category = "normal"

  // Vascular age estimation: every 5 units above normal adds ~5 years
  const baseAge = 35
  const vascularAge = Math.round(baseAge + (stiffnessIndex - 35) * 1.2)

  return {
    stiffnessIndex: Math.round(stiffnessIndex * 10) / 10,
    pulsePressure: Math.round(pulsePressure * 10) / 10,
    augmentationProxy: Math.round(augmentationProxy * 10) / 10,
    category,
    vascularAge: clamp(vascularAge, 20, 100),
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 10. Assess autonomic nervous system balance (sympathetic vs parasympathetic)
 * using HRV, resting HR, and stress metrics as proxies.
 */
export async function assessAutonomicBalance(
  userId: string,
  date: Date = new Date(),
): Promise<AutonomicBalanceResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [hrvRows, rhrRows, stressRows, respRows] = await Promise.all([
    fetchMetric(db, userId, "hrv", start7, end),
    fetchMetric(db, userId, "resting_heart_rate", start7, end),
    fetchMetric(db, userId, "stress", start7, end),
    fetchMetric(db, userId, "respiratory_rate", start7, end),
  ])

  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const stressAvg = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : 40
  const respRate = respRows.length > 0 ? mean(respRows.map((r) => r.value)) : 15

  // Parasympathetic score: high HRV, low RHR, low stress, low resp rate
  const hrvParaScore = clamp((hrvAvg / 80) * 100, 0, 100)
  const rhrParaScore = clamp((100 - rhr) * 1.5, 0, 100)
  const stressParaScore = clamp(100 - stressAvg, 0, 100)
  const respParaScore = clamp((20 - respRate) * 10, 0, 100)

  const parasympatheticScore = Math.round(
    (hrvParaScore * 0.4 + rhrParaScore * 0.3 + stressParaScore * 0.2 + respParaScore * 0.1) * 10,
  ) / 10

  // Sympathetic score: inverse of parasympathetic indicators
  const sympatheticScore = Math.round((100 - parasympatheticScore) * 10) / 10

  const balanceRatio = parasympatheticScore > 0
    ? Math.round((sympatheticScore / parasympatheticScore) * 100) / 100
    : 99

  let dominance: string
  if (balanceRatio > 1.5) dominance = "sympathetic_dominant"
  else if (balanceRatio < 0.67) dominance = "parasympathetic_dominant"
  else dominance = "balanced"

  let overallStatus: string
  if (parasympatheticScore >= 60) overallStatus = "good_recovery_state"
  else if (parasympatheticScore >= 40) overallStatus = "moderate_balance"
  else overallStatus = "elevated_stress_response"

  return {
    sympatheticScore,
    parasympatheticScore,
    balanceRatio,
    dominance,
    overallStatus,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 11. Cardiac strain score from sustained high heart rate episodes.
 * Based on TRIMP (Training Impulse) concepts where strain accumulates
 * with time spent above threshold HR.
 */
export async function computeCardiacStrain(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacStrainResult> {
  const db = getDb()
  const end = dayStart(date)
  const start1 = daysAgo(end, 1)
  const start7 = daysAgo(end, 7)

  const [hrRows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "heart_rate", start1, end),
    fetchMetric(db, userId, "resting_heart_rate", start7, end, 1),
  ])

  const rhr = rhrRows.length > 0 ? rhrRows[0]!.value : 60
  const threshold = rhr + (190 - rhr) * 0.7 // 70% HR reserve threshold

  const hrValues = hrRows.map((r) => r.value)
  const highHRReadings = hrValues.filter((v) => v > threshold)
  const highHRDuration = highHRReadings.length // proxy for minutes

  // Cumulative load: sum of excess HR above threshold (TRIMP-like)
  const cumulativeLoad = highHRReadings.reduce((sum, v) => sum + (v - threshold), 0)
  const averageExcessHR = highHRReadings.length > 0 ? mean(highHRReadings) - threshold : 0

  // Strain score: normalized 0-100
  const strainScore = clamp(Math.round((cumulativeLoad / 500) * 100), 0, 100)

  let riskLevel: string
  if (strainScore >= 80) riskLevel = "very_high"
  else if (strainScore >= 60) riskLevel = "high"
  else if (strainScore >= 40) riskLevel = "moderate"
  else if (strainScore >= 20) riskLevel = "low"
  else riskLevel = "minimal"

  return {
    strainScore,
    highHRDuration,
    averageExcessHR: Math.round(averageExcessHR * 10) / 10,
    cumulativeLoad: Math.round(cumulativeLoad),
    riskLevel,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 12. Analyze long-term resting heart rate trend over 30 and 90 days.
 * Declining RHR indicates improving cardiovascular fitness;
 * rising RHR may indicate overtraining or declining health.
 */
export async function analyzeRestingHRTrend(
  userId: string,
  date: Date = new Date(),
): Promise<RestingHRTrendResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)
  const start90 = daysAgo(end, 90)

  const [recent, thirtyDay, ninetyDay] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", daysAgo(end, 7), end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start90, end),
  ])

  const currentRHR = recent.length > 0 ? mean(recent.map((r) => r.value)) : 70
  const thirtyDayAvg = thirtyDay.length > 0 ? mean(thirtyDay.map((r) => r.value)) : currentRHR
  const ninetyDayAvg = ninetyDay.length > 0 ? mean(ninetyDay.map((r) => r.value)) : currentRHR

  const values = thirtyDay.map((r) => r.value)
  const regression = linearRegression(values)

  let trend: string
  if (regression.slope < -0.05) trend = "improving"
  else if (regression.slope > 0.05) trend = "declining"
  else trend = "stable"

  const changePercent = ninetyDayAvg > 0
    ? ((currentRHR - ninetyDayAvg) / ninetyDayAvg) * 100
    : 0

  return {
    currentRHR: Math.round(currentRHR * 10) / 10,
    thirtyDayAvg: Math.round(thirtyDayAvg * 10) / 10,
    ninetyDayAvg: Math.round(ninetyDayAvg * 10) / 10,
    trend,
    trendSlope: Math.round(regression.slope * 1000) / 1000,
    changePercent: Math.round(changePercent * 10) / 10,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 13. Aerobic capacity estimate based on VO2max, resting HR,
 * and active minutes. Uses the ACSM metabolic equations
 * for MET estimation.
 */
export async function computeAerobicCapacity(
  userId: string,
  date: Date = new Date(),
): Promise<AerobicCapacityResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [vo2Rows, rhrRows, activeRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "vo2max", start30, end, 1),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "active_minutes", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
  ])

  let vo2max: number
  if (vo2Rows.length > 0) {
    vo2max = vo2Rows[0]!.value
  } else {
    const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
    const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 190
    vo2max = 15.3 * (maxHR / rhr)
  }

  // METs = VO2max / 3.5
  const mets = vo2max / 3.5

  // Reserve capacity = METs - 1 (resting = 1 MET)
  const reserveCapacity = mets - 1

  let fitnessCategory: string
  if (mets >= 14) fitnessCategory = "superior"
  else if (mets >= 12) fitnessCategory = "excellent"
  else if (mets >= 10) fitnessCategory = "good"
  else if (mets >= 8) fitnessCategory = "average"
  else if (mets >= 6) fitnessCategory = "below_average"
  else fitnessCategory = "poor"

  return {
    aerobicCapacity: Math.round(vo2max * 10) / 10,
    mets: Math.round(mets * 10) / 10,
    fitnessCategory,
    reserveCapacity: Math.round(reserveCapacity * 10) / 10,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 14. Hypertension risk assessment from blood pressure patterns.
 * Uses JNC 8 / AHA classification and BP variability as
 * predictors of future hypertension.
 */
export async function assessHypertensionRisk(
  userId: string,
  date: Date = new Date(),
): Promise<HypertensionRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const bpRows = await fetchMetric(db, userId, "blood_pressure", start30, end)

  const systolicValues = bpRows.map((r) => r.value)
  const systolicAvg = systolicValues.length > 0 ? mean(systolicValues) : 120
  const diastolicAvg = systolicAvg * 0.625 // estimate if not separate

  const systolicSD = systolicValues.length > 1 ? stddev(systolicValues) : 0
  const variabilityScore = clamp(systolicSD * 3, 0, 100)

  // AHA Blood Pressure Classification
  let bpCategory: string
  if (systolicAvg >= 180 || diastolicAvg >= 120) bpCategory = "hypertensive_crisis"
  else if (systolicAvg >= 140 || diastolicAvg >= 90) bpCategory = "stage_2_hypertension"
  else if (systolicAvg >= 130 || diastolicAvg >= 80) bpCategory = "stage_1_hypertension"
  else if (systolicAvg >= 120) bpCategory = "elevated"
  else bpCategory = "normal"

  // Risk score considering average + variability
  let baseRisk = 0
  if (bpCategory === "hypertensive_crisis") baseRisk = 90
  else if (bpCategory === "stage_2_hypertension") baseRisk = 70
  else if (bpCategory === "stage_1_hypertension") baseRisk = 50
  else if (bpCategory === "elevated") baseRisk = 30
  else baseRisk = 10

  // High variability adds risk (Rothwell et al., Lancet 2010)
  const variabilityRisk = variabilityScore > 50 ? 15 : variabilityScore > 30 ? 8 : 0
  const riskScore = clamp(baseRisk + variabilityRisk, 0, 100)

  let riskCategory: string
  if (riskScore >= 70) riskCategory = "high"
  else if (riskScore >= 40) riskCategory = "moderate"
  else riskCategory = "low"

  return {
    riskScore,
    riskCategory,
    systolicAvg: Math.round(systolicAvg * 10) / 10,
    diastolicAvg: Math.round(diastolicAvg * 10) / 10,
    bpCategory,
    variabilityScore: Math.round(variabilityScore * 10) / 10,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 15. Pulse wave velocity estimation from blood pressure and heart rate data.
 * PWV is the gold standard for arterial stiffness measurement.
 * Uses the Bramwell-Hill equation proxy: PWV ∝ √(PP / (ΔV/V)).
 */
export async function computePulseWaveVelocity(
  userId: string,
  date: Date = new Date(),
): Promise<PulseWaveVelocityResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end, 1),
  ])

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const diastolicAvg = systolicAvg * 0.625
  const pulsePressure = systolicAvg - diastolicAvg
  const map = diastolicAvg + pulsePressure / 3
  const rhr = rhrRows.length > 0 ? rhrRows[0]!.value : 70

  // Simplified PWV estimation using Bramwell-Hill relationship
  // PWV ≈ √(MAP × 133.322 / (ρ × ΔD/D))
  // Simplified to empirical: PWV ≈ 4 + (age_proxy * 0.1) + (PP * 0.03)
  // Age proxy from resting HR and BP
  const ageProxy = (rhr * 0.3 + systolicAvg * 0.2) - 40
  const estimatedPWV = 4 + (ageProxy * 0.05) + (pulsePressure * 0.04)

  let category: string
  if (estimatedPWV > 12) category = "severe_stiffness"
  else if (estimatedPWV > 10) category = "moderate_stiffness"
  else if (estimatedPWV > 8) category = "mild_stiffness"
  else category = "normal"

  const arterialHealthScore = clamp(Math.round(100 - (estimatedPWV - 5) * 10), 0, 100)

  return {
    estimatedPWV: Math.round(estimatedPWV * 10) / 10,
    category,
    ageAdjustedPercentile: null,
    arterialHealthScore,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 16. Blood pressure variability analysis including short-term (beat-to-beat)
 * and day-to-day variability. High BPV is an independent predictor of
 * cardiovascular events (Rothwell et al., Lancet 2010).
 */
export async function analyzeBloodPressureVariability(
  userId: string,
  date: Date = new Date(),
): Promise<BloodPressureVariabilityResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const bpRows = await fetchMetric(db, userId, "blood_pressure", start30, end)

  const systolicValues = bpRows.map((r) => r.value)
  const diastolicValues = systolicValues.map((v) => v * 0.625)

  const averageSystolic = systolicValues.length > 0 ? mean(systolicValues) : 120
  const averageDiastolic = diastolicValues.length > 0 ? mean(diastolicValues) : 75
  const systolicVariability = systolicValues.length > 1 ? stddev(systolicValues) : 0
  const diastolicVariability = diastolicValues.length > 1 ? stddev(diastolicValues) : 0

  // Nocturnal dipping analysis requires time-of-day data
  // Approximate by comparing lower quartile (nighttime proxy) vs upper quartile
  let dippingStatus: string | null = null
  if (systolicValues.length >= 8) {
    const sorted = [...systolicValues].sort((a, b) => a - b)
    const lowerQ = mean(sorted.slice(0, Math.floor(sorted.length / 4)))
    const upperQ = mean(sorted.slice(Math.floor(sorted.length * 3 / 4)))
    const dipPercent = upperQ > 0 ? ((upperQ - lowerQ) / upperQ) * 100 : 0

    if (dipPercent >= 10 && dipPercent <= 20) dippingStatus = "normal_dipper"
    else if (dipPercent > 20) dippingStatus = "extreme_dipper"
    else if (dipPercent >= 0) dippingStatus = "non_dipper"
    else dippingStatus = "reverse_dipper"
  }

  let variabilityCategory: string
  if (systolicVariability > 15) variabilityCategory = "high"
  else if (systolicVariability > 10) variabilityCategory = "moderate"
  else variabilityCategory = "normal"

  return {
    systolicVariability: Math.round(systolicVariability * 10) / 10,
    diastolicVariability: Math.round(diastolicVariability * 10) / 10,
    averageSystolic: Math.round(averageSystolic * 10) / 10,
    averageDiastolic: Math.round(averageDiastolic * 10) / 10,
    dippingStatus,
    variabilityCategory,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 17. Heart rate complexity analysis using sample entropy.
 * Healthy hearts show higher complexity (more irregular);
 * reduced complexity predicts adverse outcomes (Costa et al., 2005).
 */
export async function computeHeartRateComplexity(
  userId: string,
  date: Date = new Date(),
): Promise<HeartRateComplexityResult> {
  const db = getDb()
  const end = dayStart(date)
  const start1 = daysAgo(end, 1)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start1, end)
  const hrValues = hrRows.map((r) => r.value)

  const rrIntervals = hrValues.filter((v) => v > 0).map((v) => 60000 / v)

  const sampEn = rrIntervals.length >= 20 ? sampleEntropy(rrIntervals, 2) : 0

  // Complexity index normalized 0-100
  // Healthy SampEn typically 1.0-2.0; pathological < 0.5
  const complexityIndex = clamp(Math.round(sampEn * 50), 0, 100)

  let category: string
  let healthImplication: string
  if (sampEn > 1.5) { category = "high_complexity"; healthImplication = "Healthy cardiac dynamics with strong nonlinear variability" }
  else if (sampEn > 1.0) { category = "normal_complexity"; healthImplication = "Normal heart rate complexity" }
  else if (sampEn > 0.5) { category = "reduced_complexity"; healthImplication = "Reduced complexity may indicate early autonomic dysfunction" }
  else { category = "low_complexity"; healthImplication = "Low complexity may indicate impaired cardiac regulation" }

  return {
    sampleEntropy: Math.round(sampEn * 1000) / 1000,
    complexityIndex,
    category,
    healthImplication,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 18. Atrial fibrillation risk scoring based on available cardio markers.
 * Uses a modified CHARGE-AF model considering HR irregularity, BP, and age proxies.
 */
export async function assessAtrialFibrillationRisk(
  userId: string,
  date: Date = new Date(),
): Promise<AtrialFibrillationRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [hrRows, bpRows, rhrRows, hrvRows] = await Promise.all([
    fetchMetric(db, userId, "heart_rate", start30, end),
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "hrv", start30, end),
  ])

  const factors: { factor: string; present: boolean; weight: number }[] = []
  let score = 0

  // HR irregularity (coefficient of variation of RR intervals)
  const rrIntervals = hrRows.filter((r) => r.value > 0).map((r) => 60000 / r.value)
  const rrCV = rrIntervals.length > 5 ? coefficientOfVariation(rrIntervals) : 0
  const irregularHR = rrCV > 0.15
  factors.push({ factor: "Heart rate irregularity (CV > 15%)", present: irregularHR, weight: 2 })
  if (irregularHR) score += 2

  // Hypertension
  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const hypertension = systolicAvg >= 140
  factors.push({ factor: "Hypertension (SBP >= 140)", present: hypertension, weight: 1.5 })
  if (hypertension) score += 1.5

  // Elevated resting HR
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const elevatedRHR = rhr > 85
  factors.push({ factor: "Elevated resting heart rate (> 85 bpm)", present: elevatedRHR, weight: 1 })
  if (elevatedRHR) score += 1

  // Low HRV (reduced vagal tone)
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const lowHRV = hrvAvg < 20
  factors.push({ factor: "Low heart rate variability (< 20ms)", present: lowHRV, weight: 1.5 })
  if (lowHRV) score += 1.5

  // Enlarged pulse pressure (proxy for left atrial enlargement)
  const pulsePressure = systolicAvg - systolicAvg * 0.625
  const widePP = pulsePressure > 60
  factors.push({ factor: "Wide pulse pressure (> 60 mmHg)", present: widePP, weight: 1 })
  if (widePP) score += 1

  const riskScore = clamp(Math.round(score * 14), 0, 100)

  let riskCategory: string
  if (riskScore >= 60) riskCategory = "high"
  else if (riskScore >= 35) riskCategory = "moderate"
  else riskCategory = "low"

  let recommendation: string
  if (riskScore >= 60) recommendation = "Consider ECG monitoring and cardiology consultation"
  else if (riskScore >= 35) recommendation = "Regular pulse checks and periodic ECG screening recommended"
  else recommendation = "Continue regular cardiovascular monitoring"

  return {
    riskScore,
    riskCategory,
    factors,
    recommendation,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 19. Myocardial workload estimation via Rate-Pressure Product (RPP).
 * RPP = HR × SBP, a validated proxy for myocardial oxygen consumption
 * (Gobel et al., Circulation 1978).
 */
export async function computeMyocardialWorkload(
  userId: string,
  date: Date = new Date(),
): Promise<MyocardialWorkloadResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [rhrRows, bpRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start7, end, 1),
    fetchMetric(db, userId, "blood_pressure", start7, end),
    fetchMetric(db, userId, "heart_rate", start7, end),
  ])

  const restingHR = rhrRows.length > 0 ? rhrRows[0]!.value : 70
  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const peakHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : null

  // Resting RPP
  const restingRPP = (restingHR * systolicAvg) / 1000

  // Peak RPP (if peak HR available, assume SBP rises ~20% at peak)
  const peakRPP = peakHR ? (peakHR * systolicAvg * 1.2) / 1000 : null

  let myocardialOxygenDemand: string
  if (restingRPP < 8) myocardialOxygenDemand = "low"
  else if (restingRPP < 12) myocardialOxygenDemand = "normal"
  else if (restingRPP < 15) myocardialOxygenDemand = "elevated"
  else myocardialOxygenDemand = "high"

  let workloadCategory: string
  if (restingRPP < 7) workloadCategory = "efficient"
  else if (restingRPP < 10) workloadCategory = "normal"
  else if (restingRPP < 14) workloadCategory = "moderate"
  else workloadCategory = "high"

  return {
    ratePressureProduct: Math.round(restingRPP * 100) / 100,
    myocardialOxygenDemand,
    workloadCategory,
    restingWorkload: Math.round(restingRPP * 100) / 100,
    peakWorkload: peakRPP ? Math.round(peakRPP * 100) / 100 : null,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 20. Orthostatic intolerance detection from HR and BP changes.
 * Orthostatic hypotension: SBP drop >= 20 mmHg or DBP drop >= 10 mmHg
 * POTS: HR increase >= 30 bpm upon standing (Sheldon et al., Heart Rhythm 2015).
 */
export async function analyzeOrthostatic(
  userId: string,
  date: Date = new Date(),
): Promise<OrthostaticResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [hrRows, bpRows] = await Promise.all([
    fetchMetric(db, userId, "heart_rate", start7, end),
    fetchMetric(db, userId, "blood_pressure", start7, end),
  ])

  // Analyze HR for sudden increases (standing proxy)
  let hrChange: number | null = null
  if (hrRows.length >= 10) {
    const sorted = [...hrRows].sort(
      (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    )
    // Find largest HR jump within a short window
    let maxJump = 0
    for (let i = 1; i < sorted.length; i++) {
      const jump = sorted[i]!.value - sorted[i - 1]!.value
      const timeDiff = (new Date(sorted[i]!.recordedAt).getTime() -
        new Date(sorted[i - 1]!.recordedAt).getTime()) / 1000
      if (timeDiff < 300 && jump > maxJump) {
        maxJump = jump
      }
    }
    hrChange = maxJump > 5 ? maxJump : null
  }

  // Analyze BP for drops
  let bpChange: number | null = null
  if (bpRows.length >= 4) {
    const bpValues = bpRows.map((r) => r.value)
    // Find largest drop
    let maxDrop = 0
    for (let i = 1; i < bpValues.length; i++) {
      const drop = bpValues[i - 1]! - bpValues[i]!
      if (drop > maxDrop) maxDrop = drop
    }
    bpChange = maxDrop > 5 ? -maxDrop : null
  }

  const orthostaticIntolerance =
    (hrChange !== null && hrChange >= 30) ||
    (bpChange !== null && bpChange <= -20)

  let severity: string
  if (hrChange !== null && hrChange >= 40) severity = "severe"
  else if (hrChange !== null && hrChange >= 30) severity = "moderate"
  else if (bpChange !== null && bpChange <= -20) severity = "moderate"
  else if (hrChange !== null && hrChange >= 20) severity = "mild"
  else severity = "none"

  return {
    hrChange,
    bpChange,
    orthostaticIntolerance,
    severity,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 21. Vascular age estimation comparing arterial health indicators
 * to population norms. Based on D'Agostino vascular age concept.
 */
export async function computeVascularAge(
  userId: string,
  date: Date = new Date(),
): Promise<VascularAgeResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, rhrRows, hrvRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "hrv", start30, end),
  ])

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const pulsePressure = systolicAvg - systolicAvg * 0.625

  // Base vascular age from pulse pressure (norm PP ~40 at age 30, increases ~1/year)
  const ppAge = 30 + (pulsePressure - 40) * 1.2

  // RHR adjustment (optimal ~55-60 = young, >80 = older)
  const rhrAdjust = (rhr - 60) * 0.4

  // HRV adjustment (high HRV = younger vascular system)
  const hrvAdjust = (40 - hrvAvg) * 0.3

  const vascularAge = Math.round(clamp(ppAge + rhrAdjust + hrvAdjust, 18, 100))

  const factors: { factor: string; impact: string }[] = [
    { factor: "Pulse pressure", impact: pulsePressure > 50 ? "aging" : "favorable" },
    { factor: "Resting heart rate", impact: rhr > 75 ? "aging" : "favorable" },
    { factor: "Heart rate variability", impact: hrvAvg < 30 ? "aging" : "favorable" },
  ]

  return {
    vascularAge,
    chronologicalAge: null,
    ageDifference: null,
    factors,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 22. Endothelial function proxy from blood pressure reactivity patterns.
 * Endothelial dysfunction is characterized by impaired vasodilation
 * reflected in BP variability and pulse amplitude (Deanfield et al., 2007).
 */
export async function assessEndothelialFunction(
  userId: string,
  date: Date = new Date(),
): Promise<EndothelialFunctionResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
  ])

  const systolicValues = bpRows.map((r) => r.value)
  const bpReactivity = systolicValues.length > 2
    ? coefficientOfVariation(systolicValues) * 100
    : 5

  // Pulse amplitude ratio (systolic range / mean systolic)
  const systolicMax = systolicValues.length > 0 ? Math.max(...systolicValues) : 130
  const systolicMin = systolicValues.length > 0 ? Math.min(...systolicValues) : 110
  const systolicMean = systolicValues.length > 0 ? mean(systolicValues) : 120
  const pulseAmplitudeRatio = systolicMean > 0
    ? ((systolicMax - systolicMin) / systolicMean) * 100
    : 10

  // Function score: moderate reactivity is healthy, very high or very low is bad
  let functionScore: number
  if (bpReactivity >= 3 && bpReactivity <= 8 && pulseAmplitudeRatio >= 5 && pulseAmplitudeRatio <= 20) {
    functionScore = 85
  } else if (bpReactivity > 12 || pulseAmplitudeRatio > 30) {
    functionScore = 35
  } else {
    functionScore = 60
  }

  let category: string
  if (functionScore >= 75) category = "normal"
  else if (functionScore >= 50) category = "mildly_impaired"
  else category = "impaired"

  return {
    functionScore,
    bpReactivity: Math.round(bpReactivity * 10) / 10,
    pulseAmplitudeRatio: Math.round(pulseAmplitudeRatio * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 23. Coronary artery age proxy estimation based on cardiovascular
 * risk factor burden. Higher burden suggests older coronary vasculature.
 */
export async function computeCoronaryAgeEstimate(
  userId: string,
  date: Date = new Date(),
): Promise<CoronaryAgeResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, rhrRows, hrvRows, spo2Rows, stressRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "hrv", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
    fetchMetric(db, userId, "stress", start30, end),
  ])

  let riskFactorBurden = 0

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  if (systolicAvg >= 140) riskFactorBurden += 3
  else if (systolicAvg >= 130) riskFactorBurden += 1.5

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  if (rhr > 85) riskFactorBurden += 2
  else if (rhr > 75) riskFactorBurden += 1

  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  if (hrvAvg < 20) riskFactorBurden += 2
  else if (hrvAvg < 35) riskFactorBurden += 1

  const spo2Avg = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  if (spo2Avg < 94) riskFactorBurden += 1.5

  const stressAvg = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : 40
  if (stressAvg > 70) riskFactorBurden += 1.5

  // Coronary age: base 30 + risk factor burden adjusted years
  const coronaryAge = Math.round(clamp(30 + riskFactorBurden * 4, 18, 100))

  let category: string
  if (riskFactorBurden >= 8) category = "significantly_elevated"
  else if (riskFactorBurden >= 5) category = "moderately_elevated"
  else if (riskFactorBurden >= 2) category = "mildly_elevated"
  else category = "low_burden"

  return {
    coronaryAge,
    riskFactorBurden: Math.round(riskFactorBurden * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 24. Heart rate asymmetry analysis measuring acceleration capacity (AC)
 * and deceleration capacity (DC). DC is a strong predictor of mortality
 * post-MI (Bauer et al., Lancet 2006).
 */
export async function analyzeHeartRateAsymmetry(
  userId: string,
  date: Date = new Date(),
): Promise<HeartRateAsymmetryResult> {
  const db = getDb()
  const end = dayStart(date)
  const start1 = daysAgo(end, 1)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start1, end)
  const rrIntervals = hrRows.filter((r) => r.value > 0).map((r) => 60000 / r.value)

  let accelerations: number[] = []
  let decelerations: number[] = []

  for (let i = 1; i < rrIntervals.length; i++) {
    const diff = rrIntervals[i]! - rrIntervals[i - 1]!
    if (diff > 0) decelerations.push(diff)
    else if (diff < 0) accelerations.push(Math.abs(diff))
  }

  const accelerationCapacity = accelerations.length > 0 ? mean(accelerations) : 0
  const decelerationCapacity = decelerations.length > 0 ? mean(decelerations) : 0

  // Asymmetry index = (DC - AC) / (DC + AC)
  const total = accelerationCapacity + decelerationCapacity
  const asymmetryIndex = total > 0 ? (decelerationCapacity - accelerationCapacity) / total : 0

  let category: string
  if (decelerationCapacity > 4.5) category = "normal"
  else if (decelerationCapacity > 2.5) category = "mildly_reduced"
  else category = "severely_reduced"

  return {
    accelerationCapacity: Math.round(accelerationCapacity * 100) / 100,
    decelerationCapacity: Math.round(decelerationCapacity * 100) / 100,
    asymmetryIndex: Math.round(asymmetryIndex * 1000) / 1000,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 25. Bradycardia risk scoring based on frequency and severity of
 * low heart rate episodes (< 60 bpm at rest, < 50 bpm is clinical concern).
 */
export async function computeBradycardiaRisk(
  userId: string,
  date: Date = new Date(),
): Promise<BradycardiaRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
  ])

  const rhrValues = rhrRows.map((r) => r.value)
  const hrValues = hrRows.map((r) => r.value)
  const allValues = [...rhrValues, ...hrValues]

  const bradyEpisodes = allValues.filter((v) => v < 50).length
  const lowestHR = allValues.length > 0 ? Math.min(...allValues) : 70
  const averageRestingHR = rhrValues.length > 0 ? mean(rhrValues) : 70

  let riskScore = 0
  if (lowestHR < 40) riskScore += 40
  else if (lowestHR < 45) riskScore += 25
  else if (lowestHR < 50) riskScore += 10

  riskScore += Math.min(bradyEpisodes * 3, 30)

  if (averageRestingHR < 50) riskScore += 20
  else if (averageRestingHR < 55) riskScore += 10

  riskScore = clamp(riskScore, 0, 100)

  let riskCategory: string
  if (riskScore >= 60) riskCategory = "high"
  else if (riskScore >= 30) riskCategory = "moderate"
  else if (riskScore >= 10) riskCategory = "low"
  else riskCategory = "minimal"

  return {
    riskScore,
    bradycardiaEpisodes: bradyEpisodes,
    lowestHR,
    averageRestingHR: Math.round(averageRestingHR * 10) / 10,
    riskCategory,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 26. Tachycardia risk scoring based on frequency of elevated resting
 * heart rate episodes (> 100 bpm). Persistent tachycardia is associated
 * with cardiomyopathy risk (Umana et al., Am J Med 2003).
 */
export async function computeTachycardiaRisk(
  userId: string,
  date: Date = new Date(),
): Promise<TachycardiaRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const rhrRows = await fetchMetric(db, userId, "resting_heart_rate", start30, end)
  const rhrValues = rhrRows.map((r) => r.value)

  const tachyEpisodes = rhrValues.filter((v) => v > 100).length
  const highestRHR = rhrValues.length > 0 ? Math.max(...rhrValues) : 70
  const averageRestingHR = rhrValues.length > 0 ? mean(rhrValues) : 70

  let riskScore = 0
  if (highestRHR > 130) riskScore += 35
  else if (highestRHR > 120) riskScore += 25
  else if (highestRHR > 110) riskScore += 15
  else if (highestRHR > 100) riskScore += 8

  riskScore += Math.min(tachyEpisodes * 4, 35)

  if (averageRestingHR > 90) riskScore += 20
  else if (averageRestingHR > 80) riskScore += 10

  riskScore = clamp(riskScore, 0, 100)

  let riskCategory: string
  if (riskScore >= 60) riskCategory = "high"
  else if (riskScore >= 30) riskCategory = "moderate"
  else if (riskScore >= 10) riskCategory = "low"
  else riskCategory = "minimal"

  return {
    riskScore,
    tachycardiaEpisodes: tachyEpisodes,
    highestRestingHR: highestRHR,
    averageRestingHR: Math.round(averageRestingHR * 10) / 10,
    riskCategory,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 27. Proxy for valvular heart function using pulse pressure ratio,
 * HR regularity, and blood pressure patterns. Wide pulse pressure
 * may suggest aortic regurgitation; narrow may suggest stenosis.
 */
export async function assessValvularHealthProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ValvularHealthProxyResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
  ])

  const systolicValues = bpRows.map((r) => r.value)
  const systolicAvg = systolicValues.length > 0 ? mean(systolicValues) : 120
  const diastolicAvg = systolicAvg * 0.625
  const pulsePressure = systolicAvg - diastolicAvg
  const pulsePressureRatio = systolicAvg > 0 ? pulsePressure / systolicAvg : 0.35

  // HR regularity from coefficient of variation
  const hrValues = hrRows.map((r) => r.value)
  const hrRegularity = hrValues.length > 2
    ? clamp(100 - coefficientOfVariation(hrValues) * 200, 0, 100)
    : 80

  // Health score: normal PP ratio ~0.35-0.45, HR regularity high
  let ppScore: number
  if (pulsePressureRatio >= 0.30 && pulsePressureRatio <= 0.50) ppScore = 90
  else if (pulsePressureRatio > 0.50) ppScore = 60 // wide PP
  else ppScore = 65 // narrow PP

  const healthScore = Math.round(ppScore * 0.6 + hrRegularity * 0.4)

  let category: string
  if (healthScore >= 80) category = "normal"
  else if (healthScore >= 60) category = "mild_concern"
  else category = "further_evaluation_needed"

  return {
    healthScore,
    pulsePressureRatio: Math.round(pulsePressureRatio * 1000) / 1000,
    hrRegularity: Math.round(hrRegularity * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 28. Cardiac reserve: the difference between resting and maximal cardiac
 * performance. Higher reserve indicates better cardiovascular fitness
 * and functional capacity.
 */
export async function computeCardiacReserve(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacReserveResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)
  const start90 = daysAgo(end, 90)

  const [rhrRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start7, end, 1),
    fetchMetric(db, userId, "heart_rate", start90, end),
  ])

  const restingHR = rhrRows.length > 0 ? rhrRows[0]!.value : 70
  const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 185
  const heartRateReserve = maxHR - restingHR

  // Average exercise HR
  const exerciseHRs = hrRows.filter((r) => r.value > restingHR + 20).map((r) => r.value)
  const avgExerciseHR = exerciseHRs.length > 0 ? mean(exerciseHRs) : restingHR + 40
  const percentReserveUsed = heartRateReserve > 0
    ? ((avgExerciseHR - restingHR) / heartRateReserve) * 100
    : 50

  let reserveCategory: string
  if (heartRateReserve >= 120) reserveCategory = "excellent"
  else if (heartRateReserve >= 100) reserveCategory = "good"
  else if (heartRateReserve >= 80) reserveCategory = "average"
  else if (heartRateReserve >= 60) reserveCategory = "below_average"
  else reserveCategory = "limited"

  return {
    restingHR,
    maxHR,
    heartRateReserve,
    percentReserveUsed: Math.round(percentReserveUsed * 10) / 10,
    reserveCategory,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 29. Overall circulatory efficiency combining cardiac output efficiency,
 * peripheral resistance, oxygen delivery, and vascular compliance.
 */
export async function analyzeCirculatoryEfficiency(
  userId: string,
  date: Date = new Date(),
): Promise<CirculatoryEfficiencyResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, bpRows, spo2Rows, hrvRows, vo2Rows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
    fetchMetric(db, userId, "hrv", start30, end),
    fetchMetric(db, userId, "vo2max", start30, end, 1),
  ])

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const sbp = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const spo2 = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  const hrv = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40

  // Cardiac pump efficiency: lower resting HR with adequate BP = more efficient
  const pumpScore = clamp(100 - (rhr - 50) * 1.5, 0, 100)

  // Oxygen delivery: SpO2 efficiency
  const o2Score = clamp((spo2 - 90) * 10, 0, 100)

  // Vascular compliance: from HRV and BP
  const vascularScore = clamp((hrv / 60) * 70 + (130 - sbp) * 0.5, 0, 100)

  // Autonomic regulation
  const autonomicScore = clamp((hrv / 50) * 80, 0, 100)

  const components = [
    { name: "Cardiac pump efficiency", score: Math.round(pumpScore), weight: 0.35 },
    { name: "Oxygen delivery", score: Math.round(o2Score), weight: 0.25 },
    { name: "Vascular compliance", score: Math.round(vascularScore), weight: 0.25 },
    { name: "Autonomic regulation", score: Math.round(autonomicScore), weight: 0.15 },
  ]

  const efficiencyScore = Math.round(
    components.reduce((sum, c) => sum + c.score * c.weight, 0) * 10,
  ) / 10

  let category: string
  if (efficiencyScore >= 80) category = "excellent"
  else if (efficiencyScore >= 60) category = "good"
  else if (efficiencyScore >= 40) category = "fair"
  else category = "poor"

  return { efficiencyScore, components, category, date: end.toISOString().slice(0, 10) }
}

/**
 * 30. Blood pressure load: percentage of BP readings exceeding
 * hypertensive thresholds. A load > 40% is clinically significant
 * (White, Am J Hypertens 1991).
 */
export async function computeBloodPressureLoad(
  userId: string,
  date: Date = new Date(),
): Promise<BloodPressureLoadResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const bpRows = await fetchMetric(db, userId, "blood_pressure", start30, end)

  const systolicValues = bpRows.map((r) => r.value)
  const totalReadings = systolicValues.length
  const systolicThreshold = 140
  const diastolicThreshold = 90

  const aboveSystolic = systolicValues.filter((v) => v >= systolicThreshold).length
  const diastolicValues = systolicValues.map((v) => v * 0.625)
  const aboveDiastolic = diastolicValues.filter((v) => v >= diastolicThreshold).length
  const aboveThreshold = Math.max(aboveSystolic, aboveDiastolic)

  const systolicLoad = totalReadings > 0 ? (aboveSystolic / totalReadings) * 100 : 0
  const diastolicLoad = totalReadings > 0 ? (aboveDiastolic / totalReadings) * 100 : 0
  const overallLoad = totalReadings > 0 ? (aboveThreshold / totalReadings) * 100 : 0

  let category: string
  if (overallLoad >= 50) category = "severe"
  else if (overallLoad >= 40) category = "significant"
  else if (overallLoad >= 25) category = "moderate"
  else category = "normal"

  return {
    systolicLoad: Math.round(systolicLoad * 10) / 10,
    diastolicLoad: Math.round(diastolicLoad * 10) / 10,
    overallLoad: Math.round(overallLoad * 10) / 10,
    totalReadings,
    aboveThreshold,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 31. Left ventricular hypertrophy risk proxy using the relationship
 * between sustained hypertension and cardiac remodeling.
 * Based on Cornell voltage-duration product concepts.
 */
export async function assessLeftVentricularHypertrophy(
  userId: string,
  date: Date = new Date(),
): Promise<LVHRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start90 = daysAgo(end, 90)

  const [bpRows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start90, end),
    fetchMetric(db, userId, "resting_heart_rate", start90, end),
  ])

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70

  // BP contribution: chronic hypertension drives LVH
  let bpContribution = 0
  if (systolicAvg >= 160) bpContribution = 40
  else if (systolicAvg >= 140) bpContribution = 25
  else if (systolicAvg >= 130) bpContribution = 10

  // HR contribution: sustained tachycardia increases myocardial mass
  let hrContribution = 0
  if (rhr > 90) hrContribution = 20
  else if (rhr > 80) hrContribution = 10

  const riskScore = clamp(bpContribution + hrContribution, 0, 100)

  let riskCategory: string
  if (riskScore >= 50) riskCategory = "high"
  else if (riskScore >= 25) riskCategory = "moderate"
  else riskCategory = "low"

  return {
    riskScore,
    cornellProduct: null,
    bpContribution,
    hrContribution,
    riskCategory,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 32. Ankle-brachial index (ABI) proxy for peripheral artery disease.
 * Estimated from blood pressure patterns and peripheral perfusion
 * indicators. Normal ABI: 1.0-1.4.
 */
export async function computeAnkeBrachialIndex(
  userId: string,
  date: Date = new Date(),
): Promise<AnkleBrachialIndexResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, spo2Rows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
  ])

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const spo2 = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70

  // Estimate ABI from available proxies
  // Normal ankles have slightly higher pressure than brachial
  // Low SpO2 and high RHR may indicate peripheral vascular compromise
  let estimatedABI = 1.1 // baseline normal
  if (spo2 < 94) estimatedABI -= 0.15
  if (spo2 < 92) estimatedABI -= 0.15
  if (systolicAvg > 160) estimatedABI -= 0.1 // severe HTN affects periphery
  if (rhr > 90) estimatedABI -= 0.05

  estimatedABI = Math.round(clamp(estimatedABI, 0.3, 1.4) * 100) / 100

  let padRisk: string
  if (estimatedABI < 0.5) padRisk = "severe_PAD"
  else if (estimatedABI < 0.7) padRisk = "moderate_PAD"
  else if (estimatedABI < 0.9) padRisk = "mild_PAD"
  else padRisk = "normal"

  let peripheralCirculation: string
  if (estimatedABI >= 1.0) peripheralCirculation = "adequate"
  else if (estimatedABI >= 0.8) peripheralCirculation = "borderline"
  else peripheralCirculation = "compromised"

  return {
    estimatedABI,
    padRisk,
    peripheralCirculation,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 33. Heart rate turbulence analysis from HR data patterns.
 * HRT consists of turbulence onset (TO) and turbulence slope (TS).
 * Abnormal HRT predicts mortality (Schmidt et al., Lancet 1999).
 */
export async function analyzeHeartRateTurbulence(
  userId: string,
  date: Date = new Date(),
): Promise<HeartRateTurbulenceResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start7, end)
  const rrIntervals = hrRows.filter((r) => r.value > 0).map((r) => 60000 / r.value)

  let turbulenceOnset = 0
  let turbulenceSlope = 0

  if (rrIntervals.length >= 20) {
    // Find sudden shortening (PVC proxy) followed by compensatory pause
    let bestTO = 0
    let bestTS = 0

    for (let i = 2; i < rrIntervals.length - 15; i++) {
      const prePVC = rrIntervals[i - 1]!
      const pvc = rrIntervals[i]!
      const postPVC = rrIntervals[i + 1]!

      // PVC pattern: short interval followed by long compensatory pause
      if (pvc < prePVC * 0.85 && postPVC > prePVC * 1.05) {
        // Turbulence Onset = (RR1 + RR2 - 2*RR0) / (2*RR0) × 100
        const rr0 = prePVC
        const rr1 = rrIntervals[i + 1]!
        const rr2 = rrIntervals[i + 2] ?? rr1
        const to = ((rr1 + rr2 - 2 * rr0) / (2 * rr0)) * 100

        // Turbulence Slope = max positive slope of 5 consecutive RR intervals
        const postIntervals = rrIntervals.slice(i + 1, i + 16)
        let maxSlope = 0
        for (let j = 0; j <= postIntervals.length - 5; j++) {
          const segment = postIntervals.slice(j, j + 5)
          const reg = linearRegression(segment)
          if (reg.slope > maxSlope) maxSlope = reg.slope
        }

        if (Math.abs(to) > Math.abs(bestTO)) {
          bestTO = to
          bestTS = maxSlope
        }
      }
    }

    turbulenceOnset = bestTO
    turbulenceSlope = bestTS
  }

  let category: string
  // Normal: TO < 0%, TS > 2.5 ms/RR
  if (turbulenceOnset < 0 && turbulenceSlope > 2.5) category = "normal"
  else if (turbulenceOnset >= 0 && turbulenceSlope <= 2.5) category = "abnormal_both"
  else category = "borderline"

  let prognosticValue: string
  if (category === "normal") prognosticValue = "favorable"
  else if (category === "abnormal_both") prognosticValue = "increased_risk"
  else prognosticValue = "intermediate"

  return {
    turbulenceOnset: Math.round(turbulenceOnset * 100) / 100,
    turbulenceSlope: Math.round(turbulenceSlope * 100) / 100,
    category,
    prognosticValue,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 34. Diastolic function proxy from blood pressure patterns.
 * Elevated diastolic BP and narrow pulse pressure may indicate
 * diastolic dysfunction (Zile & Brutsaert, Circulation 2002).
 */
export async function computeDiastolicFunction(
  userId: string,
  date: Date = new Date(),
): Promise<DiastolicFunctionResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const bpRows = await fetchMetric(db, userId, "blood_pressure", start30, end)

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const diastolicBP = systolicAvg * 0.625
  const pulsePressure = systolicAvg - diastolicBP

  // Scoring: normal diastolic < 80, normal PP 30-60
  let functionScore = 80

  if (diastolicBP > 90) functionScore -= 25
  else if (diastolicBP > 85) functionScore -= 15
  else if (diastolicBP > 80) functionScore -= 5

  if (pulsePressure < 25) functionScore -= 20 // narrow PP suggests stiffness
  else if (pulsePressure > 65) functionScore -= 15 // wide PP suggests reduced compliance

  functionScore = clamp(functionScore, 0, 100)

  let category: string
  if (functionScore >= 70) category = "normal"
  else if (functionScore >= 50) category = "grade_1_dysfunction"
  else if (functionScore >= 30) category = "grade_2_dysfunction"
  else category = "grade_3_dysfunction"

  return {
    functionScore,
    diastolicBP: Math.round(diastolicBP * 10) / 10,
    pulsePressure: Math.round(pulsePressure * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 35. Stroke risk scoring using a CHA₂DS₂-VASc-like model adapted
 * for wearable data. Original score predicts stroke in AF patients
 * (Lip et al., Chest 2010).
 */
export async function assessStrokeRisk(
  userId: string,
  date: Date = new Date(),
): Promise<StrokeRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start90 = daysAgo(end, 90)

  const [bpRows, hrRows, rhrRows, hrvRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start90, end),
    fetchMetric(db, userId, "heart_rate", start90, end),
    fetchMetric(db, userId, "resting_heart_rate", start90, end),
    fetchMetric(db, userId, "hrv", start90, end),
  ])

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const rrIntervals = hrRows.filter((r) => r.value > 0).map((r) => 60000 / r.value)
  const rrCV = rrIntervals.length > 5 ? coefficientOfVariation(rrIntervals) : 0.05

  const factors: { factor: string; points: number; present: boolean }[] = []
  let totalPoints = 0

  // Hypertension (1 point)
  const hasHTN = systolicAvg >= 140
  factors.push({ factor: "Hypertension", points: 1, present: hasHTN })
  if (hasHTN) totalPoints += 1

  // Heart rate irregularity as AF proxy (2 points)
  const hasIrregularity = rrCV > 0.12
  factors.push({ factor: "Heart rate irregularity (AF proxy)", points: 2, present: hasIrregularity })
  if (hasIrregularity) totalPoints += 2

  // Vascular disease proxy - high pulse pressure (1 point)
  const highPP = (systolicAvg - systolicAvg * 0.625) > 60
  factors.push({ factor: "Vascular disease (wide pulse pressure)", points: 1, present: highPP })
  if (highPP) totalPoints += 1

  // Elevated resting HR as cardiac failure proxy (1 point)
  const elevatedRHR = rhr > 90
  factors.push({ factor: "Elevated resting heart rate", points: 1, present: elevatedRHR })
  if (elevatedRHR) totalPoints += 1

  // Low HRV as autonomic dysfunction (1 point)
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const lowHRV = hrvAvg < 20
  factors.push({ factor: "Low heart rate variability", points: 1, present: lowHRV })
  if (lowHRV) totalPoints += 1

  const riskScore = clamp(Math.round(totalPoints * 16.7), 0, 100)

  // Annual stroke risk approximation from CHA2DS2-VASc
  const annualRiskLookup: Record<number, number> = { 0: 0.2, 1: 0.6, 2: 2.2, 3: 3.2, 4: 4.8, 5: 7.2, 6: 9.7 }
  const annualRiskPercent = annualRiskLookup[Math.min(totalPoints, 6)] ?? 12

  let riskCategory: string
  if (totalPoints >= 4) riskCategory = "high"
  else if (totalPoints >= 2) riskCategory = "moderate"
  else riskCategory = "low"

  return {
    riskScore,
    riskCategory,
    factors,
    annualRiskPercent,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 36. Estimated total peripheral resistance (TPR) using the simplified
 * hemodynamic equation: SVR = (MAP - CVP) / CO × 80.
 * Normal SVR: 900-1400 dynes·s/cm⁵.
 */
export async function computePeripheralResistance(
  userId: string,
  date: Date = new Date(),
): Promise<PeripheralResistanceResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [bpRows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start7, end),
    fetchMetric(db, userId, "resting_heart_rate", start7, end, 1),
  ])

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const diastolicAvg = systolicAvg * 0.625
  const pulsePressure = systolicAvg - diastolicAvg
  const map = diastolicAvg + pulsePressure / 3
  const rhr = rhrRows.length > 0 ? rhrRows[0]!.value : 70

  // Estimate cardiac output: CO = HR × SV / 1000
  const estimatedSV = 70 // mL
  const estimatedCO = (rhr * estimatedSV) / 1000 // L/min

  // SVR = (MAP - CVP) / CO × 80, CVP assumed ~5 mmHg
  const cvp = 5
  const estimatedSVR = estimatedCO > 0
    ? ((map - cvp) / estimatedCO) * 80
    : 1200

  let category: string
  if (estimatedSVR > 1600) category = "elevated"
  else if (estimatedSVR > 1400) category = "high_normal"
  else if (estimatedSVR >= 900) category = "normal"
  else category = "low"

  return {
    estimatedSVR: Math.round(estimatedSVR),
    category,
    meanArterialPressure: Math.round(map * 10) / 10,
    estimatedCardiacOutput: Math.round(estimatedCO * 100) / 100,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 37. Nocturnal blood pressure dipping pattern analysis.
 * Normal dipping: 10-20% decline in nighttime BP.
 * Non-dipping is associated with increased CV risk
 * (O'Brien et al., Hypertension 1988).
 */
export async function analyzeBloodPressureDipping(
  userId: string,
  date: Date = new Date(),
): Promise<BloodPressureDippingResult> {
  const db = getDb()
  const end = dayStart(date)
  const start14 = daysAgo(end, 14)

  const bpRows = await fetchMetric(db, userId, "blood_pressure", start14, end)

  if (bpRows.length < 4) {
    return {
      daytimeAvgSystolic: 120,
      nighttimeAvgSystolic: 110,
      dippingPercent: 8.3,
      dippingCategory: "insufficient_data",
      clinicalSignificance: "Insufficient BP readings for dipping analysis",
      date: end.toISOString().slice(0, 10),
    }
  }

  // Approximate day/night by sorting values - lower readings assumed nighttime
  const sorted = [...bpRows.map((r) => r.value)].sort((a, b) => a - b)
  const cutoff = Math.floor(sorted.length / 3)
  const nighttimeValues = sorted.slice(0, cutoff)
  const daytimeValues = sorted.slice(cutoff)

  const daytimeAvg = mean(daytimeValues)
  const nighttimeAvg = mean(nighttimeValues)
  const dippingPercent = daytimeAvg > 0 ? ((daytimeAvg - nighttimeAvg) / daytimeAvg) * 100 : 0

  let dippingCategory: string
  if (dippingPercent >= 20) dippingCategory = "extreme_dipper"
  else if (dippingPercent >= 10) dippingCategory = "normal_dipper"
  else if (dippingPercent >= 0) dippingCategory = "non_dipper"
  else dippingCategory = "reverse_dipper"

  let clinicalSignificance: string
  if (dippingCategory === "normal_dipper") clinicalSignificance = "Normal nocturnal BP pattern"
  else if (dippingCategory === "non_dipper") clinicalSignificance = "Non-dipping associated with increased CV and renal risk"
  else if (dippingCategory === "reverse_dipper") clinicalSignificance = "Reverse dipping strongly associated with adverse CV outcomes"
  else clinicalSignificance = "Extreme dipping may increase risk of nocturnal ischemia"

  return {
    daytimeAvgSystolic: Math.round(daytimeAvg * 10) / 10,
    nighttimeAvgSystolic: Math.round(nighttimeAvg * 10) / 10,
    dippingPercent: Math.round(dippingPercent * 10) / 10,
    dippingCategory,
    clinicalSignificance,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 38. Cardiac fitness age estimation comparing heart fitness metrics
 * to age-based population norms (Nes et al., Med Sci Sports Exerc 2013).
 */
export async function computeCardiacFitnessAge(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacFitnessAgeResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, hrvRows, vo2Rows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "hrv", start30, end),
    fetchMetric(db, userId, "vo2max", start30, end, 1),
    fetchMetric(db, userId, "heart_rate", start30, end),
  ])

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const hrv = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40

  let vo2max: number
  if (vo2Rows.length > 0) {
    vo2max = vo2Rows[0]!.value
  } else {
    const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 190
    vo2max = 15.3 * (maxHR / rhr)
  }

  // Fitness age model (simplified Nes et al.):
  // Higher VO2max = younger fitness age
  // Average VO2max by age: 20y=47, 30y=44, 40y=41, 50y=37, 60y=33, 70y=29
  // Roughly: fitnessAge = 80 - (vo2max - 15) * 1.1
  const fitnessAge = Math.round(clamp(80 - (vo2max - 15) * 1.1, 18, 90))

  // Adjust for RHR (lower = younger)
  const rhrAdjust = (rhr - 60) * 0.2
  // Adjust for HRV (higher = younger)
  const hrvAdjust = (40 - hrv) * 0.15

  const adjustedFitnessAge = Math.round(clamp(fitnessAge + rhrAdjust + hrvAdjust, 18, 90))

  let fitnessCategory: string
  if (adjustedFitnessAge < 30) fitnessCategory = "superior"
  else if (adjustedFitnessAge < 40) fitnessCategory = "excellent"
  else if (adjustedFitnessAge < 50) fitnessCategory = "good"
  else if (adjustedFitnessAge < 60) fitnessCategory = "average"
  else fitnessCategory = "below_average"

  return {
    fitnessAge: adjustedFitnessAge,
    chronologicalAge: null,
    ageDelta: null,
    fitnessCategory,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 39. Metabolic syndrome risk assessment from cardiovascular markers.
 * Based on IDF/AHA criteria: requires ≥3 of 5 criteria for diagnosis.
 */
export async function assessMetabolicSyndrome(
  userId: string,
  date: Date = new Date(),
): Promise<MetabolicSyndromeResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, weightRows, bodyFatRows, rhrRows, stressRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "weight", start30, end, 1),
    fetchMetric(db, userId, "body_fat", start30, end, 1),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "stress", start30, end),
  ])

  const criteria: { criterion: string; met: boolean; value: number | null }[] = []
  let criteriaCount = 0

  // Elevated BP (≥130/85)
  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : null
  const elevatedBP = systolicAvg !== null && systolicAvg >= 130
  criteria.push({ criterion: "Elevated blood pressure (≥130 mmHg)", met: elevatedBP, value: systolicAvg })
  if (elevatedBP) criteriaCount++

  // Elevated body fat (proxy for waist circumference) > 25%
  const bodyFat = bodyFatRows.length > 0 ? bodyFatRows[0]!.value : null
  const elevatedBF = bodyFat !== null && bodyFat > 25
  criteria.push({ criterion: "Elevated body fat (>25%)", met: elevatedBF, value: bodyFat })
  if (elevatedBF) criteriaCount++

  // Elevated resting HR (proxy for metabolic dysfunction)
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : null
  const elevatedHR = rhr !== null && rhr > 85
  criteria.push({ criterion: "Elevated resting heart rate (>85 bpm)", met: elevatedHR, value: rhr ? Math.round(rhr * 10) / 10 : null })
  if (elevatedHR) criteriaCount++

  // Chronic stress (metabolic impact proxy)
  const stressAvg = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : null
  const highStress = stressAvg !== null && stressAvg > 65
  criteria.push({ criterion: "High chronic stress score (>65)", met: highStress, value: stressAvg ? Math.round(stressAvg * 10) / 10 : null })
  if (highStress) criteriaCount++

  // Low fitness (BMI-related proxy from weight)
  const weight = weightRows.length > 0 ? weightRows[0]!.value : null
  const overweight = weight !== null && weight > 90 // simplified threshold
  criteria.push({ criterion: "Elevated weight (>90 kg)", met: overweight, value: weight })
  if (overweight) criteriaCount++

  const riskScore = clamp(criteriaCount * 20, 0, 100)

  let riskCategory: string
  if (criteriaCount >= 3) riskCategory = "metabolic_syndrome"
  else if (criteriaCount >= 2) riskCategory = "at_risk"
  else riskCategory = "low_risk"

  return {
    riskScore,
    criteriaCount,
    criteria,
    riskCategory,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 40. Maximum heart rate estimation using multiple established formulas.
 * Compares Fox (220-age), Tanaka (208-0.7×age), and Gulati (206-0.88×age)
 * against observed max HR from data.
 */
export async function computeMaxHeartRate(
  userId: string,
  date: Date = new Date(),
): Promise<MaxHeartRateResult> {
  const db = getDb()
  const end = dayStart(date)
  const start90 = daysAgo(end, 90)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start90, end)

  const observedMax = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : null

  // Estimate age from resting HR patterns (rough heuristic)
  // Without actual age, we use a default of 35 and note the limitation
  const estimatedAge = 35

  const foxFormula = Math.round(220 - estimatedAge) // Fox et al., 1971
  const tanakaFormula = Math.round(208 - 0.7 * estimatedAge) // Tanaka et al., 2001
  const gulatiFormula = Math.round(206 - 0.88 * estimatedAge) // Gulati et al., 2010 (women)

  // Recommended max: use Tanaka as most validated, but prefer observed if higher
  const recommendedMax = observedMax
    ? Math.max(tanakaFormula, observedMax)
    : tanakaFormula

  return {
    foxFormula,
    tanakaFormula,
    gulatiFormula,
    observedMax,
    recommendedMax,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 41. Exercise-induced hypertension analysis. Exaggerated BP response
 * during exercise (SBP > 210 in men, > 190 in women) predicts
 * future hypertension (Miyai et al., Hypertension 2000).
 */
export async function analyzeExerciseHypertension(
  userId: string,
  date: Date = new Date(),
): Promise<ExerciseHypertensionResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
  ])

  const bpValues = bpRows.map((r) => r.value)
  const restingSystolic = bpValues.length > 0
    ? mean(bpValues.slice(0, Math.min(5, bpValues.length)))
    : 120

  // Peak systolic during exercise (highest BP reading)
  const peakSystolic = bpValues.length > 0 ? Math.max(...bpValues) : restingSystolic
  const systolicRise = peakSystolic - restingSystolic

  // Exaggerated response: rise > 60 mmHg or peak > 200 mmHg
  const excessiveResponse = systolicRise > 60 || peakSystolic > 200

  let category: string
  if (peakSystolic > 210) category = "severely_exaggerated"
  else if (peakSystolic > 190 || systolicRise > 60) category = "exaggerated"
  else if (systolicRise > 40) category = "high_normal"
  else category = "normal"

  return {
    restingSystolic: Math.round(restingSystolic * 10) / 10,
    peakSystolic: Math.round(peakSystolic * 10) / 10,
    systolicRise: Math.round(systolicRise * 10) / 10,
    excessiveResponse,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 42. Rate of Perceived Exertion (RPE) estimation from heart rate data
 * using Borg's RPE scale (6-20) correlated to %HRmax.
 * RPE ≈ %HRmax / 10 + 6 approximately.
 */
export async function computeRateOfPerceivedExertion(
  userId: string,
  date: Date = new Date(),
): Promise<RPEResult> {
  const db = getDb()
  const end = dayStart(date)
  const start1 = daysAgo(end, 1)
  const start90 = daysAgo(end, 90)

  const [hrRows, allHR] = await Promise.all([
    fetchMetric(db, userId, "heart_rate", start1, end),
    fetchMetric(db, userId, "heart_rate", start90, end),
  ])

  const currentAvgHR = hrRows.length > 0 ? mean(hrRows.map((r) => r.value)) : 80
  const maxHR = allHR.length > 0 ? Math.max(...allHR.map((r) => r.value)) : 190

  const hrPercentMax = maxHR > 0 ? (currentAvgHR / maxHR) * 100 : 50

  // Borg RPE estimation: RPE ≈ HR%max / 10 + 6 (rough correlation)
  // More precise: RPE = 6 + (HR - HRrest) / (HRmax - HRrest) × 14
  const estimatedRPE = clamp(Math.round(6 + (hrPercentMax / 100) * 14), 6, 20)

  let category: string
  if (estimatedRPE >= 17) category = "very_hard"
  else if (estimatedRPE >= 14) category = "hard"
  else if (estimatedRPE >= 12) category = "somewhat_hard"
  else if (estimatedRPE >= 10) category = "light"
  else category = "very_light"

  return {
    estimatedRPE,
    hrPercentMax: Math.round(hrPercentMax * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 43. Sudden cardiac death (SCD) risk marker assessment.
 * Evaluates known SCD predictors: reduced HRV, abnormal HRT,
 * T-wave alternans proxy, and impaired HR recovery.
 */
export async function assessSuddenCardiacDeathRisk(
  userId: string,
  date: Date = new Date(),
): Promise<SCDRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [hrvRows, rhrRows, hrRows, spo2Rows] = await Promise.all([
    fetchMetric(db, userId, "hrv", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
  ])

  const markers: { marker: string; status: string; contribution: number }[] = []
  let totalRisk = 0

  // Reduced HRV (SDNN < 70ms is moderate risk, < 50ms is high risk)
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 50
  if (hrvAvg < 50) {
    markers.push({ marker: "Reduced HRV (SDNN proxy < 50ms)", status: "abnormal", contribution: 25 })
    totalRisk += 25
  } else if (hrvAvg < 70) {
    markers.push({ marker: "Borderline HRV (SDNN proxy 50-70ms)", status: "borderline", contribution: 10 })
    totalRisk += 10
  } else {
    markers.push({ marker: "Normal HRV", status: "normal", contribution: 0 })
  }

  // Elevated resting HR (> 80 bpm increases SCD risk)
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  if (rhr > 90) {
    markers.push({ marker: "Elevated resting HR (>90 bpm)", status: "abnormal", contribution: 20 })
    totalRisk += 20
  } else if (rhr > 80) {
    markers.push({ marker: "Borderline resting HR (80-90 bpm)", status: "borderline", contribution: 8 })
    totalRisk += 8
  } else {
    markers.push({ marker: "Normal resting HR", status: "normal", contribution: 0 })
  }

  // HR recovery impairment (< 12 bpm at 1 min)
  const hrValues = hrRows.map((r) => r.value)
  const peakHR = hrValues.length > 0 ? Math.max(...hrValues) : 150
  const postPeakMin = hrValues.length > 0 ? Math.min(...hrValues.slice(-5)) : peakHR - 20
  const hrRecovery = peakHR - postPeakMin
  if (hrRecovery < 12) {
    markers.push({ marker: "Impaired HR recovery (<12 bpm)", status: "abnormal", contribution: 25 })
    totalRisk += 25
  } else {
    markers.push({ marker: "Normal HR recovery", status: "normal", contribution: 0 })
  }

  // Low SpO2 episodes
  const spo2Avg = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  if (spo2Avg < 93) {
    markers.push({ marker: "Low blood oxygen (<93%)", status: "abnormal", contribution: 15 })
    totalRisk += 15
  } else {
    markers.push({ marker: "Normal blood oxygen", status: "normal", contribution: 0 })
  }

  const riskScore = clamp(totalRisk, 0, 100)

  let riskCategory: string
  if (riskScore >= 50) riskCategory = "elevated"
  else if (riskScore >= 25) riskCategory = "moderate"
  else riskCategory = "low"

  return {
    riskScore,
    riskCategory,
    markers,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 44. Coronary flow reserve (CFR) proxy estimation.
 * CFR is the ratio of hyperemic to resting coronary flow.
 * Estimated from HR response and BP patterns during activity.
 */
export async function computeCoronaryFlowReserve(
  userId: string,
  date: Date = new Date(),
): Promise<CoronaryFlowReserveResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, hrRows, bpRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
    fetchMetric(db, userId, "blood_pressure", start30, end),
  ])

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const peakHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 160
  const sbp = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120

  // Resting RPP and peak RPP proxy for myocardial oxygen demand
  const restingRPP = rhr * sbp
  const peakRPP = peakHR * sbp * 1.15 // SBP rises ~15% with exercise

  // CFR proxy = peak flow / resting flow ≈ peak RPP / resting RPP
  // Normal CFR ≥ 2.5
  const estimatedCFR = restingRPP > 0 ? peakRPP / restingRPP : 2.0

  let category: string
  if (estimatedCFR >= 3.0) category = "normal"
  else if (estimatedCFR >= 2.5) category = "borderline_normal"
  else if (estimatedCFR >= 2.0) category = "mildly_reduced"
  else category = "significantly_reduced"

  let microvascularFunction: string
  if (estimatedCFR >= 2.5) microvascularFunction = "normal"
  else if (estimatedCFR >= 2.0) microvascularFunction = "mildly_impaired"
  else microvascularFunction = "impaired"

  return {
    estimatedCFR: Math.round(estimatedCFR * 100) / 100,
    category,
    microvascularFunction,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 45. Chronotropic competence: the ability of the heart to increase its rate
 * appropriately with exercise. Chronotropic incompetence (CI < 0.80) predicts
 * adverse outcomes (Lauer et al., JAMA 1999).
 */
export async function analyzeChronotropicCompetence(
  userId: string,
  date: Date = new Date(),
): Promise<ChronotropicCompetenceResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
  ])

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const maxAchievedHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 150
  const predictedMaxHR = 208 - 0.7 * 35 // Tanaka formula with estimated age

  // Chronotropic Index = (maxAchievedHR - RHR) / (predictedMaxHR - RHR)
  const hrReserve = predictedMaxHR - rhr
  const competenceIndex = hrReserve > 0
    ? (maxAchievedHR - rhr) / hrReserve
    : 0.5

  const isIncompetent = competenceIndex < 0.80

  let category: string
  if (competenceIndex >= 1.0) category = "excellent"
  else if (competenceIndex >= 0.9) category = "good"
  else if (competenceIndex >= 0.8) category = "adequate"
  else if (competenceIndex >= 0.7) category = "mildly_impaired"
  else category = "chronotropic_incompetence"

  return {
    competenceIndex: Math.round(competenceIndex * 1000) / 1000,
    maxAchievedHR,
    predictedMaxHR: Math.round(predictedMaxHR),
    category,
    isIncompetent,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 46. Vagal tone estimation from HRV metrics. Higher vagal tone indicates
 * better parasympathetic function and is cardioprotective
 * (Thayer et al., Neuroscience & Biobehavioral Reviews 2012).
 */
export async function computeVagalTone(
  userId: string,
  date: Date = new Date(),
): Promise<VagalToneResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [hrvRows, hrRows, respRows] = await Promise.all([
    fetchMetric(db, userId, "hrv", start7, end),
    fetchMetric(db, userId, "heart_rate", start7, end),
    fetchMetric(db, userId, "respiratory_rate", start7, end),
  ])

  const rmssdVal = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 30

  // HF power proxy from respiratory sinus arrhythmia
  // HR variations synchronized with breathing indicate vagal modulation
  const rrIntervals = hrRows.filter((r) => r.value > 0).map((r) => 60000 / r.value)
  let hfPowerProxy = 0
  if (rrIntervals.length > 10) {
    // Fast component variance as HF proxy
    const diffs = []
    for (let i = 1; i < rrIntervals.length; i++) {
      diffs.push(Math.abs(rrIntervals[i]! - rrIntervals[i - 1]!))
    }
    hfPowerProxy = diffs.length > 0 ? mean(diffs) : 0
  }

  // Vagal tone index: composite of RMSSD and HF power
  // ln(RMSSD) is often used as vagal index (Laborde et al., 2017)
  const lnRmssd = rmssdVal > 0 ? Math.log(rmssdVal) : 0
  const vagalToneIndex = Math.round(clamp(lnRmssd * 20, 0, 100) * 10) / 10

  let category: string
  if (vagalToneIndex >= 70) category = "high_vagal_tone"
  else if (vagalToneIndex >= 50) category = "moderate_vagal_tone"
  else if (vagalToneIndex >= 30) category = "low_vagal_tone"
  else category = "very_low_vagal_tone"

  return {
    vagalToneIndex,
    rmssd: Math.round(rmssdVal * 10) / 10,
    hfPowerProxy: Math.round(hfPowerProxy * 100) / 100,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 47. Pericardial health proxy estimation from HR variability patterns
 * and blood pressure. Pericardial effusion/constriction may manifest
 * as reduced HRV and specific BP patterns.
 */
export async function assessPericardialHealthProxy(
  userId: string,
  date: Date = new Date(),
): Promise<PericardialHealthProxyResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [hrvRows, bpRows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "hrv", start30, end),
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
  ])

  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const pulsePressure = systolicAvg - systolicAvg * 0.625

  // HRV factor: reduced HRV may indicate pericardial constraint
  const hrVariabilityFactor = clamp((hrvAvg / 50) * 100, 0, 100)

  // BP factor: narrow pulse pressure may indicate tamponade/constriction
  let bpFactor = 80
  if (pulsePressure < 25) bpFactor = 40
  else if (pulsePressure < 30) bpFactor = 60
  else if (pulsePressure > 70) bpFactor = 65

  // Tachycardia as compensatory mechanism
  const hrPenalty = rhr > 100 ? 20 : rhr > 90 ? 10 : 0

  const healthScore = clamp(
    Math.round((hrVariabilityFactor * 0.5 + bpFactor * 0.5) - hrPenalty),
    0, 100,
  )

  let category: string
  if (healthScore >= 75) category = "normal"
  else if (healthScore >= 50) category = "borderline"
  else category = "potentially_abnormal"

  return {
    healthScore,
    hrVariabilityFactor: Math.round(hrVariabilityFactor * 10) / 10,
    bpFactor: Math.round(bpFactor * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 48. Detailed post-exercise recovery rate analysis including 1-min,
 * 2-min, and 5-min recovery values plus exponential decay half-life.
 */
export async function computePostExerciseRecoveryRate(
  userId: string,
  date: Date = new Date(),
): Promise<PostExerciseRecoveryResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start7, end)

  if (hrRows.length < 5) {
    return {
      peakHR: 0,
      recovery1Min: null,
      recovery2Min: null,
      recovery5Min: null,
      halfLifeSeconds: null,
      recoveryQuality: "insufficient_data",
      date: end.toISOString().slice(0, 10),
    }
  }

  const sorted = [...hrRows].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  )

  // Find peak HR
  let peakHR = 0
  let peakTime = 0
  for (const r of sorted) {
    if (r.value > peakHR) {
      peakHR = r.value
      peakTime = new Date(r.recordedAt).getTime()
    }
  }

  // Track recovery at different time points
  const postPeak = sorted.filter(
    (r) => new Date(r.recordedAt).getTime() > peakTime,
  )

  let rec1: number | null = null, rec2: number | null = null, rec5: number | null = null

  for (const r of postPeak) {
    const elapsed = (new Date(r.recordedAt).getTime() - peakTime) / 1000
    if (elapsed >= 50 && elapsed <= 70 && rec1 === null) rec1 = peakHR - r.value
    if (elapsed >= 110 && elapsed <= 130 && rec2 === null) rec2 = peakHR - r.value
    if (elapsed >= 280 && elapsed <= 320 && rec5 === null) rec5 = peakHR - r.value
  }

  // Exponential decay half-life estimation
  // HR(t) = HRrest + (HRpeak - HRrest) × e^(-t/τ)
  // Half-life = τ × ln(2)
  let halfLifeSeconds: number | null = null
  if (rec1 !== null && rec1 > 0) {
    const hrDrop = peakHR - (peakHR - rec1)
    const fractionRemaining = 1 - rec1 / (peakHR - 60)
    if (fractionRemaining > 0 && fractionRemaining < 1) {
      const tau = -60 / Math.log(fractionRemaining)
      halfLifeSeconds = Math.round(tau * Math.LN2)
    }
  }

  let recoveryQuality: string
  if (rec1 !== null && rec1 >= 25) recoveryQuality = "excellent"
  else if (rec1 !== null && rec1 >= 18) recoveryQuality = "good"
  else if (rec1 !== null && rec1 >= 12) recoveryQuality = "average"
  else if (rec1 !== null) recoveryQuality = "impaired"
  else recoveryQuality = "insufficient_data"

  return {
    peakHR,
    recovery1Min: rec1,
    recovery2Min: rec2,
    recovery5Min: rec5,
    halfLifeSeconds,
    recoveryQuality,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 49. Nocturnal heart rate pattern analysis. Nighttime HR patterns
 * reveal autonomic function and sleep quality. The nocturnal HR dip
 * should be 10-20% below daytime average (Hermida et al., Chronobiol Int 2013).
 */
export async function analyzeNocturnalHeartRate(
  userId: string,
  date: Date = new Date(),
): Promise<NocturnalHeartRateResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start7, end)

  if (hrRows.length < 10) {
    return {
      nighttimeAvg: 0,
      nighttimeMin: 0,
      daytimeAvg: 0,
      dipPercent: 0,
      pattern: "insufficient_data",
      date: end.toISOString().slice(0, 10),
    }
  }

  const hrValues = hrRows.map((r) => r.value)
  const sorted = [...hrValues].sort((a, b) => a - b)

  // Approximate: lowest 30% = nighttime, upper 70% = daytime
  const nightCutoff = Math.floor(sorted.length * 0.3)
  const nighttimeValues = sorted.slice(0, nightCutoff)
  const daytimeValues = sorted.slice(nightCutoff)

  const nighttimeAvg = mean(nighttimeValues)
  const nighttimeMin = Math.min(...nighttimeValues)
  const daytimeAvg = mean(daytimeValues)

  const dipPercent = daytimeAvg > 0
    ? ((daytimeAvg - nighttimeAvg) / daytimeAvg) * 100
    : 0

  let pattern: string
  if (dipPercent >= 15 && dipPercent <= 25) pattern = "optimal_nocturnal_dip"
  else if (dipPercent >= 10) pattern = "normal_dip"
  else if (dipPercent >= 5) pattern = "blunted_dip"
  else if (dipPercent >= 0) pattern = "non_dipper"
  else pattern = "reverse_dipping"

  return {
    nighttimeAvg: Math.round(nighttimeAvg * 10) / 10,
    nighttimeMin,
    daytimeAvg: Math.round(daytimeAvg * 10) / 10,
    dipPercent: Math.round(dipPercent * 10) / 10,
    pattern,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 50. Cardiovascular drift index during sustained exercise.
 * CV drift is the progressive increase in HR and decrease in
 * stroke volume during prolonged exercise at constant workload
 * (Coyle & Gonzalez-Alonso, J Appl Physiol 2001).
 */
export async function computeCardiovascularDriftIndex(
  userId: string,
  date: Date = new Date(),
): Promise<CardiovascularDriftResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start7, end)

  // Find sustained exercise periods (HR > resting + 40 for extended time)
  const sorted = [...hrRows].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  )

  const resting = sorted.length > 0
    ? percentile(sorted.map((r) => r.value), 25)
    : 65
  const exerciseThreshold = resting + 40

  // Find longest exercise bout
  let maxBoutLength = 0
  let boutStart = -1
  let currentBoutStart = -1

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.value > exerciseThreshold) {
      if (currentBoutStart === -1) currentBoutStart = i
    } else {
      if (currentBoutStart !== -1) {
        const boutLen = i - currentBoutStart
        if (boutLen > maxBoutLength) {
          maxBoutLength = boutLen
          boutStart = currentBoutStart
        }
        currentBoutStart = -1
      }
    }
  }

  let driftIndex = 0
  let hrIncrease = 0
  let driftRate = 0

  if (maxBoutLength >= 10 && boutStart >= 0) {
    const bout = sorted.slice(boutStart, boutStart + maxBoutLength)
    const firstHalf = bout.slice(0, Math.floor(bout.length / 2))
    const secondHalf = bout.slice(Math.floor(bout.length / 2))

    const firstAvg = mean(firstHalf.map((r) => r.value))
    const secondAvg = mean(secondHalf.map((r) => r.value))

    hrIncrease = secondAvg - firstAvg
    driftRate = firstAvg > 0 ? (hrIncrease / firstAvg) * 100 : 0
    driftIndex = clamp(Math.round(driftRate * 5), 0, 100)
  }

  let category: string
  if (driftRate > 10) category = "significant_drift"
  else if (driftRate > 5) category = "moderate_drift"
  else if (driftRate > 2) category = "mild_drift"
  else category = "minimal_drift"

  return {
    driftIndex,
    hrIncrease: Math.round(hrIncrease * 10) / 10,
    driftRate: Math.round(driftRate * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 51. Atherosclerosis risk scoring using available cardiovascular markers.
 * Based on established risk factors: hypertension, elevated HR,
 * reduced HRV, and inflammatory markers proxy.
 */
export async function assessAtherosclerosisRisk(
  userId: string,
  date: Date = new Date(),
): Promise<AtherosclerosisRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start90 = daysAgo(end, 90)

  const [bpRows, rhrRows, hrvRows, stressRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start90, end),
    fetchMetric(db, userId, "resting_heart_rate", start90, end),
    fetchMetric(db, userId, "hrv", start90, end),
    fetchMetric(db, userId, "stress", start90, end),
  ])

  const markers: { marker: string; value: number; contribution: number }[] = []
  let totalRisk = 0

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const bpContrib = systolicAvg >= 140 ? 30 : systolicAvg >= 130 ? 15 : 5
  markers.push({ marker: "Systolic BP", value: Math.round(systolicAvg), contribution: bpContrib })
  totalRisk += bpContrib

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const hrContrib = rhr > 85 ? 20 : rhr > 75 ? 10 : 3
  markers.push({ marker: "Resting heart rate", value: Math.round(rhr), contribution: hrContrib })
  totalRisk += hrContrib

  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const hrvContrib = hrvAvg < 25 ? 25 : hrvAvg < 40 ? 12 : 3
  markers.push({ marker: "HRV (autonomic function)", value: Math.round(hrvAvg), contribution: hrvContrib })
  totalRisk += hrvContrib

  const stressAvg = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : 40
  const stressContrib = stressAvg > 70 ? 20 : stressAvg > 50 ? 10 : 2
  markers.push({ marker: "Chronic stress", value: Math.round(stressAvg), contribution: stressContrib })
  totalRisk += stressContrib

  const riskScore = clamp(totalRisk, 0, 100)

  let riskCategory: string
  if (riskScore >= 60) riskCategory = "high"
  else if (riskScore >= 35) riskCategory = "moderate"
  else riskCategory = "low"

  return { riskScore, riskCategory, markers, date: end.toISOString().slice(0, 10) }
}

/**
 * 52. Heart rate reserve (HRR) using the Karvonen formula.
 * Calculates target HR zones based on HR reserve method.
 * THR = RHR + intensity% × (MHR - RHR) (Karvonen et al., 1957).
 */
export async function computeHeartRateReserve(
  userId: string,
  date: Date = new Date(),
): Promise<HeartRateReserveResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)
  const start90 = daysAgo(end, 90)

  const [rhrRows, hrRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "heart_rate", start90, end),
  ])

  const restingHR = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 65
  const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 190
  const hrReserve = maxHR - restingHR

  // Karvonen target HR at various intensities
  const targetHR60 = Math.round(restingHR + 0.60 * hrReserve)
  const targetHR70 = Math.round(restingHR + 0.70 * hrReserve)
  const targetHR80 = Math.round(restingHR + 0.80 * hrReserve)
  const targetHR85 = Math.round(restingHR + 0.85 * hrReserve)

  return {
    restingHR: Math.round(restingHR),
    maxHR,
    hrReserve: Math.round(hrReserve),
    targetHR60,
    targetHR70,
    targetHR80,
    targetHR85,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 53. Cardiac rhythm stability analysis using RR interval
 * coefficient of variation and arrhythmia detection proxies.
 */
export async function analyzeCardiacRhythmStability(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacRhythmStabilityResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start7, end)
  const rrIntervals = hrRows.filter((r) => r.value > 0).map((r) => 60000 / r.value)

  const rrCV = rrIntervals.length > 5 ? coefficientOfVariation(rrIntervals) : 0.05

  // Count potential premature beats (RR interval < 80% of mean)
  const meanRR = rrIntervals.length > 0 ? mean(rrIntervals) : 857
  const prematureBeats = rrIntervals.filter((rr) => rr < meanRR * 0.8).length
  const arrhythmiaProxy = rrIntervals.length > 0
    ? (prematureBeats / rrIntervals.length) * 100
    : 0

  // Stability score: very regular = high score, but some variability is normal
  // Normal sinus rhythm CV: 4-10%
  let stabilityScore: number
  if (rrCV >= 0.04 && rrCV <= 0.10) stabilityScore = 90
  else if (rrCV < 0.04) stabilityScore = 75 // too regular may be abnormal
  else if (rrCV <= 0.15) stabilityScore = 65
  else stabilityScore = 40

  // Penalize for premature beats
  stabilityScore = clamp(stabilityScore - arrhythmiaProxy * 2, 0, 100)

  let category: string
  if (stabilityScore >= 80) category = "stable_sinus_rhythm"
  else if (stabilityScore >= 60) category = "mostly_stable"
  else if (stabilityScore >= 40) category = "mild_irregularity"
  else category = "significant_irregularity"

  return {
    stabilityScore: Math.round(stabilityScore),
    rrIntervalCV: Math.round(rrCV * 10000) / 10000,
    arrhythmiaProxy: Math.round(arrhythmiaProxy * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 54. Cardiovascular endurance index combining VO2max estimate,
 * HR recovery, resting HR, and active minutes as indicators
 * of sustained aerobic capacity.
 */
export async function computeEnduranceIndex(
  userId: string,
  date: Date = new Date(),
): Promise<EnduranceIndexResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [vo2Rows, rhrRows, hrRows, activeRows] = await Promise.all([
    fetchMetric(db, userId, "vo2max", start30, end, 1),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
    fetchMetric(db, userId, "active_minutes", start30, end),
  ])

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 185

  // VO2max contribution
  let vo2max = vo2Rows.length > 0 ? vo2Rows[0]!.value : 15.3 * (maxHR / rhr)
  const vo2Contribution = clamp((vo2max / 60) * 100, 0, 100)

  // HR recovery contribution (estimated from data pattern)
  const hrValues = hrRows.map((r) => r.value)
  const peakHR = hrValues.length > 0 ? Math.max(...hrValues) : 160
  const postPeakValues = hrValues.slice(-5)
  const recoveryDrop = postPeakValues.length > 0 ? peakHR - Math.min(...postPeakValues) : 15
  const hrRecoveryContribution = clamp(recoveryDrop * 3, 0, 100)

  // Resting HR contribution (lower = better endurance)
  const restingHRContribution = clamp((90 - rhr) * 2.5, 0, 100)

  // Active minutes bonus
  const totalActiveMin = activeRows.reduce((sum, r) => sum + r.value, 0)
  const activeBonus = clamp(totalActiveMin / 150 * 10, 0, 15) // WHO recommends 150 min/week

  const enduranceIndex = Math.round(
    (vo2Contribution * 0.40 + hrRecoveryContribution * 0.25 + restingHRContribution * 0.35) + activeBonus,
  )

  let category: string
  if (enduranceIndex >= 85) category = "elite"
  else if (enduranceIndex >= 70) category = "excellent"
  else if (enduranceIndex >= 55) category = "good"
  else if (enduranceIndex >= 40) category = "average"
  else category = "below_average"

  return {
    enduranceIndex: clamp(enduranceIndex, 0, 100),
    vo2maxContribution: Math.round(vo2Contribution * 10) / 10,
    hrRecoveryContribution: Math.round(hrRecoveryContribution * 10) / 10,
    restingHRContribution: Math.round(restingHRContribution * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 55. Peripheral artery disease (PAD) risk assessment from available
 * wearable data. PAD is characterized by reduced blood flow to extremities.
 */
export async function assessPeripheralArteryDisease(
  userId: string,
  date: Date = new Date(),
): Promise<PADRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, spo2Rows, rhrRows, stepsRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "steps", start30, end),
  ])

  let riskScore = 0

  // Hypertension is a major PAD risk factor
  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  if (systolicAvg >= 140) riskScore += 25
  else if (systolicAvg >= 130) riskScore += 12

  // Low SpO2 may indicate peripheral perfusion issues
  const spo2Avg = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  if (spo2Avg < 94) riskScore += 20
  else if (spo2Avg < 96) riskScore += 8

  // Elevated resting HR
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  if (rhr > 85) riskScore += 15
  else if (rhr > 75) riskScore += 5

  // Low physical activity (sedentary lifestyle is a risk factor)
  const avgSteps = stepsRows.length > 0 ? mean(stepsRows.map((r) => r.value)) : 5000
  if (avgSteps < 3000) riskScore += 15
  else if (avgSteps < 5000) riskScore += 8

  riskScore = clamp(riskScore, 0, 100)

  // Estimate ABI from risk
  const estimatedABI = Math.round(clamp(1.2 - riskScore * 0.005, 0.4, 1.3) * 100) / 100

  let riskCategory: string
  if (riskScore >= 50) riskCategory = "high"
  else if (riskScore >= 25) riskCategory = "moderate"
  else riskCategory = "low"

  let peripheralPerfusion: string
  if (estimatedABI >= 1.0) peripheralPerfusion = "normal"
  else if (estimatedABI >= 0.8) peripheralPerfusion = "borderline"
  else peripheralPerfusion = "compromised"

  return {
    riskScore,
    riskCategory,
    estimatedABI,
    peripheralPerfusion,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 56. Aortic stiffness proxy estimation from pulse pressure and
 * mean arterial pressure. Aortic stiffness increases with age
 * and is a predictor of CV events (Vlachopoulos et al., JACC 2010).
 */
export async function computeAorticStiffnessProxy(
  userId: string,
  date: Date = new Date(),
): Promise<AorticStiffnessResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
  ])

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const diastolicAvg = systolicAvg * 0.625
  const pulsePressure = systolicAvg - diastolicAvg
  const map = diastolicAvg + pulsePressure / 3
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70

  // Stiffness index (SI) = body height / transit time
  // Proxy: SI ∝ PP² / (SV proxy × MAP)
  const svProxy = 70 // mL estimated stroke volume
  const stiffnessIndex = map > 0 ? (pulsePressure * pulsePressure) / (svProxy * map / 100) : 5

  // Augmentation Index proxy from PP/MAP ratio
  const augmentationIndex = map > 0 ? ((systolicAvg - map) / pulsePressure) * 100 : 33

  let category: string
  if (stiffnessIndex > 12) category = "severe"
  else if (stiffnessIndex > 8) category = "moderate"
  else if (stiffnessIndex > 5) category = "mild"
  else category = "normal"

  return {
    stiffnessIndex: Math.round(stiffnessIndex * 10) / 10,
    pulsePressure: Math.round(pulsePressure * 10) / 10,
    augmentationIndex: Math.round(augmentationIndex * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 57. Exercise capacity estimation in METs (Metabolic Equivalents of Task).
 * Based on achieved heart rate and ACSM metabolic equations.
 * Functional classification per NYHA/Weber criteria.
 */
export async function analyzeExerciseCapacity(
  userId: string,
  date: Date = new Date(),
): Promise<ExerciseCapacityResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [vo2Rows, hrRows, rhrRows, activeRows] = await Promise.all([
    fetchMetric(db, userId, "vo2max", start30, end, 1),
    fetchMetric(db, userId, "heart_rate", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "active_minutes", start30, end),
  ])

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 185

  let vo2max: number
  if (vo2Rows.length > 0) {
    vo2max = vo2Rows[0]!.value
  } else {
    vo2max = 15.3 * (maxHR / rhr)
  }

  const estimatedMETs = vo2max / 3.5

  let exerciseCapacity: string
  if (estimatedMETs >= 12) exerciseCapacity = "high"
  else if (estimatedMETs >= 8) exerciseCapacity = "moderate"
  else if (estimatedMETs >= 5) exerciseCapacity = "low"
  else exerciseCapacity = "very_low"

  // Weber functional classification
  let functionalClass: string
  if (estimatedMETs >= 7) functionalClass = "Class A (no limitation)"
  else if (estimatedMETs >= 5) functionalClass = "Class B (mild limitation)"
  else if (estimatedMETs >= 3) functionalClass = "Class C (moderate limitation)"
  else functionalClass = "Class D (severe limitation)"

  return {
    estimatedMETs: Math.round(estimatedMETs * 10) / 10,
    exerciseCapacity,
    functionalClass,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 58. Cardiac power output (CPO) estimation. CPO is the product of
 * cardiac output and mean arterial pressure, representing the
 * hydraulic pumping ability of the heart.
 * CPO = CO × MAP / 451 (Watts). Normal > 1.0 W.
 */
export async function computeCardiacPowerOutput(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacPowerOutputResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [rhrRows, bpRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start7, end, 1),
    fetchMetric(db, userId, "blood_pressure", start7, end),
  ])

  const rhr = rhrRows.length > 0 ? rhrRows[0]!.value : 70
  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const diastolicAvg = systolicAvg * 0.625
  const pulsePressure = systolicAvg - diastolicAvg
  const map = diastolicAvg + pulsePressure / 3

  const estimatedSV = 70 // mL
  const co = (rhr * estimatedSV) / 1000 // L/min

  // CPO = CO × MAP / 451
  const cpo = (co * map) / 451
  const bsa = 1.9 // estimated BSA
  const cpi = cpo / bsa

  let category: string
  if (cpo >= 1.2) category = "normal"
  else if (cpo >= 0.8) category = "borderline"
  else if (cpo >= 0.6) category = "reduced"
  else category = "severely_reduced"

  return {
    cardiacPowerOutput: Math.round(cpo * 1000) / 1000,
    cardiacPowerIndex: Math.round(cpi * 1000) / 1000,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 59. Cardiomyopathy risk assessment from available biomarkers.
 * Evaluates indicators of structural heart disease including
 * persistent tachycardia, reduced HRV, and exercise intolerance.
 */
export async function assessCardiomyopathyRisk(
  userId: string,
  date: Date = new Date(),
): Promise<CardiomyopathyRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start90 = daysAgo(end, 90)

  const [rhrRows, hrvRows, hrRows, spo2Rows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start90, end),
    fetchMetric(db, userId, "hrv", start90, end),
    fetchMetric(db, userId, "heart_rate", start90, end),
    fetchMetric(db, userId, "blood_oxygen", start90, end),
  ])

  const indicators: { indicator: string; value: number; abnormal: boolean }[] = []
  let riskScore = 0

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const rhrAbnormal = rhr > 90
  indicators.push({ indicator: "Resting heart rate", value: Math.round(rhr), abnormal: rhrAbnormal })
  if (rhrAbnormal) riskScore += 25

  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const hrvAbnormal = hrvAvg < 20
  indicators.push({ indicator: "Heart rate variability", value: Math.round(hrvAvg), abnormal: hrvAbnormal })
  if (hrvAbnormal) riskScore += 25

  const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 160
  const chronotropicIndex = (maxHR - rhr) / (190 - rhr)
  const ciAbnormal = chronotropicIndex < 0.7
  indicators.push({ indicator: "Chronotropic competence", value: Math.round(chronotropicIndex * 100), abnormal: ciAbnormal })
  if (ciAbnormal) riskScore += 20

  const spo2Avg = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  const spo2Abnormal = spo2Avg < 94
  indicators.push({ indicator: "Blood oxygen saturation", value: Math.round(spo2Avg * 10) / 10, abnormal: spo2Abnormal })
  if (spo2Abnormal) riskScore += 15

  riskScore = clamp(riskScore, 0, 100)

  let riskCategory: string
  if (riskScore >= 50) riskCategory = "elevated"
  else if (riskScore >= 25) riskCategory = "moderate"
  else riskCategory = "low"

  return { riskScore, riskCategory, indicators, date: end.toISOString().slice(0, 10) }
}

/**
 * 60. Blood viscosity proxy estimation. Higher viscosity increases
 * cardiovascular workload and thrombotic risk. Estimated from
 * heart rate and blood pressure patterns (Lowe et al., Lancet 1997).
 */
export async function computeBloodViscosityProxy(
  userId: string,
  date: Date = new Date(),
): Promise<BloodViscosityProxyResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, rhrRows, spo2Rows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
  ])

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const spo2 = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97

  // Viscosity correlates with: hematocrit, BP, and peripheral resistance
  // Proxy: higher BP at given CO suggests higher viscosity
  const estimatedCO = (rhr * 70) / 1000 // L/min
  const map = systolicAvg * 0.625 + (systolicAvg - systolicAvg * 0.625) / 3
  const resistanceProxy = estimatedCO > 0 ? map / estimatedCO : 20

  // Hematocrit proxy from SpO2 (lower SpO2 may indicate polycythemia or anemia)
  const hematocritProxy = clamp(spo2 - 55, 30, 55)

  // Viscosity index: higher resistance and hematocrit = higher viscosity
  const viscosityIndex = Math.round(
    (resistanceProxy * 0.6 + hematocritProxy * 0.4) * 10,
  ) / 10

  let category: string
  if (viscosityIndex > 30) category = "elevated"
  else if (viscosityIndex > 22) category = "high_normal"
  else if (viscosityIndex > 15) category = "normal"
  else category = "low"

  return {
    viscosityIndex,
    hematocritProxy: Math.round(hematocritProxy * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 61. Baroreflex sensitivity (BRS) proxy from spontaneous BP and HR
 * fluctuations. BRS measures the heart rate change per unit change
 * in blood pressure. Low BRS predicts CV mortality (La Rovere et al., 1998).
 */
export async function analyzeBaroreflexSensitivity(
  userId: string,
  date: Date = new Date(),
): Promise<BaroreflexSensitivityResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [bpRows, hrvRows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "hrv", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
  ])

  const systolicValues = bpRows.map((r) => r.value)
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70

  // BRS proxy: ms/mmHg - typically 5-25 ms/mmHg in healthy adults
  // Higher HRV at given BP variability = better BRS
  const bpVariability = systolicValues.length > 2 ? stddev(systolicValues) : 10
  const brsIndex = bpVariability > 0
    ? (hrvAvg / bpVariability) * 3 // scaled proxy
    : hrvAvg * 0.3

  // HR-BP coupling strength
  const hrBpCoupling = clamp((brsIndex / 15) * 100, 0, 100)

  let sensitivity: string
  if (brsIndex >= 12) sensitivity = "normal"
  else if (brsIndex >= 6) sensitivity = "mildly_reduced"
  else if (brsIndex >= 3) sensitivity = "moderately_reduced"
  else sensitivity = "severely_reduced"

  let category: string
  if (brsIndex >= 10) category = "good_autonomic_function"
  else if (brsIndex >= 5) category = "moderate_autonomic_function"
  else category = "impaired_autonomic_function"

  return {
    brsIndex: Math.round(brsIndex * 100) / 100,
    sensitivity,
    hrBpCoupling: Math.round(hrBpCoupling * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 62. Ventricular-arterial coupling ratio (Ea/Ees) estimation.
 * Optimal coupling ratio is ~0.7-1.0 for maximal cardiac efficiency.
 * Ea = arterial elastance, Ees = end-systolic elastance.
 */
export async function computeVentricularCoupling(
  userId: string,
  date: Date = new Date(),
): Promise<VentricularCouplingResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [bpRows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start7, end),
    fetchMetric(db, userId, "resting_heart_rate", start7, end, 1),
  ])

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const diastolicAvg = systolicAvg * 0.625
  const rhr = rhrRows.length > 0 ? rhrRows[0]!.value : 70

  const estimatedSV = 70 // mL
  // Arterial elastance Ea ≈ ESP / SV (end-systolic pressure ≈ 0.9 × SBP)
  const esp = systolicAvg * 0.9
  const ea = esp / estimatedSV // mmHg/mL

  // Ventricular elastance Ees ≈ ESP / ESV (end-systolic volume estimated)
  // ESV ≈ EDV - SV, EDV estimated from HR (higher HR = lower EDV)
  const edv = clamp(180 - rhr * 0.8, 100, 200)
  const esv = edv - estimatedSV
  const ees = esv > 0 ? esp / esv : ea * 1.2

  const couplingRatio = ees > 0 ? ea / ees : 1.0

  let efficiency: string
  if (couplingRatio >= 0.6 && couplingRatio <= 1.2) efficiency = "optimal"
  else if (couplingRatio < 0.6) efficiency = "afterload_mismatch"
  else efficiency = "uncoupled"

  return {
    couplingRatio: Math.round(couplingRatio * 1000) / 1000,
    arterialElastance: Math.round(ea * 100) / 100,
    ventricularElastance: Math.round(ees * 100) / 100,
    efficiency,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 63. Heart failure risk scoring based on available wearable biomarkers.
 * Incorporates HR, HRV, exercise tolerance, and SpO2 patterns
 * as proxy markers for heart failure risk.
 */
export async function assessHeartFailureRisk(
  userId: string,
  date: Date = new Date(),
): Promise<HeartFailureRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start90 = daysAgo(end, 90)

  const [rhrRows, hrvRows, spo2Rows, bpRows, activeRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start90, end),
    fetchMetric(db, userId, "hrv", start90, end),
    fetchMetric(db, userId, "blood_oxygen", start90, end),
    fetchMetric(db, userId, "blood_pressure", start90, end),
    fetchMetric(db, userId, "active_minutes", start90, end),
  ])

  const markers: { marker: string; value: number; abnormal: boolean }[] = []
  let riskScore = 0

  // Elevated resting HR (compensatory tachycardia)
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const rhrAbnormal = rhr > 85
  markers.push({ marker: "Resting heart rate", value: Math.round(rhr), abnormal: rhrAbnormal })
  if (rhrAbnormal) riskScore += 20

  // Reduced HRV (autonomic dysfunction)
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const hrvAbnormal = hrvAvg < 25
  markers.push({ marker: "Heart rate variability", value: Math.round(hrvAvg), abnormal: hrvAbnormal })
  if (hrvAbnormal) riskScore += 25

  // Reduced SpO2 (pulmonary congestion)
  const spo2Avg = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  const spo2Abnormal = spo2Avg < 94
  markers.push({ marker: "Blood oxygen saturation", value: Math.round(spo2Avg * 10) / 10, abnormal: spo2Abnormal })
  if (spo2Abnormal) riskScore += 20

  // Hypertension (volume overload/afterload increase)
  const sbp = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const bpAbnormal = sbp > 140
  markers.push({ marker: "Systolic blood pressure", value: Math.round(sbp), abnormal: bpAbnormal })
  if (bpAbnormal) riskScore += 15

  // Exercise intolerance (reduced active minutes)
  const avgActive = activeRows.length > 0 ? mean(activeRows.map((r) => r.value)) : 30
  const activityAbnormal = avgActive < 15
  markers.push({ marker: "Daily active minutes", value: Math.round(avgActive), abnormal: activityAbnormal })
  if (activityAbnormal) riskScore += 15

  riskScore = clamp(riskScore, 0, 100)

  let riskCategory: string
  if (riskScore >= 55) riskCategory = "high"
  else if (riskScore >= 30) riskCategory = "moderate"
  else riskCategory = "low"

  return { riskScore, riskCategory, markers, date: end.toISOString().slice(0, 10) }
}

/**
 * 64. Pulmonary vascular resistance (PVR) proxy estimation.
 * Elevated PVR indicates pulmonary hypertension or right heart strain.
 * PVR = (mPAP - PCWP) / CO.
 */
export async function computePulmonaryVascularResistance(
  userId: string,
  date: Date = new Date(),
): Promise<PulmonaryVascularResistanceResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, bpRows, spo2Rows, respRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
    fetchMetric(db, userId, "respiratory_rate", start30, end),
  ])

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const sbp = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const spo2 = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  const respRate = respRows.length > 0 ? mean(respRows.map((r) => r.value)) : 15

  // Estimate mean PAP from systemic BP and SpO2
  // mPAP proxy: higher with low SpO2, high resp rate (hypoxic vasoconstriction)
  const mPAPProxy = 15 + (100 - spo2) * 1.5 + Math.max(0, respRate - 16) * 1.5

  // PCWP proxy: ~8-12 normally, higher with elevated systemic BP
  const pcwpProxy = sbp > 140 ? 14 : sbp > 130 ? 11 : 8

  // CO estimate
  const co = (rhr * 70) / 1000

  // PVR = (mPAP - PCWP) / CO × 80 (Wood units to dynes)
  const pvr = co > 0 ? ((mPAPProxy - pcwpProxy) / co) * 80 : 160

  let category: string
  if (pvr > 480) category = "elevated"
  else if (pvr > 240) category = "borderline"
  else category = "normal"

  let rightHeartStress: string
  if (pvr > 400) rightHeartStress = "significant"
  else if (pvr > 240) rightHeartStress = "mild"
  else rightHeartStress = "minimal"

  return {
    estimatedPVR: Math.round(pvr),
    category,
    rightHeartStress,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 65. Cardiac remodeling indicator analysis. Detects patterns
 * suggestive of structural cardiac changes from longitudinal
 * trends in HR, HRV, and BP data.
 */
export async function analyzeCardiacRemodeling(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacRemodelingResult> {
  const db = getDb()
  const end = dayStart(date)
  const start90 = daysAgo(end, 90)
  const midpoint = daysAgo(end, 45)

  const [rhrEarly, rhrLate, hrvEarly, hrvLate, bpEarly, bpLate] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start90, midpoint),
    fetchMetric(db, userId, "resting_heart_rate", midpoint, end),
    fetchMetric(db, userId, "hrv", start90, midpoint),
    fetchMetric(db, userId, "hrv", midpoint, end),
    fetchMetric(db, userId, "blood_pressure", start90, midpoint),
    fetchMetric(db, userId, "blood_pressure", midpoint, end),
  ])

  const indicators: { indicator: string; trend: string; significance: string }[] = []
  let remodelingIndex = 0

  // RHR trend
  const rhrEarlyAvg = rhrEarly.length > 0 ? mean(rhrEarly.map((r) => r.value)) : 70
  const rhrLateAvg = rhrLate.length > 0 ? mean(rhrLate.map((r) => r.value)) : 70
  const rhrChange = rhrLateAvg - rhrEarlyAvg
  if (Math.abs(rhrChange) > 5) {
    indicators.push({
      indicator: "Resting heart rate",
      trend: rhrChange > 0 ? "increasing" : "decreasing",
      significance: Math.abs(rhrChange) > 10 ? "significant" : "notable",
    })
    remodelingIndex += rhrChange > 0 ? 20 : -10 // increasing RHR = concern
  } else {
    indicators.push({ indicator: "Resting heart rate", trend: "stable", significance: "normal" })
  }

  // HRV trend
  const hrvEarlyAvg = hrvEarly.length > 0 ? mean(hrvEarly.map((r) => r.value)) : 40
  const hrvLateAvg = hrvLate.length > 0 ? mean(hrvLate.map((r) => r.value)) : 40
  const hrvChange = hrvLateAvg - hrvEarlyAvg
  if (Math.abs(hrvChange) > 5) {
    indicators.push({
      indicator: "Heart rate variability",
      trend: hrvChange > 0 ? "improving" : "declining",
      significance: Math.abs(hrvChange) > 10 ? "significant" : "notable",
    })
    remodelingIndex += hrvChange < 0 ? 20 : -10 // declining HRV = concern
  } else {
    indicators.push({ indicator: "Heart rate variability", trend: "stable", significance: "normal" })
  }

  // BP trend
  const bpEarlyAvg = bpEarly.length > 0 ? mean(bpEarly.map((r) => r.value)) : 120
  const bpLateAvg = bpLate.length > 0 ? mean(bpLate.map((r) => r.value)) : 120
  const bpChange = bpLateAvg - bpEarlyAvg
  if (Math.abs(bpChange) > 5) {
    indicators.push({
      indicator: "Systolic blood pressure",
      trend: bpChange > 0 ? "increasing" : "decreasing",
      significance: Math.abs(bpChange) > 10 ? "significant" : "notable",
    })
    remodelingIndex += bpChange > 0 ? 15 : -5
  } else {
    indicators.push({ indicator: "Systolic blood pressure", trend: "stable", significance: "normal" })
  }

  remodelingIndex = clamp(remodelingIndex, 0, 100)

  let category: string
  if (remodelingIndex >= 40) category = "suggestive_of_remodeling"
  else if (remodelingIndex >= 20) category = "early_changes"
  else category = "no_significant_changes"

  return {
    remodelingIndex,
    category,
    indicators,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 66. Mean arterial pressure (MAP) calculation and clinical analysis.
 * MAP = DBP + (PP / 3). Normal MAP: 70-100 mmHg.
 * MAP < 65 mmHg may compromise organ perfusion.
 */
export async function computeMeanArterialPressure(
  userId: string,
  date: Date = new Date(),
): Promise<MeanArterialPressureResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const bpRows = await fetchMetric(db, userId, "blood_pressure", start7, end)

  const systolic = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const diastolic = systolic * 0.625
  const pp = systolic - diastolic
  const map = diastolic + pp / 3

  let category: string
  if (map > 110) category = "hypertensive"
  else if (map > 100) category = "high_normal"
  else if (map >= 70) category = "normal"
  else if (map >= 65) category = "borderline_low"
  else category = "hypotensive"

  let perfusionAdequacy: string
  if (map >= 70) perfusionAdequacy = "adequate"
  else if (map >= 65) perfusionAdequacy = "borderline"
  else perfusionAdequacy = "potentially_inadequate"

  return {
    map: Math.round(map * 10) / 10,
    systolic: Math.round(systolic * 10) / 10,
    diastolic: Math.round(diastolic * 10) / 10,
    category,
    perfusionAdequacy,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 67. Thromboembolism risk scoring based on available biomarkers.
 * Incorporates elements of Virchow's triad: stasis, endothelial injury,
 * and hypercoagulability proxies.
 */
export async function assessThromboembolismRisk(
  userId: string,
  date: Date = new Date(),
): Promise<ThromboembolismRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, bpRows, stepsRows, stressRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "steps", start30, end),
    fetchMetric(db, userId, "stress", start30, end),
  ])

  const factors: { factor: string; points: number }[] = []
  let totalPoints = 0

  // Stasis proxy: low physical activity
  const avgSteps = stepsRows.length > 0 ? mean(stepsRows.map((r) => r.value)) : 5000
  if (avgSteps < 3000) {
    factors.push({ factor: "Sedentary lifestyle (<3000 steps/day)", points: 2 })
    totalPoints += 2
  } else if (avgSteps < 5000) {
    factors.push({ factor: "Low activity (<5000 steps/day)", points: 1 })
    totalPoints += 1
  }

  // Hypertension (endothelial injury)
  const sbp = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  if (sbp >= 140) {
    factors.push({ factor: "Hypertension", points: 1 })
    totalPoints += 1
  }

  // Elevated RHR (hypercoagulability proxy via inflammation)
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  if (rhr > 85) {
    factors.push({ factor: "Elevated resting heart rate", points: 1 })
    totalPoints += 1
  }

  // Chronic stress (inflammatory pathway)
  const stress = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : 40
  if (stress > 70) {
    factors.push({ factor: "High chronic stress", points: 1 })
    totalPoints += 1
  }

  const riskScore = clamp(totalPoints * 20, 0, 100)

  let riskCategory: string
  if (totalPoints >= 4) riskCategory = "high"
  else if (totalPoints >= 2) riskCategory = "moderate"
  else riskCategory = "low"

  return {
    riskScore,
    riskCategory,
    factors,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 68. Coronary artery calcium (CAC) score proxy using cardiovascular
 * risk factor burden as predictor. CAC correlates strongly with
 * coronary atherosclerotic plaque burden (Agatston et al., JACC 1990).
 */
export async function computeCoronaryCalciumProxy(
  userId: string,
  date: Date = new Date(),
): Promise<CoronaryCalciumProxyResult> {
  const db = getDb()
  const end = dayStart(date)
  const start90 = daysAgo(end, 90)

  const [bpRows, rhrRows, hrvRows, stressRows, bodyFatRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start90, end),
    fetchMetric(db, userId, "resting_heart_rate", start90, end),
    fetchMetric(db, userId, "hrv", start90, end),
    fetchMetric(db, userId, "stress", start90, end),
    fetchMetric(db, userId, "body_fat", start90, end, 1),
  ])

  const contributors: { factor: string; weight: number }[] = []
  let cacProxy = 0

  const sbp = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const bpWeight = sbp >= 140 ? 30 : sbp >= 130 ? 15 : 5
  contributors.push({ factor: "Blood pressure", weight: bpWeight })
  cacProxy += bpWeight

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const rhrWeight = rhr > 85 ? 20 : rhr > 75 ? 10 : 3
  contributors.push({ factor: "Resting heart rate", weight: rhrWeight })
  cacProxy += rhrWeight

  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const hrvWeight = hrvAvg < 20 ? 20 : hrvAvg < 35 ? 10 : 2
  contributors.push({ factor: "Heart rate variability", weight: hrvWeight })
  cacProxy += hrvWeight

  const stress = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : 40
  const stressWeight = stress > 70 ? 15 : stress > 50 ? 7 : 2
  contributors.push({ factor: "Chronic stress", weight: stressWeight })
  cacProxy += stressWeight

  const bodyFat = bodyFatRows.length > 0 ? bodyFatRows[0]!.value : null
  if (bodyFat !== null) {
    const bfWeight = bodyFat > 30 ? 15 : bodyFat > 25 ? 8 : 2
    contributors.push({ factor: "Body fat percentage", weight: bfWeight })
    cacProxy += bfWeight
  }

  cacProxy = clamp(cacProxy, 0, 100)

  // Map to Agatston-like categories
  let riskCategory: string
  if (cacProxy >= 70) riskCategory = "extensive_calcification"
  else if (cacProxy >= 45) riskCategory = "moderate_calcification"
  else if (cacProxy >= 20) riskCategory = "mild_calcification"
  else riskCategory = "minimal_calcification"

  return { cacProxy, riskCategory, contributors, date: end.toISOString().slice(0, 10) }
}

/**
 * 69. Heart rate fragmentation (HRF) analysis. HRF measures the
 * percentage of inflection points in HR time series. Higher fragmentation
 * indicates disrupted cardiac autonomic regulation (Costa et al., 2017).
 */
export async function analyzeHeartRateFragmentation(
  userId: string,
  date: Date = new Date(),
): Promise<HeartRateFragmentationResult> {
  const db = getDb()
  const end = dayStart(date)
  const start1 = daysAgo(end, 1)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start1, end)
  const hrValues = hrRows.map((r) => r.value)

  let pip = 0 // Percentage of inflection points
  let ials = 0 // Inverse of average length of acceleration/deceleration segments
  let pss = 0 // Percentage of short segments

  if (hrValues.length >= 10) {
    // Calculate direction changes
    let inflections = 0
    let segmentLengths: number[] = []
    let currentSegLen = 1

    for (let i = 2; i < hrValues.length; i++) {
      const prevDiff = hrValues[i - 1]! - hrValues[i - 2]!
      const currDiff = hrValues[i]! - hrValues[i - 1]!

      // Sign change = inflection point
      if ((prevDiff > 0 && currDiff < 0) || (prevDiff < 0 && currDiff > 0)) {
        inflections++
        segmentLengths.push(currentSegLen)
        currentSegLen = 1
      } else {
        currentSegLen++
      }
    }
    segmentLengths.push(currentSegLen)

    // PIP: percentage of inflection points
    pip = (inflections / (hrValues.length - 2)) * 100

    // IALS: inverse of average segment length
    const avgSegLen = segmentLengths.length > 0 ? mean(segmentLengths) : 1
    ials = avgSegLen > 0 ? 1 / avgSegLen : 1

    // PSS: percentage of short segments (length = 1)
    const shortSegments = segmentLengths.filter((l) => l === 1).length
    pss = segmentLengths.length > 0 ? (shortSegments / segmentLengths.length) * 100 : 0
  }

  // Fragmentation index: weighted composite
  const fragmentationIndex = Math.round(pip * 0.5 + pss * 0.3 + ials * 20)

  let category: string
  if (fragmentationIndex > 60) category = "high_fragmentation"
  else if (fragmentationIndex > 40) category = "moderate_fragmentation"
  else if (fragmentationIndex > 20) category = "mild_fragmentation"
  else category = "low_fragmentation"

  return {
    fragmentationIndex: clamp(fragmentationIndex, 0, 100),
    pip: Math.round(pip * 10) / 10,
    ials: Math.round(ials * 1000) / 1000,
    pss: Math.round(pss * 10) / 10,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 70. Cardiac output reserve: the difference between resting and peak
 * cardiac output during exercise. Higher reserve indicates better
 * cardiovascular fitness and functional capacity.
 */
export async function computeCardiacOutputReserve(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacOutputReserveResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, hrRows, bpRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
    fetchMetric(db, userId, "blood_pressure", start30, end),
  ])

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const peakHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 170

  const restingSV = 70 // mL
  // SV increases ~20-50% with exercise due to Frank-Starling mechanism
  const peakSV = restingSV * 1.35

  const restingCO = (rhr * restingSV) / 1000 // L/min
  const peakCO = (peakHR * peakSV) / 1000 // L/min
  const coReserve = peakCO - restingCO
  const reserveRatio = restingCO > 0 ? peakCO / restingCO : 1

  let category: string
  if (reserveRatio >= 4) category = "excellent"
  else if (reserveRatio >= 3) category = "good"
  else if (reserveRatio >= 2.5) category = "average"
  else category = "limited"

  return {
    restingCO: Math.round(restingCO * 100) / 100,
    peakCO: Math.round(peakCO * 100) / 100,
    coReserve: Math.round(coReserve * 100) / 100,
    reserveRatio: Math.round(reserveRatio * 100) / 100,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 71. Aneurysm risk scoring based on cardiovascular risk factors.
 * Hypertension is the primary modifiable risk factor for aortic
 * aneurysm (Kent et al., J Vasc Surg 2010).
 */
export async function assessAneurysmRisk(
  userId: string,
  date: Date = new Date(),
): Promise<AneurysmRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start90 = daysAgo(end, 90)

  const [bpRows, rhrRows, stressRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start90, end),
    fetchMetric(db, userId, "resting_heart_rate", start90, end),
    fetchMetric(db, userId, "stress", start90, end),
  ])

  const contributors: { factor: string; contribution: number }[] = []
  let riskScore = 0

  // Sustained hypertension (primary driver of aneurysm formation)
  const sbp = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const bpContrib = sbp >= 160 ? 40 : sbp >= 140 ? 25 : sbp >= 130 ? 10 : 3
  contributors.push({ factor: "Sustained hypertension", contribution: bpContrib })
  riskScore += bpContrib

  // Blood pressure variability (wall stress variation)
  const bpVariability = bpRows.length > 2 ? stddev(bpRows.map((r) => r.value)) : 0
  const bpVarContrib = bpVariability > 15 ? 15 : bpVariability > 10 ? 8 : 2
  contributors.push({ factor: "Blood pressure variability", contribution: bpVarContrib })
  riskScore += bpVarContrib

  // Elevated resting HR (increased hemodynamic stress)
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const rhrContrib = rhr > 85 ? 15 : rhr > 75 ? 7 : 2
  contributors.push({ factor: "Resting heart rate", contribution: rhrContrib })
  riskScore += rhrContrib

  // Chronic stress (cortisol-mediated vascular damage)
  const stress = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : 40
  const stressContrib = stress > 70 ? 10 : stress > 50 ? 5 : 1
  contributors.push({ factor: "Chronic stress", contribution: stressContrib })
  riskScore += stressContrib

  riskScore = clamp(riskScore, 0, 100)

  let riskCategory: string
  if (riskScore >= 50) riskCategory = "elevated"
  else if (riskScore >= 25) riskCategory = "moderate"
  else riskCategory = "low"

  return { riskScore, riskCategory, contributors, date: end.toISOString().slice(0, 10) }
}

/**
 * 72. Systemic vascular resistance (SVR) estimation and indexing.
 * SVR = (MAP - CVP) / CO × 80. Normal: 900-1400 dynes·s/cm⁵.
 * SVR index (SVRI) normalizes by body surface area.
 */
export async function computeSystemicVascularResistance(
  userId: string,
  date: Date = new Date(),
): Promise<SystemicVascularResistanceResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [bpRows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "blood_pressure", start7, end),
    fetchMetric(db, userId, "resting_heart_rate", start7, end, 1),
  ])

  const systolicAvg = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const diastolicAvg = systolicAvg * 0.625
  const pp = systolicAvg - diastolicAvg
  const map = diastolicAvg + pp / 3
  const rhr = rhrRows.length > 0 ? rhrRows[0]!.value : 70

  const co = (rhr * 70) / 1000 // L/min, SV=70mL
  const cvp = 5 // mmHg assumed

  const svr = co > 0 ? ((map - cvp) / co) * 80 : 1200

  const bsa = 1.9
  const svrIndex = Math.round(svr * bsa)

  let category: string
  if (svr > 1600) category = "elevated"
  else if (svr > 1400) category = "high_normal"
  else if (svr >= 900) category = "normal"
  else if (svr >= 700) category = "low_normal"
  else category = "reduced"

  return {
    svr: Math.round(svr),
    svrIndex,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 73. Electrophysiological proxy from heart rate patterns.
 * Approximates conduction system health and repolarization
 * stability from HR regularity and variability metrics.
 */
export async function analyzeElectrophysiologicalProxy(
  userId: string,
  date: Date = new Date(),
): Promise<ElectrophysiologicalProxyResult> {
  const db = getDb()
  const end = dayStart(date)
  const start7 = daysAgo(end, 7)

  const [hrRows, hrvRows, rhrRows] = await Promise.all([
    fetchMetric(db, userId, "heart_rate", start7, end),
    fetchMetric(db, userId, "hrv", start7, end),
    fetchMetric(db, userId, "resting_heart_rate", start7, end),
  ])

  const rrIntervals = hrRows.filter((r) => r.value > 0).map((r) => 60000 / r.value)
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70

  // Conduction proxy: regular, appropriate rate = good conduction
  const rrCV = rrIntervals.length > 5 ? coefficientOfVariation(rrIntervals) : 0.06
  const conductionProxy = clamp(100 - Math.abs(rrCV - 0.06) * 800, 0, 100)

  // Repolarization proxy: HRV stability, extreme HR absence
  const extremeHRCount = rrIntervals.filter(
    (rr) => rr < 400 || rr > 1500, // HR > 150 or < 40
  ).length
  const extremePct = rrIntervals.length > 0
    ? (extremeHRCount / rrIntervals.length) * 100
    : 0
  const repolarizationProxy = clamp(100 - extremePct * 10 - (rhr > 90 ? 20 : 0), 0, 100)

  const epScore = Math.round((conductionProxy * 0.5 + repolarizationProxy * 0.5) * 10) / 10

  let arrhythmiaRisk: string
  if (epScore >= 80) arrhythmiaRisk = "low"
  else if (epScore >= 60) arrhythmiaRisk = "low_moderate"
  else if (epScore >= 40) arrhythmiaRisk = "moderate"
  else arrhythmiaRisk = "elevated"

  return {
    epScore,
    conductionProxy: Math.round(conductionProxy * 10) / 10,
    repolarizationProxy: Math.round(repolarizationProxy * 10) / 10,
    arrhythmiaRisk,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 74. Microvascular function estimation from SpO2, HR response,
 * and blood pressure patterns. Microvascular dysfunction precedes
 * macrovascular disease (Crea et al., Circ Res 2014).
 */
export async function computeMicrovascularFunction(
  userId: string,
  date: Date = new Date(),
): Promise<MicrovascularFunctionResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [spo2Rows, bpRows, rhrRows, hrvRows] = await Promise.all([
    fetchMetric(db, userId, "blood_oxygen", start30, end),
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "hrv", start30, end),
  ])

  const spo2 = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  const sbp = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40

  // Perfusion index: SpO2 stability and level
  const spo2Score = clamp((spo2 - 90) * 10, 0, 100)

  // Endothelial health from HRV (autonomic regulation of microvasculature)
  const endothelialScore = clamp((hrvAvg / 50) * 80, 0, 100)

  // Microvascular resistance from BP and HR
  const mvResistanceScore = clamp(100 - (sbp - 100) * 0.8 - (rhr - 60) * 0.5, 0, 100)

  const functionScore = Math.round(
    (spo2Score * 0.35 + endothelialScore * 0.35 + mvResistanceScore * 0.30) * 10,
  ) / 10

  const perfusionIndex = Math.round(spo2Score * 10) / 10

  let endothelialHealth: string
  if (functionScore >= 75) endothelialHealth = "normal"
  else if (functionScore >= 50) endothelialHealth = "mildly_impaired"
  else endothelialHealth = "impaired"

  return {
    functionScore,
    perfusionIndex,
    endothelialHealth,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 75. Cardiac sarcopenia risk assessment. Evaluates risk of
 * age-related cardiac muscle deterioration using heart rate
 * response, recovery, and functional capacity proxies.
 */
export async function assessCardiacSarcopeniaRisk(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacSarcopeniaRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start90 = daysAgo(end, 90)

  const [rhrRows, hrRows, hrvRows, activeRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start90, end),
    fetchMetric(db, userId, "heart_rate", start90, end),
    fetchMetric(db, userId, "hrv", start90, end),
    fetchMetric(db, userId, "active_minutes", start90, end),
  ])

  const indicators: { indicator: string; value: number; status: string }[] = []
  let riskScore = 0

  // Chronotropic index (ability to increase HR)
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 160
  const chronotropicIndex = (190 - rhr) > 0 ? (maxHR - rhr) / (190 - rhr) : 0.5
  const ciStatus = chronotropicIndex < 0.7 ? "impaired" : "normal"
  indicators.push({ indicator: "Chronotropic index", value: Math.round(chronotropicIndex * 100), status: ciStatus })
  if (chronotropicIndex < 0.7) riskScore += 25

  // HRV decline (autonomic regulation of cardiac muscle)
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const hrvStatus = hrvAvg < 25 ? "low" : "normal"
  indicators.push({ indicator: "Heart rate variability", value: Math.round(hrvAvg), status: hrvStatus })
  if (hrvAvg < 25) riskScore += 25

  // Low physical activity (disuse atrophy)
  const avgActive = activeRows.length > 0 ? mean(activeRows.map((r) => r.value)) : 30
  const activityStatus = avgActive < 20 ? "insufficient" : "adequate"
  indicators.push({ indicator: "Daily active minutes", value: Math.round(avgActive), status: activityStatus })
  if (avgActive < 20) riskScore += 25

  // Elevated resting HR (compensatory mechanism for reduced SV)
  const rhrStatus = rhr > 85 ? "elevated" : "normal"
  indicators.push({ indicator: "Resting heart rate", value: Math.round(rhr), status: rhrStatus })
  if (rhr > 85) riskScore += 15

  riskScore = clamp(riskScore, 0, 100)

  let riskCategory: string
  if (riskScore >= 50) riskCategory = "elevated"
  else if (riskScore >= 25) riskCategory = "moderate"
  else riskCategory = "low"

  return { riskScore, riskCategory, indicators, date: end.toISOString().slice(0, 10) }
}

/**
 * 76. Venous thromboembolism (VTE) risk scoring using a modified
 * Wells score proxy adapted for wearable data.
 * Original Wells criteria predict DVT/PE probability.
 */
export async function computeVenousThrombosisRisk(
  userId: string,
  date: Date = new Date(),
): Promise<VenousThrombosisRiskResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, stepsRows, respRows, stressRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "steps", start30, end),
    fetchMetric(db, userId, "respiratory_rate", start30, end),
    fetchMetric(db, userId, "stress", start30, end),
  ])

  const factors: { factor: string; points: number }[] = []
  let totalPoints = 0

  // Tachycardia (PE sign)
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  if (rhr > 100) {
    factors.push({ factor: "Tachycardia (>100 bpm)", points: 1.5 })
    totalPoints += 1.5
  }

  // Immobilization (sedentary behavior)
  const avgSteps = stepsRows.length > 0 ? mean(stepsRows.map((r) => r.value)) : 5000
  if (avgSteps < 2000) {
    factors.push({ factor: "Prolonged immobilization (<2000 steps/day)", points: 1.5 })
    totalPoints += 1.5
  } else if (avgSteps < 4000) {
    factors.push({ factor: "Reduced mobility (<4000 steps/day)", points: 0.5 })
    totalPoints += 0.5
  }

  // Elevated respiratory rate (possible PE)
  const respRate = respRows.length > 0 ? mean(respRows.map((r) => r.value)) : 15
  if (respRate > 20) {
    factors.push({ factor: "Elevated respiratory rate (>20/min)", points: 1 })
    totalPoints += 1
  }

  // Chronic stress (inflammatory / procoagulant state)
  const stress = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : 40
  if (stress > 70) {
    factors.push({ factor: "High chronic stress (>70)", points: 0.5 })
    totalPoints += 0.5
  }

  const wellsScoreProxy = Math.round(totalPoints * 10) / 10
  const riskScore = clamp(Math.round(totalPoints * 22), 0, 100)

  let riskCategory: string
  if (totalPoints >= 3) riskCategory = "high"
  else if (totalPoints >= 1.5) riskCategory = "moderate"
  else riskCategory = "low"

  return {
    riskScore,
    riskCategory,
    wellsScoreProxy,
    factors,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 77. Heart rate oscillation pattern analysis. Examines periodic
 * oscillations in heart rate which reflect cardiorespiratory coupling
 * and autonomic nervous system function.
 */
export async function analyzeHeartRateOscillations(
  userId: string,
  date: Date = new Date(),
): Promise<HeartRateOscillationsResult> {
  const db = getDb()
  const end = dayStart(date)
  const start1 = daysAgo(end, 1)

  const hrRows = await fetchMetric(db, userId, "heart_rate", start1, end)
  const hrValues = hrRows.map((r) => r.value)

  let oscillationAmplitude = 0
  let oscillationFrequency = 0
  let dominantPeriod = 0

  if (hrValues.length >= 20) {
    // Detect oscillations using zero-crossing method on detrended signal
    const meanHR = mean(hrValues)
    const detrended = hrValues.map((v) => v - meanHR)

    // Count zero crossings
    let zeroCrossings = 0
    for (let i = 1; i < detrended.length; i++) {
      if ((detrended[i]! > 0 && detrended[i - 1]! <= 0) ||
          (detrended[i]! <= 0 && detrended[i - 1]! > 0)) {
        zeroCrossings++
      }
    }

    // Frequency = zero crossings / (2 × signal length)
    oscillationFrequency = zeroCrossings / (2 * detrended.length)

    // Dominant period (samples per cycle)
    dominantPeriod = oscillationFrequency > 0 ? 1 / oscillationFrequency : 0

    // Amplitude = standard deviation of oscillations
    oscillationAmplitude = stddev(hrValues)
  }

  let regularity: string
  if (oscillationFrequency > 0.15 && oscillationFrequency < 0.4) regularity = "respiratory_coupled"
  else if (oscillationFrequency > 0.04 && oscillationFrequency <= 0.15) regularity = "sympathetic_modulated"
  else if (oscillationAmplitude < 3) regularity = "dampened"
  else regularity = "irregular"

  return {
    oscillationAmplitude: Math.round(oscillationAmplitude * 100) / 100,
    oscillationFrequency: Math.round(oscillationFrequency * 10000) / 10000,
    dominantPeriod: Math.round(dominantPeriod * 10) / 10,
    regularity,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 78. Comprehensive cardiovascular resilience score combining
 * recovery capacity, stress tolerance, autonomic flexibility,
 * and vascular adaptability.
 */
export async function computeCardiovascularResilience(
  userId: string,
  date: Date = new Date(),
): Promise<CardiovascularResilienceResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, hrvRows, hrRows, bpRows, spo2Rows, stressRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "hrv", start30, end),
    fetchMetric(db, userId, "heart_rate", start30, end),
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
    fetchMetric(db, userId, "stress", start30, end),
  ])

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 170
  const sbp = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const spo2 = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  const stress = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : 40

  const components: { name: string; score: number }[] = []

  // Recovery capacity (low RHR, high HR reserve)
  const hrReserve = maxHR - rhr
  const recoveryScore = clamp(Math.round(hrReserve * 0.8), 0, 100)
  components.push({ name: "Recovery capacity", score: recoveryScore })

  // Autonomic flexibility (HRV, balanced autonomic function)
  const autonomicScore = clamp(Math.round((hrvAvg / 50) * 80), 0, 100)
  components.push({ name: "Autonomic flexibility", score: autonomicScore })

  // Vascular health (normal BP, good SpO2)
  const bpScore = clamp(Math.round(100 - Math.abs(sbp - 115) * 1.5), 0, 100)
  const vascularScore = Math.round((bpScore * 0.6 + clamp((spo2 - 90) * 10, 0, 100) * 0.4))
  components.push({ name: "Vascular health", score: vascularScore })

  // Stress tolerance
  const stressTolerance = clamp(Math.round(100 - stress), 0, 100)
  components.push({ name: "Stress tolerance", score: stressTolerance })

  // Cardiac efficiency (low resting HR = efficient pump)
  const efficiencyScore = clamp(Math.round((90 - rhr) * 2.5), 0, 100)
  components.push({ name: "Cardiac efficiency", score: efficiencyScore })

  const resilienceScore = Math.round(
    components.reduce((sum, c) => sum + c.score, 0) / components.length,
  )

  let category: string
  if (resilienceScore >= 80) category = "highly_resilient"
  else if (resilienceScore >= 60) category = "resilient"
  else if (resilienceScore >= 40) category = "moderate"
  else category = "reduced_resilience"

  return {
    resilienceScore: clamp(resilienceScore, 0, 100),
    components,
    category,
    date: end.toISOString().slice(0, 10),
  }
}

/**
 * 79. Pulmonary hypertension proxy risk estimation from respiratory rate,
 * SpO2, and cardiac indicators. PH is characterized by elevated
 * pulmonary artery pressures (Simonneau et al., JACC 2019).
 */
export async function assessPulmonaryHypertensionProxy(
  userId: string,
  date: Date = new Date(),
): Promise<PulmonaryHypertensionProxyResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [respRows, spo2Rows, rhrRows, hrvRows] = await Promise.all([
    fetchMetric(db, userId, "respiratory_rate", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "hrv", start30, end),
  ])

  const indicators: { indicator: string; value: number; abnormal: boolean }[] = []
  let riskScore = 0

  // Elevated respiratory rate (dyspnea proxy)
  const respRate = respRows.length > 0 ? mean(respRows.map((r) => r.value)) : 15
  const respAbnormal = respRate > 20
  indicators.push({ indicator: "Respiratory rate", value: Math.round(respRate * 10) / 10, abnormal: respAbnormal })
  if (respAbnormal) riskScore += 25

  // Reduced SpO2 (hypoxemia)
  const spo2 = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  const spo2Abnormal = spo2 < 94
  indicators.push({ indicator: "Blood oxygen saturation", value: Math.round(spo2 * 10) / 10, abnormal: spo2Abnormal })
  if (spo2Abnormal) riskScore += 25

  // Tachycardia (right ventricular strain compensation)
  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const rhrAbnormal = rhr > 90
  indicators.push({ indicator: "Resting heart rate", value: Math.round(rhr), abnormal: rhrAbnormal })
  if (rhrAbnormal) riskScore += 20

  // Reduced HRV (autonomic dysfunction)
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const hrvAbnormal = hrvAvg < 20
  indicators.push({ indicator: "Heart rate variability", value: Math.round(hrvAvg), abnormal: hrvAbnormal })
  if (hrvAbnormal) riskScore += 15

  riskScore = clamp(riskScore, 0, 100)

  let riskCategory: string
  if (riskScore >= 50) riskCategory = "elevated"
  else if (riskScore >= 25) riskCategory = "moderate"
  else riskCategory = "low"

  return { riskScore, riskCategory, indicators, date: end.toISOString().slice(0, 10) }
}

/**
 * 80. Cardiac biological age estimation comparing heart health metrics
 * to age-normalized population data. Produces a composite "heart age"
 * that may differ from chronological age.
 */
export async function computeCardiacBioage(
  userId: string,
  date: Date = new Date(),
): Promise<CardiacBioageResult> {
  const db = getDb()
  const end = dayStart(date)
  const start30 = daysAgo(end, 30)

  const [rhrRows, hrvRows, bpRows, vo2Rows, hrRows, spo2Rows, stressRows] = await Promise.all([
    fetchMetric(db, userId, "resting_heart_rate", start30, end),
    fetchMetric(db, userId, "hrv", start30, end),
    fetchMetric(db, userId, "blood_pressure", start30, end),
    fetchMetric(db, userId, "vo2max", start30, end, 1),
    fetchMetric(db, userId, "heart_rate", start30, end),
    fetchMetric(db, userId, "blood_oxygen", start30, end),
    fetchMetric(db, userId, "stress", start30, end),
  ])

  const rhr = rhrRows.length > 0 ? mean(rhrRows.map((r) => r.value)) : 70
  const hrvAvg = hrvRows.length > 0 ? mean(hrvRows.map((r) => r.value)) : 40
  const sbp = bpRows.length > 0 ? mean(bpRows.map((r) => r.value)) : 120
  const spo2 = spo2Rows.length > 0 ? mean(spo2Rows.map((r) => r.value)) : 97
  const stress = stressRows.length > 0 ? mean(stressRows.map((r) => r.value)) : 40

  let vo2max: number
  if (vo2Rows.length > 0) {
    vo2max = vo2Rows[0]!.value
  } else {
    const maxHR = hrRows.length > 0 ? Math.max(...hrRows.map((r) => r.value)) : 190
    vo2max = 15.3 * (maxHR / rhr)
  }

  const contributors: { factor: string; impact: number }[] = []

  // RHR contribution to bio-age (lower = younger)
  // Population avg by age: 20y=62, 30y=65, 40y=68, 50y=71, 60y=73, 70y=75
  const rhrAge = 20 + (rhr - 55) * 2.5
  contributors.push({ factor: "Resting heart rate", impact: Math.round((rhrAge - 40) * 10) / 10 })

  // HRV contribution (higher = younger)
  // HRV declines ~3-5ms per decade
  const hrvAge = 20 + (80 - hrvAvg) * 0.8
  contributors.push({ factor: "Heart rate variability", impact: Math.round((hrvAge - 40) * 10) / 10 })

  // BP contribution (normal = younger)
  // SBP rises ~5-7 mmHg per decade after 30
  const bpAge = 30 + (sbp - 110) * 0.5
  contributors.push({ factor: "Blood pressure", impact: Math.round((bpAge - 40) * 10) / 10 })

  // VO2max contribution (higher = younger)
  // VO2max declines ~1 mL/kg/min per year after 25
  const vo2Age = 25 + (55 - vo2max) * 1.2
  contributors.push({ factor: "Aerobic capacity (VO2max)", impact: Math.round((vo2Age - 40) * 10) / 10 })

  // SpO2 contribution
  const spo2Age = spo2 >= 97 ? 30 : 30 + (97 - spo2) * 5
  contributors.push({ factor: "Blood oxygen", impact: Math.round((spo2Age - 40) * 10) / 10 })

  // Stress contribution
  const stressAge = 30 + stress * 0.4
  contributors.push({ factor: "Chronic stress", impact: Math.round((stressAge - 40) * 10) / 10 })

  // Weighted bio-age
  const bioAge = Math.round(clamp(
    rhrAge * 0.20 + hrvAge * 0.20 + bpAge * 0.20 + vo2Age * 0.20 + spo2Age * 0.10 + stressAge * 0.10,
    18, 95,
  ))

  let category: string
  if (bioAge < 30) category = "youthful_heart"
  else if (bioAge < 40) category = "young_heart"
  else if (bioAge < 50) category = "average_heart"
  else if (bioAge < 60) category = "aging_heart"
  else category = "aged_heart"

  return {
    bioAge,
    chronologicalAge: null,
    ageDelta: null,
    contributors,
    category,
    date: end.toISOString().slice(0, 10),
  }
}
