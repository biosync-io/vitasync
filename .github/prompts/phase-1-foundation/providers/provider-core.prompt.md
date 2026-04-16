---
description: "Base HealthDataProvider interface, ProviderRegistry, and core types for provider packages"
phase: 1
feature: "provider-core"
depends_on: []
---

# Provider Core — Base Interfaces & Registry

## Context

VitaSync aggregates health data from multiple wearable providers (Garmin, Fitbit, Strava, Whoop, Withings). Every provider shares the same abstract contract, token types, and registration mechanism. The core package lives in `packages/providers/core/` and is imported by every individual provider adapter. The worker resolves providers through the registry at sync time, and the API uses registry metadata to list available providers to the frontend.

**Existing types to reuse** (in `packages/types/`):
- `OAuthTokens`, `OAuth1Tokens`, `ProviderTokens` — token shapes
- `ProviderDefinition`, `ProviderCapabilities` — static metadata
- `ProviderConnection` — user-provider link
- `SyncOptions`, `SyncResult`, `SyncDataPoint` — sync operation types
- `HealthMetricType`, `MetricUnit`, `HealthMetric` — normalized metric types

## Engineering Rules

- **Abstract classes** — `OAuth2Provider` and `OAuth1Provider` are abstract; concrete adapters extend them.
- **Factory-based registry** — `providerRegistry.register(definition, factory)` stores a `ProviderFactory` (() => AnyProvider), resolved lazily.
- **Graceful degradation** — if a provider's env vars are missing, skip registration; never crash the process.
- **Zod validation** — validate all external API responses with Zod schemas inside provider adapters.
- **No `console.log`** — providers run inside the worker; use Pino structured logging.
- **No raw `fetch`** — external API calls go through the circuit breaker wrapper at the worker level.
- **AsyncGenerator for streaming** — `syncData()` must be an `async *` generator yielding `SyncDataPoint` items.
- **Token separation** — providers receive/return plain token objects. Encryption/decryption is handled by the worker layer.

## What to Build

### 1. Abstract Provider Classes (`packages/providers/core/src/provider.ts`)

```typescript
import type {
  OAuth1Tokens,
  OAuthTokens,
  ProviderDefinition,
  SyncDataPoint,
  SyncOptions,
} from "@biosync-io/types"

export interface OAuth2Config {
  authorizationUrl: string
  tokenUrl: string
  refreshUrl?: string
  scopes: string[]
}

export abstract class OAuth2Provider {
  abstract readonly definition: ProviderDefinition

  constructor(
    protected readonly config: {
      clientId: string
      clientSecret: string
      redirectUri: string
    },
  ) {}

  abstract getAuthorizationUrl(state: string): URL
  abstract exchangeCode(code: string): Promise<OAuthTokens>
  abstract refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens>
  abstract syncData(
    tokens: OAuthTokens,
    options?: SyncOptions,
  ): AsyncGenerator<SyncDataPoint, void, undefined>

  revokeTokens?(tokens: OAuthTokens): Promise<void>
  verifyWebhookSignature?(payload: Buffer, signature: string, secret: string): boolean
  processWebhook?(payload: unknown): Promise<SyncDataPoint[]>
}

export abstract class OAuth1Provider {
  abstract readonly definition: ProviderDefinition

  constructor(
    protected readonly config: {
      consumerKey: string
      consumerSecret: string
      redirectUri: string
    },
  ) {}

  abstract getRequestToken(): Promise<{ requestToken: string; requestTokenSecret: string }>
  abstract getAuthorizationUrl(requestToken: string): URL
  abstract exchangeVerifier(
    requestToken: string,
    requestTokenSecret: string,
    verifier: string,
  ): Promise<OAuth1Tokens>
  abstract syncData(
    tokens: OAuth1Tokens,
    options?: SyncOptions,
  ): AsyncGenerator<SyncDataPoint, void, undefined>
}

export type AnyProvider = OAuth2Provider | OAuth1Provider
```

### 2. Provider Registry (`packages/providers/core/src/registry.ts`)

```typescript
import type { ProviderDefinition } from "@biosync-io/types"
import type { AnyProvider } from "./provider.js"

type ProviderFactory = () => AnyProvider

interface RegisteredProvider {
  definition: ProviderDefinition
  factory: ProviderFactory
}

class ProviderRegistry {
  private readonly providers = new Map<string, RegisteredProvider>()

  register(definition: ProviderDefinition, factory: ProviderFactory): void
  resolve(id: string): AnyProvider
  getDefinition(id: string): ProviderDefinition | undefined
  listDefinitions(): ProviderDefinition[]
  isRegistered(id: string): boolean
  clear(): void // for testing
}

export const providerRegistry = new ProviderRegistry()
```

### 3. Utility Helpers (`packages/providers/core/src/utils.ts`)

- `buildTokenResponse(raw: unknown): OAuthTokens` — Zod-parse a token endpoint response into `OAuthTokens`.
- `isTokenExpired(tokens: OAuthTokens, bufferMs?: number): boolean` — check if a token is expired (default 5 min buffer).
- `buildAuthUrl(base: string, params: Record<string, string>): URL` — construct an authorization URL with query params.

### 4. Package Barrel Export (`packages/providers/core/src/index.ts`)

Re-export all public types and the `providerRegistry` singleton.

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `packages/providers/core/src/provider.ts` | Create/Verify | Abstract `OAuth2Provider`, `OAuth1Provider`, `AnyProvider` |
| `packages/providers/core/src/registry.ts` | Create/Verify | `ProviderRegistry` class + singleton `providerRegistry` |
| `packages/providers/core/src/utils.ts` | Create/Verify | Token parsing, expiry check, URL builder helpers |
| `packages/providers/core/src/index.ts` | Create/Verify | Barrel export for the package |
| `packages/providers/core/package.json` | Create/Verify | `@biosync-io/provider-core` package config |
| `packages/providers/core/tsconfig.json` | Create/Verify | Extends root `tsconfig.base.json` |

## Verification Checklist

```bash
# 1. TypeScript compiles
pnpm typecheck

# 2. Biome linting passes
pnpm exec biome ci .

# 3. Tests pass
pnpm --filter @biosync-io/provider-core test

# 4. Audit for violations
audit_code packages/providers/core/src/

# 5. Verify exports are importable
# Ensure @biosync-io/provider-core resolves in apps/worker and apps/api
```
