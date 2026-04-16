---
description: "6-step normalization pipeline: Schema Mapping → Unit Conversion → Time Normalization → Resolution Alignment → Validation → Enrichment"
phase: 1
feature: "normalization-pipeline"
depends_on: ["provider-core", "data-type-registry"]
---

# Normalization Pipeline — Raw to Canonical Health Records

## Context

Every wearable provider returns data in a different format, unit system, and time resolution. VitaSync's normalization pipeline transforms raw `SyncDataPoint` items (yielded by provider adapters) into `CanonicalHealthRecord` entries suitable for storage, analytics, and cross-provider comparison. The pipeline runs inside the sync worker as data streams in from the provider's `syncData()` generator.

**Input:** `SyncDataPoint` (from `@biosync-io/types`) — provider-normalized but still raw.
**Output:** `CanonicalHealthRecord` — fully normalized, validated, enriched record ready for DB insert.

The pipeline is a composable chain of pure transform functions, making each step independently testable.

## Engineering Rules

- **Pure functions** — each pipeline step is a pure function: `(input) => output | null` (null = skip record).
- **No side effects** — pipeline steps never touch the database, network, or file system.
- **Type-safe** — input and output types are fully typed; no `any`.
- **Configurable** — unit conversion targets, time zones, and resolution settings come from the `DataTypeRegistry`.
- **Error isolation** — a single malformed record does not halt the pipeline. Log and skip.
- **Batch-friendly** — the pipeline processes records one at a time via a transform function but is called in a streaming loop.
- **Drizzle ORM** — the final insert uses Drizzle, not raw SQL.

## What to Build

### 1. `CanonicalHealthRecord` Type

```typescript
// packages/types/src/health.ts (extend existing file)
export interface CanonicalHealthRecord {
  /** Composite dedup key: `${connectionId}:${metricType}:${recordedAt.toISOString()}` */
  deduplicationKey: string
  connectionId: string
  userId: string
  providerId: string
  metricType: HealthMetricType
  /** Always in the canonical unit for this metric type */
  value: number | null
  /** Structured data for complex metrics (sleep stages, workout details) */
  data: Record<string, unknown> | null
  /** Always the canonical unit from DataTypeRegistry */
  unit: MetricUnit
  /** Always UTC */
  recordedAt: Date
  /** ISO date string "YYYY-MM-DD" for partition/aggregation */
  recordedDate: string
  /** Device or sub-source */
  source: string | null
  /** Timezone the record was originally captured in */
  originalTimezone: string | null
}
```

### 2. Pipeline Steps

#### Step 1: Schema Mapping

Maps vendor-specific field names/shapes to the VitaSync canonical shape. Handled by the provider's `syncData()` generator which already yields `SyncDataPoint`. This step verifies the shape matches expectations.

```typescript
// packages/providers/core/src/pipeline/schema-mapper.ts
export function mapToCanonical(
  point: SyncDataPoint,
  context: { connectionId: string; userId: string },
): Partial<CanonicalHealthRecord> {
  return {
    connectionId: context.connectionId,
    userId: context.userId,
    providerId: point.providerId,
    metricType: point.metricType,
    value: point.value ?? null,
    data: point.data ?? null,
    unit: point.unit ?? MetricUnit.COUNT,
    recordedAt: point.recordedAt,
    source: point.source ?? null,
  }
}
```

#### Step 2: Unit Conversion

Converts the metric value from the provider's unit to the canonical unit defined by the `DataTypeRegistry`.

```typescript
// packages/providers/core/src/pipeline/unit-converter.ts
export function convertUnit(
  record: Partial<CanonicalHealthRecord>,
  registry: DataTypeRegistry,
): Partial<CanonicalHealthRecord> {
  const typeDef = registry.get(record.metricType!)
  if (!typeDef || record.value == null) return record

  const canonicalUnit = typeDef.canonicalUnit
  if (record.unit === canonicalUnit) return record

  const converted = convertValue(record.value, record.unit!, canonicalUnit)
  return { ...record, value: converted, unit: canonicalUnit }
}

// Conversion functions: miles→km, lbs→kg, °F→°C, mg/dL→mmol/L, etc.
```

#### Step 3: Time Normalization

Ensures all timestamps are in UTC and extracts the `recordedDate` partition key.

