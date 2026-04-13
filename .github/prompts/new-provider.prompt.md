---
description: "Template for adding a new health data provider integration (OAuth + sync + data normalization)"
---

# New Provider Template

Use this template when integrating a new wearable/health data provider (e.g., Garmin, Oura, Apple Health).

## Planning Phase

### 1. Research the provider API
- What OAuth flow does it use? (OAuth 2.0, OAuth 1.0a)
- What scopes/permissions are needed?
- What data endpoints are available? (activity, sleep, heart rate, etc.)
- What rate limits apply?
- What is the data format? (JSON, XML, etc.)

### 2. Check existing providers for patterns
```bash
# List existing providers
ls packages/providers/

# Look at a well-implemented provider for reference
ls packages/providers/fitbit/src/
cat packages/providers/fitbit/src/index.ts | head -50
```

## Implementation

### Step 1: Create Provider Package

```bash
mkdir -p packages/providers/{provider-name}/src
```

Create `packages/providers/{provider-name}/package.json`:
```json
{
  "name": "@biosync-io/provider-{provider-name}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@biosync-io/types": "workspace:*",
    "@biosync-io/circuit-breaker": "workspace:*"
  }
}
```

### Step 2: Implement Provider

```typescript
// packages/providers/{provider-name}/src/index.ts
import type { HealthProvider, ProviderConfig, SyncResult } from "@biosync-io/types"
import { CircuitBreaker } from "@biosync-io/circuit-breaker"

const API_BASE = "https://api.{provider}.com"

export class {Provider}Provider implements HealthProvider {
  private cb: CircuitBreaker
  private config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
    this.cb = new CircuitBreaker(`{provider}-api`, {
      failureThreshold: 5,
      resetTimeout: 60_000,
    })
  }

  // OAuth
  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "{required-scopes}",
      state,
    })
    return `${API_BASE}/oauth2/authorize?${params}`
  }

  async exchangeCode(code: string, redirectUri: string): Promise<TokenPair> {
    // Exchange authorization code for access + refresh tokens
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    // Refresh expired access token
  }

  // Data sync
  async syncData(accessToken: string, since?: Date): Promise<SyncResult> {
    return this.cb.execute(async () => {
      const activities = await this.fetchActivities(accessToken, since)
      const sleep = await this.fetchSleep(accessToken, since)
      const heartRate = await this.fetchHeartRate(accessToken, since)

      return {
        metrics: [
          ...this.normalizeActivities(activities),
          ...this.normalizeSleep(sleep),
          ...this.normalizeHeartRate(heartRate),
        ],
      }
    })
  }

  // Normalize provider-specific data to common schema
  private normalizeActivities(raw: ProviderActivity[]): HealthMetric[] {
    return raw.map(a => ({
      type: "activity",
      source: "{provider}",
      timestamp: new Date(a.startTime),
      data: {
        steps: a.steps,
        distance: a.distance,
        calories: a.calories,
        duration: a.duration,
        activityType: mapActivityType(a.type),
      },
    }))
  }
}

// Self-registration
export function register{Provider}Provider() {
  if (!process.env.{PROVIDER}_CLIENT_ID) {
    console.log("{Provider} provider disabled — missing credentials")
    return
  }
  providerRegistry.register("{provider}", new {Provider}Provider({
    clientId: process.env.{PROVIDER}_CLIENT_ID!,
    clientSecret: process.env.{PROVIDER}_CLIENT_SECRET!,
  }))
}
```

### Step 3: Add OAuth Routes (if not generic)

The generic OAuth routes in `apps/api/src/routes/v1/oauth.ts` should handle
most providers. Check if the new provider needs custom logic:

```bash
cat apps/api/src/routes/v1/oauth.ts | head -40
```

If the provider uses OAuth 1.0a or has non-standard flow, add provider-specific handling.

### Step 4: Register Provider in Worker

```typescript
// apps/worker/src/index.ts — add to provider initialization
import { register{Provider}Provider } from "@biosync-io/provider-{provider-name}"
register{Provider}Provider()
```

### Step 5: Add Environment Variables

Update `.env.example`:
```bash
# {Provider}
{PROVIDER}_CLIENT_ID=
{PROVIDER}_CLIENT_SECRET=
```

Update config validation in `apps/api/src/config.ts` and `apps/worker/src/config.ts`
(make them optional so the app doesn't fail if provider isn't configured).

### Step 6: Add Documentation

Create `apps/docs/src/content/docs/providers/{provider-name}.md`:
```markdown
---
title: {Provider} Setup
---

## Prerequisites
1. Create a developer account at {provider developer portal URL}
2. Create an OAuth application
3. Set callback URL to: `{your-domain}/v1/oauth/{provider}/callback`

## Configuration
Add to your `.env`:
- `{PROVIDER}_CLIENT_ID` — from developer portal
- `{PROVIDER}_CLIENT_SECRET` — from developer portal

## Supported Data
- ✅ Activity (steps, distance, calories)
- ✅ Sleep (duration, stages)
- ✅ Heart rate
- ❌ Blood oxygen (not available via API)
```

### Step 7: Tests

```typescript
// packages/providers/{provider-name}/src/__tests__/{provider}.test.ts
import { describe, it, expect, vi } from "vitest"
import { {Provider}Provider } from "../index"

describe("{Provider}Provider", () => {
  it("generates correct auth URL", () => {
    const provider = new {Provider}Provider(testConfig)
    const url = provider.getAuthUrl("http://localhost/callback", "test-state")
    expect(url).toContain("{provider}.com/oauth2/authorize")
    expect(url).toContain("client_id=test-id")
  })

  it("normalizes activity data to common schema", () => {
    const provider = new {Provider}Provider(testConfig)
    const raw = [{ steps: 10000, distance: 8.5, ... }]
    const normalized = provider.normalizeActivities(raw)
    expect(normalized[0].type).toBe("activity")
    expect(normalized[0].source).toBe("{provider}")
    expect(normalized[0].data.steps).toBe(10000)
  })

  it("handles rate limit errors via circuit breaker", async () => {
    // Mock fetch to return 429
    // Verify circuit breaker opens after threshold
  })
})
```

## Verification

```bash
# Type check
pnpm typecheck

# Provider tests
pnpm test --filter=@biosync-io/provider-{provider-name}

# Full test suite (no regressions)
pnpm test

# Biome
pnpm exec biome ci .
```

## Checklist

- [ ] Provider package created with proper package.json
- [ ] OAuth flow implemented (auth URL, code exchange, token refresh)
- [ ] Data sync with normalization to common schema
- [ ] Circuit breaker wrapping all external API calls
- [ ] Registered in worker startup
- [ ] Environment variables documented in .env.example
- [ ] Provider documentation page created
- [ ] Tests cover auth, normalization, and error handling
- [ ] All verification passes
