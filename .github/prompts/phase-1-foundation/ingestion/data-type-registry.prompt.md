---
description: "18 health metric type definitions with categories, units, ranges, chart types"
phase: 1
feature: "data-type-registry"
depends_on: ["provider-core"]
---

# Data Type Registry — Health Metric Definitions

## Context

VitaSync supports 18+ distinct health metric types from multiple wearable providers. Each metric type has a canonical unit, valid physiological range, time resolution, display preferences, and chart type. The `DataTypeRegistry` is a singleton lookup that the normalization pipeline, analytics engines, and frontend all reference to ensure consistent handling of every metric type.

**Existing enums** (in `packages/types/src/health.ts`):
- `HealthMetricType` — string enum with all metric IDs (`steps`, `heart_rate`, `sleep`, etc.)
- `MetricUnit` — string enum with all unit identifiers (`bpm`, `steps`, `kcal`, `kg`, etc.)

## Engineering Rules

- **Immutable registry** — defined at module load time with `as const` / `Object.freeze`; never mutated at runtime.
- **Single source of truth** — all code that needs to know "what unit does heart_rate use?" queries this registry.
- **Type-safe** — registry entries are typed with `MetricTypeDefinition` interface; keyed by `HealthMetricType`.
- **No `any`** — every field is explicitly typed.
- **Extensible** — adding a new metric type = adding one entry to the registry + one value to `HealthMetricType`.

## What to Build

### 1. `MetricTypeDefinition` Interface

```typescript
// packages/types/src/health.ts (extend existing file)
export interface MetricTypeDefinition {
  /** Matches a HealthMetricType value */
  id: HealthMetricType
  /** Human-readable label */
  label: string
  /** Category grouping for UI */
  category: "activity" | "heart" | "sleep" | "body" | "stress" | "respiratory" | "workout"
  /** Canonical storage unit — all values normalized to this */
  canonicalUnit: MetricUnit
  /** Units the value can be displayed in (user preference) */
  displayUnits: MetricUnit[]
  /** Physiological validity range (values outside are rejected) */
  validRange: { min: number; max: number } | null
  /** Time resolution for storage alignment */
  resolution: "instant" | "1min" | "5min" | "15min" | "hourly" | "daily"
  /** Whether this metric has structured data (sleep stages, workout laps) */
  isComplex: boolean
  /** Preferred chart type for frontend rendering */
  chartType: "line" | "bar" | "area" | "scatter" | "gauge" | "heatmap"
  /** Short description for tooltips */
  description: string
}
```

### 2. Registry with All 18+ Metric Types

