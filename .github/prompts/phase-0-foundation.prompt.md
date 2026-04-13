---
description: "Phase 0 — Foundation: unified error handling, config validation, shared logger, error codes"
---

# Phase 0: Foundation & Error Standards

**Branch:** `refactor/codebase-hardening`

**Read these ENGINEERING_GUIDELINES.md sections before starting:**
- §3 (TypeScript Conventions)
- §4 (API Backend Guidelines — Error responses, status codes)
- §9 (Error Handling & Resilience)
- §12 (Observability — Structured logging)

## Problem

Error handling is inconsistent across the codebase:
- Some services throw plain `Error`, others throw custom errors
- Error codes are not standardized
- Config validation varies between apps
- Logging patterns differ (some use console.log, some use Pino)

## What to Build

### 1. Unified Error System (`packages/types/src/errors.ts`)

Create a shared `AppError` class and standardized error codes:

```typescript
export enum ErrorCode {
  // Client errors
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  RATE_LIMITED = "RATE_LIMITED",

  // Provider errors
  PROVIDER_ERROR = "PROVIDER_ERROR",
  PROVIDER_AUTH_FAILED = "PROVIDER_AUTH_FAILED",
  PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED",
  PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  TOKEN_REFRESH_FAILED = "TOKEN_REFRESH_FAILED",

  // Data errors
  SYNC_FAILED = "SYNC_FAILED",
  DATA_INTEGRITY_ERROR = "DATA_INTEGRITY_ERROR",
  ENCRYPTION_ERROR = "ENCRYPTION_ERROR",

  // System errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  DATABASE_ERROR = "DATABASE_ERROR",
  QUEUE_ERROR = "QUEUE_ERROR",
}

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "AppError"
  }

  static notFound(resource: string, id?: string): AppError {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`
    return new AppError(msg, ErrorCode.NOT_FOUND, 404)
  }

  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, ErrorCode.VALIDATION_ERROR, 400, details)
  }

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError(message, ErrorCode.UNAUTHORIZED, 401)
  }

  static forbidden(message = "Insufficient permissions"): AppError {
    return new AppError(message, ErrorCode.FORBIDDEN, 403)
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
    }
  }
}
```

Export from `packages/types/src/index.ts`.

### 2. Standardized Response Envelope (`packages/types/src/api.ts`)

Ensure the shared response types are consistent:

```typescript
export interface ApiResponse<T> {
  data: T
}

export interface ApiListResponse<T> {
  data: T[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

export interface ApiErrorResponse {
  error: string
  code: string
  details?: Record<string, unknown>
}
```

### 3. Config Validation Pattern

Audit each app's config and ensure Zod validation at startup:

**`apps/api/src/config.ts`** — should validate with Zod, fail fast on missing values
**`apps/worker/src/config.ts`** — same pattern
**`apps/mcp/src/config.ts`** — same pattern (if not already)

Pattern:
```typescript
import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

export const env = envSchema.parse(process.env)
export type Env = z.infer<typeof envSchema>
```

### 4. Shared Logger Factory

If not already centralized, create a shared logger setup:

```typescript
// In each app's startup
import pino from "pino"
import { env } from "./config"

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "development" && {
    transport: { target: "pino-pretty" },
  }),
})
```

### 5. Migrate Existing Error Usage

Search for and replace inconsistent error patterns:

```bash
# Find plain Error throws that should use AppError
grep -rn "throw new Error(" apps/api/src/services/ --include="*.ts"

# Find console.log in API/worker
grep -rn "console\.\(log\|warn\|error\)" apps/api/src/ apps/worker/src/ --include="*.ts" | grep -v __tests__ | grep -v node_modules

# Find services without proper error wrapping
grep -rn "catch (e)" apps/api/src/services/ --include="*.ts"
```

## Verification

```bash
# Types compile
pnpm typecheck --filter=@biosync-io/types

# All apps still compile
pnpm typecheck

# Tests still pass
pnpm test --filter=@biosync-io/types
pnpm test --filter=@biosync-io/api

# Biome clean
pnpm exec biome ci .
```

## Acceptance Criteria

- [ ] `AppError` class in `packages/types/` with static factory methods
- [ ] `ErrorCode` enum covers all current error scenarios
- [ ] API response types standardized in `packages/types/`
- [ ] Each app has Zod-validated config that fails fast
- [ ] No `console.log` in `apps/api/src/` or `apps/worker/src/` (outside tests)
- [ ] All verification commands pass
