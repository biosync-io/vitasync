---
description: "Garmin provider adapter — OAuth 1.0a, HR/steps/sleep/HRV/stress data sync"
phase: 1
feature: "garmin-adapter"
depends_on: ["provider-core", "oauth-flow"]
---

# Garmin Provider Adapter

## Context

Garmin uses **OAuth 1.0a** (not OAuth 2.0) and provides health data via push-based webhooks and pull-based REST APIs. The Garmin Health API exposes daily summaries, activity details, sleep, heart rate, HRV, stress, and body composition data. VitaSync's Garmin adapter extends `OAuth1Provider` from `@biosync-io/provider-core`.

**Garmin API base URL:** `https://apis.garmin.com/wellness-api/rest`
**Auth:** OAuth 1.0a three-legged flow — request token → user authorization → verifier exchange.
**Rate limits:** Garmin enforces per-app rate limits; use conservative request pacing.
**Webhook support:** Garmin pushes data to a registered webhook URL; the adapter should support both push and pull modes.

## Engineering Rules

- **Extend `OAuth1Provider`** — implement `getRequestToken()`, `getAuthorizationUrl()`, `exchangeVerifier()`, `syncData()`.
- **OAuth 1.0a signing** — every API request must include OAuth signature (HMAC-SHA1). Use the `oauth-1.0a` npm package or implement signing.
- **Zod schemas** — validate every Garmin API response before processing.
- **AsyncGenerator** — `syncData()` yields `SyncDataPoint` items via `async *` generator.
- **Circuit breaker** — external API calls are wrapped at the worker level, not inside the adapter.
- **Graceful degradation** — skip registration if `GARMIN_CONSUMER_KEY` / `GARMIN_CONSUMER_SECRET` are missing.
- **No `console.log`** — use structured logging from the worker/caller context.
- **Provider definition** — declare supported metrics: `STEPS`, `HEART_RATE`, `RESTING_HEART_RATE`, `HEART_RATE_VARIABILITY`, `SLEEP`, `STRESS`, `CALORIES`, `DISTANCE`, `FLOORS`, `ACTIVE_MINUTES`, `BLOOD_OXYGEN`, `RESPIRATORY_RATE`, `BODY_FAT`, `WEIGHT`.

## What to Build

### 1. Provider Definition

```typescript
// packages/providers/garmin/src/index.ts
import { OAuth1Provider, providerRegistry } from "@biosync-io/provider-core"
import type { ProviderDefinition, SyncDataPoint, SyncOptions, OAuth1Tokens } from "@biosync-io/types"
import { HealthMetricType } from "@biosync-io/types"

const GARMIN_DEFINITION: ProviderDefinition = {
  id: "garmin",
  name: "Garmin",
  description: "Sync activity, sleep, heart rate, HRV, and stress data from Garmin Connect",
  logoUrl: "https://vitasync.dev/provider-logos/garmin.svg",
  capabilities: {
    supportedMetrics: [
      HealthMetricType.STEPS,
      HealthMetricType.HEART_RATE,
      HealthMetricType.RESTING_HEART_RATE,
      HealthMetricType.HEART_RATE_VARIABILITY,
      HealthMetricType.SLEEP,
      HealthMetricType.STRESS,
      HealthMetricType.CALORIES,
      HealthMetricType.DISTANCE,
      HealthMetricType.FLOORS,
      HealthMetricType.ACTIVE_MINUTES,
      HealthMetricType.BLOOD_OXYGEN,
      HealthMetricType.RESPIRATORY_RATE,
      HealthMetricType.BODY_FAT,
      HealthMetricType.WEIGHT,
    ],
    supportsWebhooks: true,
    oauth2: false,
    oauth1: true,
    minSyncIntervalSeconds: 900, // 15 minutes
  },
  docsUrl: "https://developer.garmin.com/gc-developer-program/overview/",
}
```

### 2. OAuth 1.0a Implementation

