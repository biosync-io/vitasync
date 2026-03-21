import type {
  Insight,
  InsightAlgorithm,
  InsightSeverity,
  AlgorithmContext,
  AlgorithmRunner,
  MetricRecord,
  WorkoutRecord,
} from "./types.js"
import { cardioRunners } from "./domains/cardio.js"
import { sleepRunners } from "./domains/sleep.js"
import { activityRunners } from "./domains/activity.js"
import { bodyRunners } from "./domains/body.js"
import { recoveryRunners } from "./domains/recovery.js"
import { respiratoryRunners } from "./domains/respiratory.js"
import { metabolicRunners } from "./domains/metabolic.js"
import { workoutRunners } from "./domains/workout.js"
import { compositeRunners } from "./domains/composite.js"
import { longevityRunners } from "./domains/longevity.js"
import { immuneRunners } from "./domains/immune.js"
import { cognitiveRunners } from "./domains/cognitive.js"
import { hormonalRunners } from "./domains/hormonal.js"
import { womensHealthRunners } from "./domains/womens-health.js"
import { performanceRunners } from "./domains/performance.js"

// ── Algorithm Registry ──────────────────────────────────────────

const registry: ReadonlyMap<string, AlgorithmRunner> = new Map<string, AlgorithmRunner>(
  Object.entries({
    ...cardioRunners,
    ...sleepRunners,
    ...activityRunners,
    ...bodyRunners,
    ...recoveryRunners,
    ...respiratoryRunners,
    ...metabolicRunners,
    ...workoutRunners,
    ...compositeRunners,
    ...longevityRunners,
    ...immuneRunners,
    ...cognitiveRunners,
    ...hormonalRunners,
    ...womensHealthRunners,
    ...performanceRunners,
  }),
)

// ── Context Factory ─────────────────────────────────────────────

function makeInsight(
  alg: InsightAlgorithm,
  severity: InsightSeverity,
  description: string,
  value: number | null,
  unit: string | null,
  referenceRange: { low: number; high: number } | null,
  metadata: Record<string, unknown> = {},
): Insight {
  return {
    id: `insight-${alg.id}-${Date.now()}`,
    algorithmId: alg.id,
    title: alg.name,
    description,
    category: alg.category,
    severity,
    value,
    unit,
    referenceRange,
    metadata,
  }
}

export function createContext(
  byType: Map<string, MetricRecord[]>,
  workouts: WorkoutRecord[],
): AlgorithmContext {
  return {
    vals: (type) =>
      (byType.get(type) ?? [])
        .filter((r) => r.value != null)
        .map((r) => r.value!),
    recs: (type) => byType.get(type) ?? [],
    sorted: (v) => [...v].sort((a, b) => a - b),
    dayStats: (type) =>
      (byType.get(type) ?? [])
        .filter((r) => r.value != null)
        .map((r) => ({
          date: r.recordedAt.toISOString().slice(0, 10),
          value: r.value!,
        })),
    workouts,
    makeInsight,
  }
}

// ── Runner ──────────────────────────────────────────────────────

export function runAlgorithm(
  alg: InsightAlgorithm,
  ctx: AlgorithmContext,
): Insight | null {
  const runner = registry.get(alg.id)
  if (!runner) return null
  return runner(alg, ctx)
}
