---
title: API Reference
description: Complete reference for the VitaSync REST API — authentication, endpoints, error codes, and rate limits.
---

import { Aside } from '@astrojs/starlight/components';

The VitaSync API is a REST API that returns JSON. It provides endpoints for managing users, OAuth connections, health data, events, personal records, webhooks, and API keys.

## Base URL

```
https://api.yourdomain.com
```

All endpoints are versioned under `/v1/`:

```
https://api.yourdomain.com/v1/
```

## Authentication

All endpoints require Bearer token authentication:

```http
Authorization: Bearer vs_live_<your_api_key>
```

See [Authentication](/api-reference/guides/authentication) for full details on creating keys and managing scopes.

## Content Type

All request bodies must be JSON with the appropriate header:

```http
Content-Type: application/json
```

## Endpoint Summary

### Users

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/v1/users` | `write` | Create or find a user by `externalId` |
| `GET` | `/v1/users` | `read` | List all users (paginated) |
| `GET` | `/v1/users/:userId` | `read` | Get a user by ID |
| `PATCH` | `/v1/users/:userId` | `write` | Update user properties |
| `DELETE` | `/v1/users/:userId` | `admin` | Delete a user and all their data |

### OAuth & Connections

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/oauth/:providerId/authorize` | — | Redirect user to provider OAuth |
| `GET` | `/v1/oauth/:providerId/callback` | — | OAuth callback (handled by VitaSync) |
| `GET` | `/v1/users/:userId/connections` | `read` | List a user's provider connections |
| `DELETE` | `/v1/users/:userId/connections/:connectionId` | `write` | Disconnect a provider |
| `POST` | `/v1/users/:userId/connections/:connectionId/sync` | `write` | Trigger a manual sync |

### Health Data

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/users/:userId/health` | `read` | Raw health metrics (paginated) |
| `GET` | `/v1/users/:userId/health/summary` | `read` | Count per metric type |
| `GET` | `/v1/users/:userId/health/timeseries` | `read` | Aggregated timeseries data |
| `GET` | `/v1/users/:userId/health/daily-summaries` | `read` | Per-day metric totals |
| `DELETE` | `/v1/users/:userId/health` | `admin` | Delete all health data (GDPR) |

### Events

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/users/:userId/events` | `read` | List workouts, sleep, and activities |
| `GET` | `/v1/users/:userId/events/:eventId` | `read` | Get a single event |

### Personal Records

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/users/:userId/personal-records` | `read` | All personal records |
| `GET` | `/v1/users/:userId/personal-records/:metricType` | `read` | Records for a metric type |

### Webhooks

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/v1/webhooks` | `admin` | Register a webhook endpoint |
| `GET` | `/v1/webhooks` | `admin` | List webhooks |
| `GET` | `/v1/webhooks/:webhookId` | `admin` | Get a webhook |
| `PATCH` | `/v1/webhooks/:webhookId` | `admin` | Update webhook settings |
| `DELETE` | `/v1/webhooks/:webhookId` | `admin` | Delete a webhook |
| `GET` | `/v1/webhooks/:webhookId/deliveries` | `admin` | Delivery history |

### API Keys

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/v1/api-keys` | `admin` | Create an API key |
| `GET` | `/v1/api-keys` | `admin` | List API keys |
| `DELETE` | `/v1/api-keys/:keyId` | `admin` | Delete an API key |
| `POST` | `/v1/api-keys/:keyId/rotate` | `admin` | Rotate (replace) an API key |

### Providers

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/providers` | `read` | List all configured providers |

### Analytics

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/users/:userId/analytics/context` | `read` | LLM-ready biological context (baselines, trends, anomalies, correlations, health scores) |
| `POST` | `/v1/users/:userId/analytics/correlations` | `read` | Auto-discover metric correlations over a configurable time window |
| `POST` | `/v1/users/:userId/analytics/anomalies` | `read` | Detect health anomalies using statistical and clinical thresholds |

### Notifications

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/users/:userId/notifications/channels` | `read` | List notification channels |
| `POST` | `/v1/users/:userId/notifications/channels` | `write` | Register a notification channel |
| `PUT` | `/v1/users/:userId/notifications/channels/:channelId` | `write` | Update channel settings |
| `DELETE` | `/v1/users/:userId/notifications/channels/:channelId` | `write` | Delete a channel |
| `POST` | `/v1/users/:userId/notifications/channels/:channelId/test` | `write` | Send a test notification |
| `GET` | `/v1/users/:userId/notifications/rules` | `read` | List notification rules |
| `POST` | `/v1/users/:userId/notifications/rules` | `write` | Create a notification rule |
| `PUT` | `/v1/users/:userId/notifications/rules/:ruleId` | `write` | Update a rule |
| `DELETE` | `/v1/users/:userId/notifications/rules/:ruleId` | `write` | Delete a rule |
| `GET` | `/v1/users/:userId/notifications/logs` | `read` | Query notification delivery history |

## Error Codes

VitaSync returns standard HTTP status codes. Error responses include a JSON body with `statusCode`, `error`, and `message`.

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "User not found"
}
```

| Status | Meaning |
|--------|---------|
| `200 OK` | Request succeeded |
| `201 Created` | Resource created |
| `202 Accepted` | Request accepted (async operation queued) |
| `204 No Content` | Success, no response body |
| `400 Bad Request` | Invalid request body or query parameters |
| `401 Unauthorized` | Missing or invalid API key |
| `403 Forbidden` | API key valid but insufficient scope |
| `404 Not Found` | Resource does not exist or does not belong to this workspace |
| `409 Conflict` | Resource already exists (e.g. duplicate connection) |
| `422 Unprocessable Entity` | Valid JSON but semantic errors (e.g. invalid enum value) |
| `429 Too Many Requests` | Rate limit exceeded — see `Retry-After` header |
| `500 Internal Server Error` | VitaSync server error |

## Pagination

Most list endpoints support two pagination styles:

### Offset Pagination

```
?limit=100&offset=0
```

Response includes `total`, `limit`, and `offset` for building page navigation.

### Cursor Pagination

```
?limit=100&cursor=<nextCursor>
```

Response includes `nextCursor` (null when no more pages). More efficient for large datasets — use cursor pagination whenever possible.

## IDs

All IDs are [ULIDs](https://github.com/ulid/spec) — lexicographically sortable, URL-safe, 26-character strings. They are time-ordered by creation, making recent records always higher when sorted alphabetically.

## Timestamps

All timestamps are returned as ISO 8601 strings in UTC:

```
2025-06-15T09:00:00.000Z
```

When providing timestamps in requests, use ISO 8601 format with UTC timezone.

## Versioning

The current API version is **v1**. Breaking changes will be introduced in a new version (v2) with a deprecation period for v1.

Non-breaking changes (new fields, new endpoints) are added without version bumps.
