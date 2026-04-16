---
description: "Sleep Score algorithm (0-100): duration + efficiency + stages + restfulness components"
phase: 1
feature: "sleep-score"
depends_on: ["algorithm-registry", "data-type-registry"]
---

# Sleep Score Algorithm — Composite Sleep Quality Score

## Context

The Sleep Score is a composite 0–100 score that evaluates sleep quality across four weighted components. It is one of the foundational scoring algorithms registered in the `AlgorithmRegistry` and feeds into the overall health score as a dependency. The algorithm uses sleep data from the `SLEEP` metric type (which includes stage breakdowns in its structured `data` field) and the `HEART_RATE_VARIABILITY` metric for the restfulness component.

**Existing types** (in `packages/types/src/health.ts`):
- `SleepData` — `{ startTime, endTime, durationMinutes, score?, stages?, awakenings?, breathingAvg?, heartRateAvg? }`
- `HealthScore.sleepScore` — field in the aggregated health score record
- `SleepQualityReport` — detailed sleep analysis report type

**Existing pattern** (in `packages/analytics/src/body-score-engine.ts`):
- Parallel component computation with `Promise.all()`
- Weighted average of nullable components
- `ComponentScore` type: `{ score: number, detail: string }`

## Engineering Rules

- **Implement `ScoringAlgorithm` interface** — register with the `algorithmRegistry`.
- **Four components** — Duration (30%), Efficiency (25%), Stages (25%), Restfulness (20%).
- **Score range** — each component and the composite score are 0–100.
- **Graceful nullability** — if a component cannot be computed (missing data), redistribute its weight proportionally among available components.
- **Lookback** — use 7 days of history for trend analysis and weekly average.
- **No `any`** — all types are explicit.
- **No `console.log`** — use the logger passed via context if logging is needed.
- **Pure function** — the `compute()` method receives all data via `ScoreInput`, no direct DB queries.
- **Testable** — write the algorithm so it can be tested with synthetic `ScoreInput` data.

## What to Build

### 1. Sleep Score Algorithm

```typescript
// packages/analytics/src/sleep-score.ts
import type { ScoringAlgorithm, ScoreInput, ScoreOutput, ComponentScore } from "./types.js"
import { HealthMetricType } from "@biosync-io/types"
import type { SleepData } from "@biosync-io/types"
import { scoreToGrade } from "./utils/grade.js"

export const sleepScoreAlgorithm: ScoringAlgorithm = {
  id: "sleep_score",
  name: "Sleep Score",
  requiredMetrics: [HealthMetricType.SLEEP, HealthMetricType.HEART_RATE_VARIABILITY],
  dependencies: [],
  lookbackDays: 7,

  async compute(input: ScoreInput): Promise<ScoreOutput> {
    const sleepData = extractSleepData(input)
    const hrvData = extractHrvData(input)

    // Compute individual components
    const duration = computeDurationScore(sleepData)
    const efficiency = computeEfficiencyScore(sleepData)
    const stages = computeStagesScore(sleepData)
    const restfulness = computeRestfulnessScore(sleepData, hrvData)

    // Weighted average with proportional redistribution for missing components
    const components = buildComponents(duration, efficiency, stages, restfulness)
    const score = computeWeightedScore(components)
    const grade = scoreToGrade(score)

    // Weekly trend
    const previousScores = computeHistoricalScores(input)
    const deltaFromPrevious = previousScores.length > 0
      ? score - previousScores[previousScores.length - 1]!
      : null
    const weeklyAverage = previousScores.length > 0
      ? Math.round((previousScores.reduce((a, b) => a + b, 0) + score) / (previousScores.length + 1))
      : null

    // Generate insights
    const insights = generateInsights(components, score, sleepData)

    return {
      algorithmId: "sleep_score",
      score,
      grade,
      components: Object.fromEntries(
        Object.entries(components).map(([key, comp]) => [key, comp]),
      ),
      deltaFromPrevious,
      weeklyAverage,
      insights,
      confidence: computeConfidence(sleepData, hrvData),
      date: input.date.toISOString().slice(0, 10),
    }
  },
}
```

### 2. Component: Duration Score (30% weight)

Evaluates whether total sleep duration falls in the optimal range.

