/**
 * All supported health metric types.
 * Using a const enum pattern for exhaustive type checking.
 */
export const HealthMetricType = {
  // Activity
  STEPS: "steps",
  DISTANCE: "distance",
  CALORIES: "calories",
  ACTIVE_MINUTES: "active_minutes",
  FLOORS: "floors",

  // Heart
  HEART_RATE: "heart_rate",
  RESTING_HEART_RATE: "resting_heart_rate",
  HEART_RATE_VARIABILITY: "heart_rate_variability",

  // Sleep
  SLEEP: "sleep",
  SLEEP_SCORE: "sleep_score",

  // Body
  WEIGHT: "weight",
  BODY_FAT: "body_fat",
  BMI: "bmi",
  BLOOD_OXYGEN: "blood_oxygen",
  BLOOD_PRESSURE: "blood_pressure",
  TEMPERATURE: "temperature",
  BLOOD_GLUCOSE: "blood_glucose",

  // Stress & Recovery
  STRESS: "stress",
  HRV_STATUS: "hrv_status",
  RECOVERY_SCORE: "recovery_score",
  READINESS_SCORE: "readiness_score",
  STRAIN_SCORE: "strain_score",

  // Workouts
  WORKOUT: "workout",

  // Breathing
  RESPIRATORY_RATE: "respiratory_rate",
  SPO2: "spo2",
} as const

export type HealthMetricType = (typeof HealthMetricType)[keyof typeof HealthMetricType]

export const MetricUnit = {
  // Count
  COUNT: "count",
  STEPS: "steps",

  // Distance
  METERS: "m",
  KILOMETERS: "km",
  MILES: "mi",

  // Energy
  KILOCALORIES: "kcal",
  KILOJOULES: "kJ",

  // Heart
  BPM: "bpm",
  MILLISECONDS: "ms",

  // Body
  KILOGRAMS: "kg",
  POUNDS: "lbs",
  PERCENT: "%",
  MMHG: "mmHg",
  CELSIUS: "°C",
  FAHRENHEIT: "°F",
  MG_DL: "mg/dL",
  MMOL_L: "mmol/L",

  // Time
  MINUTES: "min",
  SECONDS: "s",
  HOURS: "h",

  // Misc
  SCORE: "score",
  FLOORS: "floors",
  BREATHS_PER_MINUTE: "brpm",
} as const

export type MetricUnit = (typeof MetricUnit)[keyof typeof MetricUnit]

/** A single normalized health data point */
export interface HealthMetric {
  id: string
  userId: string
  connectionId: string
  providerId: string
  metricType: HealthMetricType
  recordedAt: Date
  /** Numeric value for simple scalar metrics */
  value?: number
  /** Full structured data for complex metrics (sleep stages, workout details, etc.) */
  data?: Record<string, unknown>
  unit?: MetricUnit
  /** Device or sub-app that recorded this (e.g., "Garmin Forerunner 965") */
  source?: string
  createdAt: Date
}

/** Structured sleep data */
export interface SleepData {
  startTime: Date
  endTime: Date
  durationMinutes: number
  score?: number
  stages?: {
    light: number
    deep: number
    rem: number
    awake: number
  }
  awakenings?: number
  breathingAvg?: number
  heartRateAvg?: number
}

/** Structured workout data */
export interface WorkoutData {
  activityType: string
  startTime: Date
  endTime: Date
  durationSeconds: number
  distanceMeters?: number
  calories?: number
  avgHeartRate?: number
  maxHeartRate?: number
  avgPaceSecondsPerKm?: number
  elevationGainMeters?: number
  laps?: WorkoutLap[]
}

export interface WorkoutLap {
  lapNumber: number
  durationSeconds: number
  distanceMeters?: number
  avgHeartRate?: number
}

/** Blood pressure reading */
export interface BloodPressureData {
  systolic: number
  diastolic: number
  pulse?: number
}

/** Heart rate time series */
export interface HeartRateZones {
  fat_burn: number
  cardio: number
  peak: number
  out_of_range: number
}

// ── Health Score ─────────────────────────────────────────────────

export interface HealthScore {
  id: string
  userId: string
  date: Date
  overallScore: number
  sleepScore?: number
  activityScore?: number
  cardioScore?: number
  recoveryScore?: number
  bodyScore?: number
  deltaFromPrevious?: number
  weeklyAverage?: number
  percentileRank?: number
  grade?: string
  breakdown?: Record<string, unknown>
}

// ── Goals ────────────────────────────────────────────────────────

export const GoalCategory = {
  ACTIVITY: "activity",
  SLEEP: "sleep",
  HEART: "heart",
  BODY: "body",
  NUTRITION: "nutrition",
  MENTAL_HEALTH: "mental_health",
  CUSTOM: "custom",
} as const
export type GoalCategory = (typeof GoalCategory)[keyof typeof GoalCategory]

export const GoalCadence = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const
export type GoalCadence = (typeof GoalCadence)[keyof typeof GoalCadence]

