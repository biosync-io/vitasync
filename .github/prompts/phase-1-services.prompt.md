---
description: "Phase 1 — Service layer cleanup: extract interfaces, DRY patterns, consistent DI"
---

# Phase 1: Service Layer Cleanup

**Branch:** `refactor/codebase-hardening`
**Depends on:** Phase 0 (AppError, ErrorCode)

**Read these ENGINEERING_GUIDELINES.md sections before starting:**
- §1 (Guiding Principles — DRY, SOLID, Separation of Concerns)
- §4 (API Backend Guidelines)

## Problem

The API has 41 service files with duplicated patterns:
- CRUD boilerplate repeated across services
- Inconsistent error handling (some throw, some return null)
- No shared service interfaces
- Some services do too much (business logic + DB queries + queue enqueuing)

## What to Build

### 1. Audit Current Services

```bash
# List all services
find apps/api/src/services -name "*.ts" ! -name "*.test.*" | sort

# Find services with direct DB imports
grep -rln "from.*@biosync-io/db" apps/api/src/services/ --include="*.ts"

# Find services that enqueue jobs
grep -rln "queue\|Queue\|addJob\|add(" apps/api/src/services/ --include="*.ts"

# Find services with inconsistent error patterns
grep -rn "return null" apps/api/src/services/ --include="*.ts" | head -20
```

### 2. Group Services into Domains

Organize the 41 services into logical domain groups:

```
services/
  health/          # health-data, health-score, health-data-es, readiness, sleep-analysis
  tracking/        # mood, nutrition, water-intake, journal, medications, symptoms
  analysis/        # insights, anomaly-detection, correlation, health-report
  gamification/    # goal, habit, achievement, challenge
  user/            # user, auth, mfa, sso, webauthn
  integration/     # connection, sync (provider sync coordination)
  notification/    # notification, webhook
  system/          # audit, api-key, data-export, event-store, projection
```

**Note:** This is a logical grouping — you may reorganize files into subdirectories
OR simply standardize the patterns without moving files (less disruptive).

### 3. Standardize Service Patterns

Each service should follow this pattern:

```typescript
import { db } from "@biosync-io/db"
import { eq, and } from "drizzle-orm"
import { AppError, ErrorCode } from "@biosync-io/types"

export const healthDataService = {
  async getByWorkspace(workspaceId: string, opts: ListOptions) {
    return db
      .select()
      .from(healthMetrics)
      .where(eq(healthMetrics.workspaceId, workspaceId))
      .limit(opts.limit)
      .offset(opts.offset)
  },

  async getById(workspaceId: string, id: string) {
    const [record] = await db
      .select()
      .from(healthMetrics)
      .where(and(eq(healthMetrics.id, id), eq(healthMetrics.workspaceId, workspaceId)))

    if (!record) {
      throw AppError.notFound("Health metric", id)
    }
    return record
  },

  async create(workspaceId: string, data: CreateHealthMetricInput) {
    const [record] = await db
      .insert(healthMetrics)
      .values({ workspaceId, ...data })
      .returning()
    return record
  },

  async delete(workspaceId: string, id: string) {
    const [deleted] = await db
      .delete(healthMetrics)
      .where(and(eq(healthMetrics.id, id), eq(healthMetrics.workspaceId, workspaceId)))
      .returning({ id: healthMetrics.id })

    if (!deleted) {
      throw AppError.notFound("Health metric", id)
    }
  },
}
```

### 4. DRY Up Common Patterns

Extract shared helpers for repeated patterns:

```typescript
// apps/api/src/lib/service-helpers.ts

/** Standard list query with workspace scoping and pagination */
export async function listByWorkspace<T>(
  table: PgTable,
  workspaceId: string,
  opts: ListOptions,
): Promise<T[]> {
  return db
    .select()
    .from(table)
    .where(eq(table.workspaceId, workspaceId))
    .limit(opts.limit)
    .offset(opts.offset)
}

/** Get single record with workspace scoping, throw if not found */
export async function getOrThrow<T>(
  table: PgTable,
  workspaceId: string,
  id: string,
  resourceName: string,
): Promise<T> {
  const [record] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.workspaceId, workspaceId)))

  if (!record) throw AppError.notFound(resourceName, id)
  return record as T
}
```

### 5. Ensure Services Don't Call Routes

```bash
# Services should NOT import from routes
grep -rn "from.*routes" apps/api/src/services/ --include="*.ts"
# Should return nothing

# Routes should NOT contain business logic (DB queries, complex conditionals)
# Audit: routes should only parse input, call service, return response
```

## Verification

```bash
# Type check
pnpm typecheck --filter=@biosync-io/api

# All existing tests pass (services are tested via route tests)
pnpm test --filter=@biosync-io/api

# Biome
pnpm exec biome ci apps/api/

# No console.log in services
grep -rn "console\." apps/api/src/services/ --include="*.ts" | grep -v __tests__
```

## Acceptance Criteria

- [ ] All services use `AppError` for error cases (not plain Error or return null)
- [ ] Repeated CRUD patterns extracted into shared helpers
- [ ] Services don't import from routes
- [ ] Every service has workspace-scoped queries (multi-tenancy safe)
- [ ] All 45 API tests still pass
- [ ] TypeScript and Biome pass clean
