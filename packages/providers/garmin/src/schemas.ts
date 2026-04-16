import { z } from "zod"

// ── Daily Summaries ──────────────────────────────────────────

export const GarminDailySummarySchema = z.object({
  summaryId: z.string(),
  calendarDate: z.string(),
  startTimeInSeconds: z.number().optional(),
  durationInSeconds: z.number().optional(),
  // Activity
  steps: z.number().optional(),
  totalSteps: z.number().optional(),
  distanceInMeters: z.number().optional(),
  totalDistanceInMeters: z.number().optional(),
  activeTimeInSeconds: z.number().optional(),
  activeSeconds: z.number().optional(),
  highlyActiveSeconds: z.number().optional(),
  floorsClimbed: z.number().optional(),
  floorsAscended: z.number().optional(),
  // Calories
  activeKilocalories: z.number().optional(),
  totalKilocalories: z.number().optional(),
  // Heart
  restingHeartRateInBeatsPerMinute: z.number().optional(),
  averageHeartRateInBeatsPerMinute: z.number().optional(),
  maxHeartRateInBeatsPerMinute: z.number().optional(),
  // Stress
  averageStressLevel: z.number().optional(),
  maxStressLevel: z.number().optional(),
  stressDurationInSeconds: z.number().optional(),
  // Goals
  stepsGoal: z.number().optional(),
})

export const GarminDailiesResponseSchema = z.array(GarminDailySummarySchema)

// ── Heart Rate ───────────────────────────────────────────────

export const GarminHeartRateEntrySchema = z.object({
  calendarDate: z.string(),
  startTimestampGMT: z.number().optional(),
  endTimestampGMT: z.number().optional(),
  maxHeartRate: z.number().optional(),
  minHeartRate: z.number().optional(),
  restingHeartRate: z.number().optional(),
  lastSevenDaysAvgRestingHeartRate: z.number().optional(),
})

export const GarminHeartRateResponseSchema = z.array(GarminHeartRateEntrySchema)

// ── Sleep ────────────────────────────────────────────────────

export const GarminSleepEntrySchema = z.object({
  summaryId: z.string().optional(),
  calendarDate: z.string().optional(),
  startTimeInSeconds: z.number(),
  durationInSeconds: z.number(),
  validation: z.string().optional(),
  // Sleep stages (in seconds)
  deepSleepDurationInSeconds: z.number().optional(),
  lightSleepDurationInSeconds: z.number().optional(),
  remSleepInSeconds: z.number().optional(),
  awakeDurationInSeconds: z.number().optional(),
  // Scores
  overallSleepScore: z.object({ value: z.number() }).optional(),
  sleepScores: z
    .object({
      overallScore: z.number().optional(),
      qualityScore: z.number().optional(),
      durationScore: z.number().optional(),
    })
    .optional(),
  // Physiological
  averageSpO2Value: z.number().optional(),
  lowestSpO2Value: z.number().optional(),
  averageRespiration: z.number().optional(),
})

export const GarminSleepResponseSchema = z.array(GarminSleepEntrySchema)

// ── Stress ───────────────────────────────────────────────────

export const GarminStressEntrySchema = z.object({
  calendarDate: z.string(),
  startTimestampGMT: z.number().optional(),
  endTimestampGMT: z.number().optional(),
  overallStressLevel: z.number().optional(),
  restStressDurationInSeconds: z.number().optional(),
  activityStressDurationInSeconds: z.number().optional(),
  lowStressDurationInSeconds: z.number().optional(),
  mediumStressDurationInSeconds: z.number().optional(),
  highStressDurationInSeconds: z.number().optional(),
})

export const GarminStressResponseSchema = z.array(GarminStressEntrySchema)

// ── HRV ──────────────────────────────────────────────────────

export const GarminHrvEntrySchema = z.object({
  calendarDate: z.string(),
  startTimestampGMT: z.number().optional(),
  endTimestampGMT: z.number().optional(),
  weeklyAvg: z.number().optional(),
  lastNightAvg: z.number().optional(),
  lastNight5MinHigh: z.number().optional(),
  status: z.string().optional(),
})

export const GarminHrvResponseSchema = z.array(GarminHrvEntrySchema)

// ── Body Composition ─────────────────────────────────────────

export const GarminBodyCompEntrySchema = z.object({
  summaryId: z.string().optional(),
  calendarDate: z.string(),
  weightInGrams: z.number().optional(),
  bodyFat: z.number().optional(),
  bodyMassIndex: z.number().optional(),
  muscleMassInGrams: z.number().optional(),
  boneMassInGrams: z.number().optional(),
  bodyWaterPercentage: z.number().optional(),
})

export const GarminBodyCompResponseSchema = z.array(GarminBodyCompEntrySchema)

// ── SpO2 (Pulse Ox) ─────────────────────────────────────────

export const GarminPulseOxEntrySchema = z.object({
  calendarDate: z.string(),
  startTimestampGMT: z.number().optional(),
  endTimestampGMT: z.number().optional(),
  averageSpO2: z.number().optional(),
  lowestSpO2: z.number().optional(),
})

export const GarminPulseOxResponseSchema = z.array(GarminPulseOxEntrySchema)

// ── Respiration ──────────────────────────────────────────────

export const GarminRespirationEntrySchema = z.object({
  calendarDate: z.string(),
  startTimestampGMT: z.number().optional(),
  avgWakingRespirationValue: z.number().optional(),
  highestRespirationValue: z.number().optional(),
  lowestRespirationValue: z.number().optional(),
  avgSleepRespirationValue: z.number().optional(),
})

export const GarminRespirationResponseSchema = z.array(GarminRespirationEntrySchema)