export interface Goal {
  id: string
  userId: string
  name: string
  description?: string
  category: GoalCategory
  metricType?: HealthMetricType
  targetValue: number
  unit?: string
  cadence: GoalCadence
  currentValue: number
  bestValue?: number
  currentStreak: number
  longestStreak: number
  isActive: boolean
  startDate?: Date
  endDate?: Date
  createdAt: Date
}

export interface GoalProgress {
  id: string
  goalId: string
  date: Date
  value: number
  percentComplete: number
  met: boolean
}

// ── Achievements ─────────────────────────────────────────────────

export const AchievementTier = {
  BRONZE: "bronze",
  SILVER: "silver",
  GOLD: "gold",
  PLATINUM: "platinum",
  DIAMOND: "diamond",
} as const
export type AchievementTier = (typeof AchievementTier)[keyof typeof AchievementTier]

export const AchievementCategory = {
  MILESTONE: "milestone",
  STREAK: "streak",
  PERSONAL_RECORD: "personal_record",
  SOCIAL: "social",
  SPECIAL: "special",
} as const
export type AchievementCategory = (typeof AchievementCategory)[keyof typeof AchievementCategory]

export interface Achievement {
  id: string
  userId: string
  achievementId: string
  category: AchievementCategory
  name: string
  description?: string
  icon?: string
  tier?: AchievementTier
  unlockedAt: Date
  metadata?: Record<string, unknown>
}

/** Achievement definition (code-side, not stored) */
export interface AchievementDefinition {
  id: string
  name: string
  description: string
  category: AchievementCategory
  tier: AchievementTier
  icon: string
  /** Condition checker function name */
  condition: string
  /** Target value to unlock */
  threshold: number
}

// ── Challenges ───────────────────────────────────────────────────

export const ChallengeStatus = {
  DRAFT: "draft",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const
export type ChallengeStatus = (typeof ChallengeStatus)[keyof typeof ChallengeStatus]

export interface Challenge {
  id: string
  workspaceId: string
  createdBy: string
  name: string
  description?: string
  challengeType: string
  metricType: string
  aggregation: string
  targetValue?: number
  unit?: string
  startsAt: Date
  endsAt: Date
  status: ChallengeStatus
  maxParticipants?: number
  isPublic: boolean
}

export interface ChallengeParticipant {
  id: string
  challengeId: string
  userId: string
  score: number
  rank?: number
  dailyScores: Record<string, number>
  joinedAt: Date
}

export interface ChallengeLeaderboardEntry {
  userId: string
  displayName?: string
  score: number
  rank: number
  dailyScores: Record<string, number>
}

// ── Mood Tracking ────────────────────────────────────────────────

export const MoodType = {
  HAPPY: "happy",
  CALM: "calm",
  ANXIOUS: "anxious",
  SAD: "sad",
  ANGRY: "angry",
  NEUTRAL: "neutral",
  ENERGIZED: "energized",
  TIRED: "tired",
} as const
export type MoodType = (typeof MoodType)[keyof typeof MoodType]

export interface MoodLog {
  id: string
  userId: string
  score: number
  energyLevel?: number
  stressLevel?: number
  mood: MoodType
  tags: string[]
  notes?: string
  factors: string[]
  recordedAt: Date
}

// ── Nutrition ────────────────────────────────────────────────────

export const MealType = {
  BREAKFAST: "breakfast",
  LUNCH: "lunch",
  DINNER: "dinner",
  SNACK: "snack",
  SUPPLEMENT: "supplement",
} as const
export type MealType = (typeof MealType)[keyof typeof MealType]

export interface NutritionLog {
  id: string
  userId: string
  mealType: MealType
  description?: string
  calories?: number
  proteinGrams?: number
  carbsGrams?: number
  fatGrams?: number
  fiberGrams?: number
  sugarGrams?: number
  sodiumMg?: number
  waterMl?: number
  consumedAt: Date
}

export interface DailyNutritionSummary {
  date: string
  totalCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
  totalFiber: number
  totalWaterMl: number
  mealCount: number
}

// ── Medications ──────────────────────────────────────────────────

export const MedicationFrequency = {
  ONCE_DAILY: "once_daily",
  TWICE_DAILY: "twice_daily",
  THREE_TIMES_DAILY: "three_times_daily",
  WEEKLY: "weekly",
  AS_NEEDED: "as_needed",
} as const
export type MedicationFrequency = (typeof MedicationFrequency)[keyof typeof MedicationFrequency]

export interface Medication {
  id: string
  userId: string
  name: string
  dosage?: string
  frequency: MedicationFrequency
  timeOfDay: string[]
  category?: string
  purpose?: string
  isActive: boolean
  startDate?: Date
  endDate?: Date
}

export interface MedicationAdherenceStats {
  medicationId: string
  name: string
  totalScheduled: number
  totalTaken: number
  totalMissed: number
  adherenceRate: number
  currentStreak: number
}

// ── Anomaly Detection ────────────────────────────────────────────

export const AnomalySeverity = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const
export type AnomalySeverity = (typeof AnomalySeverity)[keyof typeof AnomalySeverity]

export interface AnomalyAlert {
  id: string
  userId: string
  metricType: string
  severity: AnomalySeverity
  detectionMethod: string
  observedValue: number
  expectedValue: number
  zScore?: number
  title: string
  description: string
  status: "new" | "acknowledged" | "dismissed" | "resolved"
  detectedAt: Date
}

// ── Correlations ─────────────────────────────────────────────────

export interface MetricCorrelation {
  id: string
  userId: string
  metricA: string
  metricB: string
  pearsonR: number
  spearmanRho?: number
  pValue?: number
  sampleSize: number
  strength: "weak" | "moderate" | "strong" | "very_strong"
  direction: "positive" | "negative"
  description?: string
  lagDays: number
  periodStart: Date
  periodEnd: Date
}

// ── Health Reports ───────────────────────────────────────────────

export const ReportType = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUAL: "annual",
  CUSTOM: "custom",
} as const
export type ReportType = (typeof ReportType)[keyof typeof ReportType]

