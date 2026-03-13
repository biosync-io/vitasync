---
title: API Keys
description: Create, list, and revoke API keys for workspace access.
---

import { Aside } from '@astrojs/starlight/components';

API keys are the primary way to authenticate requests to the VitaSync API. They are scoped to a workspace and stored as SHA-256 hashes — the plain-text key is only returned once.

## Creating a Key

```bash
curl -X POST http://localhost:3001/v1/api-keys \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "my-backend-service"}'
```

```json
{
  "id": "01HXYZ...",
  "label": "my-backend-service",
  "key": "vs_live_abc123...",
  "createdAt": "2026-03-13T00:00:00.000Z"
}
```

<Aside type="caution">
  The `key` value is shown **once only**. Copy it to your secrets manager immediately — it cannot be retrieved again.
</Aside>

## Using a Key

Include the key in the `Authorization` header for every API request:

```http
Authorization: Bearer vs_live_abc123...
```

## Listing Keys

Returns all keys for the workspace, **without** the raw key value:

```bash
curl http://localhost:3001/v1/api-keys \
  -H "Authorization: Bearer $API_KEY"
```

```json
[
  {
    "id": "01HXYZ...",
    "label": "my-backend-service",
    "createdAt": "2026-03-13T00:00:00.000Z"
  }
]
```

## Revoking a Key

```bash
curl -X DELETE http://localhost:3001/v1/api-keys/01HXYZ... \
  -H "Authorization: Bearer $API_KEY"
# → 204 No Content
```

Revoked keys are rejected immediately on subsequent requests.

## Production Recommendations

- Create separate keys per environment and per service.
- Store keys in a secrets manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault, Kubernetes `Secret`).
- Rotate keys periodically — delete the old one only after the new one is deployed.
- Never put API keys in version control or client-side code.
