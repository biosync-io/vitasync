# VitaSync — Copilot Instructions

## ⚠️ COMPLETION & INTEGRITY STANDARDS

These rules exist because agents consistently violate them. Read carefully.

### Anti-Dishonesty
```
❌ DO NOT claim "all checks pass" without actually running them
❌ DO NOT say "TypeScript compiles clean" without running `pnpm typecheck`
❌ DO NOT say "0 violations found" without running grep/audit commands
❌ DO NOT report completion percentages you haven't verified
✅ DO run every verification command and paste the actual output
✅ DO show the raw terminal output, not a summary of what you think it says
```

### Anti-Shortcuts
```
❌ DO NOT stub pages with "Coming soon" or "No data available" as the only content
❌ DO NOT reduce a 600-line file to 100 lines and call it "refactored"
❌ DO NOT skip sections that seem complex — implement ALL of them
❌ DO NOT create placeholder components that render nothing useful
❌ DO NOT use `any` type to avoid writing proper interfaces
❌ DO NOT leave TODO/FIXME comments instead of implementing the code
✅ DO implement every section the original file had
✅ DO show section-by-section evidence that each section renders
✅ DO write complete implementations, not scaffolds
```

### Anti-Laziness
```
❌ DO NOT copy-paste the same component 5 times instead of creating a shared one
❌ DO NOT hardcode data that should come from API hooks or server actions
❌ DO NOT skip error handling, loading states, or empty states
❌ DO NOT import a library just to use one function — check if a shared util exists
✅ DO handle loading, error, AND empty states for every data source
✅ DO create shared components when you see the same pattern 2+ times
✅ DO write complete implementations, not scaffolds
```

### Verification Protocol
Before reporting any task as complete, you MUST:
1. **Run TypeScript**: `pnpm typecheck` — paste output
2. **Run Biome**: `pnpm exec biome ci .` — paste output
3. **Run Tests**: `pnpm test` (or targeted package) — paste output
4. **Verify builds**: `pnpm build` (or targeted package) — paste output

**If you cannot run a verification step, say so explicitly — do not fabricate results.**

---

## Project Overview

VitaSync is a **unified wearable health data aggregation platform** — TypeScript monorepo with Fastify API, Next.js web app, BullMQ workers, and provider integrations.
**Repository:** `github.com/biosync-io/vitasync`

## Architecture

```
Next.js App (/web) ──▶ API proxy ──▶ Fastify API Server (:3001)
                                        │   │   │   │
                                    Postgres Redis BullMQ Provider APIs
                                                        │
                                      Worker (BullMQ) ◀─┘
```

**Apps:** api (:3001), web (:3000), worker, mcp, docs
**Packages:** db, types, providers, analytics, notifications, event-bus, cqrs, saga, circuit-breaker

## Monorepo Structure

```
vitasync/
  apps/
    api/           # Fastify REST API server
    web/           # Next.js 16 App Router frontend
    worker/        # BullMQ job processor
    mcp/           # MCP server for AI integrations
    docs/          # Astro/Starlight documentation site
  packages/
    db/            # Drizzle ORM schema, migrations, queries
    types/         # Shared TypeScript types
    providers/     # Health data provider integrations (Fitbit, Strava, Whoop, etc.)
    analytics/     # Data analytics & aggregation
    notifications/ # Multi-channel notifications
    event-bus/     # Domain event system
    cqrs/          # Command/Query separation
    saga/          # Distributed saga orchestration
    circuit-breaker/ # Resilience patterns
```

## ⛔ PROHIBITED PATTERNS — These will be rejected in code review

```
❌ 1. `any` TYPE
   BAD:  const data: any = await response.json()
   GOOD: const data: UserResponse = await response.json()

❌ 2. NON-NULL ASSERTIONS without validation
   BAD:  const user = data!.user
   GOOD: if (!data?.user) throw new Error('...')

❌ 3. console.log for production logging
   BAD:  console.log('error:', err)
   GOOD: request.log.error({ err }, 'operation failed')  // Fastify/Pino

❌ 4. RAW SQL strings (use Drizzle ORM)
   BAD:  db.execute(sql`SELECT * FROM users WHERE id = ${id}`)
   GOOD: db.select().from(users).where(eq(users.id, id))

❌ 5. DIRECT fetch() for external APIs in providers
   BAD:  const res = await fetch('https://api.fitbit.com/...')
   GOOD: Use provider package abstractions with circuit breaker

❌ 6. SECRETS in code or .env committed to git
   BAD:  const secret = 'hardcoded-jwt-secret'
   GOOD: const secret = env.JWT_SECRET  // from validated config

❌ 7. BREAKING v1 API changes
   BAD:  Removing or renaming existing v1 fields
   GOOD: Add new fields; deprecate old ones; breaking changes go to v2

❌ 8. SKIPPING Zod validation on API inputs
   BAD:  const { userId } = request.body
   GOOD: const { userId } = createUserSchema.parse(request.body)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 LTS |
| Language | TypeScript 5.7 (strict mode) |
| Package Manager | pnpm 10 + Turborepo |
| API Framework | Fastify 5 |
| Web Framework | Next.js 16 (App Router, React 19) |
| ORM | Drizzle ORM (PostgreSQL) |
| Queue | BullMQ + Redis |
| Validation | Zod |
| Auth | JWT + API Keys (SHA-256 hashed) |
| Encryption | AES-256-GCM for OAuth tokens at rest |
| Linting | Biome (formatter + linter) |
| Testing | Vitest + @fastify/inject |
| CI | GitHub Actions |
| Containers | Docker + Helm |
| Docs | Astro/Starlight |

## API Architecture (Fastify)

### Route Pattern
```typescript
// apps/api/src/routes/v1/users.ts
import type { FastifyInstance } from "fastify"
import { z } from "zod"

const updateSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  gender: z.enum(["male", "female", "other"]).nullish(),
})

export default async function userRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const user = await userService.getByWorkspaceId(request.workspaceId)
    return { data: user }
  })

  app.patch("/", async (request) => {
    const body = updateSchema.parse(request.body)
    const user = await userService.update(request.workspaceId, body)
    return { data: user }
  })
}
```

### Key Conventions
- **Validation:** Zod schemas for all request bodies and query params
- **Responses:** `{ data: T }` for success, `{ error: string, code: string }` for errors
- **Auth:** JWT via `request.workspaceId` (decoded in auth plugin)
- **Logging:** Fastify/Pino — `request.log.info(...)`, never console.log
- **Error handling:** Fastify error handler plugin, throw `AppError` instances
- **Testing:** Vitest with `app.inject()` via shared `buildTestApp` helper

### API Versioning
- v1 receives only **non-breaking** additions
- Breaking changes must go in v2 with a deprecation period
- Source of truth for routes: `apps/api/src/routes/v1/`

## Database (Drizzle ORM)

### Schema Pattern
```typescript
// packages/db/src/schema/users.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
```

### Migrations
- Generated with `pnpm db:generate` (Drizzle Kit)
- Applied with `pnpm db:migrate`
- SQL files use `--> statement-breakpoint` markers
- Always review generated migrations before committing

## Frontend (Next.js 16 App Router)

### Key Conventions
- **App Router** with server components by default
- `"use client"` only when needed (interactivity, hooks, browser APIs)
- Server actions for mutations
- Tailwind CSS for styling
- API calls proxied through `/api/v1/[...path]` route handler to `INTERNAL_API_URL`

## Worker (BullMQ)

### Job Processing Pattern
```typescript
// apps/worker/src/processors/sync.processor.ts
export async function processSyncJob(job: Job<SyncJobData>) {
  const { connectionId, providerId } = job.data
  const provider = providerRegistry.get(providerId)
  // ... sync logic with progress updates
  await job.updateProgress(50)
}
```

## Git Conventions

### Commit Messages (Conventional Commits)
```
type(scope): description

feat(api):     Add user preferences endpoint
fix(worker):   Handle token refresh during sync
refactor(db):  Extract connection query helpers
perf(api):     Add database index for sync lookups
docs:          Update provider setup guide
test(api):     Add integration tests for OAuth flow
chore:         Update dependencies
```

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ci`, `style`
Scope: `api`, `web`, `worker`, `db`, `providers`, `mcp`, `docs`, `helm`, `ci`

### Branch Naming
```
feature/add-garmin-provider
fix/oauth-token-refresh-race
refactor/extract-sync-service
```

## Engineering Principles

### DRY — Don't Repeat Yourself
- Extract repeated logic into shared packages
- If a pattern appears 3+ times → extract it
- Shared types in `packages/types/`, shared DB in `packages/db/`

### SOLID
- **Single Responsibility:** One service/handler per concern
- **Open/Closed:** Extend via composition (provider registry, event handlers)
- **Interface Segregation:** Small focused interfaces
- **Dependency Inversion:** Accept interfaces, not concrete implementations

### Separation of Concerns
- **API routes** orchestrate, **services** contain business logic, **DB** handles persistence
- Never put business logic in route handlers — delegate to service layer
- Never put API calls in React components — use server actions or API proxy

## Security Practices

- **SQL Injection:** Drizzle ORM prevents this by design
- **XSS:** React auto-escapes, never use `dangerouslySetInnerHTML`
- **Auth:** JWT validated on every request via Fastify plugin
- **Secrets:** All secrets via environment variables, validated at startup with Zod
- **OAuth tokens:** Encrypted at rest with AES-256-GCM
- **API keys:** Stored as SHA-256 hashes only
- **Rate limiting:** Per-workspace, configurable
- **Input validation:** Zod on every endpoint

## Error Handling

- **API:** Throw `AppError` instances, Fastify error handler formats response
- **Worker:** BullMQ auto-retries with exponential backoff
- **Providers:** Circuit breaker wraps external API calls
- **Frontend:** Error boundaries + loading/error states
- **Logging:** Structured JSON via Pino, log at boundaries not deep in services