```typescript
export class GarminProvider extends OAuth1Provider {
  readonly definition = GARMIN_DEFINITION

  async getRequestToken(): Promise<{ requestToken: string; requestTokenSecret: string }> {
    // POST to Garmin request token URL with OAuth 1.0a signature
    // Parse response: oauth_token, oauth_token_secret
  }

  getAuthorizationUrl(requestToken: string): URL {
    const url = new URL("https://connect.garmin.com/oauthConfirm")
    url.searchParams.set("oauth_token", requestToken)
    return url
  }

  async exchangeVerifier(
    requestToken: string,
    requestTokenSecret: string,
    verifier: string,
  ): Promise<OAuth1Tokens> {
    // POST to Garmin access token URL with verifier + OAuth 1.0a signature
  }

  async *syncData(
    tokens: OAuth1Tokens,
    options?: SyncOptions,
  ): AsyncGenerator<SyncDataPoint, void, undefined> {
    const from = options?.startDate ?? new Date(Date.now() - 7 * 86_400_000)
    const to = options?.endDate ?? new Date()
    const requestedTypes = options?.dataTypes

    // Fetch daily summaries
    if (!requestedTypes || requestedTypes.includes(HealthMetricType.STEPS)) {
      yield* this.fetchDailySummaries(tokens, from, to)
    }

    // Fetch heart rate data
    if (!requestedTypes || requestedTypes.includes(HealthMetricType.HEART_RATE)) {
      yield* this.fetchHeartRate(tokens, from, to)
    }

    // Fetch sleep data
    if (!requestedTypes || requestedTypes.includes(HealthMetricType.SLEEP)) {
      yield* this.fetchSleep(tokens, from, to)
    }

    // Fetch HRV data
    if (!requestedTypes || requestedTypes.includes(HealthMetricType.HEART_RATE_VARIABILITY)) {
      yield* this.fetchHrv(tokens, from, to)
    }

    // Fetch stress data
    if (!requestedTypes || requestedTypes.includes(HealthMetricType.STRESS)) {
      yield* this.fetchStress(tokens, from, to)
    }
  }
}
```

### 3. Data Fetchers (Private Methods)

Each fetcher is a private `async *` generator that:
1. Makes a signed OAuth 1.0a request to the Garmin endpoint.
2. Validates the response with a Zod schema.
3. Maps vendor fields to `SyncDataPoint` shape.
4. Yields individual data points.

**Garmin API endpoints:**
- Daily summaries: `GET /dailies?uploadStartTimeInSeconds=...&uploadEndTimeInSeconds=...`
- Heart rate: `GET /heartRates?uploadStartTimeInSeconds=...&uploadEndTimeInSeconds=...`
- Sleep: `GET /sleeps?uploadStartTimeInSeconds=...&uploadEndTimeInSeconds=...`
- Stress: `GET /stressDetails?uploadStartTimeInSeconds=...&uploadEndTimeInSeconds=...`
- HRV: `GET /hrv?uploadStartTimeInSeconds=...&uploadEndTimeInSeconds=...`

### 4. Zod Response Schemas

Define strict Zod schemas for each Garmin API response type. Example:

```typescript
const GarminDailySummary = z.object({
  summaryId: z.string(),
  calendarDate: z.string(),
  steps: z.number().optional(),
  distanceInMeters: z.number().optional(),
  activeTimeInSeconds: z.number().optional(),
  floorsClimbed: z.number().optional(),
  activeKilocalories: z.number().optional(),
  restingHeartRateInBeatsPerMinute: z.number().optional(),
  maxHeartRateInBeatsPerMinute: z.number().optional(),
  averageStressLevel: z.number().optional(),
  stepsGoal: z.number().optional(),
})
```

### 5. Registration

```typescript
export function registerGarminProvider() {
  const consumerKey = process.env.GARMIN_CONSUMER_KEY
  const consumerSecret = process.env.GARMIN_CONSUMER_SECRET
  const redirectUri = process.env.OAUTH_REDIRECT_URI ?? "https://vitasync.dev/api/v1/providers/garmin/callback"

  if (!consumerKey || !consumerSecret) return // Graceful skip

  providerRegistry.register(GARMIN_DEFINITION, () =>
    new GarminProvider({ consumerKey, consumerSecret, redirectUri }),
  )
}
```

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `packages/providers/garmin/src/index.ts` | Create | `GarminProvider` class + registration |
| `packages/providers/garmin/src/schemas.ts` | Create | Zod schemas for Garmin API responses |
| `packages/providers/garmin/src/oauth-signer.ts` | Create | OAuth 1.0a request signing utility |
| `packages/providers/garmin/package.json` | Create | `@biosync-io/provider-garmin` package |
| `packages/providers/garmin/tsconfig.json` | Create | Extends root `tsconfig.base.json` |
| `apps/worker/src/lib/providers.ts` | Edit | Import and call `registerGarminProvider()` |

## Verification Checklist

```bash
# 1. TypeScript compiles
pnpm typecheck

# 2. Biome linting passes
pnpm exec biome ci .

# 3. Tests pass
pnpm --filter @biosync-io/provider-garmin test

# 4. Audit for violations
audit_code packages/providers/garmin/src/

# 5. Verify graceful degradation
# Worker starts without GARMIN_CONSUMER_KEY set — no crash

# 6. Verify OAuth 1.0a signing produces valid signatures (unit test)
```