```typescript
// packages/providers/core/src/pipeline/time-normalizer.ts
export function normalizeTime(
  record: Partial<CanonicalHealthRecord>,
  timezone?: string,
): Partial<CanonicalHealthRecord> {
  const recordedAt = record.recordedAt instanceof Date
    ? record.recordedAt
    : new Date(record.recordedAt as string)

  return {
    ...record,
    recordedAt: recordedAt,
    recordedDate: recordedAt.toISOString().slice(0, 10),
    originalTimezone: timezone ?? null,
  }
}
```

#### Step 4: Resolution Alignment

Aligns data points to standard time resolutions (1-minute, 5-minute, hourly, daily) based on the metric type definition. Prevents storing multiple readings at sub-second granularity.

```typescript
// packages/providers/core/src/pipeline/resolution-aligner.ts
export function alignResolution(
  record: Partial<CanonicalHealthRecord>,
  registry: DataTypeRegistry,
): Partial<CanonicalHealthRecord> {
  const typeDef = registry.get(record.metricType!)
  if (!typeDef) return record

  const aligned = alignTimestamp(record.recordedAt!, typeDef.resolution)
  return { ...record, recordedAt: aligned }
}
```

#### Step 5: Validation

Validates the record against the metric type's expected ranges and data shape.

```typescript
// packages/providers/core/src/pipeline/validator.ts
export function validateRecord(
  record: Partial<CanonicalHealthRecord>,
  registry: DataTypeRegistry,
): CanonicalHealthRecord | null {
  const typeDef = registry.get(record.metricType!)
  if (!typeDef) return null

  // Range check
  if (record.value != null) {
    if (typeDef.validRange && (record.value < typeDef.validRange.min || record.value > typeDef.validRange.max)) {
      return null // Out of physiological range — skip
    }
  }

  // Generate dedup key
  const deduplicationKey = `${record.connectionId}:${record.metricType}:${record.recordedAt!.toISOString()}`

  return { ...record, deduplicationKey } as CanonicalHealthRecord
}
```

#### Step 6: Enrichment

Adds computed fields — e.g., day-of-week, time-of-day bucket, derived flags.

```typescript
// packages/providers/core/src/pipeline/enricher.ts
export function enrichRecord(
  record: CanonicalHealthRecord,
): CanonicalHealthRecord {
  // Add any computed metadata
  return record
}
```

### 3. Pipeline Orchestrator

Composes all steps into a single transform function.

```typescript
// packages/providers/core/src/pipeline/index.ts
export function createNormalizationPipeline(
  registry: DataTypeRegistry,
  context: { connectionId: string; userId: string },
  timezone?: string,
) {
  return function normalize(point: SyncDataPoint): CanonicalHealthRecord | null {
    try {
      let record = mapToCanonical(point, context)
      record = convertUnit(record, registry)
      record = normalizeTime(record, timezone)
      record = alignResolution(record, registry)
      const validated = validateRecord(record, registry)
      if (!validated) return null
      return enrichRecord(validated)
    } catch {
      return null // Log at caller level
    }
  }
}
```

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `packages/providers/core/src/pipeline/schema-mapper.ts` | Create | Step 1: Map vendor shape → canonical |
| `packages/providers/core/src/pipeline/unit-converter.ts` | Create | Step 2: Convert to canonical units |
| `packages/providers/core/src/pipeline/time-normalizer.ts` | Create | Step 3: UTC normalization + date key |
| `packages/providers/core/src/pipeline/resolution-aligner.ts` | Create | Step 4: Align to standard resolutions |
| `packages/providers/core/src/pipeline/validator.ts` | Create | Step 5: Range validation + dedup key |
| `packages/providers/core/src/pipeline/enricher.ts` | Create | Step 6: Add computed fields |
| `packages/providers/core/src/pipeline/index.ts` | Create | Pipeline orchestrator |
| `packages/providers/core/src/pipeline/conversions.ts` | Create | Unit conversion lookup tables |
| `packages/types/src/health.ts` | Edit | Add `CanonicalHealthRecord` interface |

## Verification Checklist

```bash
# 1. TypeScript compiles
pnpm typecheck

# 2. Biome linting passes
pnpm exec biome ci .

# 3. Tests — unit tests for each pipeline step
pnpm --filter @biosync-io/provider-core test

# 4. Audit for violations
audit_code packages/providers/core/src/pipeline/

# 5. Verify round-trip: raw SyncDataPoint → CanonicalHealthRecord
# Write a test that passes a known SyncDataPoint through the pipeline
# and asserts the output matches expected canonical form

# 6. Verify out-of-range values are rejected (e.g., HR = -5, steps = 999999999)
```
