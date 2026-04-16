---
description: "Fitbit provider adapter — OAuth 2.0 + PKCE, HR/steps/sleep/HRV/SpO2 data sync"
phase: 1
feature: "fitbit-adapter"
depends_on: ["provider-core", "oauth-flow"]
---

# Fitbit Provider Adapter

## Context

Fitbit uses **OAuth 2.0 with PKCE** (Proof Key for Code Exchange) and provides health data via a well-documented REST API. The Fitbit Web API exposes intraday time series, daily summaries, sleep logs, SpO2, HRV, heart rate, and activity data. VitaSync's Fitbit adapter extends `OAuth2Provider` from `@biosync-io/provider-core`.

**Fitbit API base URL:** `https://api.fitbit.com`
**Auth:** OAuth 2.0 Authorization Code with PKCE (SHA-256 code challenge).
**Rate limits:** 150 requests per hour per user token. Must implement request budgeting.
**Token lifetime:** Access tokens expire after 8 hours; refresh tokens are long-lived.

## Engineering Rules

- **Extend `OAuth2Provider`** — implement `getAuthorizationUrl()`, `exchangeCode()`, `refreshTokens()`, `syncData()`.
- **PKCE required** — generate a `code_verifier` (43-128 chars) and `code_challenge` (SHA-256 base64url). Store the verifier alongside the OAuth state.
- **Rate limit budgeting** — track the `Fitbit-Rate-Limit-Remaining` response header. Pause/yield when approaching the 150 req/hr limit.
- **Zod schemas** — validate every Fitbit API response before processing.
- **AsyncGenerator** — `syncData()` yields `SyncDataPoint` items via `async *` generator.
- **Circuit breaker** — external API calls are wrapped at the worker level.
- **Graceful degradation** — skip registration if `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` are missing.
- **No `console.log`** — use structured logging from the worker/caller context.
- **Provider definition** — declare supported metrics: `STEPS`, `HEART_RATE`, `RESTING_HEART_RATE`, `HEART_RATE_VARIABILITY`, `SLEEP`, `SLEEP_SCORE`, `CALORIES`, `DISTANCE`, `FLOORS`, `ACTIVE_MINUTES`, `BLOOD_OXYGEN`, `SPO2`, `RESPIRATORY_RATE`, `WEIGHT`, `BODY_FAT`, `BMI`.

## What to Build

### 1. Provider Definition

```typescript
// packages/providers/fitbit/src/index.ts
import { OAuth2Provider, providerRegistry } from "@biosync-io/provider-core"
import type { ProviderDefinition, OAuthTokens, SyncDataPoint, SyncOptions } from "@biosync-io/types"
import { HealthMetricType } from "@biosync-io/types"

const FITBIT_DEFINITION: ProviderDefinition = {
  id: "fitbit",
  name: "Fitbit",
  description: "Sync activity, sleep, heart rate, HRV, and SpO2 data from Fitbit",
  logoUrl: "https://vitasync.dev/provider-logos/fitbit.svg",
  capabilities: {
    supportedMetrics: [
      HealthMetricType.STEPS,
      HealthMetricType.HEART_RATE,
      HealthMetricType.RESTING_HEART_RATE,
      HealthMetricType.HEART_RATE_VARIABILITY,
      HealthMetricType.SLEEP,
      HealthMetricType.SLEEP_SCORE,
      HealthMetricType.CALORIES,
      HealthMetricType.DISTANCE,
      HealthMetricType.FLOORS,
      HealthMetricType.ACTIVE_MINUTES,
      HealthMetricType.SPO2,
      HealthMetricType.RESPIRATORY_RATE,
      HealthMetricType.WEIGHT,
      HealthMetricType.BODY_FAT,
      HealthMetricType.BMI,
    ],
    supportsWebhooks: true,
    oauth2: true,
    oauth1: false,
    minSyncIntervalSeconds: 300, // 5 minutes
  },
  docsUrl: "https://dev.fitbit.com/build/reference/web-api/",
}
```

### 2. PKCE Implementation

```typescript
import { createHash, randomBytes } from "node:crypto"

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url") // 43 chars
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}
```

### 3. OAuth 2.0 + PKCE Flow

```typescript
export class FitbitProvider extends OAuth2Provider {
  readonly definition = FITBIT_DEFINITION

  getAuthorizationUrl(state: string): URL {
    // Generate code_verifier + code_challenge
    // Store code_verifier alongside state (e.g., in Redis or encoded in state token)
    const url = new URL("https://www.fitbit.com/oauth2/authorize")
    url.searchParams.set("client_id", this.config.clientId)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("redirect_uri", this.config.redirectUri)
    url.searchParams.set("scope", "activity heartrate sleep profile oxygen_saturation respiratory_rate weight")
    url.searchParams.set("state", state)
    url.searchParams.set("code_challenge", codeChallenge)
    url.searchParams.set("code_challenge_method", "S256")
    return url
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    // POST https://api.fitbit.com/oauth2/token
    // Include code_verifier in the request body
    // Authorization header: Basic base64(client_id:client_secret)
  }

  async refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> {
    // POST https://api.fitbit.com/oauth2/token
    // grant_type=refresh_token
  }

  async revokeTokens(tokens: OAuthTokens): Promise<void> {
    // POST https://api.fitbit.com/oauth2/revoke
  }
}
```

### 4. Data Sync with Rate Limit Budgeting

