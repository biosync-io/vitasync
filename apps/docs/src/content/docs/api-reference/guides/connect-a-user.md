---
title: Connect a User
description: Walk through the full OAuth flow to connect a wearable provider to a user.
---

import { Steps, Aside, Tabs, TabItem } from '@astrojs/starlight/components';

VitaSync connection model has three actors: your **backend** (holds the API key), a **user** (owns the wearable device), and the **wearable provider** (Fitbit, Garmin, etc.). This guide walks through the complete flow from creating a user to querying their health data.

## Overview

```
Your Backend                VitaSync API             Provider (e.g. Fitbit)
     |                           |                           |
     |-- POST /v1/users -------->|                           |
     |<-- { userId } ------------|                           |
     |                           |                           |
     |-- GET /v1/oauth/:p/authorize?userId= -->              |
     |<-- 302 redirect to provider login                     |
     |                           |                           |
     |                    user logs in to provider           |
     |                           |                           |
     |                    GET /v1/oauth/:p/callback          |
     |                           |<-- authorization code ----|
     |                           |-- exchange code ----------|
     |                           |<-- access + refresh token |
     |                           |-- stores encrypted tokens |
     |<-- redirect to your app w/ connectionId              |
     |                           |                           |
     |-- POST .../sync --------->|                           |
     |<-- 202 Accepted (async) --|                           |
```

## Step 1 — Create a User

VitaSync users are identified by an `externalId` — typically the user ID from your own system. If a user with that `externalId` already exists, VitaSync returns the existing record (upsert semantics).

Requires `write` scope.

```bash
curl -X POST https://api.yourdomain.com/v1/users \
  -H "Authorization: Bearer $VITASYNC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "usr_abc123",
    "email": "alice@example.com",
    "displayName": "Alice"
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `externalId` | string | Yes | Your internal user ID — unique per workspace |
| `email` | string | No | User email address |
| `displayName` | string | No | Human-readable name |
| `metadata` | object | No | Arbitrary JSON — stored as-is and returned on all user reads |

**Response** (`200 OK` if existing, `201 Created` if new):

```json
{
  "id": "01JA4MNPQR8STUVWXYZ00001",
  "externalId": "usr_abc123",
  "email": "alice@example.com",
  "displayName": "Alice",
  "metadata": {},
  "createdAt": "2025-06-01T10:00:00.000Z",
  "updatedAt": "2025-06-01T10:00:00.000Z"
}
```

Save the VitaSync `id` — use it for all subsequent requests for this user.

## Step 2 — Redirect the User to Authorize

To connect a provider, redirect your user's browser to the VitaSync authorization URL. VitaSync handles the OAuth dance with the provider and redirects back to your app when done.

```
GET /v1/oauth/{providerId}/authorize?userId={userId}
```

**Parameters:**

| Parameter | Description |
|-----------|-------------|
| `providerId` | One of: `fitbit`, `garmin`, `whoop`, `strava` |
| `userId` | The VitaSync user ID from Step 1 |

<Aside type="tip">
  This URL must be opened in a browser, not fetched server-side. Embed it in a "Connect Fitbit" button or redirect your user to it from your server.
</Aside>

**Example button:**

```tsx
function ConnectFitbitButton({ vitasyncUserId }: { vitasyncUserId: string }) {
  const authorizeUrl =
    `https://api.yourdomain.com/v1/oauth/fitbit/authorize?userId=${vitasyncUserId}`;

  return <a href={authorizeUrl}>Connect Fitbit</a>;
}
```

**What happens next:**
1. VitaSync redirects the user to the provider's login and consent screen.
2. The user grants permission.
3. The provider redirects back to `GET /v1/oauth/:providerId/callback`.
4. VitaSync exchanges the code for tokens, encrypts with AES-256-GCM, and stores them.
5. VitaSync redirects the user to your `OAUTH_CALLBACK_URL` with `connectionId` and `providerId` as query params.

Configure your redirect destination in `.env`:

```bash
OAUTH_CALLBACK_URL=https://app.yourdomain.com/settings/connections/callback
```

## Step 3 — Handle the Callback

Your callback page receives the connection details as query parameters:

```
https://app.yourdomain.com/settings/connections/callback
  ?connectionId=01JA4MNPQR8STUVWXYZ00002
  &providerId=fitbit
```

Store the `connectionId` alongside the user in your database — you will use it to trigger syncs and disconnect the provider.

## Step 4 — Trigger the First Sync

After connecting, trigger an initial sync to pull historical data. The sync runs asynchronously — VitaSync enqueues a background job and returns immediately.

Requires `write` scope.

```bash
curl -X POST \
  "https://api.yourdomain.com/v1/users/01JA4MNPQR8STUVWXYZ00001/connections/01JA4MNPQR8STUVWXYZ00002/sync" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Response** (`202 Accepted`):

```json
{
  "jobId": "sync-job-01JA4MNPQR...",
  "status": "queued"
}
```

The initial sync pulls the **last 30 days** of data. Subsequent syncs pull data from `lastSyncedAt` forward.

<Aside type="tip">
  You do not need to manually trigger syncs after the first. VitaSync periodically re-syncs connected accounts automatically. Manual sync is useful to force a refresh on demand (e.g. user hits a "Refresh" button).
</Aside>

## Step 5 — Query Health Data

Once the sync completes (a few seconds to a few minutes depending on the provider and data volume):

```bash
curl "https://api.yourdomain.com/v1/users/01JA4MNPQR8STUVWXYZ00001/health?metricType=steps&limit=7" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

See [Query Health Data](/api-reference/guides/query-health-data) for the full query API including timeseries, daily summaries, and personal records.

## Managing Connections

### List a user's connections

```bash
curl "https://api.yourdomain.com/v1/users/01JA4MNPQR8STUVWXYZ00001/connections" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Response:**

```json
[
  {
    "id": "01JA4MNPQR8STUVWXYZ00002",
    "userId": "01JA4MNPQR8STUVWXYZ00001",
    "providerId": "fitbit",
    "status": "active",
    "lastSyncedAt": "2025-06-15T08:30:00.000Z",
    "connectedAt": "2025-06-01T10:05:00.000Z"
  }
]
```

**Connection statuses:**

| Status | Meaning |
|--------|---------|
| `active` | Tokens valid, syncing normally |
| `error` | Last sync failed; check webhook `sync.failed` events for details |
| `disconnected` | User revoked access at the provider |

### Disconnect a provider

Removes the connection and deletes stored tokens. Requires `write` scope. Does **not** delete health data already synced — use `DELETE /v1/users/:userId/health` for GDPR erasure.

```bash
curl -X DELETE \
  "https://api.yourdomain.com/v1/users/01JA4MNPQR8STUVWXYZ00001/connections/01JA4MNPQR8STUVWXYZ00002" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
# 204 No Content
```

## Provider Reference

| Provider ID | Name | Auth Protocol |
|-------------|------|---------------|
| `fitbit` | Fitbit | OAuth 2.0 + PKCE |
| `garmin` | Garmin | OAuth 1.0a (HMAC-SHA1) |
| `whoop` | WHOOP | OAuth 2.0 |
| `strava` | Strava | OAuth 2.0 |

See the [Providers](/providers/supported) section for per-provider setup instructions, OAuth app creation steps, and full metric coverage tables.
