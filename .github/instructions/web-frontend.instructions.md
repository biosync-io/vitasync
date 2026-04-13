---
applyTo: "apps/web/**"
---

# Next.js Frontend Instructions

## Architecture Overview

```
apps/web/src/
  app/                  # Next.js App Router pages
    api/v1/[...path]/   # API proxy route handler → INTERNAL_API_URL
    (dashboard)/        # Dashboard layout group
    (auth)/             # Auth layout group
  lib/                  # Client utilities, API helpers, hooks
  middleware.ts         # Auth middleware (JWT validation)
```

## App Router Conventions

### Server Components (Default)
```tsx
// app/(dashboard)/connections/page.tsx
// Server component — no "use client" directive
import { getConnections } from "@/lib/api"

export default async function ConnectionsPage() {
  const connections = await getConnections()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Connections</h1>
      <ConnectionList connections={connections} />
    </div>
  )
}
```

### Client Components (Only When Needed)
```tsx
"use client"

import { useState } from "react"

export function ConnectionForm({ onSubmit }: ConnectionFormProps) {
  const [name, setName] = useState("")
  // ... interactive form logic
}
```

**Use `"use client"` only for:**
- Event handlers (onClick, onChange, onSubmit)
- React hooks (useState, useEffect, useRef)
- Browser APIs (window, document, localStorage)
- Third-party client libraries

### Loading States
```tsx
// app/(dashboard)/connections/loading.tsx
export default function Loading() {
  return <ConnectionsSkeleton />
}
```

### Error Boundaries
```tsx
// app/(dashboard)/connections/error.tsx
"use client"

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6 text-center">
      <h2 className="text-lg font-semibold text-red-500">Something went wrong</h2>
      <p className="text-muted-foreground mt-2">{error.message}</p>
      <button onClick={reset} className="mt-4 btn btn-primary">Try again</button>
    </div>
  )
}
```

## API Integration

### Proxy Pattern
The web app proxies all `/api/v1/*` calls to `INTERNAL_API_URL`:

```typescript
// app/api/v1/[...path]/route.ts — already exists
// Browser calls: /api/v1/connections
// Proxy forwards to: INTERNAL_API_URL/v1/connections
```

### Server-Side Data Fetching
```typescript
// lib/api.ts
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${process.env.INTERNAL_API_URL}/v1${path}`, {
    headers: { /* auth headers */ },
    next: { revalidate: 60 }, // ISR caching
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json = await res.json()
  return json.data
}
```

### Server Actions (Mutations)
```typescript
"use server"

import { revalidatePath } from "next/cache"

export async function deleteConnection(connectionId: string) {
  await apiDelete(`/connections/${connectionId}`)
  revalidatePath("/connections")
}
```

## Styling Rules

- **Tailwind CSS only** — no inline `style={{}}` with static values
- Use `cn()` utility for conditional classes (if available)
- Follow the existing component patterns in the codebase

```typescript
// ❌ WRONG — static inline style
style={{ color: 'red', padding: '16px' }}

// ✅ CORRECT — Tailwind
className="text-red-500 p-4"

// ✅ OK — dynamic computed values
style={{ width: `${percent}%` }}
```

## File Naming Conventions

```
app/(dashboard)/connections/page.tsx      # Route page
app/(dashboard)/connections/loading.tsx   # Loading state
app/(dashboard)/connections/error.tsx     # Error boundary
app/(dashboard)/connections/layout.tsx    # Layout wrapper
lib/api.ts                                # Utility modules
lib/hooks/use-connections.ts              # Client hooks (kebab-case)
```

## Performance Best Practices

- **Server Components first** — minimize client JavaScript
- **Streaming:** Use Suspense boundaries for progressive loading
- **Image Optimization:** Use `next/image` for all images
- **Code Splitting:** Dynamic imports for heavy client components
- **Caching:** Use `next: { revalidate }` for ISR, `cache: 'no-store'` for real-time data

## State Management

```
Is it server data? → Server component fetch or server action
Is it URL state (page, filter, sort)? → useSearchParams / searchParams prop
Is it form state? → useState (local to form component)
Is it UI state (modal open, tab active)? → useState (local to component)
Is it shared across client components? → React Context
```

**Never** add Redux, Zustand, or other state libraries without team approval.

## Security

- **XSS:** React auto-escapes — never use `dangerouslySetInnerHTML`
- **CSRF:** Server actions include CSRF protection by default
- **Auth:** Middleware validates JWT on protected routes
- **Secrets:** Never expose server env vars to client (use `NEXT_PUBLIC_` prefix only for public values)
- **Sensitive Data:** Never log PII to browser console in production
