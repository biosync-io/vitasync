---
description: "Template for adding a new dashboard page in the Next.js frontend"
---

# New Dashboard Page Template

Use this template when creating a new page in the dashboard.

## Pre-Flight

### 1. Verify the API endpoint exists
```bash
# Check available routes
ls apps/api/src/routes/v1/
grep -rn "relevant_keyword" apps/api/src/routes/v1/ --include="*.ts"
```

**If the endpoint doesn't exist → STOP.** Build the backend first (see `new-feature.prompt.md`).

### 2. Verify the API proxy works
The web app proxies `/api/v1/*` to `INTERNAL_API_URL` via `apps/web/src/app/api/v1/[...path]/route.ts`.
No additional proxy setup is needed for new endpoints.

### 3. Check existing shared components
```bash
ls apps/web/src/lib/components/ui/
```

## Build the Page

### File location
```
apps/web/src/app/dashboard/{section}/page.tsx
apps/web/src/app/dashboard/{section}/loading.tsx
apps/web/src/app/dashboard/{section}/error.tsx
```

### page.tsx — Server Component (default)

```tsx
import { apiGet } from "@/lib/api"

interface DataItem {
  id: string
  name: string
  value: number
  createdAt: string
}

export default async function NewSectionPage() {
  const items = await apiGet<DataItem[]>("/new-section")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Section Title</h1>
        {/* Action buttons if needed */}
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={items.length} />
        <StatCard label="Average" value={calcAverage(items)} />
        {/* More stat cards */}
      </div>

      {/* Main content */}
      {items.length > 0 ? (
        <div className="rounded-lg border bg-card p-6">
          <DataTable items={items} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p>No data yet.</p>
          <p className="text-sm">Connect a provider to start tracking.</p>
        </div>
      )}
    </div>
  )
}
```

### loading.tsx

```tsx
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
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

### error.tsx

```tsx
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

## Rules

- ✅ Server component by default — `"use client"` only for interactivity
- ✅ Tailwind CSS only — no inline `style={{}}` with static values
- ✅ Empty state for when data is absent
- ✅ `loading.tsx` and `error.tsx` alongside every `page.tsx`
- ✅ TypeScript types for all data
- ✅ API calls via `apiGet`/`apiPost` helpers (never raw fetch with full URL)

## Client Components (only when needed)

If the page needs interactivity (forms, toggles, charts), extract client components:

```tsx
// apps/web/src/app/dashboard/{section}/components/InteractiveChart.tsx
"use client"

import { useState } from "react"

export function InteractiveChart({ data }: { data: DataItem[] }) {
  const [range, setRange] = useState("7d")
  // ... interactive chart logic
}
```

Import into the server component page:
```tsx
import { InteractiveChart } from "./components/InteractiveChart"

export default async function Page() {
  const data = await apiGet<DataItem[]>("/data")
  return <InteractiveChart data={data} />
}
```

## Verify

```bash
pnpm typecheck --filter=@biosync-io/web
pnpm build --filter=@biosync-io/web

# Check the page has all required files
ls apps/web/src/app/dashboard/{section}/
# Should show: page.tsx, loading.tsx, error.tsx
```

**Not done until TypeScript passes and the page builds.**
