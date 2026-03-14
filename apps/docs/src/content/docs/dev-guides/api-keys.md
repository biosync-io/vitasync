---
title: API Keys
description: Create, scope, rotate, and revoke API keys for workspace access control.
---

import { Steps, Aside } from '@astrojs/starlight/components';

API keys are the primary authentication mechanism for the VitaSync API. This guide covers key lifecycle management — creation, scoping, rotation, and revocation.

## Key Format and Security

API keys follow the format:

```
vs_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- The `vs_live_` prefix makes VitaSync keys easy to identify in logs and secret scanners.
- The 32-character suffix is cryptographically random.
- Keys are stored as **SHA-256 hashes** — VitaSync cannot recover the raw key after issuance.
- The `keyPrefix` property (first 8 characters) is stored for identification in the absence of the full key.

## Scopes

Three scopes control what an API key is permitted to do:

| Scope | Permitted Operations |
|-------|---------------------|
| `read` | Query users, health data, events, personal records, connections, providers |
| `write` | Create/update users, trigger syncs, disconnect connections |
| `admin` | Create/delete API keys, manage webhooks, delete users, GDPR data deletion, key rotation |

Keys can have multiple scopes. Use the minimum set of scopes needed for a given integration.

## Creating a Key

Requires `admin` scope.

```bash
curl -X POST https://api.yourdomain.com/v1/api-keys \
  -H "Authorization: Bearer $VITASYNC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "backend-service",
    "scopes": ["read", "write"],
    "expiresAt": "2027-01-01T00:00:00.000Z"
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable label |
| `scopes` | `string[]` | Yes | One or more of `read`, `write`, `admin` |
| `expiresAt` | ISO 8601 | No | Key expiration date. Omit for a non-expiring key |

**Response** (`201 Created`):

```json
{
  "id": "01JA4MNPQR8STUVWXYZ12345",
  "name": "backend-service",
  "keyPrefix": "vs_live_ab",
  "scopes": ["read", "write"],
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "createdAt": "2025-06-01T12:00:00.000Z",
  "rawKey": "vs_live_abc123xyz789abcdef123456789012"
}
```

<Aside type="caution">
  The `rawKey` is only returned once at creation time. Store it immediately in a secrets manager — it cannot be retrieved again. VitaSync only stores the hash.
</Aside>

## Listing Keys

```bash
curl https://api.yourdomain.com/v1/api-keys \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Response:**

```json
[
  {
    "id": "01JA4MNPQR8STUVWXYZ12345",
    "name": "backend-service",
    "keyPrefix": "vs_live_ab",
    "scopes": ["read", "write"],
    "expiresAt": "2027-01-01T00:00:00.000Z",
    "lastUsedAt": "2025-06-15T09:31:00.000Z",
    "createdAt": "2025-06-01T12:00:00.000Z"
  },
  {
    "id": "01JA4MNPQR8STUVWXYZ99999",
    "name": "admin-key",
    "keyPrefix": "vs_live_ad",
    "scopes": ["read", "write", "admin"],
    "expiresAt": null,
    "lastUsedAt": "2025-06-15T10:00:00.000Z",
    "createdAt": "2025-05-01T08:00:00.000Z"
  }
]
```

The `rawKey` field is never included in list responses. The `keyPrefix` and `name` help identify which physical key corresponds to each record.

## Rotating a Key

Rotation atomically invalidates the old key and issues a new one. Requires `admin` scope.

Use rotation when you suspect a key has been compromised, or as part of a scheduled rotation policy.

```bash
curl -X POST https://api.yourdomain.com/v1/api-keys/01JA4MNPQR8STUVWXYZ12345/rotate \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Response** (`200 OK`):

```json
{
  "id": "01JA4MNPQR8STUVWXYZ99001",
  "name": "backend-service",
  "keyPrefix": "vs_live_cd",
  "scopes": ["read", "write"],
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "createdAt": "2025-06-15T11:00:00.000Z",
  "rawKey": "vs_live_cde456fgh789..."
}
```

The original key (`01JA4MNPQR8STUVWXYZ12345`) is immediately invalid after rotation. The new key inherits the same `name`, `scopes`, and `expiresAt`.

**Zero-downtime rotation pattern:**

<Steps>

1. Call `POST /v1/api-keys/:keyId/rotate` — get the new `rawKey` from the response.

2. Update the secret in your secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.).

3. Deploy or restart services that use the key — they will pick up the new value from the secrets manager.

4. Verify traffic is running normally with the new key.

5. The old key was invalidated at step 1 — no cleanup needed.

</Steps>

## Deleting a Key

Immediately revokes the key. Any in-flight requests using the key will receive `401`. Requires `admin` scope.

```bash
curl -X DELETE https://api.yourdomain.com/v1/api-keys/01JA4MNPQR8STUVWXYZ12345 \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
# 204 No Content
```

## Best Practices

### One key per service

Never share a single API key between multiple services. Keeping them isolated means you can rotate or revoke one key without affecting others. It also makes audit logs clearer — `lastUsedAt` tells you when each service last made a request.

### Minimum privilege

Match scopes to what the service needs:

| Service | Recommended Scopes |
|---------|--------------------|
| Read-only dashboard | `read` |
| Background sync worker | `read`, `write` |
| Admin panel / CLI | `read`, `write`, `admin` |
| Webhook processor (no outbound API calls) | None needed |

### Set expiry dates

For automated CI/CD pipelines or short-lived integrations, set `expiresAt`. This ensures keys self-invalidate if rotation is missed. For long-lived services, combine no-expiry keys with a periodic rotation policy.

### Never log raw keys

The `keyPrefix` field exists precisely so you can identify keys in logs without exposing the full value. Log the prefix, not the full key.

### Detect leaks

Enable secret scanning in your repository (GitHub Advanced Security, GitGuardian, etc.). VitaSync key prefixes (`vs_live_`) are recognizable patterns that scanning tools can catch before a key leaks in a commit.
