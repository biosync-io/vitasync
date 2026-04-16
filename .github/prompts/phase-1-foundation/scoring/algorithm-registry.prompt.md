---
description: "ScoringAlgorithm interface, AlgorithmRegistry, ScoreInput/ScoreOutput types, and dependency graph"
phase: 1
feature: "algorithm-registry"
depends_on: ["provider-core", "data-type-registry"]
---

# Algorithm Registry — Scoring Engine Framework

## Context

VitaSync computes multiple health scores (sleep, activity, cardio, recovery, body, overall) from normalized health metrics. Each score is produced by a **scoring algorithm** — a pure computation function that takes a set of health metrics as input and returns a score with component breakdown. The `AlgorithmRegistry` manages all scoring algorithms, resolves their dependency graph, and orchestrates computation in the correct order.

**Existing analytics engines** (in `packages/analytics/src/`):
- `body-score-engine.ts` — `computeBodyScore()` returning `BodyScoreResult` with `ComponentScore` breakdown
- `readiness-engine.ts` — `computeReadiness()` returning `ReadinessResult`
- `strain-engine.ts` — `computeTrainingLoad()` returning `TrainingLoadResult`
- `recovery-prediction.ts` — `predictRecovery()` returning `RecoveryPrediction`
- `stress-resilience.ts` — `computeStressResilience()` returning `StressResilienceIndex`

The algorithm registry standardizes these into a common interface so new scores can be added by registering a single algorithm.

## Engineering Rules

- **Pure computations** — scoring algorithms are pure functions; they query the DB for input data but have no other side effects.
- **Typed I/O** — `ScoreInput` and `ScoreOutput` are strict interfaces; no `any`.
- **Dependency graph** — some scores depend on others (e.g., `overall` depends on `sleep`, `activity`, `cardio`, `recovery`, `body`). The registry resolves dependencies via topological sort.
- **Component breakdown** — every score output includes a `components` map showing how sub-scores contribute to the final score.
- **Score range** — all scores are 0–100 unless explicitly specified otherwise.
- **Grade mapping** — scores map to letter grades: A+ (95–100), A (90–94), B+ (85–89), B (80–84), C+ (75–79), C (70–74), D (60–69), F (0–59).
- **No `console.log`** — use Pino logger passed via context.
- **Testable** — algorithms accept their input data as arguments, not by querying the DB internally (DB queries happen in the orchestrator).

## What to Build

### 1. Core Types

```typescript
// packages/types/src/health.ts (extend existing) or packages/analytics/src/types.ts

/** Input context for a scoring algorithm */
export interface ScoreInput {
  userId: string
  date: Date
  /** Metric data keyed by HealthMetricType → array of recent values */
  metrics: Record<string, MetricDataWindow>
  /** Previously computed scores (for algorithms that depend on other scores) */
  dependencyScores: Record<string, ScoreOutput>
}

/** A window of metric data for a single type */
export interface MetricDataWindow {
  /** Values from the target date */
  current: number[]
  /** Values from the past N days (for trend analysis) */
  history: { date: string; value: number }[]
  /** Computed statistics */
  stats: {
    mean: number
    stddev: number
    min: number
    max: number
    median: number
    count: number
  }
}

/** Output of a scoring algorithm */
export interface ScoreOutput {
  /** Algorithm ID that produced this score */
  algorithmId: string
  /** Final composite score (0–100) */
  score: number
  /** Letter grade */
  grade: string
  /** Component breakdown */
  components: Record<string, ComponentScore>
  /** Delta from previous day's score */
  deltaFromPrevious: number | null
  /** 7-day rolling average */
  weeklyAverage: number | null
  /** Human-readable insights */
  insights: string[]
  /** Confidence level (0–1) based on data completeness */
  confidence: number
  /** Date this score applies to */
  date: string
}

export interface ComponentScore {
  /** Component score (0–100) */
  score: number
  /** Weight in the composite (0–1, all weights sum to 1) */
  weight: number
  /** Human-readable detail */
  detail: string
}
```

### 2. ScoringAlgorithm Interface