```typescript
async *syncData(
  tokens: OAuthTokens,
  options?: SyncOptions,
): AsyncGenerator<SyncDataPoint, void, undefined> {
  const from = options?.startDate ?? new Date(Date.now() - 7 * 86_400_000)
  const to = options?.endDate ?? new Date()
  const requestedTypes = options?.dataTypes

  // Rate limit tracker
  let remainingRequests = 150

  const fetchWithRateLimit = async (url: string) => {
    if (remainingRequests <= 5) {
      // Wait until rate limit window resets (Fitbit resets hourly)
      const resetTime = /* parse Fitbit-Rate-Limit-Reset header */
      await sleep(resetTime * 1000)
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
    remainingRequests = Number(res.headers.get("Fitbit-Rate-Limit-Remaining") ?? remainingRequests - 1)
    return res
  }

  // Iterate day by day (Fitbit API is date-based)
  for (const date of eachDay(from, to)) {
    const dateStr = formatDate(date) // "YYYY-MM-DD"

    if (!requestedTypes || requestedTypes.includes(HealthMetricType.STEPS)) {
      yield* this.fetchActivity(tokens, dateStr, fetchWithRateLimit)
    }

    if (!requestedTypes || requestedTypes.includes(HealthMetricType.HEART_RATE)) {
      yield* this.fetchHeartRate(tokens, dateStr, fetchWithRateLimit)
    }

    if (!requestedTypes || requestedTypes.includes(HealthMetricType.SLEEP)) {
      yield* this.fetchSleep(tokens, dateStr, fetchWithRateLimit)
    }

    if (!requestedTypes || requestedTypes.includes(HealthMetricType.SPO2)) {
      yield* this.fetchSpO2(tokens, dateStr, fetchWithRateLimit)
    }

    if (!requestedTypes || requestedTypes.includes(HealthMetricType.HEART_RATE_VARIABILITY)) {
      yield* this.fetchHrv(tokens, dateStr, fetchWithRateLimit)
    }
  }
}
```

### 5. Zod Response Schemas

```typescript
// packages/providers/fitbit/src/schemas.ts
const FitbitActivitySummary = z.object({
  summary: z.object({
    steps: z.number(),
    caloriesOut: z.number(),
    distances: z.array(z.object({
      activity: z.string(),
      distance: z.number(),
    })),
    floors: z.number().optional(),
    fairlyActiveMinutes: z.number(),
    veryActiveMinutes: z.number(),
    restingHeartRate: z.number().optional(),
  }),
})

const FitbitSleepLog = z.object({
  sleep: z.array(z.object({
    dateOfSleep: z.string(),
    duration: z.number(),
    efficiency: z.number(),
    isMainSleep: z.boolean(),
    levels: z.object({
      summary: z.object({
        deep: z.object({ minutes: z.number() }).optional(),
        light: z.object({ minutes: z.number() }).optional(),
        rem: z.object({ minutes: z.number() }).optional(),
        wake: z.object({ minutes: z.number() }).optional(),
      }),
    }),
    minutesAsleep: z.number(),
    startTime: z.string(),
    endTime: z.string(),
  })),
})

const FitbitHeartRateIntraday = z.object({
  "activities-heart-intraday": z.object({
    dataset: z.array(z.object({
      time: z.string(),
      value: z.number(),
    })),
    datasetInterval: z.number(),
  }),
})

const FitbitSpO2 = z.object({
  dateTime: z.string(),
  value: z.object({
    avg: z.number(),
    min: z.number(),
    max: z.number(),
  }),
})

const FitbitHrvSummary = z.object({
  hrv: z.array(z.object({
    dateTime: z.string(),
    value: z.object({
      dailyRmssd: z.number(),
      deepRmssd: z.number().optional(),
    }),
  })),
})
```

### 6. Registration

```typescript
export function registerFitbitProvider() {
  const clientId = process.env.FITBIT_CLIENT_ID
  const clientSecret = process.env.FITBIT_CLIENT_SECRET
  const redirectUri = process.env.OAUTH_REDIRECT_URI ?? "https://vitasync.dev/api/v1/providers/fitbit/callback"

  if (!clientId || !clientSecret) return // Graceful skip

  providerRegistry.register(FITBIT_DEFINITION, () =>
    new FitbitProvider({ clientId, clientSecret, redirectUri }),
  )
}
```

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `packages/providers/fitbit/src/index.ts` | Create | `FitbitProvider` class + registration |
| `packages/providers/fitbit/src/schemas.ts` | Create | Zod schemas for Fitbit API responses |
| `packages/providers/fitbit/src/rate-limiter.ts` | Create | Rate limit budget tracker (150 req/hr) |
| `packages/providers/fitbit/package.json` | Create | `@biosync-io/provider-fitbit` package |
| `packages/providers/fitbit/tsconfig.json` | Create | Extends root `tsconfig.base.json` |
| `apps/worker/src/lib/providers.ts` | Edit | Import and call `registerFitbitProvider()` |

## Verification Checklist

```bash
# 1. TypeScript compiles
pnpm typecheck

# 2. Biome linting passes
pnpm exec biome ci .

# 3. Tests pass
pnpm --filter @biosync-io/provider-fitbit test

# 4. Audit for violations
audit_code packages/providers/fitbit/src/

# 5. Verify PKCE code_verifier/code_challenge generation (unit test)

# 6. Verify graceful degradation
# Worker starts without FITBIT_CLIENT_ID set — no crash

# 7. Verify rate limit headers are parsed correctly (unit test)
```
