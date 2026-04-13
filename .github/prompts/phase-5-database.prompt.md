---
description: "Phase 5 — Database optimization: index audit, query optimization, projection cleanup"
---

# Phase 5: Database Optimization

**Branch:** `refactor/codebase-hardening`
**Depends on:** Phase 0, Phase 1

**Read these ENGINEERING_GUIDELINES.md sections before starting:**
- §5 (Database & Data-Access Patterns)

## Problem

- 44 schema files may have missing indexes on frequently-queried columns
- N+1 query patterns may exist in service layer
- Projection tables may be out of sync with schema changes
- No query performance baseline

## Current State

```bash
# List all schema files
ls packages/db/src/schema/

# Count tables
grep -rn "pgTable(" packages/db/src/schema/ --include="*.ts" | wc -l

# Find tables WITHOUT indexes
grep -rL "index(" packages/db/src/schema/ --include="*.ts"

# Find foreign key columns that might need indexes
grep -rn "references\|\.references(" packages/db/src/schema/ --include="*.ts" | head -20

# List current migrations
ls packages/db/src/migrations/
```

## What to Build

### 1. Index Audit

Check that every table has indexes on:
- Foreign key columns (`workspace_id`, `connection_id`, `user_id`)
- Columns used in WHERE clauses (status, provider_id, created_at ranges)
- Columns used in ORDER BY (created_at, updated_at)

```bash
# Find all workspace_id columns — should all have indexes
grep -rn "workspaceId\|workspace_id" packages/db/src/schema/ --include="*.ts" | head -30

# Find schemas that define indexes
grep -rn "index(" packages/db/src/schema/ --include="*.ts"

# Find schemas missing index definitions
for f in packages/db/src/schema/*.ts; do
  if grep -q "pgTable" "$f" && ! grep -q "index(" "$f"; then
    echo "⚠️  Missing index: $f"
  fi
done
```

Add missing indexes:

```typescript
// Example: add index to a table
export const syncJobs = pgTable("sync_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("idx_sync_jobs_connection_id").on(table.connectionId),
  index("idx_sync_jobs_status").on(table.status),
])
```

### 2. Query Optimization

Search for potential N+1 patterns:

```bash
# Find loops with DB queries inside (N+1 pattern)
grep -rnB5 "for.*of\|\.forEach\|\.map(" apps/api/src/services/ --include="*.ts" | grep -A5 "db\.\|await "

# Find services doing multiple sequential queries that could be joined
grep -rn "await db" apps/api/src/services/ --include="*.ts" | head -30
```

Replace N+1 patterns with batch queries:

```typescript
// ❌ N+1: query in a loop
for (const conn of connections) {
  const metrics = await db.select().from(healthMetrics)
    .where(eq(healthMetrics.connectionId, conn.id))
  // ...
}

// ✅ Batch: single query with IN clause
const allMetrics = await db.select().from(healthMetrics)
  .where(inArray(healthMetrics.connectionId, connections.map(c => c.id)))
```

### 3. Projection Table Review

```bash
# Find projection-related schemas
grep -rn "projection" packages/db/src/schema/ --include="*.ts"

# Check projection service
cat apps/api/src/services/projection.service.ts | head -50
```

Ensure projections:
- Are rebuilt correctly by the CLI tool
- Have proper indexes for read queries
- Are updated transactionally with source data

### 4. Migration Cleanup

```bash
# Count migrations
ls packages/db/src/migrations/*.sql | wc -l

# Check for very old migrations that could be squashed
ls -la packages/db/src/migrations/ | head -10
```

**Note:** Don't squash migrations in this phase — just document if there's an opportunity
for a future squash (e.g., 50+ migration files that could be consolidated).

### 5. Generate New Migration

After adding indexes, generate the migration:

```bash
pnpm db:generate
```

Review the generated SQL to ensure only indexes are added (no destructive changes).

## Verification

```bash
# Type check
pnpm typecheck --filter=@biosync-io/db

# Generate migration (should succeed)
pnpm db:generate

# API tests still pass with schema changes
pnpm test --filter=@biosync-io/api

# Biome
pnpm exec biome ci packages/db/
```

## Acceptance Criteria

- [ ] Every table with `workspace_id` has an index on it
- [ ] Every foreign key column has an index
- [ ] No N+1 query patterns in service layer
- [ ] Projection tables have appropriate indexes
- [ ] Migration generated and reviewed
- [ ] All tests pass
