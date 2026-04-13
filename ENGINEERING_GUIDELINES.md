# VitaSync Engineering Guidelines

> **Purpose:** Authoritative reference for VitaSync development. Every engineer
> contributing to this codebase must read and follow these guidelines. The primary goal is to
> maintain a consistent, secure, and maintainable monorepo.

### Document Governance

| Property | Value |
|----------|-------|
| **Owner** | VitaSync Engineering Lead |
| **Approval authority** | Engineering Lead + one domain owner |
| **Review cadence** | Quarterly, or when a major architectural change is proposed |
| **Exception process** | File an ADR with justification. Requires two approvals. |
| **Enforcement** | Every "MUST" / "NEVER" rule maps to at least one automated check (Biome, CI, code-guardian extension) or a mandatory code-review gate. |

### Version & Support Matrix

| Component | Supported Version | Owner |
|-----------|-------------------|-------|
| Node.js | 22.x LTS | All |
| TypeScript | 5.7.x (strict mode) | All |
| pnpm | 10.x | All |
| Turborepo | 2.x | All |
| Fastify | 5.x | Backend |
| Next.js | 16.x (App Router) | Frontend |
| React | 19.x | Frontend |
| Drizzle ORM | Latest | Backend |
| PostgreSQL | 16.x | Backend / Infra |
| Redis | 7.x | Backend / Infra |
| BullMQ | Latest | Backend |
| Zod | Latest | All |
| Biome | 2.x | All |
| Vitest | Latest | All |

---

## Table of Contents

