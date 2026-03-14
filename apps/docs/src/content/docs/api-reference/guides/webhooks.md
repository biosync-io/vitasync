---
title: Webhooks
description: Receive real-time notifications when syncs complete, connections change, and users are created.
---

import { Aside, Tabs, TabItem } from '@astrojs/starlight/components';

VitaSync webhooks deliver real-time event notifications to your application over HTTP. When a sync completes, a connection is added, or a user is created, VitaSync makes an HTTP POST to each of your registered webhook endpoints.

## How It Works

1. You register a webhook endpoint (a URL on your server that accepts POST requests).
2. VitaSync events occur asynchronously (sync jobs, OAuth callbacks, etc.).
3. VitaSync sends a signed HTTP POST to your URL with a JSON payload.
4. Your server verifies the signature and processes the event.
5. Your server responds with any `2xx` status to acknowledge delivery.

## Registering a Webhook

Requires `admin` scope.

```bash
curl -X POST https://api.yourdomain.com/v1/webhooks \
  -H "Authorization: Bearer $VITASYNC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.yourdomain.com/api/vitasync/webhook",
    "secret": "my-webhook-secret-at-least-16-chars",
    "events": ["sync.completed", "sync.failed", "connection.created"],
    "description": "Main backend webhook"
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string (URL) | Yes | HTTPS endpoint that will receive events |
| `secret` | string | Yes | Signing secret (minimum 16 characters). Used to generate HMAC-SHA256 signature |
| `events` | string[] | Yes | Event types to subscribe to — see full list below |
| `description` | string | No | Human-readable label |

**Response** (`201 Created`):

```json
{
  "id": "01JA4MNPQR8STUVWXYZ00100",
  "url": "https://app.yourdomain.com/api/vitasync/webhook",
  "events": ["sync.completed", "sync.failed", "connection.created"],
  "isActive": true,
  "description": "Main backend webhook",
  "createdAt": "2025-06-01T12:00:00.000Z"
}
```

<Aside type="caution">
  Your webhook secret is hashed before storage and never returned after creation. Save it securely — it is required to verify incoming signatures.
</Aside>

## Event Types

| Event | When it fires |
|-------|---------------|
| `sync.completed` | A background sync job finished successfully |
| `sync.failed` | A background sync job failed (e.g. token expired, provider API error) |
| `connection.created` | A user successfully completed the OAuth flow for a provider |
| `connection.disconnected` | A provider connection was deleted (manually or due to token revocation) |
| `user.created` | A new user was created via `POST /v1/users` |
| `user.deleted` | A user was deleted via `DELETE /v1/users/:userId` |

## Delivery Format

Every webhook delivery is an HTTP POST with:

- **Content-Type:** `application/json`
- **`X-VitaSync-Signature`:** HMAC-SHA256 hex digest of the raw request body, prefixed with `sha256=`
- **`X-VitaSync-Event`:** The event type string
- **`X-VitaSync-Delivery`:** Unique delivery ID (UUID)

**Example headers:**

```http
POST /api/vitasync/webhook HTTP/1.1
Content-Type: application/json
X-VitaSync-Signature: sha256=d7e2b4f1c9a3e8b2...
X-VitaSync-Event: sync.completed
X-VitaSync-Delivery: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

## Event Payload Shapes

### `sync.completed`

```json
{
  "event": "sync.completed",
  "timestamp": "2025-06-15T09:00:00.000Z",
  "data": {
    "jobId": "sync-job-01JA4...",
    "userId": "01JA4MNPQR8STUVWXYZ00001",
    "connectionId": "01JA4MNPQR8STUVWXYZ00002",
    "providerId": "fitbit",
    "metricsSynced": 342,
    "syncedAt": "2025-06-15T09:00:00.000Z"
  }
}
```

### `sync.failed`

```json
{
  "event": "sync.failed",
  "timestamp": "2025-06-15T09:02:00.000Z",
  "data": {
    "jobId": "sync-job-01JA4...",
    "userId": "01JA4MNPQR8STUVWXYZ00001",
    "connectionId": "01JA4MNPQR8STUVWXYZ00002",
    "providerId": "garmin",
    "error": "Token refresh failed: invalid_grant",
    "failedAt": "2025-06-15T09:02:00.000Z"
  }
}
```

### `connection.created`

```json
{
  "event": "connection.created",
  "timestamp": "2025-06-10T10:05:00.000Z",
  "data": {
    "connectionId": "01JA4MNPQR8STUVWXYZ00002",
    "userId": "01JA4MNPQR8STUVWXYZ00001",
    "providerId": "whoop"
  }
}
```

### `connection.disconnected`

```json
{
  "event": "connection.disconnected",
  "timestamp": "2025-06-20T14:30:00.000Z",
  "data": {
    "connectionId": "01JA4MNPQR8STUVWXYZ00002",
    "userId": "01JA4MNPQR8STUVWXYZ00001",
    "providerId": "whoop"
  }
}
```

### `user.created`

