/**
 * Types for the VitaSync Health Insights Engine.
 *
 * The engine transforms raw health metrics and events into actionable,
 * evidence-based insights using 55 state-of-the-art algorithms.
 */

export type InsightCategory =
  | "cardiovascular"
  | "sleep"
  | "fitness"
  | "body"
  | "recovery"
  | "activity"
  | "advanced"

export type InsightStatus = "optimal" | "good" | "fair" | "poor" | "critical" | "neutral" | "info"

export interface InsightResult {
  id: string
  name: string
  category: InsightCategory
  description: string
  value: number | string | null
  unit?: string
  status: InsightStatus
  summary: string
  details?: string
  references?: string[]
}

export interface MetricDataPoint {
  recordedAt: Date
  value: number | null
  data?: Record<string, unknown>
  metricType: string
  unit?: string
}

export interface EventDataPoint {
  eventType: string
  activityType?: string
  startedAt: Date
  endedAt?: Date
  durationSeconds?: number
  distanceMeters?: number
  caloriesKcal?: number
  avgHeartRate?: number
  maxHeartRate?: number
  avgSpeedMps?: number
  elevationGainMeters?: number
  data?: Record<string, unknown>
}

export interface InsightInput {
  metrics: MetricDataPoint[]
  events: EventDataPoint[]
  period: { from: Date; to: Date }
  /** Optional user profile for age/gender-specific calculations */
  profile?: {
    age?: number
    gender?: "male" | "female"
    heightCm?: number
    weightKg?: number
  }
}

export interface AlgorithmDefinition {
  id: string
  name: string
  category: InsightCategory
  description: string
  requiredMetrics: string[]
  optionalMetrics?: string[]
  requiresEvents?: boolean
  compute: (input: InsightInput) => InsightResult | null
}
