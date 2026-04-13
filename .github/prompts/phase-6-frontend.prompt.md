---
description: "Phase 6 — Frontend consolidation: shared components, consistent patterns, loading/error states"
---

# Phase 6: Frontend Consolidation

**Branch:** `refactor/codebase-hardening`
**Depends on:** Phase 2 (API response standardization)

**Read these ENGINEERING_GUIDELINES.md sections before starting:**
- §6 (Frontend Guidelines)

## Problem

- 32 dashboard sections with potentially inconsistent patterns
- Some pages may lack loading.tsx or error.tsx
- Data fetching patterns may vary (some server-side, some client-side)
- Shared UI components in `lib/components/ui/` may be underutilized
- **CRITICAL:** Pages must NOT be gutted/replaced with skeleton placeholders — every
  existing section, chart, table, and interaction must be preserved

## Current State

```bash
# List all dashboard sections
ls apps/web/src/app/dashboard/

# Count pages
find apps/web/src/app -name "page.tsx" | wc -l

# Pages WITHOUT loading.tsx
for d in apps/web/src/app/dashboard/*/; do
  if [ ! -f "$d/loading.tsx" ]; then
    echo "⚠️  Missing loading.tsx: $d"
  fi
done

# Pages WITHOUT error.tsx
for d in apps/web/src/app/dashboard/*/; do
  if [ ! -f "$d/error.tsx" ]; then
    echo "⚠️  Missing error.tsx: $d"
  fi
done

# Shared components
ls apps/web/src/lib/components/ui/

# Client components (count "use client" directives)
grep -rl '"use client"' apps/web/src/app/ | wc -l

# Check data fetching patterns
grep -rn "fetch(" apps/web/src/app/ --include="*.tsx" --include="*.ts" | head -20
```

## What to Build

### 1. Page Inventory & Line Count Baseline (DO THIS FIRST)

Before touching ANY page, catalog every existing page with its line count:

```bash
# Generate page inventory with line counts
find apps/web/src/app -name "page.tsx" -exec sh -c 'echo "$(wc -l < "$1") $1"' _ {} \; | sort -rn > /tmp/page-inventory.txt
cat /tmp/page-inventory.txt
```

**This is your contract.** After refactoring, every page must:
- Retain ≥ 90% of its original line count (unless genuinely simpler)
- Preserve ALL sections, charts, tables, and interactive elements
- Show section-by-section evidence that each section still renders

```
⛔ ANTI-GUTTING RULES — READ CAREFULLY

❌ DO NOT replace a 300-line page with a 50-line skeleton that says "Coming soon"
❌ DO NOT remove charts, tables, or data sections because "they're complex"
❌ DO NOT replace interactive components with static placeholders
❌ DO NOT gate ALL content behind a single loading/empty check
❌ DO NOT reduce functionality to make refactoring easier
✅ DO preserve every section the original page had
✅ DO verify line counts before/after (report both numbers)
✅ DO keep all data fetching, transformations, and display logic
✅ DO show the diff if a page shrinks significantly — justify every removal
```

### 2. Loading/Error State Audit

Add `loading.tsx` and `error.tsx` to every dashboard section that's missing them:

```typescript
// loading.tsx template
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-64 rounded-lg bg-muted" />
    </div>
  )
}
```

```typescript
// error.tsx template
"use client"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <h2 className="text-lg font-semibold text-destructive">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  )
}
```

### 2. Shared Component Audit

Check if shared components are being used consistently:

```bash
# What components exist
ls apps/web/src/lib/components/ui/

# Find raw HTML that should use shared components
grep -rn "<button " apps/web/src/app/ --include="*.tsx" | grep -v "components" | head -10
grep -rn "<input " apps/web/src/app/ --include="*.tsx" | grep -v "components" | head -10
grep -rn "<select " apps/web/src/app/ --include="*.tsx" | grep -v "components" | head -10
```

### 3. Data Fetching Consistency

Ensure server components fetch data consistently:

```typescript
// ✅ Standard pattern for server component pages
import { apiGet } from "@/lib/api"

export default async function HealthScoresPage() {
  const scores = await apiGet<HealthScore[]>("/health-scores")

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Health Scores</h1>
      {scores.length > 0 ? (
        <ScoreGrid scores={scores} />
      ) : (
        <EmptyState message="No health scores yet" />
      )}
    </div>
  )
}
```

```bash
# Find pages doing client-side fetch that could be server-side
grep -rn "useEffect.*fetch\|useState.*fetch" apps/web/src/app/ --include="*.tsx" | head -10
```

### 4. Empty State Consistency

Every data display should have an empty state:

```bash
# Find pages that might show blank content when data is empty
grep -rn "\.length === 0\|\.length > 0" apps/web/src/app/ --include="*.tsx" | head -20

# Check for {data && ...} patterns (should be data ? <Content> : <Empty>)
grep -rn "{.*&&.*<" apps/web/src/app/ --include="*.tsx" | head -20
```

### 5. Dashboard Section Deduplication

Look for repeated patterns across the 32 dashboard sections:

```bash
# Find duplicate component patterns
grep -rn "className=\"grid" apps/web/src/app/dashboard/ --include="*.tsx" | head -20

# Find repeated stat card patterns
grep -rn "StatCard\|MetricCard\|stat-card" apps/web/src/app/dashboard/ --include="*.tsx" | head -20
```

Extract repeated layouts into shared layout components.

## Verification

```bash
# Type check
pnpm typecheck --filter=@biosync-io/web

# Build (catches SSR issues)
pnpm build --filter=@biosync-io/web

# Biome
pnpm exec biome ci apps/web/

# Verify every dashboard section has loading + error
for d in apps/web/src/app/dashboard/*/; do
  [ -f "$d/loading.tsx" ] || echo "❌ Missing: $d/loading.tsx"
  [ -f "$d/error.tsx" ] || echo "❌ Missing: $d/error.tsx"
done
```

## Acceptance Criteria

- [ ] Page inventory baseline taken (line counts recorded)
- [ ] Every refactored page retains ≥ 90% of original line count
- [ ] No page sections removed or replaced with placeholders
- [ ] Every dashboard section has `loading.tsx` and `error.tsx`
- [ ] Server components used for data fetching where possible
- [ ] Empty states for all data displays
- [ ] Shared components used consistently (no raw HTML buttons/inputs)
- [ ] Repeated layout patterns extracted into shared components
- [ ] Frontend builds successfully
