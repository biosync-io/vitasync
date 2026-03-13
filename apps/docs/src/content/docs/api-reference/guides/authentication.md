---
title: Authentication
description: How to create API keys and authenticate requests to the VitaSync API.
---

import { Steps, Aside } from '@astrojs/starlight/components';

## Overview

VitaSync uses **API key authentication**. Every request must include the key in the `Authorization` header:

```http
Authorization: Bearer vs_live_<your_api_key>
```

API keys are scoped to a **workspace** — they only have access to data within that workspace.

## The Bootstrap Key

On first boot, VitaSync auto-creates a workspace using `ADMIN_WORKSPACE_SLUG` and `ADMIN_API_KEY` from your `.env`. Use this key to bootstrap — then create purpose-scoped keys and revoke the bootstrap key in production.

```bash
export API_KEY=vs_live_changeme_for_production

curl http://localhost:3001/v1/providers \
  -H "Authorization: Bearer $API_KEY"
```

## Creating an API Key

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
  The `key` field is returned **only once** at creation time. Store it securely in a secrets manager — VitaSync stores only its SHA-256 hash.
</Aside>

## Listing Keys

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

Note: the raw `key` is never returned after creation.

## Revoking a Key

```bash
curl -X DELETE http://localhost:3001/v1/api-keys/01HXYZ... \
  -H "Authorization: Bearer $API_KEY"
# → 204 No Content
```

## Rate Limits

| Limit | Default |
|-------|---------|
| Requests per window | 100 |
| Window duration | 60 seconds |

Configure via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` in `.env`. Responses over the limit return `429 Too Many Requests` with a `Retry-After` header.