```typescript
// packages/analytics/src/algorithm-registry.ts

export interface ScoringAlgorithm {
  /** Unique algorithm identifier (e.g., "sleep_score", "activity_score") */
  id: string
  /** Human-readable name */
  name: string
  /** Which HealthMetricTypes this algorithm needs as input */
  requiredMetrics: HealthMetricType[]
  /** IDs of other algorithms that must run first */
  dependencies: string[]
  /** How many days of history this algorithm needs */
  lookbackDays: number
  /** Compute the score from the given input */
  compute(input: ScoreInput): Promise<ScoreOutput>
}
```

### 3. Algorithm Registry

```typescript
class AlgorithmRegistry {
  private readonly algorithms = new Map<string, ScoringAlgorithm>()

  /** Register a scoring algorithm */
  register(algorithm: ScoringAlgorithm): void {
    if (this.algorithms.has(algorithm.id)) {
      throw new Error(`Algorithm "${algorithm.id}" is already registered`)
    }
    this.algorithms.set(algorithm.id, algorithm)
  }

  /** Get a single algorithm by ID */
  get(id: string): ScoringAlgorithm | undefined

  /** List all registered algorithms */
  listAll(): ScoringAlgorithm[]

  /**
   * Return algorithms in dependency-resolved execution order.
   * Uses topological sort — throws on circular dependencies.
   */
  getExecutionOrder(): ScoringAlgorithm[]

  /**
   * Compute all scores for a user on a given date.
   * Fetches required metrics, runs algorithms in dependency order,
   * and returns all score outputs.
   */
  async computeAll(userId: string, date: Date): Promise<Record<string, ScoreOutput>>
}

export const algorithmRegistry = new AlgorithmRegistry()
```

### 4. Topological Sort for Dependency Resolution

```typescript
function topologicalSort(algorithms: Map<string, ScoringAlgorithm>): ScoringAlgorithm[] {
  const sorted: ScoringAlgorithm[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>() // cycle detection

  function visit(id: string) {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`Circular dependency detected: ${id}`)

    visiting.add(id)
    const algo = algorithms.get(id)
    if (!algo) throw new Error(`Unknown algorithm dependency: ${id}`)

    for (const dep of algo.dependencies) {
      visit(dep)
    }

    visiting.delete(id)
    visited.add(id)
    sorted.push(algo)
  }

  for (const id of algorithms.keys()) {
    visit(id)
  }

  return sorted
}
```

### 5. Grade Mapping Utility

```typescript
export function scoreToGrade(score: number): string {
  if (score >= 95) return "A+"
  if (score >= 90) return "A"
  if (score >= 85) return "B+"
  if (score >= 80) return "B"
  if (score >= 75) return "C+"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  return "F"
}
```

### 6. Score Computation Orchestrator

The `computeAll()` method:
1. Gets execution order via topological sort.
2. For each algorithm, queries the DB for required metric data (past `lookbackDays` days).
3. Builds `ScoreInput` with `metrics` and `dependencyScores` from previously computed algorithms.
4. Calls `algorithm.compute(input)`.
5. Stores the result in `health_scores` table.

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `packages/analytics/src/algorithm-registry.ts` | Create | `AlgorithmRegistry` class, `ScoringAlgorithm` interface |
| `packages/analytics/src/types.ts` | Create | `ScoreInput`, `ScoreOutput`, `MetricDataWindow`, `ComponentScore` |
| `packages/analytics/src/utils/grade.ts` | Create | `scoreToGrade()` utility |
| `packages/analytics/src/utils/topological-sort.ts` | Create | Dependency resolution |
| `packages/analytics/src/index.ts` | Edit | Re-export registry and types |
| `packages/types/src/health.ts` | Verify | Ensure `HealthScore` interface is compatible |

## Verification Checklist

```bash
# 1. TypeScript compiles
pnpm typecheck

# 2. Biome linting passes
pnpm exec biome ci .

# 3. Tests pass
pnpm --filter @biosync-io/analytics test

# 4. Audit for violations
audit_code packages/analytics/src/algorithm-registry.ts
audit_code packages/analytics/src/utils/

# 5. Verify topological sort handles:
#    - Linear dependencies (A → B → C)
#    - Diamond dependencies (A → B, A → C, B → D, C → D)
#    - Circular dependencies (throws error)

# 6. Verify grade mapping covers all ranges 0–100

# 7. Verify all existing analytics engines can be adapted to ScoringAlgorithm interface
```
