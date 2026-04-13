---
description: "Phase 7 — Testing: fill coverage gaps in workers, packages, and integration tests"
---

# Phase 7: Testing & Coverage

**Branch:** `refactor/codebase-hardening`
**Depends on:** All previous phases

**Read these ENGINEERING_GUIDELINES.md sections before starting:**
- §10 (Testing Strategy)

## Problem

- 45 API route tests exist but worker processors have 0 dedicated tests
- Package tests are minimal (circuit-breaker, saga, cqrs, event-bus — 1 each)
- No integration tests that exercise the full request → service → DB flow
- Analytics package (10 engines) has no tests

## Current State

```bash
# Count test files per area
echo "API tests:"; find apps/api/src/__tests__ -name "*.test.ts" | wc -l
echo "Worker tests:"; find apps/worker -name "*.test.ts" 2>/dev/null | wc -l
echo "Web tests:"; find apps/web -name "*.test.ts" -o -name "*.test.tsx" 2>/dev/null | wc -l
echo "Package tests:"; find packages -name "*.test.ts" | wc -l

# Check coverage config
grep -rn "coverage" apps/api/vitest.config.ts apps/worker/vitest.config.ts 2>/dev/null
```

## What to Build

### 1. Worker Processor Tests

Create tests for each of the 6 processors:

```typescript
// apps/worker/src/__tests__/sync.processor.test.ts
import { describe, it, expect, vi } from "vitest"
import { processSyncJob } from "../processors/sync.processor"

describe("processSyncJob", () => {
  it("syncs data for valid connection", async () => {
    const job = createMockJob({
      connectionId: "test-conn",
      providerId: "fitbit",
    })

    const result = await processSyncJob(job)

    expect(result).toBeDefined()
    expect(job.updateProgress).toHaveBeenCalledWith(100)
  })

  it("throws on unknown provider", async () => {
    const job = createMockJob({ providerId: "unknown" })
    await expect(processSyncJob(job)).rejects.toThrow()
  })

  it("handles token refresh on expired token", async () => {
    // Mock provider to throw TOKEN_EXPIRED, then succeed on retry
  })

  it("classifies rate limit errors as retryable", async () => {
    // Mock provider to throw PROVIDER_RATE_LIMITED
    // Verify the error propagates (BullMQ will retry)
  })
})
```

Tests needed for:
- `sync.processor.ts` — happy path, token refresh, rate limit, provider error
- `webhook.processor.ts` — delivery, retry, signature verification
- `notification.processor.ts` — email, push, in-app delivery
- `report.processor.ts` — generation, output format
- `retention.processor.ts` — policy enforcement, data deletion
- `analytics.processor.ts` — computation, aggregation

### 2. Analytics Package Tests

```bash
# List analytics engines
ls packages/analytics/src/
```

Create tests for each analytics engine:

```typescript
// packages/analytics/src/__tests__/anomaly-detector.test.ts
import { describe, it, expect } from "vitest"
import { AnomalyDetector } from "../anomaly-detector"

describe("AnomalyDetector", () => {
  it("detects spike anomaly in heart rate data", () => {
    const data = [72, 74, 71, 73, 150, 72, 74] // 150 is anomaly
    const result = detector.analyze(data)
    expect(result.anomalies).toHaveLength(1)
    expect(result.anomalies[0].index).toBe(4)
  })

  it("returns no anomalies for normal data", () => {
    const data = [72, 74, 71, 73, 70, 72, 74]
    const result = detector.analyze(data)
    expect(result.anomalies).toHaveLength(0)
  })
})
```

### 3. Integration Tests

Create integration tests that exercise the full stack:

```typescript
// apps/api/src/__tests__/integration/sync-flow.test.ts
import { describe, it, expect } from "vitest"
import { buildTestApp } from "../helpers"

describe("Provider Sync Flow (integration)", () => {
  it("creates connection → triggers sync → stores data", async () => {
    const app = await buildTestApp()

    // 1. Create connection
    const connRes = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${testToken}` },
      payload: { providerId: "test-provider" },
    })
    expect(connRes.statusCode).toBe(201)

    // 2. Trigger sync
    const syncRes = await app.inject({
      method: "POST",
      url: `/v1/sync-jobs`,
      headers: { authorization: `Bearer ${testToken}` },
      payload: { connectionId: connRes.json().data.id },
    })
    expect(syncRes.statusCode).toBe(201)

    // 3. Verify data was stored (after sync completes)
    // ...
  })
})
```

### 4. Expand Package Tests

Add edge case tests to existing packages:

```bash
# Current package test files
find packages -name "*.test.ts" -exec echo {} \;
```

For each package, add tests for:
- Error conditions and edge cases
- Concurrent operations (race conditions)
- Configuration validation

## Verification

```bash
# Run all tests with coverage
pnpm test -- --coverage

# Check coverage output
cat apps/api/coverage/lcov.info | head -5

# Ensure no test failures
pnpm test
```

## Acceptance Criteria

- [ ] Every worker processor has dedicated tests (6 test files)
- [ ] Analytics engines have tests (at least top 5)
- [ ] At least 2 integration tests for critical flows
- [ ] Package test coverage improved (edge cases, error conditions)
- [ ] All tests pass (new + existing)
- [ ] No test uses `any` type or skips assertions
