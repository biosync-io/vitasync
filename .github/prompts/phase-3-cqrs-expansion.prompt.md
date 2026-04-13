---
description: "Phase 3 — Expand CQRS from health-only to provider sync and user domains"
---

# Phase 3: CQRS Expansion

**Branch:** `refactor/codebase-hardening`
**Depends on:** Phase 0 (AppError), Phase 1 (Services), Phase 2 (API hardening)

**Read these ENGINEERING_GUIDELINES.md sections before starting:**
- §4 (API Backend Guidelines)
- §7 (Worker & Queue Guidelines)

## Problem

CQRS is only implemented for the health domain (`apps/api/src/cqrs/`). Other
high-traffic domains (provider sync, user management) use direct service calls,
missing the benefits of command/query separation, event sourcing, and audit trails.

## Current State

```bash
# Existing CQRS
ls apps/api/src/cqrs/commands/ apps/api/src/cqrs/queries/

# Existing event store
grep -rn "eventStore\|event-store\|EventStore" apps/api/src/services/ --include="*.ts" | head -10

# CQRS package
ls packages/cqrs/src/
```

## What to Build

### 1. Provider Sync Commands & Queries

```typescript
// apps/api/src/cqrs/commands/sync.commands.ts
export const TRIGGER_SYNC = "sync.trigger"
export const CANCEL_SYNC = "sync.cancel"
export const REFRESH_TOKEN = "sync.refreshToken"

// apps/api/src/cqrs/commands/sync.handlers.ts
// Command handlers that enqueue BullMQ jobs, update connection status, etc.

// apps/api/src/cqrs/queries/sync.queries.ts
export const GET_SYNC_STATUS = "sync.getStatus"
export const GET_SYNC_HISTORY = "sync.getHistory"
export const GET_CONNECTION_HEALTH = "sync.getConnectionHealth"
```

### 2. User Domain Commands & Queries

```typescript
// apps/api/src/cqrs/commands/user.commands.ts
export const UPDATE_PROFILE = "user.updateProfile"
export const ROTATE_API_KEY = "user.rotateApiKey"
export const UPDATE_PREFERENCES = "user.updatePreferences"

// apps/api/src/cqrs/queries/user.queries.ts
export const GET_USER_PROFILE = "user.getProfile"
export const GET_USER_ACTIVITY = "user.getActivity"
```

### 3. Wire New CQRS Into Routes

Update the relevant route files to dispatch commands/queries via the CQRS bus
instead of calling services directly:

```typescript
// Before (direct service call)
app.post("/sync", async (request) => {
  const result = await syncService.trigger(request.workspaceId, body)
  return { data: result }
})

// After (CQRS command)
app.post("/sync", async (request) => {
  const result = await commandBus.execute(TRIGGER_SYNC, {
    workspaceId: request.workspaceId,
    ...body,
  })
  return { data: result }
})
```

### 4. Event Store Consistency

Ensure events from new domains are stored in the event store:

```bash
# Check current event store schema
grep -rn "event_store\|events" packages/db/src/schema/ --include="*.ts" | head -10

# Check what events are currently being stored
grep -rn "eventStore\|storeEvent\|appendEvent" apps/api/src/ --include="*.ts" | head -20
```

### 5. Projection Rebuild Tooling

Ensure the existing `rebuild-projections.ts` CLI covers new domains:

```bash
cat apps/api/src/cli/rebuild-projections.ts
```

## Verification

```bash
# Type check
pnpm typecheck

# CQRS package tests
pnpm test --filter=@biosync-io/cqrs

# API tests (routes still work via CQRS)
pnpm test --filter=@biosync-io/api

# Biome
pnpm exec biome ci .
```

## Acceptance Criteria

- [ ] Provider sync domain has CQRS commands and queries
- [ ] User domain has CQRS commands and queries
- [ ] Routes dispatch through CQRS bus (not direct service calls)
- [ ] Events are stored in event store for audit trail
- [ ] Projection rebuild covers new domains
- [ ] All existing tests pass (no regressions)
