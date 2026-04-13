---
description: "Phase 8 — Observability: structured logging audit, health checks, API docs, runbooks"
---

# Phase 8: Observability & Documentation

**Branch:** `refactor/codebase-hardening`
**Depends on:** All previous phases

**Read these ENGINEERING_GUIDELINES.md sections before starting:**
- §12 (Observability)
- §14 (CI/CD & Code Quality)

## Problem

- Logging may be inconsistent (some console.log, some Pino, varying context fields)
- Health checks may not cover all dependencies
- API documentation may be incomplete
- No operational runbooks for common issues

## What to Build

### 1. Structured Logging Audit

```bash
# Find remaining console.log in production code
grep -rn "console\.\(log\|warn\|error\|debug\)" apps/api/src/ apps/worker/src/ --include="*.ts" \
  | grep -v "__tests__\|node_modules\|\.test\."

# Check logging patterns — should use request.log or pino logger
grep -rn "request\.log\.\|logger\.\(info\|error\|warn\|debug\)" apps/api/src/ --include="*.ts" | wc -l
```

Ensure every log statement includes structured context:

```typescript
// ✅ Good — structured context
request.log.info({ connectionId, providerId, itemCount: data.length }, "sync completed")

// ❌ Bad — string interpolation
request.log.info(`Sync completed for ${connectionId}`)

// ❌ Bad — console.log
console.log("sync completed", connectionId)
```

### 2. Health Check Standardization

Ensure `/healthz` and `/readyz` cover all dependencies:

```typescript
// apps/api/src/routes/v1/system.ts (or wherever health routes live)

// /healthz — liveness (is the process alive?)
app.get("/healthz", async () => {
  return { status: "ok", uptime: process.uptime() }
})

// /readyz — readiness (are dependencies connected?)
app.get("/readyz", async () => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
  }
  const healthy = Object.values(checks).every(c => c.status === "ok")
  return {
    status: healthy ? "ok" : "degraded",
    checks,
  }
})
```

```bash
# Find existing health check routes
grep -rn "healthz\|readyz\|health" apps/api/src/routes/ --include="*.ts"

# Check worker health
grep -rn "health" apps/worker/src/ --include="*.ts"
```

### 3. API Documentation

If Swagger/OpenAPI was added in Phase 2, verify completeness:

```bash
# Check if swagger is registered
grep -rn "swagger" apps/api/src/server.ts

# Start the app and check /docs
# curl http://localhost:3001/docs
```

If not, create a static API reference in the docs site:

```bash
# Check docs structure
ls apps/docs/src/content/docs/
```

### 4. Operational Runbooks

Create runbooks for common operational tasks in `apps/docs/` or a `runbooks/` directory:

```markdown
# Runbooks

## Provider Sync Failures
1. Check connection status: `GET /v1/connections?status=error`
2. Check sync job history: `GET /v1/sync-jobs?connectionId=X`
3. Check circuit breaker state: review worker logs for circuit-breaker events
4. Manual retry: `POST /v1/sync-jobs { connectionId: X }`

## Database Migration Issues
1. Check current migration version: `pnpm db:studio`
2. View pending migrations: `ls packages/db/src/migrations/`
3. Apply migrations: `pnpm db:migrate`
4. Rollback (manual): identify the migration SQL and reverse it

## Worker Queue Backup
1. Check queue depth: BullBoard at `/admin/queues`
2. Check failed jobs: filter by status=failed
3. Retry failed jobs: BullBoard UI or API
4. Clear stuck jobs: remove jobs older than 24h

## Token Refresh Failures
1. Check provider connection status
2. Verify OAuth credentials in environment
3. Check provider API status page
4. Manual re-authorization: user must reconnect via OAuth flow
```

### 5. Final Verification Suite

Run everything to ensure the full refactoring is solid:

```bash
# Full type check
pnpm typecheck

# Full lint
pnpm exec biome ci .

# Full test suite
pnpm test

# Full build (all apps + packages)
pnpm build

# Docker builds
docker compose build

# Docker health checks
docker compose up -d
sleep 30
curl -sf http://localhost:3001/healthz && echo "✅ API healthy" || echo "❌ API unhealthy"
curl -sf http://localhost:3001/readyz && echo "✅ API ready" || echo "❌ API not ready"
docker compose down
```

## Acceptance Criteria

- [ ] No console.log in API or worker production code
- [ ] All log statements use structured context (not string interpolation)
- [ ] `/healthz` and `/readyz` check all dependencies
- [ ] Worker has health check mechanism
- [ ] API docs available (Swagger or static docs)
- [ ] Operational runbooks for top 5 scenarios
- [ ] Full verification suite passes (typecheck, lint, test, build)
- [ ] Docker images build and services start healthy
