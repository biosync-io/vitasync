---
description: "Template for adding a new end-to-end feature (API route + service + frontend page)"
---

# New Feature Template

Use this template when adding a feature that spans backend API and frontend.

## Planning Phase

### 1. Define the feature scope
- What data does this feature show/manage?
- What API endpoints are needed? (GET, POST, PATCH, DELETE)
- What frontend pages/components are needed?
- What existing infrastructure can be reused?

### 2. Check what already exists
```bash
# Existing routes
ls apps/api/src/routes/v1/

# Existing services
ls apps/api/src/services/

# Existing DB schemas
ls packages/db/src/schema/

# Existing frontend pages
ls apps/web/src/app/dashboard/
```

## Backend Implementation

### Step 1: Database Schema (if new table)

Create in `packages/db/src/schema/{entity}.ts`:

```typescript
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"

export const newEntities = pgTable("new_entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_new_entities_workspace").on(table.workspaceId),
])
```

Rules:
- Include `createdAt` and `updatedAt` timestamps
- Add indexes on `workspaceId` and any foreign keys
- Export from `packages/db/src/index.ts`

Generate migration: `pnpm db:generate`

### Step 2: Service Layer

Create `apps/api/src/services/{entity}.service.ts`:

```typescript
import { db } from "@biosync-io/db"
import { newEntities } from "@biosync-io/db/schema"
import { eq, and } from "drizzle-orm"
import { AppError } from "@biosync-io/types"

export const newEntityService = {
  async list(workspaceId: string, opts: { limit: number; offset: number }) {
    return db.select().from(newEntities)
      .where(eq(newEntities.workspaceId, workspaceId))
      .limit(opts.limit).offset(opts.offset)
  },

  async getById(workspaceId: string, id: string) {
    const [entity] = await db.select().from(newEntities)
      .where(and(eq(newEntities.id, id), eq(newEntities.workspaceId, workspaceId)))
    if (!entity) throw AppError.notFound("Entity", id)
    return entity
  },

  async create(workspaceId: string, data: CreateInput) {
    const [entity] = await db.insert(newEntities)
      .values({ workspaceId, ...data }).returning()
    return entity
  },

  async update(workspaceId: string, id: string, data: UpdateInput) {
    const [entity] = await db.update(newEntities)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(newEntities.id, id), eq(newEntities.workspaceId, workspaceId)))
      .returning()
    if (!entity) throw AppError.notFound("Entity", id)
    return entity
  },

  async delete(workspaceId: string, id: string) {
    const [deleted] = await db.delete(newEntities)
      .where(and(eq(newEntities.id, id), eq(newEntities.workspaceId, workspaceId)))
      .returning({ id: newEntities.id })
    if (!deleted) throw AppError.notFound("Entity", id)
  },
}
```

### Step 3: Route Handler

Create `apps/api/src/routes/v1/{entity}.ts`:

```typescript
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { newEntityService } from "../../services/{entity}.service"

const createSchema = z.object({
  name: z.string().min(1).max(100),
})

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

export default async function newEntityRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const query = paginationSchema.parse(request.query)
    const data = await newEntityService.list(request.workspaceId, query)
    return { data }
  })

  app.get("/:id", async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const data = await newEntityService.getById(request.workspaceId, id)
    return { data }
  })

  app.post("/", async (request) => {
    const body = createSchema.parse(request.body)
    const data = await newEntityService.create(request.workspaceId, body)
    return { data }
  })

  app.patch("/:id", async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = updateSchema.parse(request.body)
    const data = await newEntityService.update(request.workspaceId, id, body)
    return { data }
  })

  app.delete("/:id", async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    await newEntityService.delete(request.workspaceId, id)
    return { data: { success: true } }
  })
}
```

Register in server.ts or route index.

### Step 4: Tests

Create `apps/api/src/__tests__/{entity}.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { buildTestApp } from "./helpers"

describe("{Entity} routes", () => {
  it("GET /v1/{entities} returns list", async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: "GET", url: "/v1/{entities}", headers: authHeaders })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toBeInstanceOf(Array)
  })

  it("POST /v1/{entities} creates new entity", async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: "POST", url: "/v1/{entities}", headers: authHeaders,
      payload: { name: "Test" },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.name).toBe("Test")
  })

  it("POST /v1/{entities} rejects invalid input", async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: "POST", url: "/v1/{entities}", headers: authHeaders,
      payload: { name: "" }, // too short
    })
    expect(res.statusCode).toBe(400)
  })
})
```

### Step 5: Verify backend
```bash
pnpm typecheck --filter=@biosync-io/api
pnpm test --filter=@biosync-io/api
pnpm exec biome ci apps/api/
```

## Frontend Implementation

### Step 6: Dashboard Page

Create `apps/web/src/app/dashboard/{entity}/page.tsx`:

```tsx
import { apiGet } from "@/lib/api"

export default async function EntityPage() {
  const entities = await apiGet<Entity[]>("/{entities}")

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Entities</h1>
      {entities.length > 0 ? (
        <EntityList entities={entities} />
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No entities yet. Create your first one.
        </div>
      )}
    </div>
  )
}
```

Add `loading.tsx` and `error.tsx` alongside.

### Step 7: Verify frontend
```bash
pnpm typecheck --filter=@biosync-io/web
pnpm build --filter=@biosync-io/web
```

## Verification Checklist

**ALL must be true:**
- [ ] Database schema created with indexes
- [ ] Migration generated and reviewed
- [ ] Service layer with AppError for error cases
- [ ] Route handler with Zod validation on all inputs
- [ ] Response format: `{ data }` envelope
- [ ] Tests cover happy path + validation errors
- [ ] Frontend page with loading + error states
- [ ] TypeScript, Biome, and tests all pass
