import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, sql } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchMetric(
  userId: string,
  metricName: string,
  startDate: Date,
  endDate: Date,
): Promise<number[]> {
  const db = getDb()
  const rows = await db
    .select({ value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, metricName),
        gte(healthMetrics.recordedAt, startDate),
        lte(healthMetrics.recordedAt, endDate),
      ),
    )
    .orderBy(desc(healthMetrics.recordedAt))
  return rows.map((r) => Number(r.value))
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function daysAgo(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

function hoursAgo(date: Date, hours: number): Date {
  return new Date(date.getTime() - hours * 3_600_000)
}

function normalize(value: number, low: number, high: number): number {
  if (high === low) return 0.5
  return clamp((value - low) / (high - low), 0, 1)
}

function riskLevel(score: number): "low" | "moderate" | "high" | "critical" {
  if (score < 0.25) return "low"
  if (score < 0.5) return "moderate"
  if (score < 0.75) return "high"
  return "critical"
}

// ---------------------------------------------------------------------------
// 1. Altitude Adaptation
// ---------------------------------------------------------------------------

export interface AltitudeAdaptationResult {
  currentAltitude: number
  avgAltitude7d: number
  adaptationScore: number
  oxygenSaturationDelta: number
  recommendation: string
}

export async function analyzeAltitudeAdaptation(
  userId: string,
  date: Date = new Date(),
): Promise<AltitudeAdaptationResult> {
  const altitudes = await fetchMetric(userId, "altitude_m", daysAgo(date, 7), date)
  const spo2 = await fetchMetric(userId, "spo2", daysAgo(date, 7), date)

  const current = altitudes[0] ?? 0
  const avg7d = mean(altitudes)
  const avgSpo2 = mean(spo2)
  const baselineSpo2 = 98

  const altitudeStress = normalize(current, 0, 5000)
  const spo2Delta = baselineSpo2 - avgSpo2
  const variability = stddev(altitudes)
  const adaptationScore = clamp(1 - altitudeStress * 0.5 - normalize(variability, 0, 1000) * 0.3 - normalize(spo2Delta, 0, 10) * 0.2, 0, 1)

  let recommendation = "Well adapted to current altitude."
  if (adaptationScore < 0.4) recommendation = "Allow 2-3 days for acclimatisation; stay hydrated and avoid strenuous activity."
  else if (adaptationScore < 0.7) recommendation = "Partial adaptation detected; monitor oxygen saturation and rest as needed."

  return { currentAltitude: current, avgAltitude7d: avg7d, adaptationScore, oxygenSaturationDelta: spo2Delta, recommendation }
}

// ---------------------------------------------------------------------------
// 2. Heat Acclimation
// ---------------------------------------------------------------------------

export interface HeatAcclimationResult {
  avgTemperature: number
  heatExposureDays: number
  acclimationScore: number
  sweatEfficiency: number
  recommendation: string
}

export async function analyzeHeatAcclimation(
  userId: string,
  date: Date = new Date(),
): Promise<HeatAcclimationResult> {
  const temps = await fetchMetric(userId, "ambient_temp_c", daysAgo(date, 14), date)
  const heartRates = await fetchMetric(userId, "resting_hr", daysAgo(date, 14), date)
  const sweatRate = await fetchMetric(userId, "sweat_rate_ml_h", daysAgo(date, 14), date)

  const avgTemp = mean(temps)
  const heatDays = temps.filter((t) => t >= 30).length
  const hrTrend = heartRates.length >= 2 ? heartRates[heartRates.length - 1]! - heartRates[0]! : 0
  const sweatEff = mean(sweatRate) > 0 ? normalize(mean(sweatRate), 200, 1500) : 0.5

  const acclimationScore = clamp(
    normalize(heatDays, 0, 10) * 0.4 + (hrTrend < 0 ? 0.3 : 0) + sweatEff * 0.3,
    0,
    1,
  )

  let recommendation = "Good heat acclimation."
  if (acclimationScore < 0.4) recommendation = "Gradually increase heat exposure over 10-14 days; hydrate aggressively."
  else if (acclimationScore < 0.7) recommendation = "Continue moderate heat exposure; monitor heart-rate recovery."

  return { avgTemperature: avgTemp, heatExposureDays: heatDays, acclimationScore, sweatEfficiency: sweatEff, recommendation }
}

// ---------------------------------------------------------------------------
// 3. Cold Adaptation
// ---------------------------------------------------------------------------

export interface ColdAdaptationResult {
  avgColdExposure: number
  coldExposureDays: number
  adaptationScore: number
  peripheralTempDelta: number
  recommendation: string
}

export async function analyzeColdAdaptation(
  userId: string,
  date: Date = new Date(),
): Promise<ColdAdaptationResult> {
  const temps = await fetchMetric(userId, "ambient_temp_c", daysAgo(date, 14), date)
  const skinTemps = await fetchMetric(userId, "skin_temp_c", daysAgo(date, 14), date)
  const coreTemps = await fetchMetric(userId, "core_temp_c", daysAgo(date, 14), date)

  const coldDays = temps.filter((t) => t <= 5).length
  const avgCold = mean(temps.filter((t) => t <= 10))
  const peripheralDelta = mean(coreTemps) - mean(skinTemps)

  const adaptationScore = clamp(
    normalize(coldDays, 0, 10) * 0.4 + normalize(peripheralDelta, 0, 8) * 0.3 + (1 - normalize(stddev(skinTemps), 0, 3)) * 0.3,
    0,
    1,
  )

  let recommendation = "Good cold tolerance."
  if (adaptationScore < 0.4) recommendation = "Increase gradual cold exposure; ensure adequate caloric intake and layered clothing."
  else if (adaptationScore < 0.7) recommendation = "Cold tolerance developing; continue controlled exposure and monitor extremity temperature."

  return { avgColdExposure: avgCold, coldExposureDays: coldDays, adaptationScore, peripheralTempDelta: peripheralDelta, recommendation }
}

// ---------------------------------------------------------------------------
// 4. Humidity Impact
// ---------------------------------------------------------------------------

export interface HumidityImpactResult {
  avgHumidity: number
  comfortIndex: number
  respiratoryStress: number
  skinHydration: number
  recommendation: string
}

export async function analyzeHumidityImpact(
  userId: string,
  date: Date = new Date(),
): Promise<HumidityImpactResult> {
  const humidity = await fetchMetric(userId, "relative_humidity_pct", daysAgo(date, 7), date)
  const respRate = await fetchMetric(userId, "respiratory_rate", daysAgo(date, 7), date)
  const skinHydration = await fetchMetric(userId, "skin_hydration", daysAgo(date, 7), date)

  const avgH = mean(humidity)
  const comfortIndex = 1 - Math.abs(avgH - 50) / 50
  const respStress = normalize(mean(respRate), 12, 25)
  const avgSkinH = mean(skinHydration)

  let recommendation = "Humidity levels are comfortable."
  if (avgH > 70) recommendation = "High humidity detected; use dehumidifiers indoors and wear moisture-wicking fabrics."
  else if (avgH < 30) recommendation = "Low humidity detected; use humidifiers and increase fluid intake to prevent dehydration."

  return { avgHumidity: avgH, comfortIndex, respiratoryStress: respStress, skinHydration: avgSkinH, recommendation }
}

// ---------------------------------------------------------------------------
// 5. UV Exposure Risk
// ---------------------------------------------------------------------------

export interface UvExposureRiskResult {
  avgUvIndex: number
  peakUvIndex: number
  cumulativeExposureMinutes: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeUvExposureRisk(
  userId: string,
  date: Date = new Date(),
): Promise<UvExposureRiskResult> {
  const uvIndex = await fetchMetric(userId, "uv_index", daysAgo(date, 7), date)
  const outdoorMin = await fetchMetric(userId, "outdoor_minutes", daysAgo(date, 7), date)

  const avgUv = mean(uvIndex)
  const peakUv = uvIndex.length > 0 ? Math.max(...uvIndex) : 0
  const totalOutdoor = outdoorMin.reduce((a, b) => a + b, 0)
  const riskScore = clamp(normalize(avgUv, 0, 11) * 0.5 + normalize(totalOutdoor, 0, 600) * 0.3 + normalize(peakUv, 0, 11) * 0.2, 0, 1)

  return {
    avgUvIndex: avgUv,
    peakUvIndex: peakUv,
    cumulativeExposureMinutes: totalOutdoor,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? "Apply SPF 50+ sunscreen, wear protective clothing and seek shade during peak hours." : "UV exposure within safe limits; standard sun protection advised.",
  }
}

// ---------------------------------------------------------------------------
// 6. Jet Lag Severity
// ---------------------------------------------------------------------------

export interface JetLagSeverityResult {
  timeZoneShift: number
  directionality: "east" | "west" | "none"
  severityScore: number
  estimatedRecoveryDays: number
  recommendation: string
}

export async function analyzeJetLagSeverity(
  userId: string,
  date: Date = new Date(),
): Promise<JetLagSeverityResult> {
  const tzOffsets = await fetchMetric(userId, "timezone_offset_h", daysAgo(date, 3), date)
  const sleepQuality = await fetchMetric(userId, "sleep_quality", daysAgo(date, 3), date)

  const current = tzOffsets[0] ?? 0
  const previous = tzOffsets.length > 1 ? tzOffsets[tzOffsets.length - 1]! : current
  const shift = current - previous
  const absShift = Math.abs(shift)
  const direction: "east" | "west" | "none" = shift > 0 ? "east" : shift < 0 ? "west" : "none"

  const sleepImpact = 1 - normalize(mean(sleepQuality), 0, 100)
  const severityScore = clamp(normalize(absShift, 0, 12) * 0.6 + sleepImpact * 0.4, 0, 1)
  const recoveryDays = Math.ceil(absShift * (direction === "east" ? 1.5 : 1.0))

  return {
    timeZoneShift: absShift,
    directionality: direction,
    severityScore,
    estimatedRecoveryDays: recoveryDays,
    recommendation: absShift >= 3 ? "Use timed light exposure and melatonin to accelerate circadian resynchronisation." : "Minor shift; maintain consistent sleep-wake times.",
  }
}

// ---------------------------------------------------------------------------
// 7. Shift Work Impact
// ---------------------------------------------------------------------------

export interface ShiftWorkImpactResult {
  irregularShiftDays: number
  avgSleepDuration: number
  circadianDisruptionScore: number
  metabolicRiskFactor: number
  recommendation: string
}

export async function analyzeShiftWorkImpact(
  userId: string,
  date: Date = new Date(),
): Promise<ShiftWorkImpactResult> {
  const sleepStart = await fetchMetric(userId, "sleep_start_hour", daysAgo(date, 14), date)
  const sleepDuration = await fetchMetric(userId, "sleep_duration_h", daysAgo(date, 14), date)
  const cortisol = await fetchMetric(userId, "cortisol_morning", daysAgo(date, 14), date)

  const irregularDays = sleepStart.filter((h) => h < 4 || h > 10).length
  const avgSleep = mean(sleepDuration)
  const sleepVariability = stddev(sleepStart)
  const circadianDisruption = clamp(normalize(sleepVariability, 0, 6) * 0.5 + normalize(irregularDays, 0, 10) * 0.3 + (1 - normalize(avgSleep, 4, 9)) * 0.2, 0, 1)
  const metabolicRisk = clamp(circadianDisruption * 0.6 + (1 - normalize(mean(cortisol), 5, 25)) * 0.4, 0, 1)

  return {
    irregularShiftDays: irregularDays,
    avgSleepDuration: avgSleep,
    circadianDisruptionScore: circadianDisruption,
    metabolicRiskFactor: metabolicRisk,
    recommendation: circadianDisruption > 0.6 ? "Adopt strategic napping, use blackout curtains, and keep meals on a fixed schedule." : "Shift pattern manageable; prioritise sleep hygiene on off-days.",
  }
}

// ---------------------------------------------------------------------------
// 8. Seasonal Affective Risk
// ---------------------------------------------------------------------------

export interface SeasonalAffectiveRiskResult {
  daylightMinutes: number
  moodTrend: number
  energyTrend: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeSeasonalAffectiveRisk(
  userId: string,
  date: Date = new Date(),
): Promise<SeasonalAffectiveRiskResult> {
  const daylight = await fetchMetric(userId, "daylight_exposure_min", daysAgo(date, 14), date)
  const mood = await fetchMetric(userId, "mood_score", daysAgo(date, 14), date)
  const energy = await fetchMetric(userId, "energy_level", daysAgo(date, 14), date)

  const avgDaylight = mean(daylight)
  const moodTrend = mood.length >= 2 ? mood[0]! - mood[mood.length - 1]! : 0
  const energyTrend = energy.length >= 2 ? energy[0]! - energy[energy.length - 1]! : 0
  const riskScore = clamp(
    (1 - normalize(avgDaylight, 0, 120)) * 0.4 + (moodTrend < 0 ? normalize(Math.abs(moodTrend), 0, 50) * 0.3 : 0) + (energyTrend < 0 ? normalize(Math.abs(energyTrend), 0, 50) * 0.3 : 0),
    0,
    1,
  )

  return {
    daylightMinutes: avgDaylight,
    moodTrend,
    energyTrend,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? "Consider a 10 000-lux light therapy lamp for 20-30 min each morning; increase outdoor time." : "Seasonal affect risk low; maintain regular light exposure.",
  }
}

// ---------------------------------------------------------------------------
// 9. Screen Time Impact
// ---------------------------------------------------------------------------

export interface ScreenTimeImpactResult {
  avgScreenHours: number
  eveningScreenHours: number
  eyeStrainScore: number
  sleepImpactScore: number
  recommendation: string
}

export async function analyzeScreenTimeImpact(
  userId: string,
  date: Date = new Date(),
): Promise<ScreenTimeImpactResult> {
  const screenTotal = await fetchMetric(userId, "screen_time_h", daysAgo(date, 7), date)
  const screenEvening = await fetchMetric(userId, "screen_time_evening_h", daysAgo(date, 7), date)
  const sleepLatency = await fetchMetric(userId, "sleep_latency_min", daysAgo(date, 7), date)

  const avgScreen = mean(screenTotal)
  const avgEvening = mean(screenEvening)
  const eyeStrain = clamp(normalize(avgScreen, 0, 16) * 0.7 + normalize(avgEvening, 0, 6) * 0.3, 0, 1)
  const sleepImpact = clamp(normalize(avgEvening, 0, 4) * 0.6 + normalize(mean(sleepLatency), 0, 60) * 0.4, 0, 1)

  return {
    avgScreenHours: avgScreen,
    eveningScreenHours: avgEvening,
    eyeStrainScore: eyeStrain,
    sleepImpactScore: sleepImpact,
    recommendation: avgEvening > 2 ? "Reduce screen use 1-2 hours before bed; enable blue-light filters after sunset." : "Screen habits within reasonable limits.",
  }
}

// ---------------------------------------------------------------------------
// 10. Sedentary Behavior
// ---------------------------------------------------------------------------

export interface SedentaryBehaviorResult {
  avgSedentaryHours: number
  longestSedentaryBout: number
  breakFrequency: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeSedentaryBehavior(
  userId: string,
  date: Date = new Date(),
): Promise<SedentaryBehaviorResult> {
  const sedentaryH = await fetchMetric(userId, "sedentary_hours", daysAgo(date, 7), date)
  const longestBout = await fetchMetric(userId, "longest_sedentary_bout_min", daysAgo(date, 7), date)
  const breaks = await fetchMetric(userId, "activity_breaks", daysAgo(date, 7), date)

  const avgSed = mean(sedentaryH)
  const avgBout = mean(longestBout)
  const avgBreaks = mean(breaks)

  const riskScore = clamp(
    normalize(avgSed, 4, 14) * 0.4 + normalize(avgBout, 30, 180) * 0.35 + (1 - normalize(avgBreaks, 0, 12)) * 0.25,
    0,
    1,
  )

  return {
    avgSedentaryHours: avgSed,
    longestSedentaryBout: avgBout,
    breakFrequency: avgBreaks,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? "Set a timer to stand and move every 30 minutes; consider a standing desk." : "Activity break pattern is adequate.",
  }
}

// ---------------------------------------------------------------------------
// 11. Active Transport Benefit
// ---------------------------------------------------------------------------

export interface ActiveTransportBenefitResult {
  walkingMinutes: number
  cyclingMinutes: number
  caloriesBurned: number
  cardioFitnessBenefit: number
  recommendation: string
}

export async function analyzeActiveTransportBenefit(
  userId: string,
  date: Date = new Date(),
): Promise<ActiveTransportBenefitResult> {
  const walking = await fetchMetric(userId, "walking_commute_min", daysAgo(date, 7), date)
  const cycling = await fetchMetric(userId, "cycling_commute_min", daysAgo(date, 7), date)
  const calories = await fetchMetric(userId, "active_transport_calories", daysAgo(date, 7), date)

  const totalWalk = walking.reduce((a, b) => a + b, 0)
  const totalCycle = cycling.reduce((a, b) => a + b, 0)
  const totalCal = calories.reduce((a, b) => a + b, 0)
  const cardio = clamp(normalize(totalWalk + totalCycle, 0, 300) * 0.6 + normalize(totalCal, 0, 2000) * 0.4, 0, 1)

  return {
    walkingMinutes: totalWalk,
    cyclingMinutes: totalCycle,
    caloriesBurned: totalCal,
    cardioFitnessBenefit: cardio,
    recommendation: cardio < 0.3 ? "Consider walking or cycling for part of your commute to boost cardiovascular fitness." : "Active transport contributing positively to fitness.",
  }
}

// ---------------------------------------------------------------------------
// 12. Step Count Patterns
// ---------------------------------------------------------------------------

export interface StepCountPatternsResult {
  avgDailySteps: number
  consistency: number
  peakHour: number
  trendscore: number
  recommendation: string
}

export async function analyzeStepCountPatterns(
  userId: string,
  date: Date = new Date(),
): Promise<StepCountPatternsResult> {
  const steps = await fetchMetric(userId, "daily_steps", daysAgo(date, 14), date)
  const peakHours = await fetchMetric(userId, "peak_step_hour", daysAgo(date, 14), date)

  const avg = mean(steps)
  const consistency = 1 - normalize(stddev(steps), 0, avg || 1)
  const peakH = Math.round(mean(peakHours))
  const trend = steps.length >= 2 ? (steps[0]! - steps[steps.length - 1]!) / (avg || 1) : 0
  const trendScore = clamp(0.5 + trend * 0.5, 0, 1)

  return {
    avgDailySteps: avg,
    consistency,
    peakHour: peakH,
    trendscore: trendScore,
    recommendation: avg < 7000 ? "Aim for at least 7 000-10 000 steps per day; add a short walk after meals." : "Step count is on target; maintain consistency.",
  }
}

// ---------------------------------------------------------------------------
// 13. Physical Inactivity Risk
// ---------------------------------------------------------------------------

export interface PhysicalInactivityRiskResult {
  activeMinutesPerWeek: number
  vigorousMinutesPerWeek: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzePhysicalInactivityRisk(
  userId: string,
  date: Date = new Date(),
): Promise<PhysicalInactivityRiskResult> {
  const moderate = await fetchMetric(userId, "moderate_activity_min", daysAgo(date, 7), date)
  const vigorous = await fetchMetric(userId, "vigorous_activity_min", daysAgo(date, 7), date)

  const totalModerate = moderate.reduce((a, b) => a + b, 0)
  const totalVigorous = vigorous.reduce((a, b) => a + b, 0)
  const equivalentMinutes = totalModerate + totalVigorous * 2

  const riskScore = clamp(1 - normalize(equivalentMinutes, 0, 300), 0, 1)

  return {
    activeMinutesPerWeek: totalModerate,
    vigorousMinutesPerWeek: totalVigorous,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: equivalentMinutes < 150 ? "WHO recommends ≥150 min moderate or ≥75 min vigorous activity per week." : "Meeting physical activity guidelines.",
  }
}

// ---------------------------------------------------------------------------
// 14. Ergonomic Risk
// ---------------------------------------------------------------------------

export interface ErgonomicRiskResult {
  avgPostureScore: number
  sittingHours: number
  breakFrequency: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeErgonomicRisk(
  userId: string,
  date: Date = new Date(),
): Promise<ErgonomicRiskResult> {
  const posture = await fetchMetric(userId, "posture_score", daysAgo(date, 7), date)
  const sitting = await fetchMetric(userId, "sitting_hours", daysAgo(date, 7), date)
  const breaks = await fetchMetric(userId, "posture_breaks", daysAgo(date, 7), date)

  const avgPosture = mean(posture)
  const avgSitting = mean(sitting)
  const avgBreaks = mean(breaks)

  const riskScore = clamp(
    (1 - normalize(avgPosture, 0, 100)) * 0.4 + normalize(avgSitting, 4, 12) * 0.35 + (1 - normalize(avgBreaks, 0, 10)) * 0.25,
    0,
    1,
  )

  return {
    avgPostureScore: avgPosture,
    sittingHours: avgSitting,
    breakFrequency: avgBreaks,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? "Adjust monitor to eye level, keep feet flat on floor, and take micro-breaks every 25 min." : "Ergonomic setup appears adequate.",
  }
}

// ---------------------------------------------------------------------------
// 15. Nature Exposure Benefit
// ---------------------------------------------------------------------------

export interface NatureExposureBenefitResult {
  weeklyNatureMinutes: number
  greenSpaceVisits: number
  stressReduction: number
  benefitScore: number
  recommendation: string
}

export async function analyzeNatureExposureBenefit(
  userId: string,
  date: Date = new Date(),
): Promise<NatureExposureBenefitResult> {
  const natureMin = await fetchMetric(userId, "nature_time_min", daysAgo(date, 7), date)
  const visits = await fetchMetric(userId, "green_space_visits", daysAgo(date, 7), date)
  const stress = await fetchMetric(userId, "stress_level", daysAgo(date, 7), date)

  const totalNature = natureMin.reduce((a, b) => a + b, 0)
  const totalVisits = visits.reduce((a, b) => a + b, 0)
  const stressReduction = stress.length >= 2 ? stress[stress.length - 1]! - stress[0]! : 0
  const benefitScore = clamp(normalize(totalNature, 0, 300) * 0.5 + normalize(totalVisits, 0, 5) * 0.3 + (stressReduction > 0 ? normalize(stressReduction, 0, 30) * 0.2 : 0), 0, 1)

  return {
    weeklyNatureMinutes: totalNature,
    greenSpaceVisits: totalVisits,
    stressReduction: Math.max(stressReduction, 0),
    benefitScore,
    recommendation: totalNature < 120 ? "Aim for ≥120 minutes in nature per week for measurable mental-health benefits." : "Nature exposure meeting recommended thresholds.",
  }
}

// ---------------------------------------------------------------------------
// 16. Social Jet Lag Impact
// ---------------------------------------------------------------------------

export interface SocialJetLagResult {
  weekdaySleepMidpoint: number
  weekendSleepMidpoint: number
  socialJetLagHours: number
  impactScore: number
  recommendation: string
}

export async function analyzeSocialJetLagImpact(
  userId: string,
  date: Date = new Date(),
): Promise<SocialJetLagResult> {
  const weekdayMid = await fetchMetric(userId, "weekday_sleep_midpoint_h", daysAgo(date, 14), date)
  const weekendMid = await fetchMetric(userId, "weekend_sleep_midpoint_h", daysAgo(date, 14), date)
  const fatigue = await fetchMetric(userId, "fatigue_score", daysAgo(date, 14), date)

  const wdMid = mean(weekdayMid)
  const weMid = mean(weekendMid)
  const sjl = Math.abs(weMid - wdMid)
  const impactScore = clamp(normalize(sjl, 0, 4) * 0.6 + normalize(mean(fatigue), 0, 100) * 0.4, 0, 1)

  return {
    weekdaySleepMidpoint: wdMid,
    weekendSleepMidpoint: weMid,
    socialJetLagHours: sjl,
    impactScore,
    recommendation: sjl > 1.5 ? "Keep weekend wake-up within 1 hour of weekday schedule to reduce social jet lag." : "Consistent sleep schedule across the week.",
  }
}

// ---------------------------------------------------------------------------
// 17. Light Exposure Pattern
// ---------------------------------------------------------------------------

export interface LightExposurePatternResult {
  morningLuxAvg: number
  eveningLuxAvg: number
  totalBrightLightMinutes: number
  circadianAlignmentScore: number
  recommendation: string
}

export async function analyzeLightExposurePattern(
  userId: string,
  date: Date = new Date(),
): Promise<LightExposurePatternResult> {
  const morningLux = await fetchMetric(userId, "morning_lux", daysAgo(date, 7), date)
  const eveningLux = await fetchMetric(userId, "evening_lux", daysAgo(date, 7), date)
  const brightMin = await fetchMetric(userId, "bright_light_min", daysAgo(date, 7), date)

  const mLux = mean(morningLux)
  const eLux = mean(eveningLux)
  const totalBright = brightMin.reduce((a, b) => a + b, 0)

  const circadian = clamp(
    normalize(mLux, 0, 10000) * 0.4 + (1 - normalize(eLux, 0, 500)) * 0.3 + normalize(totalBright, 0, 300) * 0.3,
    0,
    1,
  )

  return {
    morningLuxAvg: mLux,
    eveningLuxAvg: eLux,
    totalBrightLightMinutes: totalBright,
    circadianAlignmentScore: circadian,
    recommendation: circadian < 0.5 ? "Get bright light within 30 min of waking and dim lights 2 hours before bed." : "Light exposure pattern supports healthy circadian rhythm.",
  }
}

// ---------------------------------------------------------------------------
// 18. Noise Pollution Impact
// ---------------------------------------------------------------------------

export interface NoisePollutionImpactResult {
  avgNoiseDb: number
  peakNoiseDb: number
  exposureAbove70dbMinutes: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeNoisePollutionImpact(
  userId: string,
  date: Date = new Date(),
): Promise<NoisePollutionImpactResult> {
  const noiseDb = await fetchMetric(userId, "ambient_noise_db", daysAgo(date, 7), date)
  const noiseOver70 = await fetchMetric(userId, "noise_above_70db_min", daysAgo(date, 7), date)

  const avg = mean(noiseDb)
  const peak = noiseDb.length > 0 ? Math.max(...noiseDb) : 0
  const totalOver70 = noiseOver70.reduce((a, b) => a + b, 0)
  const riskScore = clamp(normalize(avg, 40, 85) * 0.4 + normalize(peak, 70, 120) * 0.3 + normalize(totalOver70, 0, 480) * 0.3, 0, 1)

  return {
    avgNoiseDb: avg,
    peakNoiseDb: peak,
    exposureAbove70dbMinutes: totalOver70,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? "Use noise-cancelling headphones or ear protection; prolonged exposure above 70 dB damages hearing." : "Noise levels within acceptable range.",
  }
}

// ---------------------------------------------------------------------------
// 19. Air Quality Health Impact
// ---------------------------------------------------------------------------

export interface AirQualityHealthImpactResult {
  avgAqi: number
  peakAqi: number
  outdoorExerciseMinutes: number
  respiratoryRisk: number
  risk: string
  recommendation: string
}

export async function analyzeAirQualityHealthImpact(
  userId: string,
  date: Date = new Date(),
): Promise<AirQualityHealthImpactResult> {
  const aqi = await fetchMetric(userId, "aqi", daysAgo(date, 7), date)
  const outdoorExercise = await fetchMetric(userId, "outdoor_exercise_min", daysAgo(date, 7), date)
  const respSymptoms = await fetchMetric(userId, "respiratory_symptoms", daysAgo(date, 7), date)

  const avgAqi = mean(aqi)
  const peakAqi = aqi.length > 0 ? Math.max(...aqi) : 0
  const totalOutdoor = outdoorExercise.reduce((a, b) => a + b, 0)
  const respRisk = clamp(
    normalize(avgAqi, 0, 300) * 0.5 + normalize(peakAqi, 50, 300) * 0.2 + normalize(mean(respSymptoms), 0, 10) * 0.3,
    0,
    1,
  )

  return {
    avgAqi: avgAqi,
    peakAqi,
    outdoorExerciseMinutes: totalOutdoor,
    respiratoryRisk: respRisk,
    risk: riskLevel(respRisk),
    recommendation: avgAqi > 100 ? "Limit outdoor exercise when AQI exceeds 100; use N95 masks if necessary." : "Air quality acceptable for outdoor activities.",
  }
}

// ---------------------------------------------------------------------------
// 20. Work-Life Balance
// ---------------------------------------------------------------------------

export interface WorkLifeBalanceResult {
  avgWorkHours: number
  avgLeisureHours: number
  balanceRatio: number
  burnoutRisk: number
  recommendation: string
}

export async function analyzeWorkLifeBalance(
  userId: string,
  date: Date = new Date(),
): Promise<WorkLifeBalanceResult> {
  const workH = await fetchMetric(userId, "work_hours", daysAgo(date, 14), date)
  const leisureH = await fetchMetric(userId, "leisure_hours", daysAgo(date, 14), date)
  const stress = await fetchMetric(userId, "stress_level", daysAgo(date, 14), date)

  const avgWork = mean(workH)
  const avgLeisure = mean(leisureH)
  const ratio = avgLeisure > 0 ? avgWork / avgLeisure : avgWork
  const burnout = clamp(normalize(avgWork, 6, 14) * 0.5 + normalize(mean(stress), 0, 100) * 0.3 + (1 - normalize(avgLeisure, 0, 6)) * 0.2, 0, 1)

  return {
    avgWorkHours: avgWork,
    avgLeisureHours: avgLeisure,
    balanceRatio: ratio,
    burnoutRisk: burnout,
    recommendation: burnout >= 0.6 ? "Establish firm work boundaries; schedule non-negotiable personal time daily." : "Work-life balance appears sustainable.",
  }
}

// ---------------------------------------------------------------------------
// 21. Dehydration Risk
// ---------------------------------------------------------------------------

export interface DehydrationRiskResult {
  avgWaterIntakeMl: number
  avgTemperature: number
  activityLevel: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeDehydrationRisk(
  userId: string,
  date: Date = new Date(),
): Promise<DehydrationRiskResult> {
  const water = await fetchMetric(userId, "water_intake_ml", daysAgo(date, 7), date)
  const temp = await fetchMetric(userId, "ambient_temp_c", daysAgo(date, 7), date)
  const activity = await fetchMetric(userId, "activity_level", daysAgo(date, 7), date)

  const avgWater = mean(water)
  const avgTemp = mean(temp)
  const avgActivity = mean(activity)

  const neededWater = 2000 + (avgTemp > 25 ? (avgTemp - 25) * 100 : 0) + avgActivity * 50
  const riskScore = clamp(1 - avgWater / neededWater, 0, 1)

  return {
    avgWaterIntakeMl: avgWater,
    avgTemperature: avgTemp,
    activityLevel: avgActivity,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? `Increase daily water intake to at least ${Math.round(neededWater)} ml given current conditions.` : "Hydration levels appear adequate.",
  }
}

// ---------------------------------------------------------------------------
// 22. Thermoregulation
// ---------------------------------------------------------------------------

export interface ThermoregulationResult {
  avgCoreTemp: number
  coreTempVariability: number
  ambientTempRange: number
  regulationScore: number
  recommendation: string
}

export async function analyzeThermoregulation(
  userId: string,
  date: Date = new Date(),
): Promise<ThermoregulationResult> {
  const coreTemp = await fetchMetric(userId, "core_temp_c", daysAgo(date, 7), date)
  const ambientTemp = await fetchMetric(userId, "ambient_temp_c", daysAgo(date, 7), date)

  const avgCore = mean(coreTemp)
  const coreVar = stddev(coreTemp)
  const ambRange = ambientTemp.length > 0 ? Math.max(...ambientTemp) - Math.min(...ambientTemp) : 0

  const regulationScore = clamp(
    (1 - normalize(Math.abs(avgCore - 37), 0, 2)) * 0.5 + (1 - normalize(coreVar, 0, 1)) * 0.3 + (1 - normalize(ambRange, 0, 30)) * 0.2,
    0,
    1,
  )

  return {
    avgCoreTemp: avgCore,
    coreTempVariability: coreVar,
    ambientTempRange: ambRange,
    regulationScore,
    recommendation: regulationScore < 0.5 ? "Core temperature fluctuation detected; dress in layers and monitor hydration." : "Thermoregulation functioning well.",
  }
}

// ---------------------------------------------------------------------------
// 23. Circadian Disruption
// ---------------------------------------------------------------------------

export interface CircadianDisruptionResult {
  sleepOnsetVariability: number
  wakeTimeVariability: number
  lightTimingScore: number
  disruptionScore: number
  recommendation: string
}

export async function analyzeCircadianDisruption(
  userId: string,
  date: Date = new Date(),
): Promise<CircadianDisruptionResult> {
  const sleepOnset = await fetchMetric(userId, "sleep_onset_hour", daysAgo(date, 14), date)
  const wakeTime = await fetchMetric(userId, "wake_hour", daysAgo(date, 14), date)
  const morningLight = await fetchMetric(userId, "morning_lux", daysAgo(date, 14), date)

  const onsetVar = stddev(sleepOnset)
  const wakeVar = stddev(wakeTime)
  const lightScore = normalize(mean(morningLight), 0, 10000)
  const disruptionScore = clamp(
    normalize(onsetVar, 0, 3) * 0.4 + normalize(wakeVar, 0, 3) * 0.4 + (1 - lightScore) * 0.2,
    0,
    1,
  )

  return {
    sleepOnsetVariability: onsetVar,
    wakeTimeVariability: wakeVar,
    lightTimingScore: lightScore,
    disruptionScore,
    recommendation: disruptionScore >= 0.5 ? "Anchor your circadian clock with consistent bed/wake times and morning bright light." : "Circadian rhythm is reasonably stable.",
  }
}

// ---------------------------------------------------------------------------
// 24. Travel Fatigue
// ---------------------------------------------------------------------------

export interface TravelFatigueResult {
  travelHoursRecent: number
  timeZonesCrossed: number
  sleepDebt: number
  fatigueScore: number
  recommendation: string
}

export async function analyzeTravelFatigue(
  userId: string,
  date: Date = new Date(),
): Promise<TravelFatigueResult> {
  const travelH = await fetchMetric(userId, "travel_hours", daysAgo(date, 7), date)
  const tzCrossed = await fetchMetric(userId, "timezones_crossed", daysAgo(date, 7), date)
  const sleepDebt = await fetchMetric(userId, "sleep_debt_h", daysAgo(date, 7), date)

  const totalTravel = travelH.reduce((a, b) => a + b, 0)
  const totalTz = tzCrossed.reduce((a, b) => a + b, 0)
  const totalDebt = sleepDebt.reduce((a, b) => a + b, 0)

  const fatigueScore = clamp(
    normalize(totalTravel, 0, 40) * 0.35 + normalize(totalTz, 0, 12) * 0.35 + normalize(totalDebt, 0, 14) * 0.3,
    0,
    1,
  )

  return {
    travelHoursRecent: totalTravel,
    timeZonesCrossed: totalTz,
    sleepDebt: totalDebt,
    fatigueScore,
    recommendation: fatigueScore >= 0.5 ? "Schedule a recovery day after travel; prioritise sleep and light activity." : "Travel load manageable.",
  }
}

// ---------------------------------------------------------------------------
// 25. Pollution Adaptation
// ---------------------------------------------------------------------------

export interface PollutionAdaptationResult {
  avgPm25: number
  avgPm10: number
  exposureDuration: number
  adaptationScore: number
  recommendation: string
}

export async function analyzePollutionAdaptation(
  userId: string,
  date: Date = new Date(),
): Promise<PollutionAdaptationResult> {
  const pm25 = await fetchMetric(userId, "pm25", daysAgo(date, 30), date)
  const pm10 = await fetchMetric(userId, "pm10", daysAgo(date, 30), date)
  const outdoorH = await fetchMetric(userId, "outdoor_hours", daysAgo(date, 30), date)

  const avgPm25 = mean(pm25)
  const avgPm10 = mean(pm10)
  const totalOutdoor = outdoorH.reduce((a, b) => a + b, 0)

  const pollutionLevel = normalize(avgPm25, 0, 75) * 0.6 + normalize(avgPm10, 0, 150) * 0.4
  const adaptationScore = clamp(1 - pollutionLevel * normalize(totalOutdoor, 0, 200), 0, 1)

  return {
    avgPm25: avgPm25,
    avgPm10: avgPm10,
    exposureDuration: totalOutdoor,
    adaptationScore,
    recommendation: avgPm25 > 35 ? "Limit outdoor exposure on high-pollution days; use HEPA filters indoors." : "Pollution levels within tolerable range.",
  }
}

// ---------------------------------------------------------------------------
// 26. Weather Sensitivity
// ---------------------------------------------------------------------------

export interface WeatherSensitivityResult {
  tempCorrelation: number
  humidityCorrelation: number
  pressureCorrelation: number
  sensitivityScore: number
  recommendation: string
}

export async function analyzeWeatherSensitivity(
  userId: string,
  date: Date = new Date(),
): Promise<WeatherSensitivityResult> {
  const temp = await fetchMetric(userId, "ambient_temp_c", daysAgo(date, 30), date)
  const humidity = await fetchMetric(userId, "relative_humidity_pct", daysAgo(date, 30), date)
  const pressure = await fetchMetric(userId, "barometric_pressure_hpa", daysAgo(date, 30), date)
  const symptoms = await fetchMetric(userId, "symptom_score", daysAgo(date, 30), date)

  const minLen = Math.min(temp.length, humidity.length, pressure.length, symptoms.length)

  function pearson(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length)
    if (n < 3) return 0
    const ma = mean(a.slice(0, n))
    const mb = mean(b.slice(0, n))
    let num = 0, da = 0, db = 0
    for (let i = 0; i < n; i++) {
      const x = a[i]! - ma, y = b[i]! - mb
      num += x * y; da += x * x; db += y * y
    }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0
  }

  const tCorr = Math.abs(pearson(temp.slice(0, minLen), symptoms.slice(0, minLen)))
  const hCorr = Math.abs(pearson(humidity.slice(0, minLen), symptoms.slice(0, minLen)))
  const pCorr = Math.abs(pearson(pressure.slice(0, minLen), symptoms.slice(0, minLen)))
  const sensitivity = clamp((tCorr + hCorr + pCorr) / 3, 0, 1)

  return {
    tempCorrelation: tCorr,
    humidityCorrelation: hCorr,
    pressureCorrelation: pCorr,
    sensitivityScore: sensitivity,
    recommendation: sensitivity >= 0.5 ? "You appear weather-sensitive; prepare for symptom flares during weather changes." : "Low weather sensitivity detected.",
  }
}

// ---------------------------------------------------------------------------
// 27. Barometric Pressure Impact
// ---------------------------------------------------------------------------

export interface BarometricPressureImpactResult {
  avgPressure: number
  pressureVariability: number
  rapidChanges: number
  impactScore: number
  recommendation: string
}

export async function analyzeBarometricPressureImpact(
  userId: string,
  date: Date = new Date(),
): Promise<BarometricPressureImpactResult> {
  const pressure = await fetchMetric(userId, "barometric_pressure_hpa", daysAgo(date, 7), date)
  const headache = await fetchMetric(userId, "headache_score", daysAgo(date, 7), date)

  const avgP = mean(pressure)
  const pVar = stddev(pressure)
  let rapidChanges = 0
  for (let i = 1; i < pressure.length; i++) {
    if (Math.abs(pressure[i]! - pressure[i - 1]!) > 5) rapidChanges++
  }

  const impactScore = clamp(
    normalize(pVar, 0, 15) * 0.4 + normalize(rapidChanges, 0, 5) * 0.3 + normalize(mean(headache), 0, 10) * 0.3,
    0,
    1,
  )

  return {
    avgPressure: avgP,
    pressureVariability: pVar,
    rapidChanges,
    impactScore,
    recommendation: impactScore >= 0.5 ? "Barometric swings correlated with symptoms; stay hydrated and consider preventive medication." : "Pressure conditions stable.",
  }
}

// ---------------------------------------------------------------------------
// 28. Altitude Sickness Risk
// ---------------------------------------------------------------------------

export interface AltitudeSicknessRiskResult {
  currentAltitude: number
  ascentRate: number
  spo2: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeAltitudeSicknessRisk(
  userId: string,
  date: Date = new Date(),
): Promise<AltitudeSicknessRiskResult> {
  const altitude = await fetchMetric(userId, "altitude_m", daysAgo(date, 3), date)
  const spo2 = await fetchMetric(userId, "spo2", daysAgo(date, 3), date)
  const headache = await fetchMetric(userId, "headache_score", daysAgo(date, 3), date)

  const current = altitude[0] ?? 0
  const oldest = altitude.length > 1 ? altitude[altitude.length - 1]! : current
  const ascentRate = Math.max(current - oldest, 0) / Math.max(altitude.length, 1)
  const currentSpo2 = spo2[0] ?? 98

  const riskScore = clamp(
    normalize(current, 2000, 5500) * 0.35 + normalize(ascentRate, 0, 500) * 0.3 + (1 - normalize(currentSpo2, 80, 100)) * 0.2 + normalize(mean(headache), 0, 10) * 0.15,
    0,
    1,
  )

  return {
    currentAltitude: current,
    ascentRate,
    spo2: currentSpo2,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? "Descend if symptoms worsen; limit ascent to 300-500 m/day above 3000 m." : "Altitude sickness risk currently low.",
  }
}

// ---------------------------------------------------------------------------
// 29. Heat Stroke Risk
// ---------------------------------------------------------------------------

export interface HeatStrokeRiskResult {
  heatIndex: number
  coreTemp: number
  heartRate: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeHeatStrokeRisk(
  userId: string,
  date: Date = new Date(),
): Promise<HeatStrokeRiskResult> {
  const temp = await fetchMetric(userId, "ambient_temp_c", daysAgo(date, 1), date)
  const humidity = await fetchMetric(userId, "relative_humidity_pct", daysAgo(date, 1), date)
  const coreTemp = await fetchMetric(userId, "core_temp_c", daysAgo(date, 1), date)
  const hr = await fetchMetric(userId, "heart_rate", daysAgo(date, 1), date)

  const t = mean(temp)
  const rh = mean(humidity)
  const heatIndex = t + 0.33 * (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t)) - 4.0
  const core = mean(coreTemp)
  const heartRate = mean(hr)

  const riskScore = clamp(
    normalize(heatIndex, 27, 54) * 0.35 + normalize(core, 37, 41) * 0.3 + normalize(heartRate, 60, 180) * 0.2 + normalize(rh, 40, 100) * 0.15,
    0,
    1,
  )

  return {
    heatIndex,
    coreTemp: core,
    heartRate,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? "Move to a cool environment, hydrate immediately, and apply cold compresses." : "Heat stroke risk is low; continue standard hydration.",
  }
}

// ---------------------------------------------------------------------------
// 30. Hypothermia Risk
// ---------------------------------------------------------------------------

export interface HypothermiaRiskResult {
  ambientTemp: number
  windChill: number
  coreTemp: number
  exposureDuration: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeHypothermiaRisk(
  userId: string,
  date: Date = new Date(),
): Promise<HypothermiaRiskResult> {
  const temp = await fetchMetric(userId, "ambient_temp_c", daysAgo(date, 1), date)
  const wind = await fetchMetric(userId, "wind_speed_kmh", daysAgo(date, 1), date)
  const coreTemp = await fetchMetric(userId, "core_temp_c", daysAgo(date, 1), date)
  const outdoorMin = await fetchMetric(userId, "outdoor_minutes", daysAgo(date, 1), date)

  const t = mean(temp)
  const w = mean(wind)
  const wc = 13.12 + 0.6215 * t - 11.37 * Math.pow(w, 0.16) + 0.3965 * t * Math.pow(w, 0.16)
  const core = mean(coreTemp)
  const exposure = outdoorMin.reduce((a, b) => a + b, 0)

  const riskScore = clamp(
    (1 - normalize(wc, -40, 10)) * 0.35 + (1 - normalize(core, 33, 37)) * 0.3 + normalize(exposure, 0, 240) * 0.2 + (1 - normalize(t, -30, 10)) * 0.15,
    0,
    1,
  )

  return {
    ambientTemp: t,
    windChill: wc,
    coreTemp: core,
    exposureDuration: exposure,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? "Seek shelter, add insulation layers, consume warm fluids." : "Hypothermia risk low under current conditions.",
  }
}

// ---------------------------------------------------------------------------
// 31. Frostbite Risk
// ---------------------------------------------------------------------------

export interface FrostbiteRiskResult {
  windChill: number
  exposedSkinTemp: number
  exposureDuration: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeFrostbiteRisk(
  userId: string,
  date: Date = new Date(),
): Promise<FrostbiteRiskResult> {
  const temp = await fetchMetric(userId, "ambient_temp_c", daysAgo(date, 1), date)
  const wind = await fetchMetric(userId, "wind_speed_kmh", daysAgo(date, 1), date)
  const skinTemp = await fetchMetric(userId, "skin_temp_c", daysAgo(date, 1), date)
  const outdoorMin = await fetchMetric(userId, "outdoor_minutes", daysAgo(date, 1), date)

  const t = mean(temp)
  const w = mean(wind)
  const wc = 13.12 + 0.6215 * t - 11.37 * Math.pow(w, 0.16) + 0.3965 * t * Math.pow(w, 0.16)
  const skin = mean(skinTemp)
  const exposure = outdoorMin.reduce((a, b) => a + b, 0)

  const riskScore = clamp(
    (1 - normalize(wc, -50, 0)) * 0.4 + (1 - normalize(skin, -5, 15)) * 0.3 + normalize(exposure, 0, 120) * 0.3,
    0,
    1,
  )

  return {
    windChill: wc,
    exposedSkinTemp: skin,
    exposureDuration: exposure,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? "Cover all exposed skin; limit outdoor time to 10-minute intervals in extreme cold." : "Frostbite risk manageable with current protection.",
  }
}

// ---------------------------------------------------------------------------
// 32. Sunburn Risk
// ---------------------------------------------------------------------------

export interface SunburnRiskResult {
  uvIndex: number
  skinType: number
  spfUsed: number
  exposureMinutes: number
  riskScore: number
  risk: string
  recommendation: string
}

export async function analyzeSunburnRisk(
  userId: string,
  date: Date = new Date(),
): Promise<SunburnRiskResult> {
  const uv = await fetchMetric(userId, "uv_index", daysAgo(date, 1), date)
  const skinType = await fetchMetric(userId, "skin_type_fitzpatrick", daysAgo(date, 365), date)
  const spf = await fetchMetric(userId, "spf_applied", daysAgo(date, 1), date)
  const outdoor = await fetchMetric(userId, "outdoor_minutes", daysAgo(date, 1), date)

  const currentUv = mean(uv)
  const skin = skinType[0] ?? 3
  const appliedSpf = mean(spf) || 0
  const exposure = outdoor.reduce((a, b) => a + b, 0)

  const baseBurnTime = [10, 15, 20, 30, 45, 60][clamp(Math.round(skin) - 1, 0, 5)] ?? 20
  const effectiveBurnTime = baseBurnTime * Math.max(appliedSpf, 1)
  const burnRatio = (exposure * currentUv) / (effectiveBurnTime * 5)
  const riskScore = clamp(burnRatio, 0, 1)

  return {
    uvIndex: currentUv,
    skinType: skin,
    spfUsed: appliedSpf,
    exposureMinutes: exposure,
    riskScore,
    risk: riskLevel(riskScore),
    recommendation: riskScore >= 0.5 ? "Reapply broad-spectrum SPF 50+ every 2 hours; seek shade during 10 AM-4 PM." : "Sunburn risk low with current protection.",
  }
}

// ---------------------------------------------------------------------------
// 33. Vitamin D Synthesis
// ---------------------------------------------------------------------------

export interface VitaminDSynthesisResult {
  avgUvbExposureMinutes: number
  skinCoverage: number
  latitude: number
  estimatedIU: number
  sufficiencyScore: number
  recommendation: string
}

export async function analyzeVitaminDSynthesis(
  userId: string,
  date: Date = new Date(),
): Promise<VitaminDSynthesisResult> {
  const uvb = await fetchMetric(userId, "uvb_exposure_min", daysAgo(date, 7), date)
  const coverage = await fetchMetric(userId, "skin_coverage_pct", daysAgo(date, 7), date)
  const lat = await fetchMetric(userId, "latitude", daysAgo(date, 7), date)

  const avgUvb = mean(uvb)
  const avgCoverage = mean(coverage) || 70
  const avgLat = mean(lat) || 40
  const exposedFraction = (100 - avgCoverage) / 100
  const latFactor = 1 - normalize(Math.abs(avgLat), 0, 60)
  const estimatedIU = avgUvb * exposedFraction * latFactor * 100
  const sufficiency = normalize(estimatedIU, 0, 1000)

  return {
    avgUvbExposureMinutes: avgUvb,
    skinCoverage: avgCoverage,
    latitude: avgLat,
    estimatedIU,
    sufficiencyScore: sufficiency,
    recommendation: sufficiency < 0.4 ? "Consider vitamin D supplementation (1000-2000 IU/day) or increase midday sun exposure." : "Vitamin D synthesis appears adequate.",
  }
}

// ---------------------------------------------------------------------------
// 34. Seasonal Activity Variation
// ---------------------------------------------------------------------------

export interface SeasonalActivityVariationResult {
  currentMonthAvgSteps: number
  yearAvgSteps: number
  variationPct: number
  seasonalDip: boolean
  recommendation: string
}

export async function analyzeSeasonalActivityVariation(
  userId: string,
  date: Date = new Date(),
): Promise<SeasonalActivityVariationResult> {
  const recentSteps = await fetchMetric(userId, "daily_steps", daysAgo(date, 30), date)
  const yearSteps = await fetchMetric(userId, "daily_steps", daysAgo(date, 365), date)

  const currentAvg = mean(recentSteps)
  const yearAvg = mean(yearSteps)
  const variationPct = yearAvg > 0 ? ((currentAvg - yearAvg) / yearAvg) * 100 : 0
  const dip = variationPct < -15

  return {
    currentMonthAvgSteps: currentAvg,
    yearAvgSteps: yearAvg,
    variationPct,
    seasonalDip: dip,
    recommendation: dip ? "Seasonal activity dip detected; try indoor exercise, gym sessions, or active hobbies." : "Activity level consistent across seasons.",
  }
}

// ---------------------------------------------------------------------------
// 35. Daylight Savings Impact
// ---------------------------------------------------------------------------

export interface DaylightSavingsImpactResult {
  sleepDurationChange: number
  moodChange: number
  reactionTimeChange: number
  impactScore: number
  recommendation: string
}

export async function analyzeDaylightSavingsImpact(
  userId: string,
  date: Date = new Date(),
): Promise<DaylightSavingsImpactResult> {
  const preSleep = await fetchMetric(userId, "sleep_duration_h", daysAgo(date, 14), daysAgo(date, 7))
  const postSleep = await fetchMetric(userId, "sleep_duration_h", daysAgo(date, 7), date)
  const preMood = await fetchMetric(userId, "mood_score", daysAgo(date, 14), daysAgo(date, 7))
  const postMood = await fetchMetric(userId, "mood_score", daysAgo(date, 7), date)
  const preReaction = await fetchMetric(userId, "reaction_time_ms", daysAgo(date, 14), daysAgo(date, 7))
  const postReaction = await fetchMetric(userId, "reaction_time_ms", daysAgo(date, 7), date)

  const sleepDelta = mean(postSleep) - mean(preSleep)
  const moodDelta = mean(postMood) - mean(preMood)
  const reactionDelta = mean(postReaction) - mean(preReaction)

  const impactScore = clamp(
    normalize(Math.abs(sleepDelta), 0, 2) * 0.4 + normalize(Math.abs(moodDelta), 0, 20) * 0.3 + normalize(Math.max(reactionDelta, 0), 0, 50) * 0.3,
    0,
    1,
  )

  return {
    sleepDurationChange: sleepDelta,
    moodChange: moodDelta,
    reactionTimeChange: reactionDelta,
    impactScore,
    recommendation: impactScore >= 0.4 ? "Shift sleep schedule by 15 min/day in the week before DST transitions." : "Minimal DST impact detected.",
  }
}

// ---------------------------------------------------------------------------
// 36. Time Zone Adaptation
// ---------------------------------------------------------------------------

export interface TimeZoneAdaptationResult {
  currentOffset: number
  homeOffset: number
  daysSinceChange: number
  adaptationProgress: number
  recommendation: string
}

export async function analyzeTimeZoneAdaptation(
  userId: string,
  date: Date = new Date(),
): Promise<TimeZoneAdaptationResult> {
  const currentTz = await fetchMetric(userId, "timezone_offset_h", daysAgo(date, 1), date)
  const homeTz = await fetchMetric(userId, "home_timezone_offset_h", daysAgo(date, 30), date)
  const sleepQuality = await fetchMetric(userId, "sleep_quality", daysAgo(date, 7), date)
  const tzHistory = await fetchMetric(userId, "timezone_offset_h", daysAgo(date, 14), date)

  const current = currentTz[0] ?? 0
  const home = mean(homeTz)
  const diff = Math.abs(current - home)

  let daysSince = 0
  for (let i = 1; i < tzHistory.length; i++) {
    if (Math.abs(tzHistory[i]! - tzHistory[i - 1]!) > 1) { daysSince = i; break }
  }

  const expectedDays = diff * 1.3
  const progress = expectedDays > 0 ? clamp(daysSince / expectedDays, 0, 1) : 1
  const sleepBoost = normalize(mean(sleepQuality), 0, 100) * 0.2
  const adaptationProgress = clamp(progress * 0.8 + sleepBoost, 0, 1)

  return {
    currentOffset: current,
    homeOffset: home,
    daysSinceChange: daysSince,
    adaptationProgress,
    recommendation: adaptationProgress < 0.5 ? "Use strategic light/dark exposure to accelerate adaptation; avoid caffeine after 2 PM local." : "Time zone adaptation progressing well.",
  }
}

// ---------------------------------------------------------------------------
// 37. Chronotype-Environment Match
// ---------------------------------------------------------------------------

export interface ChronotypeEnvironmentMatchResult {
  chronotype: string
  naturalWakeHour: number
  requiredWakeHour: number
  mismatchHours: number
  matchScore: number
  recommendation: string
}

export async function analyzeChronotypeEnvironmentMatch(
  userId: string,
  date: Date = new Date(),
): Promise<ChronotypeEnvironmentMatchResult> {
  const naturalWake = await fetchMetric(userId, "natural_wake_hour", daysAgo(date, 30), date)
  const requiredWake = await fetchMetric(userId, "alarm_hour", daysAgo(date, 30), date)
  const meqScore = await fetchMetric(userId, "meq_score", daysAgo(date, 90), date)

  const natWake = mean(naturalWake)
  const reqWake = mean(requiredWake)
  const meq = mean(meqScore)

  let chronotype: string
  if (meq >= 70) chronotype = "definite morning"
  else if (meq >= 59) chronotype = "moderate morning"
  else if (meq >= 42) chronotype = "intermediate"
  else if (meq >= 31) chronotype = "moderate evening"
  else chronotype = "definite evening"

  const mismatch = Math.abs(natWake - reqWake)
  const matchScore = clamp(1 - normalize(mismatch, 0, 4), 0, 1)

  return {
    chronotype,
    naturalWakeHour: natWake,
    requiredWakeHour: reqWake,
    mismatchHours: mismatch,
    matchScore,
    recommendation: matchScore < 0.5 ? `As a ${chronotype} type, request flexible hours or shift schedule closer to your natural wake time.` : "Schedule aligns well with your chronotype.",
  }
}

// ---------------------------------------------------------------------------
// 38. Indoor Air Quality Proxy
// ---------------------------------------------------------------------------

export interface IndoorAirQualityProxyResult {
  avgCo2Ppm: number
  avgVocPpb: number
  ventilationScore: number
  qualityScore: number
  recommendation: string
}

export async function analyzeIndoorAirQualityProxy(
  userId: string,
  date: Date = new Date(),
): Promise<IndoorAirQualityProxyResult> {
  const co2 = await fetchMetric(userId, "indoor_co2_ppm", daysAgo(date, 7), date)
  const voc = await fetchMetric(userId, "indoor_voc_ppb", daysAgo(date, 7), date)
  const ventilation = await fetchMetric(userId, "ventilation_score", daysAgo(date, 7), date)

  const avgCo2 = mean(co2)
  const avgVoc = mean(voc)
  const ventScore = mean(ventilation)

  const qualityScore = clamp(
    (1 - normalize(avgCo2, 400, 2000)) * 0.4 + (1 - normalize(avgVoc, 0, 500)) * 0.3 + normalize(ventScore, 0, 100) * 0.3,
    0,
    1,
  )

  return {
    avgCo2Ppm: avgCo2,
    avgVocPpb: avgVoc,
    ventilationScore: ventScore,
    qualityScore,
    recommendation: qualityScore < 0.5 ? "Improve ventilation: open windows or use air purifiers; CO₂ above 1000 ppm impairs cognition." : "Indoor air quality is acceptable.",
  }
}

// ---------------------------------------------------------------------------
// 39. Water Intake Adequacy
// ---------------------------------------------------------------------------

export interface WaterIntakeAdequacyResult {
  avgIntakeMl: number
  recommendedMl: number
  adequacyPct: number
  urineColor: number
  recommendation: string
}

export async function analyzeWaterIntakeAdequacy(
  userId: string,
  date: Date = new Date(),
): Promise<WaterIntakeAdequacyResult> {
  const intake = await fetchMetric(userId, "water_intake_ml", daysAgo(date, 7), date)
  const weight = await fetchMetric(userId, "body_weight_kg", daysAgo(date, 30), date)
  const activity = await fetchMetric(userId, "activity_level", daysAgo(date, 7), date)
  const urineColor = await fetchMetric(userId, "urine_color_scale", daysAgo(date, 7), date)

  const avgIntake = mean(intake)
  const w = mean(weight) || 70
  const actLevel = mean(activity)
  const recommended = w * 30 + actLevel * 200
  const adequacy = avgIntake / recommended * 100
  const avgUrine = mean(urineColor)

  return {
    avgIntakeMl: avgIntake,
    recommendedMl: recommended,
    adequacyPct: Math.min(adequacy, 150),
    urineColor: avgUrine,
    recommendation: adequacy < 80 ? `Increase intake to approximately ${Math.round(recommended)} ml/day based on weight and activity.` : "Water intake meets estimated requirements.",
  }
}

// ---------------------------------------------------------------------------
// 40. Commute Health Impact
// ---------------------------------------------------------------------------

export interface CommuteHealthImpactResult {
  avgCommuteMinutes: number
  commuteMode: string
  stressContribution: number
  activityContribution: number
  impactScore: number
  recommendation: string
}

export async function analyzeCommuteHealthImpact(
  userId: string,
  date: Date = new Date(),
): Promise<CommuteHealthImpactResult> {
  const commuteDuration = await fetchMetric(userId, "commute_minutes", daysAgo(date, 14), date)
  const commuteStress = await fetchMetric(userId, "commute_stress", daysAgo(date, 14), date)
  const commuteActivity = await fetchMetric(userId, "commute_active_min", daysAgo(date, 14), date)
  const commuteType = await fetchMetric(userId, "commute_mode", daysAgo(date, 14), date)

  const avgDuration = mean(commuteDuration)
  const stressContrib = normalize(mean(commuteStress), 0, 100)
  const activityContrib = normalize(mean(commuteActivity), 0, 60)
  const modeNum = mean(commuteType)
  const mode = modeNum < 1 ? "walking" : modeNum < 2 ? "cycling" : modeNum < 3 ? "public_transit" : "driving"

  const impactScore = clamp(
    normalize(avgDuration, 0, 120) * 0.3 + stressContrib * 0.4 - activityContrib * 0.3,
    0,
    1,
  )

  return {
    avgCommuteMinutes: avgDuration,
    commuteMode: mode,
    stressContribution: stressContrib,
    activityContribution: activityContrib,
    impactScore,
    recommendation: impactScore >= 0.5 ? "Long or stressful commutes harm health; explore remote work, carpooling, or active commuting." : "Commute impact on health is manageable.",
  }
}

// ---------------------------------------------------------------------------
// 41. Desk Ergonomics
// ---------------------------------------------------------------------------

export interface DeskErgonomicsResult {
  monitorDistance: number
  chairHeight: number
  keyboardAngle: number
  ergonomicScore: number
  recommendation: string
}

export async function analyzeDeskErgonomics(
  userId: string,
  date: Date = new Date(),
): Promise<DeskErgonomicsResult> {
  const monitorDist = await fetchMetric(userId, "monitor_distance_cm", daysAgo(date, 7), date)
  const chairH = await fetchMetric(userId, "chair_height_cm", daysAgo(date, 7), date)
  const kbAngle = await fetchMetric(userId, "keyboard_angle_deg", daysAgo(date, 7), date)
  const painReports = await fetchMetric(userId, "musculoskeletal_pain", daysAgo(date, 7), date)

  const dist = mean(monitorDist) || 60
  const chair = mean(chairH) || 45
  const angle = mean(kbAngle) || 0
  const pain = mean(painReports)

  const distScore = 1 - normalize(Math.abs(dist - 65), 0, 40)
  const chairScore = 1 - normalize(Math.abs(chair - 45), 0, 20)
  const angleScore = 1 - normalize(Math.abs(angle - 5), 0, 30)
  const ergonomicScore = clamp(distScore * 0.3 + chairScore * 0.3 + angleScore * 0.2 + (1 - normalize(pain, 0, 10)) * 0.2, 0, 1)

  return {
    monitorDistance: dist,
    chairHeight: chair,
    keyboardAngle: angle,
    ergonomicScore,
    recommendation: ergonomicScore < 0.5 ? "Adjust monitor to arm's length, chair so thighs are parallel to floor, keyboard slightly tilted." : "Desk ergonomics within recommended ranges.",
  }
}

// ---------------------------------------------------------------------------
// 42. Blue Light Exposure
// ---------------------------------------------------------------------------

export interface BlueLightExposureResult {
  avgBlueLightHours: number
  eveningExposureHours: number
  melatoninSuppressionRisk: number
  eyeStrainRisk: number
  recommendation: string
}

export async function analyzeBlueLightExposure(
  userId: string,
  date: Date = new Date(),
): Promise<BlueLightExposureResult> {
  const blueLight = await fetchMetric(userId, "blue_light_hours", daysAgo(date, 7), date)
  const eveningBlue = await fetchMetric(userId, "blue_light_evening_h", daysAgo(date, 7), date)
  const sleepLatency = await fetchMetric(userId, "sleep_latency_min", daysAgo(date, 7), date)

  const avgBlue = mean(blueLight)
  const avgEvening = mean(eveningBlue)
  const melatoninRisk = clamp(normalize(avgEvening, 0, 4) * 0.7 + normalize(mean(sleepLatency), 5, 60) * 0.3, 0, 1)
  const eyeStrain = normalize(avgBlue, 0, 14)

  return {
    avgBlueLightHours: avgBlue,
    eveningExposureHours: avgEvening,
    melatoninSuppressionRisk: melatoninRisk,
    eyeStrainRisk: eyeStrain,
    recommendation: melatoninRisk >= 0.5 ? "Enable night-shift mode after sunset; wear blue-light-blocking glasses in the evening." : "Blue light exposure pattern is acceptable.",
  }
}

// ---------------------------------------------------------------------------
// 43. Temperature Comfort
// ---------------------------------------------------------------------------

export interface TemperatureComfortResult {
  avgIndoorTemp: number
  comfortZoneMin: number
  comfortZoneMax: number
  comfortScore: number
  thermalSatisfaction: number
  recommendation: string
}

export async function analyzeTemperatureComfort(
  userId: string,
  date: Date = new Date(),
): Promise<TemperatureComfortResult> {
  const indoorTemp = await fetchMetric(userId, "indoor_temp_c", daysAgo(date, 7), date)
  const thermalComfort = await fetchMetric(userId, "thermal_comfort", daysAgo(date, 7), date)

  const avgTemp = mean(indoorTemp)
  const comfortMin = 20
  const comfortMax = 25
  const deviation = avgTemp < comfortMin ? comfortMin - avgTemp : avgTemp > comfortMax ? avgTemp - comfortMax : 0
  const comfortScore = clamp(1 - normalize(deviation, 0, 10), 0, 1)
  const satisfaction = mean(thermalComfort)

  return {
    avgIndoorTemp: avgTemp,
    comfortZoneMin: comfortMin,
    comfortZoneMax: comfortMax,
    comfortScore,
    thermalSatisfaction: satisfaction,
    recommendation: comfortScore < 0.5 ? `Adjust indoor temperature closer to 20-25 °C; current average is ${avgTemp.toFixed(1)} °C.` : "Indoor temperature is within the comfort zone.",
  }
}

// ---------------------------------------------------------------------------
// 44. Sleep Environment Quality
// ---------------------------------------------------------------------------

export interface SleepEnvironmentQualityResult {
  roomTempC: number
  noiseDb: number
  lightLux: number
  humidityPct: number
  qualityScore: number
  recommendation: string
}

export async function analyzeSleepEnvironmentQuality(
  userId: string,
  date: Date = new Date(),
): Promise<SleepEnvironmentQualityResult> {
  const roomTemp = await fetchMetric(userId, "bedroom_temp_c", daysAgo(date, 7), date)
  const noise = await fetchMetric(userId, "bedroom_noise_db", daysAgo(date, 7), date)
  const light = await fetchMetric(userId, "bedroom_light_lux", daysAgo(date, 7), date)
  const humidity = await fetchMetric(userId, "bedroom_humidity_pct", daysAgo(date, 7), date)

  const avgTemp = mean(roomTemp)
  const avgNoise = mean(noise)
  const avgLight = mean(light)
  const avgHumidity = mean(humidity)

  const tempScore = 1 - normalize(Math.abs(avgTemp - 18), 0, 10)
  const noiseScore = 1 - normalize(avgNoise, 20, 60)
  const lightScore = 1 - normalize(avgLight, 0, 50)
  const humidityScore = 1 - normalize(Math.abs(avgHumidity - 45), 0, 30)

  const qualityScore = clamp(tempScore * 0.3 + noiseScore * 0.25 + lightScore * 0.25 + humidityScore * 0.2, 0, 1)

  return {
    roomTempC: avgTemp,
    noiseDb: avgNoise,
    lightLux: avgLight,
    humidityPct: avgHumidity,
    qualityScore,
    recommendation: qualityScore < 0.5 ? "Optimise bedroom: 16-19 °C, blackout curtains, white noise machine, 40-50% humidity." : "Sleep environment is well-optimised.",
  }
}

// ---------------------------------------------------------------------------
// 45. Exercise Environment
// ---------------------------------------------------------------------------

export interface ExerciseEnvironmentResult {
  outdoorExercisePct: number
  avgExerciseAqi: number
  avgExerciseTemp: number
  suitabilityScore: number
  recommendation: string
}

export async function analyzeExerciseEnvironment(
  userId: string,
  date: Date = new Date(),
): Promise<ExerciseEnvironmentResult> {
  const outdoorEx = await fetchMetric(userId, "outdoor_exercise_pct", daysAgo(date, 7), date)
  const exAqi = await fetchMetric(userId, "exercise_aqi", daysAgo(date, 7), date)
  const exTemp = await fetchMetric(userId, "exercise_temp_c", daysAgo(date, 7), date)
  const exHumidity = await fetchMetric(userId, "exercise_humidity_pct", daysAgo(date, 7), date)

  const outdoorPct = mean(outdoorEx)
  const avgAqi = mean(exAqi)
  const avgTemp = mean(exTemp)
  const avgH = mean(exHumidity)

  const aqiScore = 1 - normalize(avgAqi, 0, 200)
  const tempScore = 1 - normalize(Math.abs(avgTemp - 18), 0, 25)
  const humidityScore = 1 - normalize(Math.abs(avgH - 50), 0, 40)

  const suitabilityScore = clamp(aqiScore * 0.4 + tempScore * 0.3 + humidityScore * 0.3, 0, 1)

  return {
    outdoorExercisePct: outdoorPct,
    avgExerciseAqi: avgAqi,
    avgExerciseTemp: avgTemp,
    suitabilityScore,
    recommendation: suitabilityScore < 0.5 ? "Consider indoor exercise when AQI > 100 or temperatures are extreme." : "Exercise environment conditions are favourable.",
  }
}

// ---------------------------------------------------------------------------
// 46. Recovery Environment
// ---------------------------------------------------------------------------

export interface RecoveryEnvironmentResult {
  restDays7d: number
  avgHrv: number
  sleepQuality: number
  stressLevel: number
  recoveryScore: number
  recommendation: string
}

export async function analyzeRecoveryEnvironment(
  userId: string,
  date: Date = new Date(),
): Promise<RecoveryEnvironmentResult> {
  const restDays = await fetchMetric(userId, "rest_day", daysAgo(date, 7), date)
  const hrv = await fetchMetric(userId, "hrv_ms", daysAgo(date, 7), date)
  const sleepQ = await fetchMetric(userId, "sleep_quality", daysAgo(date, 7), date)
  const stress = await fetchMetric(userId, "stress_level", daysAgo(date, 7), date)

  const totalRest = restDays.filter((d) => d === 1).length
  const avgHrv = mean(hrv)
  const avgSleep = mean(sleepQ)
  const avgStress = mean(stress)

  const recoveryScore = clamp(
    normalize(totalRest, 0, 3) * 0.25 + normalize(avgHrv, 20, 100) * 0.3 + normalize(avgSleep, 0, 100) * 0.25 + (1 - normalize(avgStress, 0, 100)) * 0.2,
    0,
    1,
  )

  return {
    restDays7d: totalRest,
    avgHrv: avgHrv,
    sleepQuality: avgSleep,
    stressLevel: avgStress,
    recoveryScore,
    recommendation: recoveryScore < 0.5 ? "Prioritise recovery: schedule 1-2 rest days, improve sleep, and reduce stress triggers." : "Recovery environment supports training adaptation.",
  }
}

// ---------------------------------------------------------------------------
// 47. Social Environment Health
// ---------------------------------------------------------------------------

export interface SocialEnvironmentHealthResult {
  socialInteractionMinutes: number
  socialConnections: number
  lonelinessScore: number
  socialHealthScore: number
  recommendation: string
}

export async function analyzeSocialEnvironmentHealth(
  userId: string,
  date: Date = new Date(),
): Promise<SocialEnvironmentHealthResult> {
  const socialMin = await fetchMetric(userId, "social_interaction_min", daysAgo(date, 7), date)
  const connections = await fetchMetric(userId, "meaningful_connections", daysAgo(date, 7), date)
  const loneliness = await fetchMetric(userId, "loneliness_score", daysAgo(date, 7), date)

  const totalSocial = socialMin.reduce((a, b) => a + b, 0)
  const totalConnections = connections.reduce((a, b) => a + b, 0)
  const avgLoneliness = mean(loneliness)

  const socialHealth = clamp(
    normalize(totalSocial, 0, 600) * 0.35 + normalize(totalConnections, 0, 15) * 0.35 + (1 - normalize(avgLoneliness, 0, 10)) * 0.3,
    0,
    1,
  )

  return {
    socialInteractionMinutes: totalSocial,
    socialConnections: totalConnections,
    lonelinessScore: avgLoneliness,
    socialHealthScore: socialHealth,
    recommendation: socialHealth < 0.5 ? "Invest in social connections: schedule regular catch-ups, join group activities." : "Social environment supports wellbeing.",
  }
}

// ---------------------------------------------------------------------------
// 48. Work Stress Environment
// ---------------------------------------------------------------------------

export interface WorkStressEnvironmentResult {
  avgWorkStress: number
  meetingHours: number
  focusTimeHours: number
  workloadScore: number
  environmentScore: number
  recommendation: string
}

export async function analyzeWorkStressEnvironment(
  userId: string,
  date: Date = new Date(),
): Promise<WorkStressEnvironmentResult> {
  const workStress = await fetchMetric(userId, "work_stress", daysAgo(date, 14), date)
  const meetingH = await fetchMetric(userId, "meeting_hours", daysAgo(date, 14), date)
  const focusH = await fetchMetric(userId, "focus_time_hours", daysAgo(date, 14), date)
  const workload = await fetchMetric(userId, "perceived_workload", daysAgo(date, 14), date)

  const avgStress = mean(workStress)
  const avgMeetings = mean(meetingH)
  const avgFocus = mean(focusH)
  const avgWorkload = mean(workload)

  const meetingBurden = normalize(avgMeetings, 0, 8)
  const focusBenefit = normalize(avgFocus, 0, 6)
  const workloadPressure = normalize(avgWorkload, 0, 10)

  const environmentScore = clamp(
    (1 - normalize(avgStress, 0, 100)) * 0.3 + (1 - meetingBurden) * 0.2 + focusBenefit * 0.25 + (1 - workloadPressure) * 0.25,
    0,
    1,
  )

  return {
    avgWorkStress: avgStress,
    meetingHours: avgMeetings,
    focusTimeHours: avgFocus,
    workloadScore: avgWorkload,
    environmentScore,
    recommendation: environmentScore < 0.5 ? "Reduce meeting load, protect 2+ hours of focus time daily, and communicate workload boundaries." : "Work environment stress levels are manageable.",
  }
}

// ---------------------------------------------------------------------------
// 49. Home Health Environment
// ---------------------------------------------------------------------------

export interface HomeHealthEnvironmentResult {
  indoorAirScore: number
  lightingScore: number
  noiseScore: number
  cleanlinessScore: number
  overallScore: number
  recommendation: string
}

export async function analyzeHomeHealthEnvironment(
  userId: string,
  date: Date = new Date(),
): Promise<HomeHealthEnvironmentResult> {
  const co2 = await fetchMetric(userId, "indoor_co2_ppm", daysAgo(date, 7), date)
  const lighting = await fetchMetric(userId, "home_lighting_lux", daysAgo(date, 7), date)
  const noise = await fetchMetric(userId, "home_noise_db", daysAgo(date, 7), date)
  const cleanliness = await fetchMetric(userId, "home_cleanliness", daysAgo(date, 7), date)
  const mold = await fetchMetric(userId, "mold_risk_score", daysAgo(date, 7), date)

  const airScore = clamp(1 - normalize(mean(co2), 400, 2000), 0, 1)
  const lightScore = normalize(mean(lighting), 50, 500)
  const noiseScr = clamp(1 - normalize(mean(noise), 30, 70), 0, 1)
  const cleanScore = normalize(mean(cleanliness), 0, 10)
  const moldPenalty = normalize(mean(mold), 0, 10) * 0.15

  const overallScore = clamp(airScore * 0.3 + lightScore * 0.2 + noiseScr * 0.2 + cleanScore * 0.2 - moldPenalty + 0.1, 0, 1)

  return {
    indoorAirScore: airScore,
    lightingScore: lightScore,
    noiseScore: noiseScr,
    cleanlinessScore: cleanScore,
    overallScore,
    recommendation: overallScore < 0.5 ? "Improve ventilation, ensure adequate natural lighting, reduce noise sources, and address mold risks." : "Home health environment is supportive of wellbeing.",
  }
}

// ---------------------------------------------------------------------------
// 50. Urban vs Rural Health
// ---------------------------------------------------------------------------

export interface UrbanRuralHealthResult {
  urbanExposurePct: number
  greenSpaceAccessScore: number
  pollutionExposure: number
  noiseExposure: number
  healthDifferentialScore: number
  recommendation: string
}

export async function analyzeUrbanRuralHealth(
  userId: string,
  date: Date = new Date(),
): Promise<UrbanRuralHealthResult> {
  const urbanPct = await fetchMetric(userId, "urban_time_pct", daysAgo(date, 14), date)
  const greenAccess = await fetchMetric(userId, "green_space_access", daysAgo(date, 14), date)
  const pollution = await fetchMetric(userId, "pm25", daysAgo(date, 14), date)
  const noise = await fetchMetric(userId, "ambient_noise_db", daysAgo(date, 14), date)
  const steps = await fetchMetric(userId, "daily_steps", daysAgo(date, 14), date)

  const avgUrban = mean(urbanPct)
  const avgGreen = mean(greenAccess)
  const avgPollution = mean(pollution)
  const avgNoise = mean(noise)
  const avgSteps = mean(steps)

  const urbanPenalty = normalize(avgUrban, 0, 100) * 0.15
  const greenBenefit = normalize(avgGreen, 0, 10) * 0.25
  const pollutionPenalty = normalize(avgPollution, 0, 75) * 0.2
  const noisePenalty = normalize(avgNoise, 40, 85) * 0.15
  const activityBenefit = normalize(avgSteps, 0, 15000) * 0.25

  const healthDiff = clamp(greenBenefit + activityBenefit - urbanPenalty - pollutionPenalty - noisePenalty + 0.5, 0, 1)

  return {
    urbanExposurePct: avgUrban,
    greenSpaceAccessScore: avgGreen,
    pollutionExposure: avgPollution,
    noiseExposure: avgNoise,
    healthDifferentialScore: healthDiff,
    recommendation: healthDiff < 0.5 ? "Offset urban health penalties: visit parks regularly, use air purifiers, and maintain physical activity." : "Environment-health balance is positive.",
  }
}

// ---------------------------------------------------------------------------
// 51. Circadian Meal Timing
// ---------------------------------------------------------------------------

export interface CircadianMealTimingResult {
  firstMealHour: number
  lastMealHour: number
  eatingWindowHours: number
  lateEatingScore: number
  alignmentScore: number
  recommendation: string
}

export async function analyzeCircadianMealTiming(
  userId: string,
  date: Date = new Date(),
): Promise<CircadianMealTimingResult> {
  const firstMeal = await fetchMetric(userId, "first_meal_hour", daysAgo(date, 7), date)
  const lastMeal = await fetchMetric(userId, "last_meal_hour", daysAgo(date, 7), date)
  const wakeHour = await fetchMetric(userId, "wake_hour", daysAgo(date, 7), date)

  const avgFirst = mean(firstMeal)
  const avgLast = mean(lastMeal)
  const avgWake = mean(wakeHour)
  const window = avgLast - avgFirst

  const lateEating = normalize(Math.max(avgLast - 20, 0), 0, 4)
  const windowPenalty = normalize(Math.max(window - 12, 0), 0, 6)
  const wakeGap = normalize(Math.max(avgFirst - avgWake - 2, 0), 0, 4)

  const alignmentScore = clamp(1 - lateEating * 0.4 - windowPenalty * 0.3 - wakeGap * 0.3, 0, 1)

  return {
    firstMealHour: avgFirst,
    lastMealHour: avgLast,
    eatingWindowHours: window,
    lateEatingScore: lateEating,
    alignmentScore,
    recommendation: alignmentScore < 0.5 ? "Finish eating 3+ hours before bed; keep eating window under 12 hours." : "Meal timing aligns well with circadian rhythm.",
  }
}

// ---------------------------------------------------------------------------
// 52. Microclimate Stress
// ---------------------------------------------------------------------------

export interface MicroclimateStressResult {
  indoorOutdoorTempDelta: number
  transitionsPerDay: number
  thermalShockScore: number
  adaptationStress: number
  recommendation: string
}

export async function analyzeMicroclimateStress(
  userId: string,
  date: Date = new Date(),
): Promise<MicroclimateStressResult> {
  const indoorTemp = await fetchMetric(userId, "indoor_temp_c", daysAgo(date, 7), date)
  const outdoorTemp = await fetchMetric(userId, "ambient_temp_c", daysAgo(date, 7), date)
  const transitions = await fetchMetric(userId, "indoor_outdoor_transitions", daysAgo(date, 7), date)

  const avgIndoor = mean(indoorTemp)
  const avgOutdoor = mean(outdoorTemp)
  const delta = Math.abs(avgIndoor - avgOutdoor)
  const avgTransitions = mean(transitions)

  const thermalShock = normalize(delta, 0, 25)
  const adaptationStress = clamp(thermalShock * 0.6 + normalize(avgTransitions, 0, 20) * 0.4, 0, 1)

  return {
    indoorOutdoorTempDelta: delta,
    transitionsPerDay: avgTransitions,
    thermalShockScore: thermalShock,
    adaptationStress,
    recommendation: adaptationStress >= 0.5 ? "Reduce indoor-outdoor temperature contrast; use transitional clothing layers." : "Microclimate transitions are manageable.",
  }
}
