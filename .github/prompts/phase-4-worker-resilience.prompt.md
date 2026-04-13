---
description: "Phase 4 — Worker resilience: standardize processors, improve sagas, DLQ, circuit breaker tuning"
---

# Phase 4: Worker & Queue Resilience

**Branch:** `refactor/codebase-hardening`
**Depends on:** Phase 0 (AppError), Phase 1 (Services)

**Read these ENGINEERING_GUIDELINES.md sections before starting:**
- §7 (Worker & Queue Guidelines)
- §8 (Provider Integration Guidelines)
- §9 (Error Handling & Resilience)

## Problem

- 6 processors with inconsistent patterns (some have progress tracking, some don't)
- Saga coverage is partial (sync saga exists, but export/onboarding may be incomplete)
- Dead letter queue handling is not standardized
- Circuit breaker thresholds may not be tuned for actual provider behavior

## Current State

```bash
# List all processors
ls apps/worker/src/processors/

# List sagas
ls apps/worker/src/sagas/

# List queues
ls apps/worker/src/queues/

# Check circuit breaker config
cat apps/worker/src/lib/circuit-breakers.ts

# Check retry policies
grep -rn "attempts\|backoff\|delay\|retries" apps/worker/src/ --include="*.ts" | head -20
```

## What to Build

### 1. Standardize Processor Pattern

Every processor should follow this template:

```typescript
import type { Job } from "bullmq"
import { logger } from "../config"
import { AppError, ErrorCode } from "@biosync-io/types"

export async function processXxxJob(job: Job<XxxJobData>) {
  const log = logger.child({ jobId: job.id, jobName: job.name, ...job.data })

  log.info("job started")
  try {
    await job.updateProgress(10)

    // ... do work with progress updates ...

    await job.updateProgress(100)
    log.info({ result }, "job completed")
    return result
  } catch (err) {
    log.error({ err }, "job failed")

    // Classify error for retry decisions
    if (err instanceof AppError && err.code === ErrorCode.PROVIDER_RATE_LIMITED) {
      // Throw to let BullMQ retry with backoff
      throw err
    }

    if (err instanceof AppError && err.code === ErrorCode.TOKEN_EXPIRED) {
      // Attempt token refresh, then retry
      throw err
    }

    // Permanent failures → don't retry
    if (err instanceof AppError && err.code === ErrorCode.DATA_INTEGRITY_ERROR) {
      // Move to DLQ by not throwing (return failure result)
      return { success: false, error: err.message }
    }

    throw err // unknown errors → retry
  }
}
```

### 2. Dead Letter Queue Handling

Add DLQ configuration for each queue:

```typescript
// apps/worker/src/queues/sync.ts
export const syncQueue = new Queue("sync-queue", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 30_000, // 30s, 60s, 120s, 240s, 480s
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 }, // keep failed jobs for debugging
  },
})
```

Add a DLQ processor that logs and alerts on permanently failed jobs:

```typescript
// apps/worker/src/processors/dlq.processor.ts
export async function processDLQ(job: Job) {
  logger.error({
    jobId: job.id,
    queue: job.queueName,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    data: job.data,
  }, "job moved to DLQ — permanent failure")

  // Optionally: send notification, update connection status to 'error', etc.
}
```

### 3. Improve Saga Coverage

Audit existing sagas and fill gaps:

```bash
# Check sync saga steps
cat apps/worker/src/sagas/sync.saga.ts

# Check export saga steps
cat apps/worker/src/sagas/export.saga.ts

# Check onboarding saga in API
cat apps/api/src/sagas/onboarding.saga.ts
```

Ensure each saga has:
- All steps with both `execute` and `compensate` functions
- Proper error classification (retryable vs permanent)
- State persistence between steps
- Logging at each step boundary

### 4. Circuit Breaker Tuning

Review and document circuit breaker settings per provider:

```typescript
// apps/worker/src/lib/circuit-breakers.ts
const PROVIDER_CB_CONFIG = {
  fitbit: {
    failureThreshold: 5,     // Open after 5 consecutive failures
    resetTimeout: 60_000,    // Try half-open after 60s
    monitorInterval: 10_000, // Check circuit state every 10s
  },
  strava: {
    failureThreshold: 3,     // Strava rate limits are stricter
    resetTimeout: 120_000,   // Longer cooldown
    monitorInterval: 10_000,
  },
  // ... per provider
}
```

### 5. Bulkhead Pattern Review

Check the existing bulkhead implementation:

```bash
cat apps/worker/src/lib/bulkhead.ts
```

Ensure per-provider concurrency limits are enforced to prevent one noisy provider
from starving others.

## Verification

```bash
# Type check
pnpm typecheck --filter=@biosync-io/worker

# All tests
pnpm test

# Biome
pnpm exec biome ci apps/worker/

# Check processor pattern consistency
grep -rn "job.updateProgress" apps/worker/src/processors/ --include="*.ts"
# Every processor should have progress updates

# Check error classification
grep -rn "AppError\|ErrorCode" apps/worker/src/processors/ --include="*.ts"
# Every processor should use AppError
```

## Acceptance Criteria

- [ ] All 6 processors follow standardized pattern with progress tracking
- [ ] Every processor classifies errors (retryable vs permanent)
- [ ] DLQ processor logs and handles permanent failures
- [ ] Queue configs have explicit retry/backoff policies
- [ ] Sagas have compensating transactions for all steps
- [ ] Circuit breaker thresholds documented per provider
- [ ] All tests pass