```typescript
function computeDurationScore(sleepData: SleepSummary | null): ComponentScore | null {
  if (!sleepData) return null

  const durationHours = sleepData.durationMinutes / 60
  const TARGET_MIN = 7.0  // hours
  const TARGET_MAX = 9.0  // hours
  const OPTIMAL = 8.0     // hours

  let score: number
  if (durationHours >= TARGET_MIN && durationHours <= TARGET_MAX) {
    // Within optimal range: 80–100 based on proximity to 8h
    score = 80 + (1 - Math.abs(durationHours - OPTIMAL) / (TARGET_MAX - OPTIMAL)) * 20
  } else if (durationHours < TARGET_MIN) {
    // Under-sleeping: linear decay to 0 at 4h
    score = Math.max(0, ((durationHours - 4) / (TARGET_MIN - 4)) * 80)
  } else {
    // Over-sleeping: gradual decay after 9h
    score = Math.max(0, 80 - (durationHours - TARGET_MAX) * 15)
  }

  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    weight: 0.30,
    detail: `${durationHours.toFixed(1)}h of sleep (target: ${TARGET_MIN}–${TARGET_MAX}h)`,
  }
}
```

### 3. Component: Efficiency Score (25% weight)

Sleep efficiency = time asleep / time in bed × 100. Optimal is ≥85%.

```typescript
function computeEfficiencyScore(sleepData: SleepSummary | null): ComponentScore | null {
  if (!sleepData || !sleepData.efficiency) return null

  const efficiency = sleepData.efficiency // percentage 0–100

  let score: number
  if (efficiency >= 90) {
    score = 90 + (efficiency - 90) * 1.0 // 90–100 → 90–100
  } else if (efficiency >= 85) {
    score = 70 + (efficiency - 85) * 4.0 // 85–90 → 70–90
  } else if (efficiency >= 75) {
    score = 40 + (efficiency - 75) * 3.0 // 75–85 → 40–70
  } else {
    score = Math.max(0, efficiency * 0.53) // Below 75% → rapid decay
  }

  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    weight: 0.25,
    detail: `${efficiency.toFixed(0)}% sleep efficiency`,
  }
}
```

### 4. Component: Stages Score (25% weight)

Evaluates the distribution of sleep stages. Optimal ratios: Deep 15–20%, REM 20–25%, Light 45–55%, Awake <10%.

```typescript
function computeStagesScore(sleepData: SleepSummary | null): ComponentScore | null {
  if (!sleepData?.stages) return null

  const total = sleepData.stages.deep + sleepData.stages.light + sleepData.stages.rem + sleepData.stages.awake
  if (total === 0) return null

  const deepPct = (sleepData.stages.deep / total) * 100
  const remPct = (sleepData.stages.rem / total) * 100
  const awakePct = (sleepData.stages.awake / total) * 100

  // Score each stage distribution
  const deepScore = scoreRange(deepPct, 15, 20, 5, 30)    // optimal 15–20%
  const remScore = scoreRange(remPct, 20, 25, 10, 35)      // optimal 20–25%
  const awakeScore = awakePct <= 5 ? 100 : Math.max(0, 100 - (awakePct - 5) * 8) // penalize > 5%

  const score = deepScore * 0.40 + remScore * 0.40 + awakeScore * 0.20

  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    weight: 0.25,
    detail: `Deep ${deepPct.toFixed(0)}%, REM ${remPct.toFixed(0)}%, Awake ${awakePct.toFixed(0)}%`,
  }
}

/** Score a value based on an optimal range with linear decay outside the range */
function scoreRange(
  value: number,
  optimalMin: number,
  optimalMax: number,
  absMin: number,
  absMax: number,
): number {
  if (value >= optimalMin && value <= optimalMax) return 100
  if (value < optimalMin) return Math.max(0, ((value - absMin) / (optimalMin - absMin)) * 100)
  return Math.max(0, ((absMax - value) / (absMax - optimalMax)) * 100)
}
```

### 5. Component: Restfulness Score (20% weight)

Evaluates restfulness based on number of awakenings and overnight HRV.

