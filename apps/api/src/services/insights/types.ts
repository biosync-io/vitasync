export type InsightSeverity = "info" | "positive" | "warning" | "critical"
export type InsightCategory =
  | "cardio"
  | "sleep"
  | "activity"
  | "body"
  | "recovery"
  | "respiratory"
  | "metabolic"
  | "workout"
  | "trend"
  | "anomaly"

export interface Insight {
  id: string
  algorithmId: string
  title: string
  description: string
  category: InsightCategory
  severity: InsightSeverity
  value: number | null
  unit: string | null
  referenceRange: { low: number; high: number } | null
  metadata: Record<string, unknown>
}

export interface InsightAlgorithm {
  id: string
  name: string
  description: string
  category: InsightCategory
  requiredMetrics: string[]
}

export interface DayStat {
  date: string
  value: number
}

export interface MetricRecord {
  recordedAt: Date
  value: number | null
  data: Record<string, unknown> | null
}

export interface WorkoutRecord {
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  caloriesKcal: number | null
  distanceMeters: number | null
  data: unknown
}

/** Context passed to each domain algorithm runner */
export interface AlgorithmContext {
  vals: (type: string) => number[]
  recs: (type: string) => MetricRecord[]
  sorted: (v: number[]) => number[]
  dayStats: (type: string) => DayStat[]
  workouts: WorkoutRecord[]
  makeInsight: (
    alg: InsightAlgorithm,
    severity: InsightSeverity,
    description: string,
    value: number | null,
    unit: string | null,
    referenceRange: { low: number; high: number } | null,
    metadata?: Record<string, unknown>,
  ) => Insight
}

/** Function signature for a single algorithm runner */
export type AlgorithmRunner = (alg: InsightAlgorithm, ctx: AlgorithmContext) => Insight | null
