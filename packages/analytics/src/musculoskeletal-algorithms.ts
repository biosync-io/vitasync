import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, sql } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchMetric(
  userId: string,
  metricName: string,
  start: Date,
  end: Date,
): Promise<number[]> {
  const db = getDb()
  const rows = await db
    .select({ value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, metricName),
        gte(healthMetrics.recordedAt, start),
        lte(healthMetrics.recordedAt, end),
      ),
    )
    .orderBy(desc(healthMetrics.recordedAt))
  return rows.map((r) => Number(r.value))
}

function mean(vals: number[]): number {
  if (vals.length === 0) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0
  const m = mean(vals)
  return Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1))
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v))
}

function daysAgo(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - n)
  return d
}

function weeksAgo(date: Date, n: number): Date {
  return daysAgo(date, n * 7)
}

function coefficientOfVariation(vals: number[]): number {
  const m = mean(vals)
  if (m === 0) return 0
  return stddev(vals) / m
}

function linearSlope(vals: number[]): number {
  const n = vals.length
  if (n < 2) return 0
  const xMean = (n - 1) / 2
  const yMean = mean(vals)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (vals[i] - yMean)
    den += (i - xMean) ** 2
  }
  return den === 0 ? 0 : num / den
}

function percentile(vals: number[], p: number): number {
  if (vals.length === 0) return 0
  const sorted = [...vals].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

// ---------------------------------------------------------------------------
// Result Interfaces
// ---------------------------------------------------------------------------

export interface MobilityScoreResult {
  overall: number
  upperBody: number
  lowerBody: number
  spine: number
  trend: number
}

export interface InjuryRiskResult {
  riskScore: number
  level: "low" | "moderate" | "high" | "very_high"
  contributors: string[]
}

export interface JointHealthProxyResult {
  score: number
  stiffnessIndex: number
  painCorrelation: number
  activityImpact: number
}

export interface MovementPatternResult {
  symmetryScore: number
  consistencyScore: number
  qualityScore: number
  compensationRisk: number
}

export interface FmsLikeScoreResult {
  totalScore: number
  deepSquat: number
  hurdleStep: number
  inlineLunge: number
  shoulderMobility: number
  activeStraightLegRaise: number
  trunkStabilityPushup: number
  rotaryStability: number
}

export interface OsteoarthritisRiskResult {
  riskScore: number
  level: "low" | "moderate" | "high"
  modifiableFactors: string[]
  protectiveFactors: string[]
}

export interface PostureProxyResult {
  score: number
  forwardHeadRisk: number
  thoracicKyphosisRisk: number
  lumbarLordosisRisk: number
  overallAlignment: number
}

export interface GaitAnalysisResult {
  cadence: number
  strideVariability: number
  symmetryIndex: number
  stabilityScore: number
  efficiency: number
}

export interface BalanceAssessmentResult {
  staticBalance: number
  dynamicBalance: number
  singleLegStance: number
  overallScore: number
}

export interface FallRiskResult {
  riskScore: number
  level: "low" | "moderate" | "high"
  factors: string[]
  recommendations: string[]
}

export interface CoreStabilityResult {
  score: number
  anteriorChain: number
  posteriorChain: number
  lateralStability: number
  rotationalControl: number
}

export interface FlexibilityIndexResult {
  overallIndex: number
  hamstrings: number
  hipFlexors: number
  shoulders: number
  thoracolumbar: number
  trend: number
}

export interface GripStrengthEstimateResult {
  estimatedKg: number
  percentileForAge: number
  trend: number
  sarcopeniaRisk: number
}

export interface TendonHealthResult {
  score: number
  loadTolerance: number
  recoveryCapacity: number
  overloadRisk: number
}

export interface MuscleFatiguabilityResult {
  fatigueIndex: number
  enduranceRatio: number
  recoveryRate: number
  performanceDecline: number
}

export interface RecoveryAfterExerciseResult {
  recoveryScore: number
  hoursToBaseline: number
  muscleReadiness: number
  cardiovascularRecovery: number
  neuromuscularRecovery: number
}

export interface OveruseInjuryRiskResult {
  riskScore: number
  level: "low" | "moderate" | "high"
  acuteChronicRatio: number
  monotonyIndex: number
  strainIndex: number
}

export interface SpinalHealthResult {
  overallScore: number
  cervicalScore: number
  thoracicScore: number
  lumbarScore: number
  discHealthProxy: number
}

export interface RangeOfMotionProxyResult {
  overallRom: number
  shoulderRom: number
  hipRom: number
  kneeRom: number
  ankleRom: number
  trend: number
}

export interface MuscleImbalanceResult {
  imbalanceScore: number
  leftRightAsymmetry: number
  anteriorPosteriorRatio: number
  upperLowerRatio: number
  riskLevel: "low" | "moderate" | "high"
}

export interface BoneDensityProxyResult {
  estimatedTScore: number
  loadingScore: number
  nutritionFactor: number
  riskCategory: "normal" | "osteopenia" | "osteoporosis_risk"
}

export interface LigamentStressResult {
  stressIndex: number
  acuteLoadFactor: number
  chronicAdaptation: number
  injuryRisk: number
}

export interface CartilageHealthResult {
  healthScore: number
  loadDistribution: number
  recoveryEfficiency: number
  degradationRisk: number
}

export interface MuscleActivationPatternResult {
  activationScore: number
  sequencingQuality: number
  inhibitionRisk: number
  coordinationIndex: number
}

export interface ProprioceptionResult {
  score: number
  balanceComponent: number
  jointPositionSense: number
  reactiveControl: number
  ageFactor: number
}

export interface KineticChainResult {
  efficiencyScore: number
  weakLinks: string[]
  powerTransfer: number
  segmentalContribution: number
}

export interface PlyometricReadinessResult {
  readinessScore: number
  reactiveStrengthIndex: number
  landingMechanics: number
  eccConRatio: number
  recommendation: string
}

export interface IsometricStrengthResult {
  estimatedForce: number
  holdCapacity: number
  fatigueResistance: number
  trend: number
}

export interface EccentricCapacityResult {
  capacityScore: number
  loadAbsorption: number
  decelerationControl: number
  muscleElongationTolerance: number
}

export interface ConcentricPowerResult {
  peakPower: number
  averagePower: number
  rateOfForceDevelopment: number
  powerEndurance: number
}

export interface StretchShorteningCycleResult {
  sscEfficiency: number
  amortizationPhase: number
  elasticEnergyUtilization: number
  performanceIndex: number
}

export interface MyofascialTensionResult {
  tensionScore: number
  upperBodyTension: number
  lowerBodyTension: number
  asymmetry: number
  releaseRecommendation: string
}

export interface TriggerPointProxyResult {
  likelihoodScore: number
  affectedRegions: string[]
  painCorrelation: number
  movementImpact: number
}

export interface RehabilitationProgressResult {
  progressPercent: number
  milestonesMet: number
  totalMilestones: number
  projectedCompletion: number
  adherenceRate: number
}

export interface ReturnToSportReadinessResult {
  readinessScore: number
  strengthSymmetry: number
  powerRecovery: number
  functionalCapacity: number
  psychologicalReadiness: number
  clearanceLevel: "not_ready" | "partial" | "full"
}

export interface PowerOutputDeclineResult {
  declinePercent: number
  annualRate: number
  comparedToBaseline: number
  interventionUrgency: "none" | "low" | "moderate" | "high"
}

export interface AgeRelatedStrengthLossResult {
  estimatedLossPercent: number
  sarcopeniaRisk: number
  muscleQualityIndex: number
  mitigationScore: number
}

export interface ExercisePrescriptionResult {
  recommendedIntensity: number
  recommendedVolume: number
  recommendedFrequency: number
  priorityAreas: string[]
  contraindications: string[]
}

export interface LoadManagementResult {
  acuteLoad: number
  chronicLoad: number
  acuteChronicRatio: number
  loadStatus: "undertraining" | "optimal" | "overreaching" | "overtraining"
  recommendation: string
}

export interface TissueToleranceResult {
  toleranceScore: number
  currentLoad: number
  maxTolerableLoad: number
  safetyMargin: number
  adaptationRate: number
}

export interface RepetitiveStrainRiskResult {
  riskScore: number
  cumulativeLoad: number
  restAdequacy: number
  tissueRecovery: number
  level: "low" | "moderate" | "high"
}

export interface ErgonomicHealthResult {
  score: number
  workstationRisk: number
  breakFrequency: number
  postureVariability: number
  recommendations: string[]
}

export interface SittingHealthImpactResult {
  impactScore: number
  dailySittingHours: number
  breakFrequencyScore: number
  metabolicImpact: number
  musculoskeletalImpact: number
}

export interface StandingToleranceResult {
  toleranceScore: number
  estimatedMaxMinutes: number
  fatigueRate: number
  discomfortOnset: number
}

export interface WalkingCapacityResult {
  capacityScore: number
  estimatedMaxDistanceKm: number
  gaitEfficiency: number
  enduranceFactor: number
  painLimitation: number
}

export interface StairClimbingCapacityResult {
  capacityScore: number
  estimatedFloors: number
  powerOutput: number
  cardiovascularLimit: number
  musculoskeletalLimit: number
}

export interface LiftingCapacityResult {
  estimatedMaxKg: number
  safeWorkingLoad: number
  formScore: number
  fatigueAdjustment: number
  riskLevel: "low" | "moderate" | "high"
}

export interface CarryingCapacityResult {
  estimatedMaxKg: number
  durationFactor: number
  distanceFactor: number
  postureImpact: number
}

export interface PushingPullingCapacityResult {
  pushCapacity: number
  pullCapacity: number
  sustainedForce: number
  peakForce: number
  asymmetry: number
}

export interface RotationalMobilityResult {
  overallScore: number
  cervicalRotation: number
  thoracicRotation: number
  lumbarRotation: number
  hipRotation: number
  asymmetry: number
}

// ---------------------------------------------------------------------------
// 1. Mobility Score
// ---------------------------------------------------------------------------

export async function computeMobilityScore(
  userId: string,
  date: Date = new Date(),
): Promise<MobilityScoreResult> {
  const start = daysAgo(date, 30)
  const [rom, flexibility, steps, activeMinutes] = await Promise.all([
    fetchMetric(userId, "range_of_motion", start, date),
    fetchMetric(userId, "flexibility_score", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "active_minutes", start, date),
  ])

  const romMean = mean(rom)
  const flexMean = mean(flexibility)
  const stepsMean = mean(steps)
  const activeMean = mean(activeMinutes)

  const upperBody = clamp(flexMean * 0.6 + romMean * 0.4)
  const lowerBody = clamp(
    (stepsMean / 100) * 0.5 + romMean * 0.3 + activeMean * 0.2,
  )
  const spine = clamp(flexMean * 0.5 + romMean * 0.5)
  const overall = clamp(upperBody * 0.3 + lowerBody * 0.4 + spine * 0.3)

  const prevStart = daysAgo(date, 60)
  const prevRom = await fetchMetric(userId, "range_of_motion", prevStart, start)
  const trend = mean(rom) - mean(prevRom)

  return { overall, upperBody, lowerBody, spine, trend }
}

// ---------------------------------------------------------------------------
// 2. Injury Risk
// ---------------------------------------------------------------------------

export async function computeInjuryRisk(
  userId: string,
  date: Date = new Date(),
): Promise<InjuryRiskResult> {
  const weekStart = daysAgo(date, 7)
  const monthStart = daysAgo(date, 28)
  const [acuteLoad, chronicLoad, pain, sleep] = await Promise.all([
    fetchMetric(userId, "training_load", weekStart, date),
    fetchMetric(userId, "training_load", monthStart, date),
    fetchMetric(userId, "pain_level", weekStart, date),
    fetchMetric(userId, "sleep_hours", weekStart, date),
  ])

  const acuteMean = mean(acuteLoad)
  const chronicMean = mean(chronicLoad)
  const acwr = chronicMean > 0 ? acuteMean / chronicMean : 1
  const painMean = mean(pain)
  const sleepMean = mean(sleep)

  const contributors: string[] = []
  let risk = 0

  if (acwr > 1.5) {
    risk += 30
    contributors.push("high_acute_chronic_ratio")
  } else if (acwr > 1.3) {
    risk += 15
    contributors.push("elevated_acute_chronic_ratio")
  }

  if (painMean > 5) {
    risk += 25
    contributors.push("elevated_pain")
  } else if (painMean > 3) {
    risk += 10
    contributors.push("mild_pain")
  }

  if (sleepMean < 6) {
    risk += 20
    contributors.push("insufficient_sleep")
  } else if (sleepMean < 7) {
    risk += 10
    contributors.push("suboptimal_sleep")
  }

  const loadVariability = coefficientOfVariation(acuteLoad)
  if (loadVariability > 0.5) {
    risk += 15
    contributors.push("high_load_variability")
  }

  risk = clamp(risk)
  const level =
    risk >= 75
      ? "very_high"
      : risk >= 50
        ? "high"
        : risk >= 25
          ? "moderate"
          : "low"

  return { riskScore: risk, level, contributors }
}

// ---------------------------------------------------------------------------
// 3. Joint Health Proxy
// ---------------------------------------------------------------------------

export async function computeJointHealthProxy(
  userId: string,
  date: Date = new Date(),
): Promise<JointHealthProxyResult> {
  const start = daysAgo(date, 30)
  const [stiffness, pain, activity, rom] = await Promise.all([
    fetchMetric(userId, "joint_stiffness", start, date),
    fetchMetric(userId, "joint_pain", start, date),
    fetchMetric(userId, "active_minutes", start, date),
    fetchMetric(userId, "range_of_motion", start, date),
  ])

  const stiffnessIndex = clamp(100 - mean(stiffness) * 10)
  const painCorrelation = clamp(100 - mean(pain) * 12)
  const activityImpact = clamp(mean(activity) / 0.6)
  const romFactor = clamp(mean(rom))

  const score = clamp(
    stiffnessIndex * 0.25 + painCorrelation * 0.3 + activityImpact * 0.2 + romFactor * 0.25,
  )

  return { score, stiffnessIndex, painCorrelation, activityImpact }
}

// ---------------------------------------------------------------------------
// 4. Movement Patterns
// ---------------------------------------------------------------------------

export async function computeMovementPatterns(
  userId: string,
  date: Date = new Date(),
): Promise<MovementPatternResult> {
  const start = daysAgo(date, 14)
  const [leftForce, rightForce, cadence, stability] = await Promise.all([
    fetchMetric(userId, "left_limb_force", start, date),
    fetchMetric(userId, "right_limb_force", start, date),
    fetchMetric(userId, "movement_cadence", start, date),
    fetchMetric(userId, "stability_score", start, date),
  ])

  const leftMean = mean(leftForce)
  const rightMean = mean(rightForce)
  const maxSide = Math.max(leftMean, rightMean, 1)
  const symmetryScore = clamp((1 - Math.abs(leftMean - rightMean) / maxSide) * 100)

  const consistencyScore = clamp(100 - coefficientOfVariation(cadence) * 100)
  const qualityScore = clamp(mean(stability))
  const compensationRisk = clamp(100 - symmetryScore * 0.5 - qualityScore * 0.5)

  return { symmetryScore, consistencyScore, qualityScore, compensationRisk }
}

// ---------------------------------------------------------------------------
// 5. FMS-like Scoring
// ---------------------------------------------------------------------------

export async function computeFmsLikeScore(
  userId: string,
  date: Date = new Date(),
): Promise<FmsLikeScoreResult> {
  const start = daysAgo(date, 30)
  const metrics = [
    "squat_depth",
    "hurdle_step_score",
    "lunge_stability",
    "shoulder_mobility_score",
    "hamstring_flexibility",
    "pushup_form_score",
    "rotary_stability_score",
  ] as const

  const raw = await Promise.all(
    metrics.map((m) => fetchMetric(userId, m, start, date)),
  )

  const toThree = (vals: number[]) => clamp(Math.round(mean(vals)), 0, 3)

  const deepSquat = toThree(raw[0])
  const hurdleStep = toThree(raw[1])
  const inlineLunge = toThree(raw[2])
  const shoulderMobility = toThree(raw[3])
  const activeStraightLegRaise = toThree(raw[4])
  const trunkStabilityPushup = toThree(raw[5])
  const rotaryStability = toThree(raw[6])

  const totalScore =
    deepSquat +
    hurdleStep +
    inlineLunge +
    shoulderMobility +
    activeStraightLegRaise +
    trunkStabilityPushup +
    rotaryStability

  return {
    totalScore,
    deepSquat,
    hurdleStep,
    inlineLunge,
    shoulderMobility,
    activeStraightLegRaise,
    trunkStabilityPushup,
    rotaryStability,
  }
}

// ---------------------------------------------------------------------------
// 6. Osteoarthritis Risk
// ---------------------------------------------------------------------------

export async function computeOsteoarthritisRisk(
  userId: string,
  date: Date = new Date(),
): Promise<OsteoarthritisRiskResult> {
  const start = daysAgo(date, 90)
  const [bmi, jointPain, activity, age, impactLoad] = await Promise.all([
    fetchMetric(userId, "bmi", start, date),
    fetchMetric(userId, "joint_pain", start, date),
    fetchMetric(userId, "active_minutes", start, date),
    fetchMetric(userId, "age", start, date),
    fetchMetric(userId, "impact_load", start, date),
  ])

  const bmiVal = mean(bmi)
  const painVal = mean(jointPain)
  const activityVal = mean(activity)
  const ageVal = mean(age)
  const impactVal = mean(impactLoad)

  let risk = 0
  const modifiableFactors: string[] = []
  const protectiveFactors: string[] = []

  if (bmiVal > 30) {
    risk += 25
    modifiableFactors.push("obesity")
  } else if (bmiVal > 25) {
    risk += 10
    modifiableFactors.push("overweight")
  }

  if (painVal > 4) {
    risk += 20
    modifiableFactors.push("chronic_joint_pain")
  }

  if (impactVal > 70) {
    risk += 15
    modifiableFactors.push("high_impact_loading")
  }

  if (ageVal > 55) risk += 20
  else if (ageVal > 45) risk += 10

  if (activityVal >= 30 && activityVal <= 90) {
    risk -= 10
    protectiveFactors.push("moderate_activity")
  }

  if (bmiVal >= 18.5 && bmiVal <= 24.9) {
    protectiveFactors.push("healthy_weight")
  }

  risk = clamp(risk)
  const level = risk >= 60 ? "high" : risk >= 30 ? "moderate" : "low"

  return { riskScore: risk, level, modifiableFactors, protectiveFactors }
}

// ---------------------------------------------------------------------------
// 7. Posture Proxy
// ---------------------------------------------------------------------------

export async function computePostureProxy(
  userId: string,
  date: Date = new Date(),
): Promise<PostureProxyResult> {
  const start = daysAgo(date, 14)
  const [neckAngle, thoracicAngle, lumbarAngle, sittingHours] = await Promise.all([
    fetchMetric(userId, "neck_angle", start, date),
    fetchMetric(userId, "thoracic_angle", start, date),
    fetchMetric(userId, "lumbar_angle", start, date),
    fetchMetric(userId, "sitting_hours", start, date),
  ])

  const forwardHeadRisk = clamp(mean(neckAngle) * 2.5)
  const thoracicKyphosisRisk = clamp(mean(thoracicAngle) * 2)
  const lumbarLordosisRisk = clamp(Math.abs(mean(lumbarAngle) - 30) * 2)

  const sittingPenalty = clamp(mean(sittingHours) * 3, 0, 30)

  const overallAlignment = clamp(
    100 - forwardHeadRisk * 0.35 - thoracicKyphosisRisk * 0.35 - lumbarLordosisRisk * 0.3,
  )

  const score = clamp(overallAlignment - sittingPenalty)

  return { score, forwardHeadRisk, thoracicKyphosisRisk, lumbarLordosisRisk, overallAlignment }
}

// ---------------------------------------------------------------------------
// 8. Gait Analysis
// ---------------------------------------------------------------------------

export async function computeGaitAnalysis(
  userId: string,
  date: Date = new Date(),
): Promise<GaitAnalysisResult> {
  const start = daysAgo(date, 7)
  const [cadenceVals, strideLen, leftGct, rightGct, speed] = await Promise.all([
    fetchMetric(userId, "step_cadence", start, date),
    fetchMetric(userId, "stride_length", start, date),
    fetchMetric(userId, "left_ground_contact_time", start, date),
    fetchMetric(userId, "right_ground_contact_time", start, date),
    fetchMetric(userId, "walking_speed", start, date),
  ])

  const cadence = mean(cadenceVals)
  const strideVariability = coefficientOfVariation(strideLen) * 100

  const leftGctMean = mean(leftGct)
  const rightGctMean = mean(rightGct)
  const gctMax = Math.max(leftGctMean, rightGctMean, 1)
  const symmetryIndex = clamp(
    (1 - Math.abs(leftGctMean - rightGctMean) / gctMax) * 100,
  )

  const stabilityScore = clamp(100 - strideVariability * 5)
  const efficiency = clamp(
    (mean(speed) * mean(strideLen)) / Math.max(cadence, 1) * 50,
  )

  return { cadence, strideVariability, symmetryIndex, stabilityScore, efficiency }
}

// ---------------------------------------------------------------------------
// 9. Balance Assessment
// ---------------------------------------------------------------------------

export async function computeBalanceAssessment(
  userId: string,
  date: Date = new Date(),
): Promise<BalanceAssessmentResult> {
  const start = daysAgo(date, 14)
  const [sway, singleLeg, dynamicBal, stability] = await Promise.all([
    fetchMetric(userId, "postural_sway", start, date),
    fetchMetric(userId, "single_leg_stance_time", start, date),
    fetchMetric(userId, "dynamic_balance_score", start, date),
    fetchMetric(userId, "stability_score", start, date),
  ])

  const staticBalance = clamp(100 - mean(sway) * 3)
  const dynamicBalance = clamp(mean(dynamicBal))
  const singleLegStance = clamp(mean(singleLeg) / 0.3)
  const overallScore = clamp(
    staticBalance * 0.3 + dynamicBalance * 0.35 + singleLegStance * 0.2 + mean(stability) * 0.15,
  )

  return { staticBalance, dynamicBalance, singleLegStance, overallScore }
}

// ---------------------------------------------------------------------------
// 10. Fall Risk
// ---------------------------------------------------------------------------

export async function computeFallRisk(
  userId: string,
  date: Date = new Date(),
): Promise<FallRiskResult> {
  const start = daysAgo(date, 30)
  const [balance, gait, strength, vision, medications, age] = await Promise.all([
    fetchMetric(userId, "stability_score", start, date),
    fetchMetric(userId, "gait_score", start, date),
    fetchMetric(userId, "lower_body_strength", start, date),
    fetchMetric(userId, "vision_score", start, date),
    fetchMetric(userId, "medication_count", start, date),
    fetchMetric(userId, "age", start, date),
  ])

  let risk = 0
  const factors: string[] = []
  const recommendations: string[] = []

  const balanceMean = mean(balance)
  if (balanceMean < 50) {
    risk += 25
    factors.push("poor_balance")
    recommendations.push("balance_training_program")
  }

  const gaitMean = mean(gait)
  if (gaitMean < 50) {
    risk += 20
    factors.push("impaired_gait")
    recommendations.push("gait_rehabilitation")
  }

  const strengthMean = mean(strength)
  if (strengthMean < 40) {
    risk += 20
    factors.push("lower_body_weakness")
    recommendations.push("strength_training")
  }

  if (mean(vision) < 50) {
    risk += 10
    factors.push("vision_impairment")
  }

  if (mean(medications) >= 4) {
    risk += 10
    factors.push("polypharmacy")
    recommendations.push("medication_review")
  }

  if (mean(age) > 65) {
    risk += 15
    factors.push("advanced_age")
  }

  risk = clamp(risk)
  const level = risk >= 60 ? "high" : risk >= 30 ? "moderate" : "low"

  return { riskScore: risk, level, factors, recommendations }
}

// ---------------------------------------------------------------------------
// 11. Core Stability
// ---------------------------------------------------------------------------

export async function computeCoreStability(
  userId: string,
  date: Date = new Date(),
): Promise<CoreStabilityResult> {
  const start = daysAgo(date, 14)
  const [plank, backExtension, sidePlank, rotation, trunkControl] = await Promise.all([
    fetchMetric(userId, "plank_hold_seconds", start, date),
    fetchMetric(userId, "back_extension_hold", start, date),
    fetchMetric(userId, "side_plank_seconds", start, date),
    fetchMetric(userId, "rotational_control_score", start, date),
    fetchMetric(userId, "trunk_stability_score", start, date),
  ])

  const anteriorChain = clamp(mean(plank) / 1.2)
  const posteriorChain = clamp(mean(backExtension) / 1.0)
  const lateralStability = clamp(mean(sidePlank) / 0.9)
  const rotationalControl = clamp(mean(rotation))

  const score = clamp(
    anteriorChain * 0.3 +
    posteriorChain * 0.25 +
    lateralStability * 0.25 +
    rotationalControl * 0.2,
  )

  return { score, anteriorChain, posteriorChain, lateralStability, rotationalControl }
}

// ---------------------------------------------------------------------------
// 12. Flexibility Index
// ---------------------------------------------------------------------------

export async function computeFlexibilityIndex(
  userId: string,
  date: Date = new Date(),
): Promise<FlexibilityIndexResult> {
  const start = daysAgo(date, 30)
  const prevStart = daysAgo(date, 60)
  const [hamstrings, hipFlexors, shoulders, thoracolumbar] = await Promise.all([
    fetchMetric(userId, "hamstring_flexibility", start, date),
    fetchMetric(userId, "hip_flexor_length", start, date),
    fetchMetric(userId, "shoulder_flexibility", start, date),
    fetchMetric(userId, "thoracolumbar_flexibility", start, date),
  ])

  const prevHam = await fetchMetric(userId, "hamstring_flexibility", prevStart, start)

  const hamScore = clamp(mean(hamstrings))
  const hipScore = clamp(mean(hipFlexors))
  const shoulderScore = clamp(mean(shoulders))
  const thoracolumbarScore = clamp(mean(thoracolumbar))

  const overallIndex = clamp(
    hamScore * 0.3 + hipScore * 0.25 + shoulderScore * 0.25 + thoracolumbarScore * 0.2,
  )

  const trend = mean(hamstrings) - mean(prevHam)

  return {
    overallIndex,
    hamstrings: hamScore,
    hipFlexors: hipScore,
    shoulders: shoulderScore,
    thoracolumbar: thoracolumbarScore,
    trend,
  }
}

// ---------------------------------------------------------------------------
// 13. Grip Strength Estimate
// ---------------------------------------------------------------------------

export async function computeGripStrengthEstimate(
  userId: string,
  date: Date = new Date(),
): Promise<GripStrengthEstimateResult> {
  const start = daysAgo(date, 30)
  const prevStart = daysAgo(date, 60)
  const [grip, age, weight, activity] = await Promise.all([
    fetchMetric(userId, "grip_strength_kg", start, date),
    fetchMetric(userId, "age", start, date),
    fetchMetric(userId, "body_weight_kg", start, date),
    fetchMetric(userId, "resistance_training_minutes", start, date),
  ])

  let estimatedKg = mean(grip)
  if (estimatedKg === 0) {
    const wt = mean(weight) || 70
    const actFactor = Math.min(mean(activity) / 60, 1.5)
    estimatedKg = wt * 0.5 * (0.8 + actFactor * 0.2)
  }

  const ageVal = mean(age) || 30
  const normalForAge = Math.max(50 - (ageVal - 30) * 0.5, 20)
  const percentileForAge = clamp((estimatedKg / normalForAge) * 50)

  const prevGrip = await fetchMetric(userId, "grip_strength_kg", prevStart, start)
  const trend = estimatedKg - mean(prevGrip)

  const sarcopeniaRisk = clamp(
    estimatedKg < 26 ? 60 + (26 - estimatedKg) * 5 : Math.max(0, 30 - estimatedKg),
  )

  return { estimatedKg, percentileForAge, trend, sarcopeniaRisk }
}

// ---------------------------------------------------------------------------
// 14. Tendon Health
// ---------------------------------------------------------------------------

export async function computeTendonHealth(
  userId: string,
  date: Date = new Date(),
): Promise<TendonHealthResult> {
  const start = daysAgo(date, 30)
  const [load, pain, recovery, volume] = await Promise.all([
    fetchMetric(userId, "tendon_load", start, date),
    fetchMetric(userId, "tendon_pain", start, date),
    fetchMetric(userId, "recovery_score", start, date),
    fetchMetric(userId, "training_volume", start, date),
  ])

  const loadTolerance = clamp(100 - mean(pain) * 15)
  const recoveryCapacity = clamp(mean(recovery))
  const overloadRisk = clamp(
    (mean(load) / Math.max(mean(volume), 1)) * 50 + mean(pain) * 10,
  )

  const score = clamp(
    loadTolerance * 0.4 + recoveryCapacity * 0.35 + (100 - overloadRisk) * 0.25,
  )

  return { score, loadTolerance, recoveryCapacity, overloadRisk }
}

// ---------------------------------------------------------------------------
// 15. Muscle Fatiguability
// ---------------------------------------------------------------------------

export async function computeMuscleFatiguability(
  userId: string,
  date: Date = new Date(),
): Promise<MuscleFatiguabilityResult> {
  const start = daysAgo(date, 14)
  const [peakPower, endPower, heartRateRecovery, rpe] = await Promise.all([
    fetchMetric(userId, "peak_power_output", start, date),
    fetchMetric(userId, "end_session_power", start, date),
    fetchMetric(userId, "heart_rate_recovery_60s", start, date),
    fetchMetric(userId, "rpe", start, date),
  ])

  const peakMean = mean(peakPower)
  const endMean = mean(endPower)
  const performanceDecline = peakMean > 0 ? clamp(((peakMean - endMean) / peakMean) * 100) : 0

  const enduranceRatio = peakMean > 0 ? clamp((endMean / peakMean) * 100) : 50
  const recoveryRate = clamp(mean(heartRateRecovery) / 0.4)

  const fatigueIndex = clamp(
    performanceDecline * 0.4 + (100 - enduranceRatio) * 0.3 + mean(rpe) * 3,
  )

  return { fatigueIndex, enduranceRatio, recoveryRate, performanceDecline }
}

// ---------------------------------------------------------------------------
// 16. Recovery After Exercise
// ---------------------------------------------------------------------------

export async function computeRecoveryAfterExercise(
  userId: string,
  date: Date = new Date(),
): Promise<RecoveryAfterExerciseResult> {
  const start = daysAgo(date, 7)
  const [hrv, restingHr, sleep, soreness, power] = await Promise.all([
    fetchMetric(userId, "hrv_rmssd", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
    fetchMetric(userId, "sleep_quality", start, date),
    fetchMetric(userId, "muscle_soreness", start, date),
    fetchMetric(userId, "peak_power_output", start, date),
  ])

  const cardiovascularRecovery = clamp(mean(hrv) / 0.6 + (70 - mean(restingHr)))
  const neuromuscularRecovery = clamp(
    mean(power) > 0 ? (mean(power) / (mean(power) + 10)) * 100 : 50,
  )
  const muscleReadiness = clamp(100 - mean(soreness) * 12)
  const sleepFactor = clamp(mean(sleep))

  const recoveryScore = clamp(
    cardiovascularRecovery * 0.3 +
    neuromuscularRecovery * 0.25 +
    muscleReadiness * 0.25 +
    sleepFactor * 0.2,
  )

  const hoursToBaseline = Math.max(12, 72 - recoveryScore * 0.6)

  return {
    recoveryScore,
    hoursToBaseline,
    muscleReadiness,
    cardiovascularRecovery,
    neuromuscularRecovery,
  }
}

// ---------------------------------------------------------------------------
// 17. Overuse Injury Risk
// ---------------------------------------------------------------------------

export async function computeOveruseInjuryRisk(
  userId: string,
  date: Date = new Date(),
): Promise<OveruseInjuryRiskResult> {
  const weekStart = daysAgo(date, 7)
  const fourWeekStart = daysAgo(date, 28)
  const dailyLoads = await fetchMetric(userId, "training_load", fourWeekStart, date)

  const weeklyLoads: number[] = []
  for (let w = 0; w < 4; w++) {
    const wStart = w * 7
    const wEnd = (w + 1) * 7
    const weekSlice = dailyLoads.slice(wStart, Math.min(wEnd, dailyLoads.length))
    weeklyLoads.push(weekSlice.reduce((a, b) => a + b, 0))
  }

  const acuteLoad = weeklyLoads[0] || 0
  const chronicLoad = mean(weeklyLoads)
  const acuteChronicRatio = chronicLoad > 0 ? acuteLoad / chronicLoad : 1

  const monotonyIndex =
    stddev(dailyLoads.slice(0, 7)) > 0
      ? mean(dailyLoads.slice(0, 7)) / stddev(dailyLoads.slice(0, 7))
      : 1
  const strainIndex = acuteLoad * monotonyIndex

  let riskScore = 0
  if (acuteChronicRatio > 1.5) riskScore += 35
  else if (acuteChronicRatio > 1.3) riskScore += 20
  else if (acuteChronicRatio < 0.8) riskScore += 10

  if (monotonyIndex > 2) riskScore += 25
  else if (monotonyIndex > 1.5) riskScore += 15

  riskScore += clamp(strainIndex / 100, 0, 30)
  riskScore = clamp(riskScore)

  const level = riskScore >= 60 ? "high" : riskScore >= 30 ? "moderate" : "low"

  return { riskScore, level, acuteChronicRatio, monotonyIndex, strainIndex }
}

// ---------------------------------------------------------------------------
// 18. Spinal Health
// ---------------------------------------------------------------------------

export async function computeSpinalHealth(
  userId: string,
  date: Date = new Date(),
): Promise<SpinalHealthResult> {
  const start = daysAgo(date, 30)
  const [cervicalPain, thoracicMob, lumbarPain, coreStrength, sitting] = await Promise.all([
    fetchMetric(userId, "cervical_pain", start, date),
    fetchMetric(userId, "thoracic_mobility", start, date),
    fetchMetric(userId, "lumbar_pain", start, date),
    fetchMetric(userId, "core_strength_score", start, date),
    fetchMetric(userId, "sitting_hours", start, date),
  ])

  const cervicalScore = clamp(100 - mean(cervicalPain) * 12)
  const thoracicScore = clamp(mean(thoracicMob))
  const lumbarScore = clamp(100 - mean(lumbarPain) * 12)
  const discHealthProxy = clamp(
    (cervicalScore + lumbarScore) / 2 - mean(sitting) * 2,
  )

  const overallScore = clamp(
    cervicalScore * 0.25 +
    thoracicScore * 0.25 +
    lumbarScore * 0.3 +
    mean(coreStrength) * 0.2,
  )

  return { overallScore, cervicalScore, thoracicScore, lumbarScore, discHealthProxy }
}

// ---------------------------------------------------------------------------
// 19. Range of Motion Proxy
// ---------------------------------------------------------------------------

export async function computeRangeOfMotionProxy(
  userId: string,
  date: Date = new Date(),
): Promise<RangeOfMotionProxyResult> {
  const start = daysAgo(date, 30)
  const prevStart = daysAgo(date, 60)
  const [shoulder, hip, knee, ankle] = await Promise.all([
    fetchMetric(userId, "shoulder_rom", start, date),
    fetchMetric(userId, "hip_rom", start, date),
    fetchMetric(userId, "knee_rom", start, date),
    fetchMetric(userId, "ankle_rom", start, date),
  ])

  const shoulderRom = clamp(mean(shoulder))
  const hipRom = clamp(mean(hip))
  const kneeRom = clamp(mean(knee))
  const ankleRom = clamp(mean(ankle))

  const overallRom = clamp(
    shoulderRom * 0.25 + hipRom * 0.3 + kneeRom * 0.25 + ankleRom * 0.2,
  )

  const prevShoulder = await fetchMetric(userId, "shoulder_rom", prevStart, start)
  const trend = mean(shoulder) - mean(prevShoulder)

  return { overallRom, shoulderRom, hipRom, kneeRom, ankleRom, trend }
}

// ---------------------------------------------------------------------------
// 20. Muscle Imbalance
// ---------------------------------------------------------------------------

export async function computeMuscleImbalance(
  userId: string,
  date: Date = new Date(),
): Promise<MuscleImbalanceResult> {
  const start = daysAgo(date, 14)
  const [leftStr, rightStr, anteriorStr, posteriorStr, upperStr, lowerStr] =
    await Promise.all([
      fetchMetric(userId, "left_leg_strength", start, date),
      fetchMetric(userId, "right_leg_strength", start, date),
      fetchMetric(userId, "anterior_chain_strength", start, date),
      fetchMetric(userId, "posterior_chain_strength", start, date),
      fetchMetric(userId, "upper_body_strength", start, date),
      fetchMetric(userId, "lower_body_strength", start, date),
    ])

  const leftMean = mean(leftStr)
  const rightMean = mean(rightStr)
  const maxLR = Math.max(leftMean, rightMean, 1)
  const leftRightAsymmetry = clamp(
    (Math.abs(leftMean - rightMean) / maxLR) * 100,
  )

  const antMean = mean(anteriorStr)
  const postMean = mean(posteriorStr)
  const anteriorPosteriorRatio = postMean > 0 ? antMean / postMean : 1

  const upMean = mean(upperStr)
  const loMean = mean(lowerStr)
  const upperLowerRatio = loMean > 0 ? upMean / loMean : 1

  const imbalanceScore = clamp(
    leftRightAsymmetry * 0.4 +
    Math.abs(anteriorPosteriorRatio - 0.6) * 50 +
    Math.abs(upperLowerRatio - 0.5) * 40,
  )

  const riskLevel =
    imbalanceScore >= 60 ? "high" : imbalanceScore >= 30 ? "moderate" : "low"

  return {
    imbalanceScore,
    leftRightAsymmetry,
    anteriorPosteriorRatio,
    upperLowerRatio,
    riskLevel,
  }
}

// ---------------------------------------------------------------------------
// 21. Bone Density Proxy
// ---------------------------------------------------------------------------

export async function computeBoneDensityProxy(
  userId: string,
  date: Date = new Date(),
): Promise<BoneDensityProxyResult> {
  const start = daysAgo(date, 90)
  const [impactLoad, resistance, calcium, vitD, age, weight] = await Promise.all([
    fetchMetric(userId, "impact_load", start, date),
    fetchMetric(userId, "resistance_training_minutes", start, date),
    fetchMetric(userId, "calcium_intake_mg", start, date),
    fetchMetric(userId, "vitamin_d_level", start, date),
    fetchMetric(userId, "age", start, date),
    fetchMetric(userId, "body_weight_kg", start, date),
  ])

  const loadingScore = clamp(
    mean(impactLoad) * 0.5 + mean(resistance) * 0.3 + mean(weight) * 0.2,
  )

  const calciumAdequacy = clamp((mean(calcium) / 1000) * 100)
  const vitDAdequacy = clamp((mean(vitD) / 30) * 100)
  const nutritionFactor = (calciumAdequacy + vitDAdequacy) / 2

  const ageVal = mean(age) || 30
  const agePenalty = Math.max(0, (ageVal - 50) * 1.5)

  const rawTScore = (loadingScore * 0.4 + nutritionFactor * 0.3) / 20 - agePenalty / 30
  const estimatedTScore = Math.max(-4, Math.min(2, rawTScore))

  const riskCategory =
    estimatedTScore < -2.5
      ? "osteoporosis_risk"
      : estimatedTScore < -1
        ? "osteopenia"
        : "normal"

  return { estimatedTScore, loadingScore, nutritionFactor, riskCategory }
}

// ---------------------------------------------------------------------------
// 22. Ligament Stress
// ---------------------------------------------------------------------------

export async function computeLigamentStress(
  userId: string,
  date: Date = new Date(),
): Promise<LigamentStressResult> {
  const weekStart = daysAgo(date, 7)
  const monthStart = daysAgo(date, 28)
  const [acuteImpact, chronicImpact, instability, pivotLoad] = await Promise.all([
    fetchMetric(userId, "impact_load", weekStart, date),
    fetchMetric(userId, "impact_load", monthStart, date),
    fetchMetric(userId, "joint_instability_score", weekStart, date),
    fetchMetric(userId, "pivot_load", weekStart, date),
  ])

  const acuteLoadFactor = clamp(mean(acuteImpact))
  const chronicAdaptation = clamp(mean(chronicImpact) * 0.8)
  const instabilityFactor = mean(instability)

  const stressIndex = clamp(
    acuteLoadFactor * 0.35 +
    mean(pivotLoad) * 0.25 +
    instabilityFactor * 10 +
    Math.max(0, acuteLoadFactor - chronicAdaptation) * 0.3,
  )

  const injuryRisk = clamp(
    stressIndex * 0.6 + instabilityFactor * 20 + Math.max(0, acuteLoadFactor - chronicAdaptation),
  )

  return { stressIndex, acuteLoadFactor, chronicAdaptation, injuryRisk }
}

// ---------------------------------------------------------------------------
// 23. Cartilage Health
// ---------------------------------------------------------------------------

export async function computeCartilageHealth(
  userId: string,
  date: Date = new Date(),
): Promise<CartilageHealthResult> {
  const start = daysAgo(date, 30)
  const [jointPain, activity, bmi, impact, recovery] = await Promise.all([
    fetchMetric(userId, "joint_pain", start, date),
    fetchMetric(userId, "active_minutes", start, date),
    fetchMetric(userId, "bmi", start, date),
    fetchMetric(userId, "impact_load", start, date),
    fetchMetric(userId, "recovery_score", start, date),
  ])

  const painFactor = clamp(100 - mean(jointPain) * 12)
  const activityFactor = mean(activity)
  const loadDistribution = clamp(
    activityFactor >= 20 && activityFactor <= 60
      ? 80 + (30 - Math.abs(activityFactor - 40))
      : 50,
  )

  const bmiPenalty = Math.max(0, (mean(bmi) - 25) * 4)
  const recoveryEfficiency = clamp(mean(recovery))
  const degradationRisk = clamp(
    mean(impact) * 0.3 + bmiPenalty + mean(jointPain) * 8,
  )

  const healthScore = clamp(
    painFactor * 0.3 +
    loadDistribution * 0.25 +
    recoveryEfficiency * 0.25 +
    (100 - degradationRisk) * 0.2,
  )

  return { healthScore, loadDistribution, recoveryEfficiency, degradationRisk }
}

// ---------------------------------------------------------------------------
// 24. Muscle Activation Patterns
// ---------------------------------------------------------------------------

export async function computeMuscleActivationPatterns(
  userId: string,
  date: Date = new Date(),
): Promise<MuscleActivationPatternResult> {
  const start = daysAgo(date, 14)
  const [emgPeak, emgOnset, coActivation, movementQuality] = await Promise.all([
    fetchMetric(userId, "emg_peak_amplitude", start, date),
    fetchMetric(userId, "emg_onset_delay_ms", start, date),
    fetchMetric(userId, "co_activation_ratio", start, date),
    fetchMetric(userId, "movement_quality_score", start, date),
  ])

  const activationScore = clamp(mean(emgPeak) / 0.8)
  const onsetDelay = mean(emgOnset)
  const sequencingQuality = clamp(100 - onsetDelay * 0.5)
  const inhibitionRisk = clamp(
    (100 - activationScore) * 0.5 + onsetDelay * 0.3,
  )
  const coordinationIndex = clamp(
    mean(movementQuality) * 0.6 + (100 - mean(coActivation) * 50) * 0.4,
  )

  return { activationScore, sequencingQuality, inhibitionRisk, coordinationIndex }
}

// ---------------------------------------------------------------------------
// 25. Proprioception
// ---------------------------------------------------------------------------

export async function computeProprioception(
  userId: string,
  date: Date = new Date(),
): Promise<ProprioceptionResult> {
  const start = daysAgo(date, 14)
  const [balanceScore, jointPosition, reactionTime, age] = await Promise.all([
    fetchMetric(userId, "stability_score", start, date),
    fetchMetric(userId, "joint_position_error", start, date),
    fetchMetric(userId, "reaction_time_ms", start, date),
    fetchMetric(userId, "age", start, date),
  ])

  const balanceComponent = clamp(mean(balanceScore))
  const jointPositionSense = clamp(100 - mean(jointPosition) * 5)
  const reactiveControl = clamp(100 - (mean(reactionTime) - 200) * 0.3)

  const ageVal = mean(age) || 30
  const ageFactor = clamp(100 - Math.max(0, ageVal - 40) * 1.5)

  const score = clamp(
    balanceComponent * 0.3 +
    jointPositionSense * 0.25 +
    reactiveControl * 0.25 +
    ageFactor * 0.2,
  )

  return { score, balanceComponent, jointPositionSense, reactiveControl, ageFactor }
}

// ---------------------------------------------------------------------------
// 26. Kinetic Chain
// ---------------------------------------------------------------------------

export async function computeKineticChain(
  userId: string,
  date: Date = new Date(),
): Promise<KineticChainResult> {
  const start = daysAgo(date, 14)
  const [ankleStr, kneeStr, hipStr, coreStr, shoulderStr, wristStr] =
    await Promise.all([
      fetchMetric(userId, "ankle_strength", start, date),
      fetchMetric(userId, "knee_strength", start, date),
      fetchMetric(userId, "hip_strength", start, date),
      fetchMetric(userId, "core_strength_score", start, date),
      fetchMetric(userId, "shoulder_strength", start, date),
      fetchMetric(userId, "wrist_strength", start, date),
    ])

  const segments = [
    { name: "ankle", val: mean(ankleStr) },
    { name: "knee", val: mean(kneeStr) },
    { name: "hip", val: mean(hipStr) },
    { name: "core", val: mean(coreStr) },
    { name: "shoulder", val: mean(shoulderStr) },
    { name: "wrist", val: mean(wristStr) },
  ]

  const segMeans = segments.map((s) => s.val)
  const overallMean = mean(segMeans)
  const weakLinks = segments
    .filter((s) => s.val < overallMean * 0.75)
    .map((s) => s.name)

  const powerTransfer = clamp(
    100 - coefficientOfVariation(segMeans) * 150,
  )

  const segmentalContribution = clamp(
    overallMean > 0 ? (Math.min(...segMeans) / overallMean) * 100 : 0,
  )

  const efficiencyScore = clamp(
    powerTransfer * 0.5 + segmentalContribution * 0.3 + (weakLinks.length === 0 ? 20 : 0),
  )

  return { efficiencyScore, weakLinks, powerTransfer, segmentalContribution }
}

// ---------------------------------------------------------------------------
// 27. Plyometric Readiness
// ---------------------------------------------------------------------------

export async function computePlyometricReadiness(
  userId: string,
  date: Date = new Date(),
): Promise<PlyometricReadinessResult> {
  const start = daysAgo(date, 14)
  const [squat1rm, bodyWeight, jumpHeight, groundContact, landingScore] =
    await Promise.all([
      fetchMetric(userId, "squat_1rm_kg", start, date),
      fetchMetric(userId, "body_weight_kg", start, date),
      fetchMetric(userId, "vertical_jump_cm", start, date),
      fetchMetric(userId, "ground_contact_time_ms", start, date),
      fetchMetric(userId, "landing_mechanics_score", start, date),
    ])

  const bw = mean(bodyWeight) || 70
  const relativeStrength = mean(squat1rm) / bw

  const rsi =
    mean(groundContact) > 0
      ? (mean(jumpHeight) / 100) / (mean(groundContact) / 1000)
      : 0
  const reactiveStrengthIndex = clamp(rsi * 30)

  const landingMechanics = clamp(mean(landingScore))
  const eccConRatio = relativeStrength > 0 ? clamp(relativeStrength * 50) : 30

  const readinessScore = clamp(
    reactiveStrengthIndex * 0.3 +
    landingMechanics * 0.3 +
    eccConRatio * 0.2 +
    (relativeStrength >= 1.5 ? 20 : relativeStrength * 13.3),
  )

  let recommendation: string
  if (readinessScore >= 80) recommendation = "ready_for_advanced_plyometrics"
  else if (readinessScore >= 60) recommendation = "moderate_plyometrics_appropriate"
  else if (readinessScore >= 40) recommendation = "basic_plyometrics_with_caution"
  else recommendation = "focus_on_strength_base_first"

  return {
    readinessScore,
    reactiveStrengthIndex,
    landingMechanics,
    eccConRatio,
    recommendation,
  }
}

// ---------------------------------------------------------------------------
// 28. Isometric Strength
// ---------------------------------------------------------------------------

export async function computeIsometricStrength(
  userId: string,
  date: Date = new Date(),
): Promise<IsometricStrengthResult> {
  const start = daysAgo(date, 30)
  const prevStart = daysAgo(date, 60)
  const [isoForce, holdTime, fatigueDrop] = await Promise.all([
    fetchMetric(userId, "isometric_peak_force_n", start, date),
    fetchMetric(userId, "isometric_hold_seconds", start, date),
    fetchMetric(userId, "isometric_fatigue_drop_pct", start, date),
  ])

  const estimatedForce = mean(isoForce)
  const holdCapacity = clamp(mean(holdTime) / 0.6)
  const fatigueResistance = clamp(100 - mean(fatigueDrop))

  const prevForce = await fetchMetric(
    userId,
    "isometric_peak_force_n",
    prevStart,
    start,
  )
  const trend = estimatedForce - mean(prevForce)

  return { estimatedForce, holdCapacity, fatigueResistance, trend }
}

// ---------------------------------------------------------------------------
// 29. Eccentric Capacity
// ---------------------------------------------------------------------------

export async function computeEccentricCapacity(
  userId: string,
  date: Date = new Date(),
): Promise<EccentricCapacityResult> {
  const start = daysAgo(date, 14)
  const [eccForce, concForce, deceleration, elongation] = await Promise.all([
    fetchMetric(userId, "eccentric_force_n", start, date),
    fetchMetric(userId, "concentric_force_n", start, date),
    fetchMetric(userId, "deceleration_score", start, date),
    fetchMetric(userId, "muscle_elongation_tolerance", start, date),
  ])

  const eccMean = mean(eccForce)
  const concMean = mean(concForce)
  const loadAbsorption = clamp(
    concMean > 0 ? (eccMean / concMean) * 60 : 40,
  )
  const decelerationControl = clamp(mean(deceleration))
  const muscleElongationTolerance = clamp(mean(elongation))

  const capacityScore = clamp(
    loadAbsorption * 0.35 +
    decelerationControl * 0.35 +
    muscleElongationTolerance * 0.3,
  )

  return { capacityScore, loadAbsorption, decelerationControl, muscleElongationTolerance }
}

// ---------------------------------------------------------------------------
// 30. Concentric Power
// ---------------------------------------------------------------------------

export async function computeConcentricPower(
  userId: string,
  date: Date = new Date(),
): Promise<ConcentricPowerResult> {
  const start = daysAgo(date, 14)
  const [peakPowerVals, avgPowerVals, rfd, repPower] = await Promise.all([
    fetchMetric(userId, "concentric_peak_power_w", start, date),
    fetchMetric(userId, "concentric_avg_power_w", start, date),
    fetchMetric(userId, "rate_of_force_development", start, date),
    fetchMetric(userId, "rep_power_endurance", start, date),
  ])

  const peakPower = mean(peakPowerVals)
  const averagePower = mean(avgPowerVals)
  const rateOfForceDevelopment = clamp(mean(rfd) / 10)
  const powerEndurance = clamp(mean(repPower))

  return { peakPower, averagePower, rateOfForceDevelopment, powerEndurance }
}

// ---------------------------------------------------------------------------
// 31. Stretch Shortening Cycle
// ---------------------------------------------------------------------------

export async function computeStretchShorteningCycle(
  userId: string,
  date: Date = new Date(),
): Promise<StretchShorteningCycleResult> {
  const start = daysAgo(date, 14)
  const [cmj, sqj, groundContact, stiffness] = await Promise.all([
    fetchMetric(userId, "counter_movement_jump_cm", start, date),
    fetchMetric(userId, "squat_jump_cm", start, date),
    fetchMetric(userId, "ground_contact_time_ms", start, date),
    fetchMetric(userId, "leg_stiffness_kn_m", start, date),
  ])

  const cmjMean = mean(cmj)
  const sqjMean = mean(sqj)
  const elasticEnergyUtilization = clamp(
    sqjMean > 0 ? ((cmjMean - sqjMean) / sqjMean) * 100 + 50 : 30,
  )

  const amortizationPhase = clamp(100 - mean(groundContact) * 0.3)
  const stiffnessScore = clamp(mean(stiffness) * 10)

  const sscEfficiency = clamp(
    elasticEnergyUtilization * 0.4 + amortizationPhase * 0.3 + stiffnessScore * 0.3,
  )

  const performanceIndex = clamp(
    (cmjMean / Math.max(sqjMean, 1)) * 40 + sscEfficiency * 0.3,
  )

  return { sscEfficiency, amortizationPhase, elasticEnergyUtilization, performanceIndex }
}

// ---------------------------------------------------------------------------
// 32. Myofascial Tension
// ---------------------------------------------------------------------------

export async function computeMyofascialTension(
  userId: string,
  date: Date = new Date(),
): Promise<MyofascialTensionResult> {
  const start = daysAgo(date, 14)
  const [upperTension, lowerTension, stiffness, rom] = await Promise.all([
    fetchMetric(userId, "upper_body_tension", start, date),
    fetchMetric(userId, "lower_body_tension", start, date),
    fetchMetric(userId, "muscle_stiffness", start, date),
    fetchMetric(userId, "range_of_motion", start, date),
  ])

  const upperBodyTension = clamp(mean(upperTension))
  const lowerBodyTension = clamp(mean(lowerTension))
  const maxTension = Math.max(upperBodyTension, lowerBodyTension, 1)
  const asymmetry = clamp(
    (Math.abs(upperBodyTension - lowerBodyTension) / maxTension) * 100,
  )

  const tensionScore = clamp(
    (upperBodyTension + lowerBodyTension) / 2 + mean(stiffness) * 5 - mean(rom) * 0.3,
  )

  let releaseRecommendation: string
  if (tensionScore >= 70) releaseRecommendation = "daily_myofascial_release_recommended"
  else if (tensionScore >= 40) releaseRecommendation = "regular_foam_rolling_recommended"
  else releaseRecommendation = "maintenance_stretching_sufficient"

  return {
    tensionScore,
    upperBodyTension,
    lowerBodyTension,
    asymmetry,
    releaseRecommendation,
  }
}

// ---------------------------------------------------------------------------
// 33. Trigger Point Proxy
// ---------------------------------------------------------------------------

export async function computeTriggerPointProxy(
  userId: string,
  date: Date = new Date(),
): Promise<TriggerPointProxyResult> {
  const start = daysAgo(date, 14)
  const [localPain, referredPain, tension, mobility] = await Promise.all([
    fetchMetric(userId, "localized_pain_score", start, date),
    fetchMetric(userId, "referred_pain_score", start, date),
    fetchMetric(userId, "muscle_stiffness", start, date),
    fetchMetric(userId, "range_of_motion", start, date),
  ])

  const painCorrelation = clamp(
    mean(localPain) * 8 + mean(referredPain) * 12,
  )

  const affectedRegions: string[] = []
  if (mean(localPain) > 3) {
    const regionMetrics = [
      { name: "neck_shoulders", metric: "neck_tension" },
      { name: "upper_back", metric: "thoracic_tension" },
      { name: "lower_back", metric: "lumbar_tension" },
      { name: "hip_glutes", metric: "hip_tension" },
    ]
    for (const r of regionMetrics) {
      const regionVals = await fetchMetric(userId, r.metric, start, date)
      if (mean(regionVals) > 5) affectedRegions.push(r.name)
    }
  }

  const movementImpact = clamp(100 - mean(mobility))
  const likelihoodScore = clamp(
    painCorrelation * 0.4 +
    mean(tension) * 5 +
    movementImpact * 0.2,
  )

  return { likelihoodScore, affectedRegions, painCorrelation, movementImpact }
}

// ---------------------------------------------------------------------------
// 34. Rehabilitation Progress
// ---------------------------------------------------------------------------

export async function computeRehabilitationProgress(
  userId: string,
  date: Date = new Date(),
): Promise<RehabilitationProgressResult> {
  const start = daysAgo(date, 90)
  const [pain, rom, strength, compliance, functionScore] = await Promise.all([
    fetchMetric(userId, "pain_level", start, date),
    fetchMetric(userId, "range_of_motion", start, date),
    fetchMetric(userId, "strength_score", start, date),
    fetchMetric(userId, "rehab_compliance", start, date),
    fetchMetric(userId, "functional_score", start, date),
  ])

  const painTrend = linearSlope(pain)
  const romTrend = linearSlope(rom)
  const strengthTrend = linearSlope(strength)

  let milestonesMet = 0
  const totalMilestones = 5

  if (mean(pain) < 3) milestonesMet++
  if (painTrend < 0) milestonesMet++
  if (mean(rom) > 70) milestonesMet++
  if (mean(strength) > 60) milestonesMet++
  if (mean(functionScore) > 70) milestonesMet++

  const progressPercent = clamp((milestonesMet / totalMilestones) * 100)
  const adherenceRate = clamp(mean(compliance))

  const remainingMilestones = totalMilestones - milestonesMet
  const avgTrendRate = (Math.abs(romTrend) + Math.abs(strengthTrend)) / 2
  const projectedCompletion =
    avgTrendRate > 0 ? remainingMilestones / avgTrendRate : 90

  return {
    progressPercent,
    milestonesMet,
    totalMilestones,
    projectedCompletion,
    adherenceRate,
  }
}

// ---------------------------------------------------------------------------
// 35. Return to Sport Readiness
// ---------------------------------------------------------------------------

export async function computeReturnToSportReadiness(
  userId: string,
  date: Date = new Date(),
): Promise<ReturnToSportReadinessResult> {
  const start = daysAgo(date, 30)
  const [leftStr, rightStr, peakPower, baselinePower, funcScore, confidence] =
    await Promise.all([
      fetchMetric(userId, "left_leg_strength", start, date),
      fetchMetric(userId, "right_leg_strength", start, date),
      fetchMetric(userId, "peak_power_output", start, date),
      fetchMetric(userId, "baseline_power_output", start, date),
      fetchMetric(userId, "functional_score", start, date),
      fetchMetric(userId, "psychological_readiness", start, date),
    ])

  const leftMean = mean(leftStr)
  const rightMean = mean(rightStr)
  const maxLimb = Math.max(leftMean, rightMean, 1)
  const strengthSymmetry = clamp(
    (Math.min(leftMean, rightMean) / maxLimb) * 100,
  )

  const basePwr = mean(baselinePower)
  const powerRecovery = clamp(
    basePwr > 0 ? (mean(peakPower) / basePwr) * 100 : 50,
  )

  const functionalCapacity = clamp(mean(funcScore))
  const psychologicalReadiness = clamp(mean(confidence))

  const readinessScore = clamp(
    strengthSymmetry * 0.3 +
    powerRecovery * 0.25 +
    functionalCapacity * 0.25 +
    psychologicalReadiness * 0.2,
  )

  const clearanceLevel =
    readinessScore >= 85 ? "full" : readinessScore >= 60 ? "partial" : "not_ready"

  return {
    readinessScore,
    strengthSymmetry,
    powerRecovery,
    functionalCapacity,
    psychologicalReadiness,
    clearanceLevel,
  }
}

// ---------------------------------------------------------------------------
// 36. Power Output Decline
// ---------------------------------------------------------------------------

export async function computePowerOutputDecline(
  userId: string,
  date: Date = new Date(),
): Promise<PowerOutputDeclineResult> {
  const recentStart = daysAgo(date, 30)
  const historicStart = daysAgo(date, 365)
  const [recentPower, historicPower, baselinePower] = await Promise.all([
    fetchMetric(userId, "peak_power_output", recentStart, date),
    fetchMetric(userId, "peak_power_output", historicStart, date),
    fetchMetric(userId, "baseline_power_output", historicStart, date),
  ])

  const recentMean = mean(recentPower)
  const historicMean = mean(historicPower)
  const baselineMean = mean(baselinePower) || historicMean

  const declinePercent =
    historicMean > 0
      ? clamp(((historicMean - recentMean) / historicMean) * 100, -50, 100)
      : 0

  const annualRate = declinePercent
  const comparedToBaseline =
    baselineMean > 0 ? (recentMean / baselineMean) * 100 : 100

  const interventionUrgency =
    declinePercent > 20
      ? "high"
      : declinePercent > 10
        ? "moderate"
        : declinePercent > 5
          ? "low"
          : "none"

  return { declinePercent, annualRate, comparedToBaseline, interventionUrgency }
}

// ---------------------------------------------------------------------------
// 37. Age-Related Strength Loss
// ---------------------------------------------------------------------------

export async function computeAgeRelatedStrengthLoss(
  userId: string,
  date: Date = new Date(),
): Promise<AgeRelatedStrengthLossResult> {
  const start = daysAgo(date, 90)
  const [age, strength, leanMass, resistance, protein] = await Promise.all([
    fetchMetric(userId, "age", start, date),
    fetchMetric(userId, "strength_score", start, date),
    fetchMetric(userId, "lean_mass_kg", start, date),
    fetchMetric(userId, "resistance_training_minutes", start, date),
    fetchMetric(userId, "protein_intake_g", start, date),
  ])

  const ageVal = mean(age) || 30
  const expectedLossPerDecade = ageVal > 50 ? 15 : ageVal > 40 ? 8 : 3
  const yearsOver30 = Math.max(0, ageVal - 30)
  const estimatedLossPercent = clamp(
    (yearsOver30 / 10) * expectedLossPerDecade,
    0,
    80,
  )

  const strengthVal = mean(strength)
  const leanMassVal = mean(leanMass)
  const muscleQualityIndex = clamp(
    leanMassVal > 0 ? (strengthVal / leanMassVal) * 10 : 50,
  )

  const resistanceMins = mean(resistance)
  const proteinAdequacy = clamp((mean(protein) / (leanMassVal * 1.6 || 100)) * 100)
  const mitigationScore = clamp(
    resistanceMins * 0.4 + proteinAdequacy * 0.35 + muscleQualityIndex * 0.25,
  )

  const sarcopeniaRisk = clamp(
    estimatedLossPercent * 0.5 + (100 - muscleQualityIndex) * 0.3 + (100 - mitigationScore) * 0.2,
  )

  return { estimatedLossPercent, sarcopeniaRisk, muscleQualityIndex, mitigationScore }
}

// ---------------------------------------------------------------------------
// 38. Exercise Prescription
// ---------------------------------------------------------------------------

export async function computeExercisePrescription(
  userId: string,
  date: Date = new Date(),
): Promise<ExercisePrescriptionResult> {
  const start = daysAgo(date, 30)
  const [fitness, strength, flexibility, pain, hrMax, restHr] = await Promise.all([
    fetchMetric(userId, "vo2max_estimate", start, date),
    fetchMetric(userId, "strength_score", start, date),
    fetchMetric(userId, "flexibility_score", start, date),
    fetchMetric(userId, "pain_level", start, date),
    fetchMetric(userId, "max_heart_rate", start, date),
    fetchMetric(userId, "resting_heart_rate", start, date),
  ])

  const fitnessMean = mean(fitness)
  const strengthMean = mean(strength)
  const flexMean = mean(flexibility)
  const painMean = mean(pain)

  const priorityAreas: string[] = []
  if (strengthMean < 50) priorityAreas.push("strength_training")
  if (fitnessMean < 35) priorityAreas.push("cardiovascular_conditioning")
  if (flexMean < 40) priorityAreas.push("flexibility_mobility")
  if (priorityAreas.length === 0) priorityAreas.push("maintenance_all_components")

  const contraindications: string[] = []
  if (painMean > 6) contraindications.push("high_intensity_training")
  if (painMean > 4) contraindications.push("high_impact_activities")

  const hrMaxVal = mean(hrMax) || 190
  const restHrVal = mean(restHr) || 65
  const hrReserve = hrMaxVal - restHrVal

  const recommendedIntensity = clamp(
    painMean > 5 ? 40 : painMean > 3 ? 55 : fitnessMean > 50 ? 70 : 60,
  )

  const recommendedVolume = clamp(
    painMean > 5 ? 20 : fitnessMean > 40 ? 45 : 30,
    10,
    60,
  )

  const recommendedFrequency = painMean > 5 ? 3 : fitnessMean > 40 ? 5 : 4

  return {
    recommendedIntensity,
    recommendedVolume,
    recommendedFrequency,
    priorityAreas,
    contraindications,
  }
}

// ---------------------------------------------------------------------------
// 39. Load Management
// ---------------------------------------------------------------------------

export async function computeLoadManagement(
  userId: string,
  date: Date = new Date(),
): Promise<LoadManagementResult> {
  const weekStart = daysAgo(date, 7)
  const fourWeekStart = daysAgo(date, 28)
  const dailyLoad = await fetchMetric(userId, "training_load", fourWeekStart, date)

  const recentWeek = dailyLoad.slice(0, Math.min(7, dailyLoad.length))
  const acuteLoad = recentWeek.reduce((a, b) => a + b, 0)

  const weeklyTotals: number[] = []
  for (let w = 0; w < 4; w++) {
    const slice = dailyLoad.slice(w * 7, (w + 1) * 7)
    weeklyTotals.push(slice.reduce((a, b) => a + b, 0))
  }
  const chronicLoad = mean(weeklyTotals)

  const acuteChronicRatio = chronicLoad > 0 ? acuteLoad / chronicLoad : 1

  let loadStatus: LoadManagementResult["loadStatus"]
  let recommendation: string

  if (acuteChronicRatio < 0.8) {
    loadStatus = "undertraining"
    recommendation = "gradually_increase_training_load"
  } else if (acuteChronicRatio <= 1.3) {
    loadStatus = "optimal"
    recommendation = "maintain_current_training_load"
  } else if (acuteChronicRatio <= 1.5) {
    loadStatus = "overreaching"
    recommendation = "reduce_load_10_to_20_percent"
  } else {
    loadStatus = "overtraining"
    recommendation = "significant_load_reduction_needed"
  }

  return { acuteLoad, chronicLoad, acuteChronicRatio, loadStatus, recommendation }
}

// ---------------------------------------------------------------------------
// 40. Tissue Tolerance
// ---------------------------------------------------------------------------

export async function computeTissueTolerance(
  userId: string,
  date: Date = new Date(),
): Promise<TissueToleranceResult> {
  const start = daysAgo(date, 30)
  const [load, pain, recovery, adaptation] = await Promise.all([
    fetchMetric(userId, "training_load", start, date),
    fetchMetric(userId, "pain_level", start, date),
    fetchMetric(userId, "recovery_score", start, date),
    fetchMetric(userId, "tissue_adaptation_score", start, date),
  ])

  const currentLoad = mean(load)
  const painMean = mean(pain)
  const recoveryMean = mean(recovery)
  const adaptationMean = mean(adaptation)

  const maxTolerableLoad = clamp(
    adaptationMean * 1.2 + recoveryMean * 0.5 - painMean * 5,
    0,
    200,
  )

  const safetyMargin =
    maxTolerableLoad > 0
      ? clamp(((maxTolerableLoad - currentLoad) / maxTolerableLoad) * 100, -50, 100)
      : 0

  const adaptationRate = clamp(linearSlope(adaptation) * 10 + 50)

  const toleranceScore = clamp(
    safetyMargin * 0.4 +
    recoveryMean * 0.3 +
    (100 - painMean * 10) * 0.3,
  )

  return { toleranceScore, currentLoad, maxTolerableLoad, safetyMargin, adaptationRate }
}

// ---------------------------------------------------------------------------
// 41. Repetitive Strain Risk
// ---------------------------------------------------------------------------

export async function computeRepetitiveStrainRisk(
  userId: string,
  date: Date = new Date(),
): Promise<RepetitiveStrainRiskResult> {
  const start = daysAgo(date, 14)
  const [repCount, restBreaks, pain, tissueRecoveryVals] = await Promise.all([
    fetchMetric(userId, "repetition_count", start, date),
    fetchMetric(userId, "rest_breaks_per_hour", start, date),
    fetchMetric(userId, "localized_pain_score", start, date),
    fetchMetric(userId, "tissue_recovery_pct", start, date),
  ])

  const cumulativeLoad = mean(repCount) * 14
  const restAdequacy = clamp(mean(restBreaks) * 15)
  const tissueRecovery = clamp(mean(tissueRecoveryVals))
  const painFactor = mean(pain)

  const riskScore = clamp(
    cumulativeLoad * 0.01 +
    (100 - restAdequacy) * 0.3 +
    (100 - tissueRecovery) * 0.3 +
    painFactor * 8,
  )

  const level = riskScore >= 60 ? "high" : riskScore >= 30 ? "moderate" : "low"

  return { riskScore, cumulativeLoad, restAdequacy, tissueRecovery, level }
}

// ---------------------------------------------------------------------------
// 42. Ergonomic Health
// ---------------------------------------------------------------------------

export async function computeErgonomicHealth(
  userId: string,
  date: Date = new Date(),
): Promise<ErgonomicHealthResult> {
  const start = daysAgo(date, 14)
  const [deskPosture, breakFreq, monitorAngle, wristAngle, chairSupport] =
    await Promise.all([
      fetchMetric(userId, "desk_posture_score", start, date),
      fetchMetric(userId, "break_frequency_per_hour", start, date),
      fetchMetric(userId, "monitor_angle_score", start, date),
      fetchMetric(userId, "wrist_angle_score", start, date),
      fetchMetric(userId, "chair_support_score", start, date),
    ])

  const workstationRisk = clamp(
    100 -
    (mean(monitorAngle) * 0.3 +
      mean(wristAngle) * 0.3 +
      mean(chairSupport) * 0.4),
  )

  const breakFrequency = clamp(mean(breakFreq) * 20)
  const postureVariability = clamp(stddev(deskPosture) * 5)

  const recommendations: string[] = []
  if (mean(breakFreq) < 3) recommendations.push("increase_break_frequency")
  if (mean(monitorAngle) < 50) recommendations.push("adjust_monitor_height")
  if (mean(wristAngle) < 50) recommendations.push("improve_wrist_position")
  if (mean(chairSupport) < 50) recommendations.push("upgrade_chair_support")

  const score = clamp(
    (100 - workstationRisk) * 0.4 +
    breakFrequency * 0.25 +
    mean(deskPosture) * 0.2 +
    postureVariability * 0.15,
  )

  return { score, workstationRisk, breakFrequency, postureVariability, recommendations }
}

// ---------------------------------------------------------------------------
// 43. Sitting Health Impact
// ---------------------------------------------------------------------------

export async function computeSittingHealthImpact(
  userId: string,
  date: Date = new Date(),
): Promise<SittingHealthImpactResult> {
  const start = daysAgo(date, 14)
  const [sittingHrs, breaks, steps, metabolic, backPain] = await Promise.all([
    fetchMetric(userId, "sitting_hours", start, date),
    fetchMetric(userId, "sitting_breaks_per_day", start, date),
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "metabolic_score", start, date),
    fetchMetric(userId, "lumbar_pain", start, date),
  ])

  const dailySittingHours = mean(sittingHrs)
  const breakFrequencyScore = clamp(mean(breaks) * 8)
  const stepCompensation = clamp(mean(steps) / 100)

  const metabolicImpact = clamp(
    dailySittingHours * 6 - stepCompensation * 0.3 - breakFrequencyScore * 0.2,
  )

  const musculoskeletalImpact = clamp(
    dailySittingHours * 5 + mean(backPain) * 8 - breakFrequencyScore * 0.3,
  )

  const impactScore = clamp(
    metabolicImpact * 0.5 + musculoskeletalImpact * 0.5,
  )

  return {
    impactScore,
    dailySittingHours,
    breakFrequencyScore,
    metabolicImpact,
    musculoskeletalImpact,
  }
}

// ---------------------------------------------------------------------------
// 44. Standing Tolerance
// ---------------------------------------------------------------------------

export async function computeStandingTolerance(
  userId: string,
  date: Date = new Date(),
): Promise<StandingToleranceResult> {
  const start = daysAgo(date, 14)
  const [standingMins, footPain, legFatigue, circulation] = await Promise.all([
    fetchMetric(userId, "standing_minutes", start, date),
    fetchMetric(userId, "foot_pain_score", start, date),
    fetchMetric(userId, "leg_fatigue_score", start, date),
    fetchMetric(userId, "lower_limb_circulation_score", start, date),
  ])

  const avgStanding = mean(standingMins)
  const footPainMean = mean(footPain)
  const fatigueMean = mean(legFatigue)
  const circulationMean = mean(circulation)

  const estimatedMaxMinutes = clamp(
    avgStanding * 1.3 - footPainMean * 10 - fatigueMean * 8 + circulationMean * 0.5,
    30,
    480,
  )

  const fatigueRate = clamp(fatigueMean * 10 + footPainMean * 5)
  const discomfortOnset = clamp(
    estimatedMaxMinutes * 0.6,
    15,
    300,
  )

  const toleranceScore = clamp(
    (estimatedMaxMinutes / 480) * 60 +
    (100 - fatigueRate) * 0.2 +
    circulationMean * 0.2,
  )

  return { toleranceScore, estimatedMaxMinutes, fatigueRate, discomfortOnset }
}

// ---------------------------------------------------------------------------
// 45. Walking Capacity
// ---------------------------------------------------------------------------

export async function computeWalkingCapacity(
  userId: string,
  date: Date = new Date(),
): Promise<WalkingCapacityResult> {
  const start = daysAgo(date, 14)
  const [steps, walkingSpeed, vo2, pain, fatigue] = await Promise.all([
    fetchMetric(userId, "steps", start, date),
    fetchMetric(userId, "walking_speed", start, date),
    fetchMetric(userId, "vo2max_estimate", start, date),
    fetchMetric(userId, "lower_limb_pain", start, date),
    fetchMetric(userId, "fatigue_score", start, date),
  ])

  const avgSteps = mean(steps)
  const avgSpeed = mean(walkingSpeed) || 1.2
  const strideLen = 0.75
  const estimatedMaxDistanceKm = clamp(
    (avgSteps * strideLen) / 1000 * 1.3 + mean(vo2) * 0.1,
    0.5,
    50,
  )

  const gaitEfficiency = clamp(avgSpeed * 20 + mean(vo2) * 0.5)
  const enduranceFactor = clamp(mean(vo2) * 1.5)
  const painLimitation = clamp(mean(pain) * 12)

  const capacityScore = clamp(
    gaitEfficiency * 0.3 +
    enduranceFactor * 0.3 +
    (100 - painLimitation) * 0.2 +
    (100 - mean(fatigue)) * 0.2,
  )

  return { capacityScore, estimatedMaxDistanceKm, gaitEfficiency, enduranceFactor, painLimitation }
}

// ---------------------------------------------------------------------------
// 46. Stair Climbing Capacity
// ---------------------------------------------------------------------------

export async function computeStairClimbingCapacity(
  userId: string,
  date: Date = new Date(),
): Promise<StairClimbingCapacityResult> {
  const start = daysAgo(date, 14)
  const [flights, legStrength, vo2, kneePain, bodyWeight] = await Promise.all([
    fetchMetric(userId, "stair_flights_climbed", start, date),
    fetchMetric(userId, "lower_body_strength", start, date),
    fetchMetric(userId, "vo2max_estimate", start, date),
    fetchMetric(userId, "knee_pain", start, date),
    fetchMetric(userId, "body_weight_kg", start, date),
  ])

  const avgFlights = mean(flights)
  const legStr = mean(legStrength)
  const vo2Mean = mean(vo2)
  const bw = mean(bodyWeight) || 70

  const powerOutput = clamp((legStr * 0.5 + avgFlights * 5) / bw * 10)
  const cardiovascularLimit = clamp(vo2Mean * 2)
  const musculoskeletalLimit = clamp(
    legStr * 0.8 - mean(kneePain) * 10,
  )

  const estimatedFloors = clamp(
    avgFlights * 1.2 + legStr * 0.1 + vo2Mean * 0.2 - mean(kneePain) * 2,
    1,
    50,
  )

  const capacityScore = clamp(
    powerOutput * 0.3 +
    cardiovascularLimit * 0.3 +
    musculoskeletalLimit * 0.25 +
    (100 - mean(kneePain) * 10) * 0.15,
  )

  return { capacityScore, estimatedFloors, powerOutput, cardiovascularLimit, musculoskeletalLimit }
}

// ---------------------------------------------------------------------------
// 47. Lifting Capacity
// ---------------------------------------------------------------------------

export async function computeLiftingCapacity(
  userId: string,
  date: Date = new Date(),
): Promise<LiftingCapacityResult> {
  const start = daysAgo(date, 30)
  const [deadlift1rm, bodyWeight, coreStr, backPain, fatigue] = await Promise.all([
    fetchMetric(userId, "deadlift_1rm_kg", start, date),
    fetchMetric(userId, "body_weight_kg", start, date),
    fetchMetric(userId, "core_strength_score", start, date),
    fetchMetric(userId, "lumbar_pain", start, date),
    fetchMetric(userId, "fatigue_score", start, date),
  ])

  const dl = mean(deadlift1rm)
  const bw = mean(bodyWeight) || 70
  const estimatedMaxKg = dl > 0 ? dl : bw * 0.8

  const fatigueAdj = clamp(100 - mean(fatigue), 50, 100) / 100
  const safeWorkingLoad = estimatedMaxKg * 0.6 * fatigueAdj

  const formScore = clamp(
    mean(coreStr) * 0.6 + (100 - mean(backPain) * 12) * 0.4,
  )

  const riskLevel =
    mean(backPain) > 5 || formScore < 40
      ? "high"
      : mean(backPain) > 3 || formScore < 60
        ? "moderate"
        : "low"

  return {
    estimatedMaxKg,
    safeWorkingLoad,
    formScore,
    fatigueAdjustment: fatigueAdj,
    riskLevel,
  }
}

// ---------------------------------------------------------------------------
// 48. Carrying Capacity
// ---------------------------------------------------------------------------

export async function computeCarryingCapacity(
  userId: string,
  date: Date = new Date(),
): Promise<CarryingCapacityResult> {
  const start = daysAgo(date, 14)
  const [gripStr, coreStr, endurance, posture, bodyWeight] = await Promise.all([
    fetchMetric(userId, "grip_strength_kg", start, date),
    fetchMetric(userId, "core_strength_score", start, date),
    fetchMetric(userId, "cardiovascular_endurance", start, date),
    fetchMetric(userId, "posture_score", start, date),
    fetchMetric(userId, "body_weight_kg", start, date),
  ])

  const bw = mean(bodyWeight) || 70
  const gripMean = mean(gripStr) || bw * 0.4
  const estimatedMaxKg = clamp(
    gripMean * 0.7 + mean(coreStr) * 0.3,
    5,
    bw * 0.8,
  )

  const durationFactor = clamp(mean(endurance) * 0.8)
  const distanceFactor = clamp(mean(endurance) * 0.6 + mean(coreStr) * 0.3)
  const postureImpact = clamp(100 - mean(posture))

  return { estimatedMaxKg, durationFactor, distanceFactor, postureImpact }
}

// ---------------------------------------------------------------------------
// 49. Pushing / Pulling Capacity
// ---------------------------------------------------------------------------

export async function computePushingPullingCapacity(
  userId: string,
  date: Date = new Date(),
): Promise<PushingPullingCapacityResult> {
  const start = daysAgo(date, 14)
  const [benchPress, row, shoulderStr, coreStr, bodyWeight] = await Promise.all([
    fetchMetric(userId, "bench_press_1rm_kg", start, date),
    fetchMetric(userId, "row_1rm_kg", start, date),
    fetchMetric(userId, "shoulder_strength", start, date),
    fetchMetric(userId, "core_strength_score", start, date),
    fetchMetric(userId, "body_weight_kg", start, date),
  ])

  const bw = mean(bodyWeight) || 70
  const benchMean = mean(benchPress) || bw * 0.6
  const rowMean = mean(row) || bw * 0.5

  const pushCapacity = clamp(
    (benchMean / bw) * 50 + mean(shoulderStr) * 0.3,
  )
  const pullCapacity = clamp(
    (rowMean / bw) * 50 + mean(coreStr) * 0.3,
  )

  const sustainedForce = clamp(
    (pushCapacity + pullCapacity) / 2 * 0.6,
  )
  const peakForce = clamp(
    Math.max(pushCapacity, pullCapacity),
  )

  const maxPP = Math.max(pushCapacity, pullCapacity, 1)
  const asymmetry = clamp(
    (Math.abs(pushCapacity - pullCapacity) / maxPP) * 100,
  )

  return { pushCapacity, pullCapacity, sustainedForce, peakForce, asymmetry }
}

// ---------------------------------------------------------------------------
// 50. Rotational Mobility
// ---------------------------------------------------------------------------

export async function computeRotationalMobility(
  userId: string,
  date: Date = new Date(),
): Promise<RotationalMobilityResult> {
  const start = daysAgo(date, 14)
  const [cervical, thoracic, lumbar, hipRot, leftRot, rightRot] = await Promise.all([
    fetchMetric(userId, "cervical_rotation_deg", start, date),
    fetchMetric(userId, "thoracic_rotation_deg", start, date),
    fetchMetric(userId, "lumbar_rotation_deg", start, date),
    fetchMetric(userId, "hip_rotation_deg", start, date),
    fetchMetric(userId, "left_rotation_total", start, date),
    fetchMetric(userId, "right_rotation_total", start, date),
  ])

  const cervicalRotation = clamp(mean(cervical) / 0.8)
  const thoracicRotation = clamp(mean(thoracic) / 0.5)
  const lumbarRotation = clamp(mean(lumbar) / 0.15)
  const hipRotation = clamp(mean(hipRot) / 0.5)

  const leftTotal = mean(leftRot)
  const rightTotal = mean(rightRot)
  const maxSide = Math.max(leftTotal, rightTotal, 1)
  const asymmetry = clamp(
    (Math.abs(leftTotal - rightTotal) / maxSide) * 100,
  )

  const overallScore = clamp(
    cervicalRotation * 0.2 +
    thoracicRotation * 0.3 +
    lumbarRotation * 0.15 +
    hipRotation * 0.25 +
    (100 - asymmetry) * 0.1,
  )

  return {
    overallScore,
    cervicalRotation,
    thoracicRotation,
    lumbarRotation,
    hipRotation,
    asymmetry,
  }
}
