---
applyTo: "apps/api/**,packages/db/**,packages/cqrs/**,packages/saga/**,packages/event-bus/**"
---

# API Backend Instructions

## Architecture Overview

```
apps/api/src/
  index.ts           # Entry point — starts Fastify server
  server.ts          # Fastify app factory with plugin registration
  config.ts          # Zod-validated environment config
  telemetry.ts       # OpenTelemetry setup
  routes/v1/         # Versioned API route handlers
  services/          # Business logic layer
  plugins/           # Fastify plugins (auth, error handler, etc.)
  queues/            # BullMQ queue producers
  cqrs/              # Command/Query handlers
  sagas/             # Saga orchestrations
  lib/               # Shared utilities
  __tests__/         # Integration tests
```

## Route Handler Pattern

Routes are Fastify plugins — one file per domain:

```typescript
import type { FastifyInstance } from "fastify"
import { z } from "zod"

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

export default async function connectionRoutes(app: FastifyInstance) {
  // List connections
  app.get("/", async (request) => {
    const { limit, offset } = querySchema.parse(request.query)
    const connections = await connectionService.list(request.workspaceId, { limit, offset })
    return { data: connections }
  })

  // Create connection
  app.post("/", async (request) => {
    const body = createConnectionSchema.parse(request.body)
    const connection = await connectionService.create(request.workspaceId, body)
    return { data: connection }
  })

  // Delete connection
  app.delete("/:connectionId", async (request) => {
    const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(request.params)
    await connectionService.delete(request.workspaceId, connectionId)
    return { data: { success: true } }
  })
}
```

## Service Layer Pattern

Services contain business logic, accept typed inputs, return typed results:

```typescript
// apps/api/src/services/connection.service.ts
import { db } from "@biosync-io/db"
import { providerConnections } from "@biosync-io/db/schema"
import { eq, and } from "drizzle-orm"

export const connectionService = {
  async list(workspaceId: string, opts: { limit: number; offset: number }) {
    return db
      .select()
      .from(providerConnections)
      .where(eq(providerConnections.workspaceId, workspaceId))
      .limit(opts.limit)
      .offset(opts.offset)
  },

  async create(workspaceId: string, data: CreateConnectionInput) {
    const [connection] = await db
      .insert(providerConnections)
      .values({ workspaceId, ...data })
      .returning()
    return connection
  },
}
```

## Key Rules

- **Validation:** Zod schemas on ALL inputs (body, query, params)
- **Logging:** `request.log.info/error/warn(...)` — Pino structured JSON
- **Errors:** Throw `AppError` instances — Fastify error handler formats response
- **Auth:** `request.workspaceId` from JWT decoded in auth plugin
- **Database:** Drizzle ORM only — never raw SQL strings
- **Queues:** Enqueue BullMQ jobs via queue wrappers in `apps/api/src/queues/`
- **Testing:** Vitest with `buildTestApp` helper and `app.inject()`
- **Responses:** `{ data: T }` for success, `{ error: string, code: string }` for errors

## Database Conventions (Drizzle ORM)

```typescript
// Query with proper typing
const users = await db
  .select({
    id: usersTable.id,
    displayName: usersTable.displayName,
  })
  .from(usersTable)
  .where(eq(usersTable.workspaceId, workspaceId))

// Insert with returning
const [user] = await db
  .insert(usersTable)
  .values({ workspaceId, displayName })
  .returning()

// Update with returning
const [updated] = await db
  .update(usersTable)
  .set({ displayName, updatedAt: new Date() })
  .where(eq(usersTable.id, userId))
  .returning()

// Transaction
await db.transaction(async (tx) => {
  await tx.insert(tableA).values(...)
  await tx.update(tableB).set(...).where(...)
})
```

## Testing Pattern

```typescript
import { describe, it, expect } from "vitest"
import { buildTestApp } from "./helpers"

describe("GET /v1/users", () => {
  it("returns user for valid workspace", async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: "GET",
      url: "/v1/users",
      headers: { authorization: `Bearer ${testToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toBeDefined()
    expect(body.data.workspaceId).toBe(testWorkspaceId)
  })
})
```

## Error Handling

```typescript
// AppError for business logic errors
throw new AppError("Connection not found", "NOT_FOUND", 404)
throw new AppError("Rate limit exceeded", "RATE_LIMITED", 429)

// Zod validation errors are caught by Fastify error handler automatically
// Database errors propagate to error handler with 500 status

// NEVER catch and swallow errors silently:
// ❌ try { ... } catch (e) { /* silently ignored */ }
// ✅ try { ... } catch (e) { request.log.error({ err: e }, 'operation failed'); throw e }
```

## API Versioning

- v1 routes in `apps/api/src/routes/v1/` — only non-breaking changes
- Breaking changes MUST go in v2 with deprecation period
- Non-breaking: adding new fields, new endpoints, new optional params
- Breaking: removing fields, changing types, renaming endpoints

## Environment Config

All config via `apps/api/src/config.ts` with Zod validation:
- Config is validated at startup — fail fast on missing/invalid values
- Access via typed `env` object, never `process.env` directly in business code
- Secrets: `JWT_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`