```typescript
// packages/providers/core/src/data-type-registry.ts
import { HealthMetricType, MetricUnit } from "@biosync-io/types"
import type { MetricTypeDefinition } from "@biosync-io/types"

const METRIC_DEFINITIONS: readonly MetricTypeDefinition[] = [
  // ── Activity ─────────────────────────────────────────────
  {
    id: HealthMetricType.STEPS,
    label: "Steps",
    category: "activity",
    canonicalUnit: MetricUnit.STEPS,
    displayUnits: [MetricUnit.STEPS],
    validRange: { min: 0, max: 100_000 },
    resolution: "daily",
    isComplex: false,
    chartType: "bar",
    description: "Total steps walked or run",
  },
  {
    id: HealthMetricType.DISTANCE,
    label: "Distance",
    category: "activity",
    canonicalUnit: MetricUnit.METERS,
    displayUnits: [MetricUnit.METERS, MetricUnit.KILOMETERS, MetricUnit.MILES],
    validRange: { min: 0, max: 200_000 },
    resolution: "daily",
    isComplex: false,
    chartType: "bar",
    description: "Total distance covered",
  },
  {
    id: HealthMetricType.CALORIES,
    label: "Calories Burned",
    category: "activity",
    canonicalUnit: MetricUnit.KILOCALORIES,
    displayUnits: [MetricUnit.KILOCALORIES, MetricUnit.KILOJOULES],
    validRange: { min: 0, max: 15_000 },
    resolution: "daily",
    isComplex: false,
    chartType: "bar",
    description: "Total active calories burned",
  },
  {
    id: HealthMetricType.ACTIVE_MINUTES,
    label: "Active Minutes",
    category: "activity",
    canonicalUnit: MetricUnit.MINUTES,
    displayUnits: [MetricUnit.MINUTES, MetricUnit.HOURS],
    validRange: { min: 0, max: 1440 },
    resolution: "daily",
    isComplex: false,
    chartType: "bar",
    description: "Minutes of moderate-to-vigorous activity",
  },
  {
    id: HealthMetricType.FLOORS,
    label: "Floors Climbed",
    category: "activity",
    canonicalUnit: MetricUnit.FLOORS,
    displayUnits: [MetricUnit.FLOORS],
    validRange: { min: 0, max: 500 },
    resolution: "daily",
    isComplex: false,
    chartType: "bar",
    description: "Number of floors climbed",
  },

  // ── Heart ────────────────────────────────────────────────
  {
    id: HealthMetricType.HEART_RATE,
    label: "Heart Rate",
    category: "heart",
    canonicalUnit: MetricUnit.BPM,
    displayUnits: [MetricUnit.BPM],
    validRange: { min: 20, max: 250 },
    resolution: "1min",
    isComplex: false,
    chartType: "line",
    description: "Instantaneous heart rate",
  },
  {
    id: HealthMetricType.RESTING_HEART_RATE,
    label: "Resting Heart Rate",
    category: "heart",
    canonicalUnit: MetricUnit.BPM,
    displayUnits: [MetricUnit.BPM],
    validRange: { min: 25, max: 120 },
    resolution: "daily",
    isComplex: false,
    chartType: "line",
    description: "Lowest sustained heart rate during rest",
  },
  {
    id: HealthMetricType.HEART_RATE_VARIABILITY,
    label: "Heart Rate Variability",
    category: "heart",
    canonicalUnit: MetricUnit.MILLISECONDS,
    displayUnits: [MetricUnit.MILLISECONDS],
    validRange: { min: 1, max: 300 },
    resolution: "daily",
    isComplex: false,
    chartType: "line",
    description: "RMSSD-based heart rate variability",
  },

  // ── Sleep ────────────────────────────────────────────────
  {
    id: HealthMetricType.SLEEP,
    label: "Sleep",
    category: "sleep",
    canonicalUnit: MetricUnit.MINUTES,
    displayUnits: [MetricUnit.MINUTES, MetricUnit.HOURS],
    validRange: { min: 0, max: 1440 },
    resolution: "daily",
    isComplex: true,
    chartType: "bar",
    description: "Sleep session with stages and quality metrics",
  },
  {
    id: HealthMetricType.SLEEP_SCORE,
    label: "Sleep Score",
    category: "sleep",
    canonicalUnit: MetricUnit.SCORE,
    displayUnits: [MetricUnit.SCORE],
    validRange: { min: 0, max: 100 },
    resolution: "daily",
    isComplex: false,
    chartType: "line",
    description: "Composite sleep quality score (0–100)",
  },

  // ── Body ─────────────────────────────────────────────────
  {
    id: HealthMetricType.WEIGHT,
    label: "Weight",
    category: "body",
    canonicalUnit: MetricUnit.KILOGRAMS,
    displayUnits: [MetricUnit.KILOGRAMS, MetricUnit.POUNDS],
    validRange: { min: 20, max: 300 },
    resolution: "daily",
    isComplex: false,
    chartType: "line",
    description: "Body weight measurement",
  },
  {
    id: HealthMetricType.BODY_FAT,
    label: "Body Fat",
    category: "body",
    canonicalUnit: MetricUnit.PERCENT,
    displayUnits: [MetricUnit.PERCENT],
    validRange: { min: 2, max: 60 },
    resolution: "daily",
    isComplex: false,
    chartType: "line",
    description: "Body fat percentage",
  },
  {
    id: HealthMetricType.BMI,
    label: "BMI",
    category: "body",
    canonicalUnit: MetricUnit.SCORE,
    displayUnits: [MetricUnit.SCORE],
    validRange: { min: 10, max: 60 },
    resolution: "daily",
    isComplex: false,
    chartType: "line",
    description: "Body Mass Index",
  },
  {
    id: HealthMetricType.BLOOD_OXYGEN,
    label: "Blood Oxygen (SpO2)",
    category: "body",
    canonicalUnit: MetricUnit.PERCENT,
    displayUnits: [MetricUnit.PERCENT],
    validRange: { min: 70, max: 100 },
    resolution: "daily",
    isComplex: false,
    chartType: "line",
    description: "Peripheral blood oxygen saturation",
  },
  {
    id: HealthMetricType.TEMPERATURE,
    label: "Body Temperature",
    category: "body",
    canonicalUnit: MetricUnit.CELSIUS,
    displayUnits: [MetricUnit.CELSIUS, MetricUnit.FAHRENHEIT],
    validRange: { min: 34, max: 42 },
    resolution: "daily",
    isComplex: false,
    chartType: "line",
    description: "Skin or core body temperature",
  },

  // ── Stress & Recovery ────────────────────────────────────
  {
    id: HealthMetricType.STRESS,
    label: "Stress Level",
    category: "stress",
    canonicalUnit: MetricUnit.SCORE,
    displayUnits: [MetricUnit.SCORE],
    validRange: { min: 0, max: 100 },
    resolution: "15min",
    isComplex: false,
    chartType: "area",
    description: "Stress level score derived from HRV analysis",
  },

  // ── Respiratory ──────────────────────────────────────────
  {
    id: HealthMetricType.RESPIRATORY_RATE,
    label: "Respiratory Rate",
    category: "respiratory",
    canonicalUnit: MetricUnit.BREATHS_PER_MINUTE,
    displayUnits: [MetricUnit.BREATHS_PER_MINUTE],
    validRange: { min: 4, max: 60 },
    resolution: "daily",
    isComplex: false,
    chartType: "line",
    description: "Average breaths per minute during sleep",
  },
  {
    id: HealthMetricType.SPO2,
    label: "SpO2",
    category: "respiratory",
    canonicalUnit: MetricUnit.PERCENT,
    displayUnits: [MetricUnit.PERCENT],
    validRange: { min: 70, max: 100 },
    resolution: "daily",
    isComplex: false,
    chartType: "line",
    description: "Blood oxygen saturation from pulse oximeter",
  },

  // ── Workouts ─────────────────────────────────────────────
  {
    id: HealthMetricType.WORKOUT,
    label: "Workout",
    category: "workout",
    canonicalUnit: MetricUnit.SECONDS,
    displayUnits: [MetricUnit.SECONDS, MetricUnit.MINUTES, MetricUnit.HOURS],
    validRange: null,
    resolution: "instant",
    isComplex: true,
    chartType: "bar",
    description: "Structured workout session with laps, splits, and zones",
  },
] as const
```