export interface HealthReport {
  id: string
  userId: string
  reportType: ReportType
  title: string
  periodStart: Date
  periodEnd: Date
  status: "generating" | "ready" | "failed"
  content?: Record<string, unknown>
  highlights?: string[]
  recommendations?: string[]
  format: string
  createdAt: Date
}

// ── Data Exports ─────────────────────────────────────────────────

export const ExportFormat = {
  FHIR_R4: "fhir_r4",
  CSV: "csv",
  JSON: "json",
  PDF: "pdf",
} as const
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat]

export interface DataExport {
  id: string
  userId: string
  format: ExportFormat
  status: "pending" | "processing" | "completed" | "failed" | "expired"
  metricTypes?: string[]
  periodStart?: Date
  periodEnd?: Date
  recordCount?: number
  downloadUrl?: string
  expiresAt?: Date
  createdAt: Date
}

// ── Training Plans ───────────────────────────────────────────────

export const TrainingGoal = {
  GENERAL_FITNESS: "general_fitness",
  WEIGHT_LOSS: "weight_loss",
  ENDURANCE: "endurance",
  STRENGTH: "strength",
  MARATHON: "marathon",
  FIVE_K: "5k",
  RECOVERY: "recovery",
} as const
export type TrainingGoal = (typeof TrainingGoal)[keyof typeof TrainingGoal]

export const TrainingDifficulty = {
  BEGINNER: "beginner",
  INTERMEDIATE: "intermediate",
  ADVANCED: "advanced",
  ELITE: "elite",
} as const
export type TrainingDifficulty = (typeof TrainingDifficulty)[keyof typeof TrainingDifficulty]

export interface TrainingPlan {
  id: string
  userId: string
  name: string
  goal: TrainingGoal
  difficulty: TrainingDifficulty
  durationWeeks: number
  currentWeek: number
  status: "active" | "paused" | "completed" | "abandoned"
  schedule?: Record<string, unknown>[]
  weeklyTargets?: Record<string, number>
  adherenceRate: number
  adaptive: boolean
  startsAt: Date
  endsAt?: Date
}

// ── Symptom Logs ─────────────────────────────────────────────────

export interface SymptomLog {
  id: string
  userId: string
  symptom: string
  severity: number
  durationMinutes?: number
  bodyLocation?: string
  triggers?: string[]
  reliefMeasures?: string[]
  notes?: string
  startedAt: Date
  resolvedAt?: Date
}

// ── Biometric Baselines ─────────────────────────────────────────

export interface BiometricBaseline {
  id: string
  userId: string
  metricType: string
  date: Date
  mean: number
  stddev?: number
  min?: number
  max?: number
  median?: number
  p25?: number
  p75?: number
  sampleSize?: number
  trend?: "rising" | "falling" | "stable"
  trendSlope?: number
}

// ── Health Snapshots ─────────────────────────────────────────────

export interface HealthSnapshot {
  id: string
  userId: string
  periodType: "weekly" | "monthly"
  periodStart: Date
  periodEnd: Date
  overallScore?: number
  avgSteps?: number
  avgSleepMinutes?: number
  avgRestingHr?: number
  avgHrv?: number
  avgCalories?: number
  avgActiveMinutes?: number
  avgWeight?: number
  avgStress?: number
  avgRecovery?: number
  workoutCount?: number
  totalDistanceMeters?: number
  goalCompletionRate?: number
  avgMoodScore?: number
  periodComparison?: Record<string, number>
  achievements?: string[]
  observations?: string[]
}

// ── Sleep Analysis ───────────────────────────────────────────────

export interface SleepDebtAnalysis {
  userId: string
  currentDebtMinutes: number
  weeklyDebtMinutes: number
  avgSleepMinutes: number
  targetSleepMinutes: number
  debtTrend: "accumulating" | "recovering" | "stable"
  recoveryEtaDays?: number
  recommendations: string[]
}

export interface SleepQualityReport {
  userId: string
  periodDays: number
  avgDuration: number
  avgEfficiency: number
  avgDeepSleepPct: number
  avgRemSleepPct: number
  consistencyScore: number
  overallGrade: string
  issues: string[]
  suggestions: string[]
}
