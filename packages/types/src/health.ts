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
