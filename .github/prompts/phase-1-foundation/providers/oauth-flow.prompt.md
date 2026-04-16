---
description: "OAuth 2.0 connect/disconnect/refresh flow with AES-256-GCM token encryption"
phase: 1
feature: "oauth-flow"
depends_on: ["provider-core"]
---

# OAuth Flow — Connect, Disconnect & Token Refresh

## Context

VitaSync uses OAuth 2.0 (and OAuth 1.0a for Garmin) to connect users to their wearable data providers. The API exposes routes for initiating authorization, handling the callback, and disconnecting. OAuth tokens are **encrypted at rest** with AES-256-GCM using the `ENCRYPTION_KEY` from validated env config. Token refresh happens at sync time in the worker, but the API routes handle the initial connect/disconnect lifecycle.

**Key tables:** `provider_connections` (stores encrypted tokens, connection status, provider metadata).
**Key packages:** `@biosync-io/provider-core` (registry, provider classes), `@biosync-io/db` (Drizzle schema).

## Engineering Rules

- **Zod validation** on all route inputs — `providerId` param, callback `code`/`state` query params.
- **AES-256-GCM encryption** — `encrypt(plaintext, key)` / `decrypt(ciphertext, key)` from `apps/api/src/lib/crypto.ts`. Never store tokens in plaintext.
- **CSRF protection** — generate a random `state` value, store it in a short-lived session/cookie, verify on callback.
- **Provider registry** — resolve the provider instance via `providerRegistry.resolve(providerId)`.
- **`request.workspaceId`** — from JWT auth plugin. All connection records are scoped to the workspace.
- **`AppError`** for error responses — `AppError.notFound()`, `AppError.validation()`, etc.
- **No breaking v1 changes** — additive only.
- **Logging** — `request.log.info(...)` / `request.log.error(...)`, never `console.log`.

## What to Build

### 1. Connect Route — `GET /v1/providers/:providerId/auth`

Initiates the OAuth flow by redirecting the user to the provider's authorization page.

```typescript
// apps/api/src/routes/v1/providers.ts (or oauth.ts)
app.get("/:providerId/auth", async (request, reply) => {
  const { providerId } = z.object({ providerId: z.string() }).parse(request.params)

  const provider = providerRegistry.resolve(providerId)
  // Generate CSRF state, store in short-lived cookie / Redis
  const state = generateState({ workspaceId: request.workspaceId, providerId })

  if (provider instanceof OAuth2Provider) {
    const url = provider.getAuthorizationUrl(state)
    return reply.redirect(url.toString())
  }

  if (provider instanceof OAuth1Provider) {
    const { requestToken, requestTokenSecret } = await provider.getRequestToken()
    // Store requestTokenSecret in Redis keyed by requestToken
    const url = provider.getAuthorizationUrl(requestToken)
    return reply.redirect(url.toString())
  }
})
```

### 2. Callback Route — `GET /v1/providers/:providerId/callback`

Handles the redirect from the provider, exchanges the code for tokens, encrypts and stores them.

```typescript
app.get("/:providerId/callback", async (request, reply) => {
  const { providerId } = z.object({ providerId: z.string() }).parse(request.params)
  const { code, state } = z.object({
    code: z.string(),
    state: z.string(),
  }).parse(request.query)

  // 1. Verify CSRF state
  const statePayload = verifyState(state)
  if (!statePayload || statePayload.providerId !== providerId) {
    throw AppError.validation("Invalid or expired OAuth state")
  }

  // 2. Exchange code for tokens
  const provider = providerRegistry.resolve(providerId)
  const tokens = await (provider as OAuth2Provider).exchangeCode(code)

  // 3. Encrypt tokens
  const encryptedTokens = encrypt(JSON.stringify(tokens), env.ENCRYPTION_KEY)

  // 4. Upsert provider_connections record
  await db
    .insert(providerConnections)
    .values({
      workspaceId: statePayload.workspaceId,
      providerId,
      status: "active",
      encryptedTokens,
      scopes: tokens.raw?.scope ? String(tokens.raw.scope).split(" ") : [],
    })
    .onConflictDoUpdate({
      target: [providerConnections.workspaceId, providerConnections.providerId],
      set: { encryptedTokens, status: "active", updatedAt: new Date() },
    })

  // 5. Redirect to frontend success page
  return reply.redirect(`${env.WEB_URL}/connections?connected=${providerId}`)
})
```

### 3. Disconnect Route — `DELETE /v1/connections/:connectionId`

Revokes the token at the provider (if supported), then soft-deletes the connection.

```typescript
app.delete("/:connectionId", async (request) => {
  const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(request.params)

  const connection = await connectionService.getById(connectionId, request.workspaceId)

  // Attempt token revocation at provider (best-effort)
  try {
    const provider = providerRegistry.resolve(connection.providerId)
    if ("revokeTokens" in provider && provider.revokeTokens) {
      const tokens = JSON.parse(decrypt(connection.encryptedTokens, env.ENCRYPTION_KEY))
      await provider.revokeTokens(tokens)
    }
  } catch (err) {
    request.log.warn({ err, connectionId }, "Token revocation failed (best-effort)")
  }

  await connectionService.updateStatus(connectionId, request.workspaceId, "revoked")
  return { data: { success: true } }
})
```

### 4. Token Encryption Utilities (`apps/api/src/lib/crypto.ts`)

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex")
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

export function decrypt(ciphertext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex")
  const buf = Buffer.from(ciphertext, "base64")
  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final("utf8")
}
```

### 5. OAuth State Management

- Generate a signed, short-lived state token containing `{ workspaceId, providerId, expiresAt }`.
- Use HMAC-SHA256 with `JWT_SECRET` to sign and verify the state.
- Expiration: 10 minutes.

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/routes/v1/providers.ts` | Create/Edit | OAuth connect + callback routes |
| `apps/api/src/routes/v1/connections.ts` | Create/Edit | Disconnect + connection management routes |
| `apps/api/src/lib/crypto.ts` | Create/Verify | AES-256-GCM `encrypt()` / `decrypt()` |
| `apps/api/src/lib/oauth-state.ts` | Create | `generateState()` / `verifyState()` with HMAC signing |
| `apps/api/src/services/connection.service.ts` | Create/Edit | Connection CRUD + status updates |
| `apps/api/src/routes/v1/index.ts` | Edit | Register new route prefixes |
| `packages/db/src/schema/provider-connections.ts` | Verify | Ensure `encryptedTokens` column exists |

## Verification Checklist

```bash
# 1. TypeScript compiles
pnpm typecheck

# 2. Biome linting passes
pnpm exec biome ci .

# 3. Tests pass
pnpm --filter @biosync-io/api test

# 4. Audit for violations
audit_code apps/api/src/routes/v1/providers.ts
audit_code apps/api/src/lib/crypto.ts

# 5. Verify no secrets in code
grep -r "ENCRYPTION_KEY\s*=" apps/api/src/ --include="*.ts" | grep -v "env\."

# 6. Test crypto round-trip
# Write a test: encrypt then decrypt returns original plaintext
```
