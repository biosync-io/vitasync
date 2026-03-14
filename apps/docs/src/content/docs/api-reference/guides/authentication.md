---
title: Authentication
description: Authenticate requests to the VitaSync API using API keys with granular scope control.
---

import { Steps, Aside, Tabs, TabItem } from '@astrojs/starlight/components';

VitaSync uses **API key authentication**. All requests to the API must include a key in the Authorization header. Keys are workspace-scoped — they can only access data within the workspace they belong to.

## Key Format

Every API key follows this format:

`
vs_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
`

The s_live_ prefix makes keys easy to identify in logs, environment config, and secret scanners. The suffix is 32 cryptographically random characters. The raw key is **never stored** — VitaSync persists only the SHA-256 hash, so the key cannot be recovered after issuance.

## Sending the API Key

Include your API key as a Bearer token on every request:

`http
Authorization: Bearer vs_live_abc123...
`

<Tabs>
  <TabItem label="curl">
    `ash
    curl https://api.yourdomain.com/v1/providers \
      -H "Authorization: Bearer "
    `
  </TabItem>
  <TabItem label="JavaScript">
    `	s
    const res = await fetch('https://api.yourdomain.com/v1/providers', {
      headers: {
        Authorization: Bearer ,
      },
    });
    `
  </TabItem>
  <TabItem label="Python">
    `python
    import httpx

    client = httpx.Client(base_url='https://api.yourdomain.com')
    resp = client.get('/v1/providers', headers={
        'Authorization': f'Bearer {API_KEY}'
    })
    `
  </TabItem>
</Tabs>

## Scopes

Each API key is issued with one or more scopes that define what it is allowed to do. Use the minimum scope necessary for each key.

| Scope | What it allows |
|-------|----------------|
| ead | Query users, health data, events, personal records, connections, providers |
| write | Create/update users, trigger syncs, disconnect connections |
| dmin | Create/delete API keys, manage webhooks, delete users and health data (GDPR), rotate keys |

<Aside type="caution">
  Keys with dmin scope can delete all data and issue new keys. Treat them like root credentials — store in a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault) and never expose them in client-side code.
</Aside>

## The Bootstrap Key

On first startup, VitaSync auto-creates a workspace and a bootstrap API key from the values in .env:

`ash
ADMIN_WORKSPACE_SLUG=my-workspace
ADMIN_API_KEY=vs_live_changeme_for_production
`

Use this key to create purpose-specific keys, then revoke it before going to production.

## Creating an API Key

Requires dmin scope.

`ash
curl -X POST https://api.yourdomain.com/v1/api-keys \
  -H "Authorization: Bearer " \
  -H "Content-Type: application/json" \
  -d '{
    "name": "backend-service",
    "scopes": ["read", "write"],
    "expiresAt": "2027-01-01T00:00:00.000Z"
  }'
`

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| 
ame | string | Yes | Human-readable label for the key |
| scopes | ("read" \| "write" \| "admin")[] | Yes | Permission scopes |
| xpiresAt | ISO 8601 string | No | Optional expiry date — keys are permanent by default |

**Response** (201 Created):

`json
{
  "id": "01JA4MNPQR8STUVWXYZ12345",
  "name": "backend-service",
  "keyPrefix": "vs_live_",
  "scopes": ["read", "write"],
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "createdAt": "2025-06-01T12:00:00.000Z",
  "rawKey": "vs_live_abc123xyz789..."
}
`

<Aside type="caution">
  The awKey field is only present in this response. It is **never returned again**. Copy it immediately and store it in a secrets manager.
</Aside>

## Listing API Keys

`ash
curl https://api.yourdomain.com/v1/api-keys \
  -H "Authorization: Bearer "
`

**Response** (200 OK):

`json
[
  {
    "id": "01JA4MNPQR8STUVWXYZ12345",
    "name": "backend-service",
    "keyPrefix": "vs_live_ab",
    "scopes": ["read", "write"],
    "expiresAt": "2027-01-01T00:00:00.000Z",
    "lastUsedAt": "2025-06-10T09:31:00.000Z",
    "createdAt": "2025-06-01T12:00:00.000Z"
  }
]
`

The keyPrefix field (first 8 characters) is included so you can identify which key is which without storing the full key.

## Rotating a Key

Rotation invalidates the old key and issues a new one atomically. Requires dmin scope.

`ash
curl -X POST https://api.yourdomain.com/v1/api-keys/01JA4MNPQR8STUVWXYZ12345/rotate \
  -H "Authorization: Bearer "
`

**Response** (200 OK):

`json
{
  "id": "01JA4MNPQR8STUVWXYZ99999",
  "name": "backend-service",
  "keyPrefix": "vs_live_de",
  "scopes": ["read", "write"],
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "createdAt": "2025-06-15T08:00:00.000Z",
  "rawKey": "vs_live_def456uvw..."
}
`

<Aside type="tip">
  For zero-downtime rotation: (1) rotate the key, (2) update all services with the new key, (3) verify traffic, (4) the old key is already invalid — no second call needed. Keep the rotation window short.
</Aside>

## Deleting a Key

Immediately revokes the key — in-flight requests using the key will fail with 401. Requires dmin scope.

`ash
curl -X DELETE https://api.yourdomain.com/v1/api-keys/01JA4MNPQR8STUVWXYZ12345 \
  -H "Authorization: Bearer "
# → 204 No Content
`

## Error Responses

| Status | Code | Meaning |
|--------|------|---------|
| 401 Unauthorized | UNAUTHORIZED | No Authorization header, malformed header, or key not found |
| 403 Forbidden | FORBIDDEN | Key is valid but lacks the required scope for this endpoint |
| 429 Too Many Requests | RATE_LIMIT_EXCEEDED | Request rate exceeded; see Retry-After header |

**401 response:**
`json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}
`

**403 response:**
`json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Insufficient scope. Required: admin"
}
`

## Rate Limits

| Setting | Default |
|---------|---------|
| Max requests per window | 100 |
| Window duration | 60 seconds |

Configure via RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS in .env. When the limit is exceeded, the API returns 429 with a Retry-After header indicating when to retry.

## Key Management Best Practices

- **One key per service** — never share keys between applications. This limits blast radius and enables independent rotation.
- **Minimum scopes** — a background sync worker only needs ead + write, never dmin.
- **Set expiry dates** — short-lived keys reduce exposure. Pair with automated rotation in CI/CD.
- **Rotate on compromise** — if a key leaks, rotate immediately. VitaSync invalidates the old key the moment rotation completes.
- **Never log raw keys** — the keyPrefix field is explicitly provided for log correlation. Use it instead.