### 3. Registry Class

```typescript
class DataTypeRegistry {
  private readonly map: ReadonlyMap<HealthMetricType, MetricTypeDefinition>

  constructor(definitions: readonly MetricTypeDefinition[]) {
    this.map = new Map(definitions.map((d) => [d.id, d]))
  }

  get(metricType: HealthMetricType): MetricTypeDefinition | undefined
  getOrThrow(metricType: HealthMetricType): MetricTypeDefinition
  listAll(): MetricTypeDefinition[]
  listByCategory(category: MetricTypeDefinition["category"]): MetricTypeDefinition[]
  isValid(metricType: string): metricType is HealthMetricType
}

export const dataTypeRegistry = new DataTypeRegistry(METRIC_DEFINITIONS)
```

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `packages/providers/core/src/data-type-registry.ts` | Create | `DataTypeRegistry` class + all metric definitions |
| `packages/types/src/health.ts` | Edit | Add `MetricTypeDefinition` interface |
| `packages/providers/core/src/index.ts` | Edit | Re-export `dataTypeRegistry` |

## Verification Checklist

```bash
# 1. TypeScript compiles
pnpm typecheck

# 2. Biome linting passes
pnpm exec biome ci .

# 3. Tests — verify every HealthMetricType has a registry entry
pnpm --filter @biosync-io/provider-core test

# 4. Audit for violations
audit_code packages/providers/core/src/data-type-registry.ts

# 5. Verify all HealthMetricType enum values have a matching definition
# Write a test: Object.values(HealthMetricType).forEach(type => expect(registry.get(type)).toBeDefined())

# 6. Verify valid range boundaries are physiologically reasonable
```