```json
{
  "event": "user.created",
  "timestamp": "2025-06-01T10:00:00.000Z",
  "data": {
    "userId": "01JA4MNPQR8STUVWXYZ00001",
    "externalId": "usr_abc123",
    "email": "alice@example.com"
  }
}
```

### `user.deleted`

```json
{
  "event": "user.deleted",
  "timestamp": "2025-07-01T12:00:00.000Z",
  "data": {
    "userId": "01JA4MNPQR8STUVWXYZ00001",
    "externalId": "usr_abc123"
  }
}
```

## Verifying Signatures

**Always verify the signature** before processing webhook events. This confirms the request came from VitaSync and not an attacker.

VitaSync computes the signature as:

```
HMAC-SHA256(key=your_secret, message=raw_request_body)
```

The header value is `sha256=<hex_digest>`.

<Tabs>
  <TabItem label="Node.js (Fastify)">
    ```ts
    import crypto from 'node:crypto';

    app.post('/api/vitasync/webhook', {
      config: { rawBody: true }, // requires rawBody plugin
    }, async (req, reply) => {
      const signature = req.headers['x-vitasync-signature'] as string;
      const expected = 'sha256=' + crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET!)
        .update(req.rawBody!)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      const payload = req.body as WebhookPayload;
      // process event...
      return reply.send({ ok: true });
    });
    ```
  </TabItem>
  <TabItem label="Node.js (Express)">
    ```ts
    import crypto from 'node:crypto';
    import express from 'express';

    const app = express();

    app.post('/api/vitasync/webhook',
      express.raw({ type: 'application/json' }),
      (req, res) => {
        const signature = req.headers['x-vitasync-signature'] as string;
        const expected = 'sha256=' + crypto
          .createHmac('sha256', process.env.WEBHOOK_SECRET!)
          .update(req.body)
          .digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
          return res.status(401).json({ error: 'Invalid signature' });
        }

        const payload = JSON.parse(req.body.toString());
        // process event...
        res.json({ ok: true });
      }
    );
    ```
  </TabItem>
  <TabItem label="Python (FastAPI)">
    ```python
    import hashlib, hmac
    from fastapi import FastAPI, Request, HTTPException

    app = FastAPI()
    WEBHOOK_SECRET = os.environ['WEBHOOK_SECRET']

    @app.post('/api/vitasync/webhook')
    async def webhook(request: Request):
        body = await request.body()
        signature = request.headers.get('x-vitasync-signature', '')
        expected = 'sha256=' + hmac.new(
            WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail='Invalid signature')

        payload = await request.json()
        # process event...
        return {'ok': True}
    ```
  </TabItem>
</Tabs>

<Aside type="caution">
  Use a constant-time comparison function (`crypto.timingSafeEqual`, `hmac.compare_digest`) to prevent timing attacks. Never use a regular string equality check for signature verification.
</Aside>

## Delivery Retries

If your endpoint does not return a `2xx` status, VitaSync retries with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 (initial) | Immediate |
| 2 | 30 seconds |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

After 5 failed attempts the delivery is marked as `failed` and no further retries are made.

Respond quickly (under 5 seconds) and process events asynchronously. If your handler takes too long, VitaSync may treat it as a failure.

## Viewing Delivery History

```bash
curl "https://api.yourdomain.com/v1/webhooks/01JA4MNPQR8STUVWXYZ00100/deliveries" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Response:**

```json
[
  {
    "id": "01JA4MNPQR8STUVWXYZ00200",
    "webhookId": "01JA4MNPQR8STUVWXYZ00100",
    "event": "sync.completed",
    "status": "delivered",
    "statusCode": 200,
    "attemptCount": 1,
    "deliveredAt": "2025-06-15T09:00:05.000Z",
    "createdAt": "2025-06-15T09:00:04.000Z"
  },
  {
    "id": "01JA4MNPQR8STUVWXYZ00201",
    "webhookId": "01JA4MNPQR8STUVWXYZ00100",
    "event": "sync.failed",
    "status": "failed",
    "statusCode": 503,
    "attemptCount": 5,
    "createdAt": "2025-06-14T14:00:00.000Z"
  }
]
```

## Managing Webhooks

### List webhooks

```bash
curl "https://api.yourdomain.com/v1/webhooks" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

### Update a webhook

```bash
curl -X PATCH "https://api.yourdomain.com/v1/webhooks/01JA4MNPQR8STUVWXYZ00100" \
  -H "Authorization: Bearer $VITASYNC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": ["sync.completed", "sync.failed", "connection.created", "user.created"],
    "isActive": true
  }'
```

**PATCH fields** (all optional):

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | New endpoint URL |
| `events` | string[] | Replace the event subscription list |
| `isActive` | boolean | Pause (`false`) or resume (`true`) deliveries |
| `description` | string | Update the label |

### Delete a webhook

```bash
curl -X DELETE "https://api.yourdomain.com/v1/webhooks/01JA4MNPQR8STUVWXYZ00100" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
# 204 No Content
```
