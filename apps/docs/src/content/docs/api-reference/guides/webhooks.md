---
title: Webhooks (API Guide)
description: Register endpoints to receive real-time notifications when health data is synced.
---

import { Aside } from '@astrojs/starlight/components';

## Register a Webhook

```bash
curl -X POST http://localhost:3001/v1/webhooks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/vitasync",
    "secret": "your-webhook-secret",
    "events": ["sync.completed", "sync.failed"]
  }'
```

```json
{
  "id": "01HWEBOOK...",
  "url": "https://your-app.com/webhooks/vitasync",
  "events": ["sync.completed", "sync.failed"],
  "createdAt": "2026-03-13T00:00:00.000Z"
}
```

## Payload Structure

VitaSync sends a `POST` request to your endpoint with:

```http
POST /webhooks/vitasync
Content-Type: application/json
X-VitaSync-Event: sync.completed
X-VitaSync-Signature: sha256=<hmac>
X-VitaSync-Delivery: 01HDEL...
```

```json
{
  "event": "sync.completed",
  "userId": "01HXYZ...",
  "connectionId": "01HABC...",
  "providerId": "fitbit",
  "metricsCount": 42,
  "syncedAt": "2026-03-13T00:02:00.000Z"
}
```

## Verifying Signatures

The `X-VitaSync-Signature` header is an HMAC-SHA256 of the raw request body, signed with the `secret` you provided at registration.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verifySignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = "sha256=" +
    createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

<Aside type="caution">
  Always use a constant-time comparison (`timingSafeEqual`) to prevent timing attacks.
</Aside>

## Delivery Retries

Failed deliveries (non-2xx or timeout) are retried up to **5 times** with exponential back-off. Delivery history is available at:

```bash
curl http://localhost:3001/v1/webhooks/01HWEBOOK.../deliveries \
  -H "Authorization: Bearer $API_KEY"
```

## Event Types

| Event | When it fires |
|-------|--------------|
| `sync.completed` | A sync job finishes successfully |
| `sync.failed` | A sync job exhausts all retries |
