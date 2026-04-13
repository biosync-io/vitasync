---
description: "Phase 2 — API hardening: Zod on every route, consistent responses, OpenAPI generation"
---

# Phase 2: API Hardening

**Branch:** `refactor/codebase-hardening`
**Depends on:** Phase 0 (AppError), Phase 1 (Service cleanup)

**Read these ENGINEERING_GUIDELINES.md sections before starting:**
- §4 (API Backend Guidelines — all subsections)
- §11 (Security — Input validation)

## Problem

- Not all 51 routes have Zod validation on inputs
- Response format varies (some return `{ data }`, some return raw arrays)
- Error responses are inconsistent
- No auto-generated API docs

## What to Build

### 1. Audit Zod Coverage

```bash
# Route files that DON'T import Zod
find apps/api/src/routes/v1 -name "*.ts" ! -name "*.test.*" \
  -exec grep -L 'from "zod"' {} \;

# Route handlers that use request.body without .parse()
grep -rnA3 "request\.body" apps/api/src/routes/v1/ --include="*.ts" | grep -v "parse\|schema"

# Route handlers that use request.query without validation
grep -rnA3 "request\.query" apps/api/src/routes/v1/ --include="*.ts" | grep -v "parse\|schema"

# Route handlers that use request.params without validation
grep -rnA3 "request\.params" apps/api/src/routes/v1/ --include="*.ts" | grep -v "parse\|schema"
```

### 2. Add Zod Validation to Every Route

For each route file missing validation:

```typescript
// Before (unsafe)
app.post("/", async (request) => {
  const { name, providerId } = request.body as any
  // ...
})

// After (validated)
const createSchema = z.object({
  name: z.string().min(1).max(100),
  providerId: z.string().min(1),
})

app.post("/", async (request) => {
  const body = createSchema.parse(request.body)
  // body is now typed and validated
})
```

**Validation rules:**
- `request.body` → always `schema.parse(request.body)`
- `request.query` → always validate with coercion (`z.coerce.number()`)
- `request.params` → always validate (especially UUIDs: `z.string().uuid()`)
- Pagination: standardized `z.object({ limit: z.coerce.number().min(1).max(100).default(50), offset: z.coerce.number().min(0).default(0) })`

### 3. Standardize Response Envelope

Create a Fastify response helper plugin:

```typescript
// apps/api/src/lib/response.ts
export function success<T>(data: T) {
  return { data }
}

export function paginated<T>(data: T[], meta: { total: number; limit: number; offset: number }) {
  return { data, meta }
}
```

Ensure ALL route handlers return `{ data }` format:

```bash
# Find routes returning raw arrays or objects (not wrapped in { data })
grep -rn "return \[" apps/api/src/routes/v1/ --include="*.ts"
grep -rn "return {" apps/api/src/routes/v1/ --include="*.ts" | grep -v "data:"
```

### 4. Standardize Error Handler

Ensure the Fastify error handler in `apps/api/src/plugins/` handles:

```typescript
// AppError → return { error, code } with correct status
// ZodError → return { error: "Validation error", code: "VALIDATION_ERROR", details: issues }
// Unknown → return { error: "Internal server error", code: "INTERNAL_ERROR" } + log full error
```

### 5. Shared Pagination Schema

Create a reusable pagination schema:

```typescript
// apps/api/src/lib/schemas.ts
export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
})

export const workspaceQuerySchema = z.object({
  workspaceId: z.string().uuid().optional(),
})
```

### 6. OpenAPI/Swagger Integration

If not already present, add `@fastify/swagger` + `@fastify/swagger-ui`:

```typescript
// apps/api/src/server.ts
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"

app.register(swagger, {
  openapi: {
    info: {
      title: "VitaSync API",
      version: "1.0.0",
      description: "Unified wearable health data aggregation API",
    },
  },
})
app.register(swaggerUi, { routePrefix: "/docs" })
```

## Verification

```bash
# Type check
pnpm typecheck

# ALL tests pass (route tests exercise the validation)
pnpm test --filter=@biosync-io/api

# Biome
pnpm exec biome ci .

# Verify: no unvalidated request.body
grep -rn "request\.body" apps/api/src/routes/v1/ --include="*.ts" | grep -v "parse\|schema\|test"
# Should be 0

# Verify: all routes return { data }
grep -rn "return {" apps/api/src/routes/v1/ --include="*.ts" | grep -v "data:\|error:\|test"
# Should be 0
```

## Acceptance Criteria

- [ ] Every route handler validates inputs with Zod
- [ ] Shared pagination, UUID, and workspace schemas
- [ ] All routes return `{ data }` or `{ data, meta }` envelope
- [ ] Error handler returns `{ error, code }` consistently
- [ ] Swagger/OpenAPI docs available at `/docs` (if not already)
- [ ] All 45 API tests still pass