1. [Guiding Principles](#1-guiding-principles)
2. [Repository Structure](#2-repository-structure)
3. [TypeScript Conventions](#3-typescript-conventions)
4. [API Backend Guidelines](#4-api-backend-guidelines)
5. [Database & Data-Access Patterns](#5-database--data-access-patterns)
6. [Frontend Guidelines](#6-frontend-guidelines)
7. [Worker & Queue Guidelines](#7-worker--queue-guidelines)
8. [Provider Integration Guidelines](#8-provider-integration-guidelines)
9. [Error Handling & Resilience](#9-error-handling--resilience)
10. [Testing Strategy](#10-testing-strategy)
11. [Security](#11-security)
12. [Observability](#12-observability)
13. [Infrastructure & Deployment](#13-infrastructure--deployment)
14. [CI/CD & Code Quality](#14-cicd--code-quality)
15. [Git Conventions](#15-git-conventions)

---

## 1. Guiding Principles

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
- **API routes** orchestrate, **services** contain business logic, **DB layer** handles persistence
- Never put business logic in route handlers — delegate to service layer
- Never put API calls directly in React components — use server actions or API proxy

### Fail Fast
- Validate config at startup with Zod — fail immediately on missing values
- Validate all inputs at API boundaries — never trust incoming data
- Prefer early returns over deeply nested conditionals

---

## 2. Repository Structure

```
vitasync/
  apps/
    api/             # Fastify REST API server (:3001)
    web/             # Next.js 16 App Router frontend (:3000)
    worker/          # BullMQ job processor
    mcp/             # MCP server for AI integrations
    docs/            # Astro/Starlight documentation site
  packages/
    db/              # Drizzle ORM schema, migrations, queries
    types/           # Shared TypeScript type definitions
    providers/       # Health data provider integrations
    analytics/       # Data analytics & aggregation
    notifications/   # Multi-channel notification dispatch
    event-bus/       # Domain event system
    cqrs/            # Command/Query separation
    saga/            # Distributed saga orchestration
    circuit-breaker/ # Resilience patterns
  helm/              # Kubernetes Helm chart
  monitoring/        # Grafana dashboards, Prometheus config
  load-tests/        # k6 load test scripts
```

### Package Naming
- Scope: `@biosync-io/{name}` (e.g., `@biosync-io/db`, `@biosync-io/types`)
- All packages are internal — no publishing to npm

### Dependency Rules
- Apps can depend on packages
- Packages can depend on other packages (no circular deps)
- `packages/types` has zero dependencies (pure type definitions)
- Never import from one app into another — use shared packages

---

## 3. TypeScript Conventions

### Strict Mode
All packages use `"strict": true` in `tsconfig.json`. The following are enforced:
- `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`
- `noUncheckedIndexedAccess` (recommended)

### Type Safety Rules
```typescript
// ❌ NEVER use `any`
const data: any = await response.json()

// ✅ Use proper types
const data: UserResponse = await response.json()

// ❌ NEVER use non-null assertions without validation
const name = user!.name

// ✅ Validate first, then use
if (!user) throw new AppError("User not found", "NOT_FOUND", 404)
const name = user.name

// ❌ NEVER use type assertions to bypass safety
const user = data as User // dangerous if data doesn't match

// ✅ Validate with Zod runtime check
const user = userSchema.parse(data)
```

### Import Organization
Biome handles import sorting automatically. Manual grouping:
1. Node.js built-ins (`node:fs`, `node:path`)
2. External packages (`fastify`, `zod`, `drizzle-orm`)
3. Internal packages (`@biosync-io/db`, `@biosync-io/types`)
4. Relative imports (`./service`, `../lib/utils`)

### Naming Conventions
| Item | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `connection.service.ts` |
| Types/Interfaces | PascalCase | `UserResponse` |
| Functions/Variables | camelCase | `getConnectionById` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Database columns | snake_case | `workspace_id` |
| API query params | camelCase | `connectionId` |
| Enum values | PascalCase or UPPER_SNAKE_CASE | `SyncStatus.InProgress` |

### Code Style
- Biome enforces formatting: 2-space indent, double quotes, trailing commas
- Line width: 100 characters
- Semicolons: as needed (ASI-safe)
- Use `import type` for type-only imports

---

## 4. API Backend Guidelines

### Route Handler Pattern
```typescript
// apps/api/src/routes/v1/connections.ts
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { connectionService } from "../../services/connection.service"

const createSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().max(100).optional(),
})

export default async function connectionRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const connections = await connectionService.list(request.workspaceId)
    return { data: connections }
  })

  app.post("/", async (request) => {
    const body = createSchema.parse(request.body)
    const connection = await connectionService.create(request.workspaceId, body)
    return { data: connection }
  })
}
```

### Response Format
```typescript
// Success
{ data: T }
{ data: T, meta: { total: number, limit: number, offset: number } }

// Error
{ error: string, code: string }
// e.g. { error: "Connection not found", code: "NOT_FOUND" }
```

### HTTP Status Codes
- `200` — Success
- `201` — Created (POST)
- `204` — No Content (DELETE)
- `400` — Bad Request (validation error)
- `401` — Unauthorized (missing/invalid JWT)
- `403` — Forbidden (valid auth, insufficient permission)
- `404` — Not Found
- `429` — Rate Limited
- `500` — Internal Server Error (log details, return generic message)

### API Versioning
- v1 routes: `apps/api/src/routes/v1/` — **non-breaking changes only**
- Breaking changes MUST go in v2 with a deprecation period
- Non-breaking: new fields, new endpoints, new optional parameters
- Breaking: removing fields, changing types, renaming endpoints

### Logging (Pino via Fastify)
```typescript
// ✅ Structured logging with context
request.log.info({ connectionId, providerId }, "sync started")
request.log.error({ err, connectionId }, "sync failed")

// ❌ Never use console.log
console.log("sync started") // WRONG
```

---

## 5. Database & Data-Access Patterns

### Schema Definition (Drizzle ORM)
```typescript
// packages/db/src/schema/provider-connections.ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"

export const providerConnections = pgTable("provider_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  providerId: text("provider_id").notNull(),
  status: text("status").notNull().default("connected"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_provider_connections_workspace").on(table.workspaceId),
])
```

### Query Patterns
```typescript
// ✅ Use Drizzle query builder
const connections = await db
  .select()
  .from(providerConnections)
  .where(eq(providerConnections.workspaceId, workspaceId))
  .orderBy(desc(providerConnections.createdAt))
  .limit(50)

// ✅ Use transactions for multi-step operations
await db.transaction(async (tx) => {
  const [connection] = await tx.insert(providerConnections).values(data).returning()
  await tx.insert(syncHistory).values({ connectionId: connection.id, ... })
})

// ❌ Never use raw SQL for standard CRUD
db.execute(sql`SELECT * FROM provider_connections WHERE workspace_id = ${id}`)
```

### Migration Rules
- Generate with `pnpm db:generate` (Drizzle Kit)
- Review generated SQL before committing
- SQL files use `--> statement-breakpoint` markers
- Never manually edit generated migration files
- Test migrations in dev before pushing

---

## 6. Frontend Guidelines

### Next.js App Router
- Server components by default — minimize client JavaScript
- `"use client"` only for interactivity (hooks, events, browser APIs)
- Server actions for mutations

### Data Fetching
```tsx
// ✅ Server component — fetch on server
export default async function ConnectionsPage() {
  const connections = await getConnections()
  return <ConnectionList connections={connections} />
}

// ✅ Client component — API proxy
"use client"
const res = await fetch("/api/v1/connections")
```

### API Proxy
- Web app proxies `/api/v1/*` to `INTERNAL_API_URL` via route handler
- Never call the backend directly from browser code
- The proxy adds auth headers from the session

### Styling
- Tailwind CSS only — no inline `style={{}}` with static values
- Exception: dynamic computed values (percentages, calculated positions)
- Follow existing component patterns in the codebase

### Loading & Error States
- Every route segment should have `loading.tsx` and `error.tsx`
- Never show a blank page while data loads
- Show meaningful error messages, not raw stack traces

---

## 7. Worker & Queue Guidelines

### BullMQ Job Pattern
```typescript
// apps/worker/src/processors/sync.processor.ts
export async function processSyncJob(job: Job<SyncJobData>) {
  const { connectionId, providerId } = job.data

  job.updateProgress(10)
  const provider = providerRegistry.get(providerId)
  if (!provider) throw new Error(`Unknown provider: ${providerId}`)

  job.updateProgress(30)
  const data = await provider.fetchData(connectionId)

  job.updateProgress(70)
  await storeHealthData(connectionId, data)

  job.updateProgress(100)
  return { itemsSynced: data.length }
}
```

### Queue Conventions
- Queue names: kebab-case (`sync-queue`, `webhook-queue`)
- Jobs include `connectionId` and `providerId` for traceability
- Use exponential backoff for retries
- Dead letter queue for persistent failures
- Log job start/complete/fail with structured context

---

## 8. Provider Integration Guidelines

### Provider Registry
```typescript
// Providers self-register at startup
export function registerFitbitProvider() {
  if (!env.FITBIT_CLIENT_ID) {
    logger.info("Fitbit provider disabled — missing credentials")
    return
  }
  providerRegistry.register("fitbit", new FitbitProvider(...))
}
```

### Provider Contract
Every provider must implement:
- OAuth flow (authorize URL, callback handler, token refresh)
- Data sync (fetch health data, normalize to common schema)
- Token management (encrypted at rest with AES-256-GCM)

### Circuit Breaker
All external API calls go through the circuit breaker package:
- Opens after consecutive failures
- Half-open retry after cooldown period
- Prevents cascading failures when provider APIs are down

---

## 9. Error Handling & Resilience

### API Layer
```typescript
// Throw AppError for business logic errors
throw new AppError("Connection not found", "NOT_FOUND", 404)
throw new AppError("Rate limit exceeded", "RATE_LIMITED", 429)

// Fastify error handler formats the response automatically
// Zod validation errors → 400 with details
// AppError → appropriate status code
// Unknown errors → 500 with generic message (details logged)
```

### Worker Layer
- BullMQ handles retries with exponential backoff
- Log every failure with job ID and error context
- Dead letter queue for permanent failures
- Circuit breaker on provider API calls

### Frontend Layer
- `error.tsx` boundaries catch rendering errors
- `loading.tsx` provides loading states
- API errors shown with user-friendly messages
- Never show raw stack traces to users

---

## 10. Testing Strategy

### API Tests (Vitest + @fastify/inject)
```typescript
import { describe, it, expect } from "vitest"
import { buildTestApp } from "./helpers"

describe("GET /v1/connections", () => {
  it("returns connections for authenticated workspace", async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: "GET",
      url: "/v1/connections",
      headers: { authorization: `Bearer ${testToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toBeInstanceOf(Array)
  })
})
```

### Test Conventions
- Co-locate tests: `__tests__/` directory alongside source
- Test files: `*.test.ts` or `*.spec.ts`
- Test behavior, not implementation
- Use factories for test data, not hardcoded fixtures
- Mock external services (provider APIs, email), not internal modules

### Coverage
- Aim for 80%+ on critical paths (route handlers, services, provider sync)
- CI uploads coverage to Codecov
- Don't chase 100% — focus on business logic and edge cases

---

## 11. Security

### Authentication
- JWT tokens validated on every request via Fastify auth plugin
- API keys stored as SHA-256 hashes (never plaintext)
- Constant-time comparison for auth validation

### Encryption
- OAuth tokens encrypted at rest with AES-256-GCM
- `ENCRYPTION_KEY` from environment, validated at startup
- Token refresh handled transparently by provider packages

### Input Validation
- Zod schemas on EVERY API input (body, query, params)
- Never trust incoming data — validate before use
- Sanitize all string inputs (trim, length limits)

### Secrets Management
- All secrets via environment variables
- `.env` files never committed to git (`.env.example` as template)
- In Kubernetes: External Secrets Operator or Sealed Secrets
- Rotate `JWT_SECRET` and `ENCRYPTION_KEY` periodically

### Dependencies
- Dependabot keeps dependencies updated
- Security scanning in CI pipeline
- Review dependency changes carefully

---

## 12. Observability

### Structured Logging (Pino)
```typescript
// ✅ Structured with context
request.log.info({ workspaceId, connectionId }, "sync completed")
request.log.error({ err, jobId }, "job processing failed")

// ❌ Never
console.log("something happened")
fmt.Printf("debug: %v\n", data)
```

**Log Levels:**
- `error` — operation failed, needs attention
- `warn` — degraded but functional (retry needed, cache miss)
- `info` — significant business events (sync complete, connection created)
- `debug` — development diagnostics (query timing, payload sizes)

### Health Checks
- `/healthz` — liveness (is the process alive?)
- `/readyz` — readiness (are dependencies connected?)
- Both return 200 OK with JSON health status

---

## 13. Infrastructure & Deployment

### Docker Compose Services
| Service | Image | Port |
|---------|-------|------|
| api | Custom (node:22-alpine) | 3001 |
| web | Custom (node:22-alpine) | 3000 |
| worker | Custom (node:22-alpine) | — |
| postgres | postgres:16-alpine | 5432 |
| redis | redis:7-alpine | 6379 |

### Persistent Volumes
- `postgres_data` — PostgreSQL data
- `redis_data` — Redis persistence

### Helm Chart
- Located in `helm/vitasync/`
- Supports external PostgreSQL and Redis
- Configurable replicas, resources, ingress

---

## 14. CI/CD & Code Quality

### GitHub Actions Pipeline
```
lint → typecheck → test → build
```

- **Lint:** `pnpm exec biome ci .`
- **TypeCheck:** `pnpm typecheck` (Turborepo runs per-package)
- **Test:** `pnpm test` with Postgres + Redis services
- **Build:** `pnpm build` (verifies all apps compile)

### Biome Configuration
- Formatter: 2-space indent, double quotes, 100-char line width
- Linter: recommended rules + custom overrides in `biome.json`
- `noGlobalEval: error`, `useNodejsImportProtocol: error`

### Code-Guardian Extension
- Auto-audits `.ts/.tsx` files after edits
- Checks for `any` types, console.log, raw SQL, hardcoded secrets
- Provides `audit_code` tool for manual audits

---

## 15. Git Conventions

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

**Types:** `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ci`, `style`
**Scope:** `api`, `web`, `worker`, `db`, `providers`, `mcp`, `docs`, `helm`, `ci`

### Branch Naming
```
feature/add-garmin-provider
fix/oauth-token-refresh-race
refactor/extract-sync-service
```

### Pull Request Standards
- Title follows conventional commit format
- Description includes: what changed, why, how to test
- All CI checks must pass before merge
- Self-review checklist: types pass, Biome clean, tests pass, no regressions