```typescript
function computeRestfulnessScore(
  sleepData: SleepSummary | null,
  hrvData: number | null,
): ComponentScore | null {
  if (!sleepData) return null

  let score = 50 // baseline

  // Awakenings penalty: 0 awakenings = 100, each one reduces score
  if (sleepData.awakenings != null) {
    const awakeningScore = Math.max(0, 100 - sleepData.awakenings * 10)
    score = awakeningScore
  }

  // HRV bonus: higher overnight HRV = better parasympathetic recovery
  if (hrvData != null) {
    // Normalize HRV to 0–100 scale (20ms = low, 80ms = high)
    const hrvScore = Math.min(100, Math.max(0, ((hrvData - 20) / 60) * 100))
    score = score * 0.6 + hrvScore * 0.4
  }

  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    weight: 0.20,
    detail: `${sleepData.awakenings ?? "?"} awakenings${hrvData ? `, HRV ${hrvData.toFixed(0)}ms` : ""}`,
  }
}
```

### 6. Weighted Score Computation with Proportional Redistribution

```typescript
function computeWeightedScore(
  components: Record<string, ComponentScore | null>,
): number {
  const available = Object.values(components).filter(
    (c): c is ComponentScore => c != null,
  )

  if (available.length === 0) return 50 // No data fallback

  const totalWeight = available.reduce((sum, c) => sum + c.weight, 0)

  // Proportional redistribution: normalize weights to sum to 1.0
  const weightedSum = available.reduce(
    (sum, c) => sum + c.score * (c.weight / totalWeight),
    0,
  )

  return Math.round(Math.min(100, Math.max(0, weightedSum)) * 10) / 10
}
```

### 7. Insight Generation

```typescript
function generateInsights(
  components: Record<string, ComponentScore | null>,
  score: number,
  sleepData: SleepSummary | null,
): string[] {
  const insights: string[] = []

  if (score >= 85) insights.push("Excellent sleep quality — well recovered")
  else if (score >= 70) insights.push("Good sleep quality with room for improvement")
  else if (score >= 50) insights.push("Below-average sleep — consider adjusting your routine")
  else insights.push("Poor sleep quality — prioritize rest tonight")

  const duration = components.duration
  if (duration && duration.score < 60) {
    insights.push("Sleep duration is below target — aim for 7–9 hours")
  }

  const stages = components.stages
  if (stages && stages.score < 60) {
    insights.push("Sleep stage distribution is suboptimal — deep sleep or REM may be low")
  }

  const restfulness = components.restfulness
  if (restfulness && restfulness.score < 50) {
    insights.push("High number of awakenings — reduce caffeine and screen time before bed")
  }

  return insights
}
```

### 8. Registration

```typescript
// packages/analytics/src/index.ts (add export)
import { sleepScoreAlgorithm } from "./sleep-score.js"
import { algorithmRegistry } from "./algorithm-registry.js"

algorithmRegistry.register(sleepScoreAlgorithm)
```

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `packages/analytics/src/sleep-score.ts` | Create | Sleep score algorithm implementation |
| `packages/analytics/src/algorithm-registry.ts` | Verify | Ensure `ScoringAlgorithm` interface exists |
| `packages/analytics/src/types.ts` | Verify | Ensure `ScoreInput`, `ScoreOutput`, `ComponentScore` exist |
| `packages/analytics/src/utils/grade.ts` | Verify | `scoreToGrade()` utility available |
| `packages/analytics/src/index.ts` | Edit | Register sleep score + re-export |
| `packages/analytics/src/__tests__/sleep-score.test.ts` | Create | Unit tests with synthetic data |

## Verification Checklist

```bash
# 1. TypeScript compiles
pnpm typecheck

# 2. Biome linting passes
pnpm exec biome ci .

# 3. Tests pass
pnpm --filter @biosync-io/analytics test

# 4. Audit for violations
audit_code packages/analytics/src/sleep-score.ts

# 5. Verify score boundaries:
#    - 8h sleep, 95% efficiency, perfect stages, 0 awakenings → score ≥ 90
#    - 5h sleep, 70% efficiency, no stage data, 8 awakenings → score ≤ 40
#    - No data at all → score = 50 (fallback)

# 6. Verify weight redistribution:
#    - Remove stages component → remaining 3 components scale proportionally

# 7. Verify grade mapping is consistent with scoreToGrade()
```
