---
title: API Reference
description: Complete reference for the VitaSync REST API.
---

import { Aside } from '@astrojs/starlight/components';

## Base URL

```
http://localhost:3001   # local development
https://api.example.com # production
```

## Interactive Docs

When the API server is running, full interactive OpenAPI documentation is available at:

```
http://localhost:3001/docs
```

## Authentication

All endpoints (except `GET /health` and OAuth callback routes) require an API key:

```http
Authorization: Bearer vs_live_<your_api_key>
```

See [Authentication](/api-reference/guides/authentication/) for details on creating and managing API keys.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check — no auth required |
| `GET` | `/v1/providers` | List registered providers |
| `POST` | `/v1/users` | Create or upsert a user |
| `GET` | `/v1/users` | List all users in the workspace |
| `GET` | `/v1/users/:id` | Get a user by ID |
| `DELETE` | `/v1/users/:id` | Delete a user and all their data |
| `GET` | `/v1/oauth/:provider/authorize` | Start OAuth flow for a user |
| `GET` | `/v1/oauth/:provider/callback` | OAuth callback (handled internally) |
| `GET` | `/v1/users/:id/connections` | List a user's provider connections |
| `DELETE` | `/v1/users/:id/connections/:cid` | Disconnect a provider |
| `POST` | `/v1/users/:id/connections/:cid/sync` | Trigger an immediate sync |
| `GET` | `/v1/users/:id/health` | Query health metrics |
| `GET` | `/v1/users/:id/health/summary` | Count per metric type |
| `POST` | `/v1/api-keys` | Create an API key |
| `GET` | `/v1/api-keys` | List API keys |
| `DELETE` | `/v1/api-keys/:id` | Revoke an API key |
| `POST` | `/v1/webhooks` | Register a webhook |
| `GET` | `/v1/webhooks` | List webhooks |
| `DELETE` | `/v1/webhooks/:id` | Delete a webhook |
| `GET` | `/v1/webhooks/:id/deliveries` | List delivery attempts |

## Response Format

All responses use `application/json`. Successful responses return the resource directly or a paginated envelope:

```json
{
  "data": [ /* array of resources */ ],
  "total": 42
}
```

## Error Format

```json
{
  "error": "NOT_FOUND",
  "message": "User not found",
  "statusCode": 404
}
```

| Status | Meaning |
|--------|---------|
| `400` | Validation error — check `message` for details |
| `401` | Missing or invalid API key |
| `403` | API key does not have access to this resource |
| `404` | Resource not found |
| `409` | Conflict — e.g. duplicate `externalId` |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

<Aside type="tip">
  The Swagger UI at `/docs` lets you try every endpoint directly in the browser with your API key.
</Aside>
