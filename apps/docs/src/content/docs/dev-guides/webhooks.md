---
title: Webhooks
description: Receive real-time notifications when VitaSync syncs health data.
---

import { Steps, Aside } from '@astrojs/starlight/components';

Webhooks let your application react in real time whenever VitaSync finishes (or fails) a sync for any of your users.

## Register an Endpoint

```bash
curl -X POST http://localhost:3001/v1/webhooks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/vitasync",
    "secret": "a-long-random-secret",
    "events": ["sync.completed", "sync.failed"]
  }'
```

## Event Types

| Event | Payload |
|-------|---------|
| `sync.completed` | `userId`, `connectionId`, `providerId`, `metricsCount`, `syncedAt` |
| `sync.failed` | `userId`, `connectionId`, `providerId`, `error`, `failedAt` |

## Receiving Payloads

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

Always verify the `X-VitaSync-Signature` header to confirm the request came from VitaSync:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signatureHeader, "utf8"),
    );
  } catch {
    return false;
  }
}
```

<Aside type="caution">
  Never skip signature verification — without it, anyone who knows your endpoint URL can send fake events.
</Aside>

## Delivery & Retries

- Your endpoint must return a **2xx status** within **10 seconds**.
- Failed deliveries are retried up to **5 times** with exponential back-off.
- Inspect delivery history: `GET /v1/webhooks/:id/deliveries`

## Development Tips

Use a tunnelling tool (e.g. [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)) to expose `localhost` to VitaSync during development:

```bash
ngrok http 3000
# Copy the https URL and register it as your webhook endpoint
```
