---
title: Webhooks (Developer Guide)
description: Implement reliable webhook processing with signature verification, idempotency, and retry handling.
---

import { Aside, Tabs, TabItem } from '@astrojs/starlight/components';

This guide covers the implementation side of webhook delivery — how to verify signatures, handle retries idempotently, and build reliable webhook processors.

For webhook management (creating, updating, deleting webhooks), see the [Webhooks API guide](/api-reference/guides/webhooks).

## Signature Verification

Every delivery includes an `X-VitaSync-Signature` header containing an HMAC-SHA256 digest of the raw request body, computed using your webhook secret.

**Header format:**
```
X-VitaSync-Signature: sha256=<hex_digest>
```

**Computing the expected signature:**
```
expected = "sha256=" + HMAC-SHA256(key=WEBHOOK_SECRET, message=raw_request_body)
```

Always verify signatures before processing events. Use constant-time comparison to prevent timing attacks.

<Tabs>
  <TabItem label="Node.js">
    ```ts
    import crypto from 'node:crypto';

    function verifySignature(
      rawBody: Buffer,
      signature: string,
      secret: string,
    ): boolean {
      const expected = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      try {
        return crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expected),
        );
      } catch {
        return false; // length mismatch
      }
    }
    ```
  </TabItem>
  <TabItem label="Python">
    ```python
    import hashlib
    import hmac

    def verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
        expected = 'sha256=' + hmac.new(
            secret.encode('utf-8'),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(signature, expected)
    ```
  </TabItem>
  <TabItem label="Go">
    ```go
    import (
        "crypto/hmac"
        "crypto/sha256"
        "encoding/hex"
        "fmt"
    )

    func VerifySignature(rawBody []byte, signature, secret string) bool {
        mac := hmac.New(sha256.New, []byte(secret))
        mac.Write(rawBody)
        expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
        return hmac.Equal([]byte(signature), []byte(expected))
    }
    ```
  </TabItem>
</Tabs>

<Aside type="caution">
  You must verify the signature against the **raw request body bytes** before JSON parsing. Parsing the JSON first and re-serializing it may change whitespace or field order and invalidate the signature.
</Aside>

## Framework Integration Examples

### Fastify

Fastify does not expose `rawBody` by default. Use `fastify-raw-body` or the `ContentTypeParser` approach:

```ts
import Fastify from 'fastify';
import rawBody from 'fastify-raw-body';
import crypto from 'node:crypto';

const app = Fastify();
await app.register(rawBody);

app.post('/webhooks/vitasync', async (req, reply) => {
  const signature = req.headers['x-vitasync-signature'] as string;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(req.rawBody!)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature ?? ''), Buffer.from(expected))) {
    return reply.code(401).send({ error: 'Invalid signature' });
  }

  const { event, data } = req.body as { event: string; data: unknown };

  switch (event) {
    case 'sync.completed':
      await handleSyncCompleted(data);
      break;
    case 'sync.failed':
      await handleSyncFailed(data);
      break;
  }

  return reply.send({ ok: true });
});
```

### Express

```ts
import express from 'express';
import crypto from 'node:crypto';

const app = express();

// Use express.raw() BEFORE express.json() for this route
app.post(
  '/webhooks/vitasync',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-vitasync-signature'] as string;
    const expected = 'sha256=' + crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET!)
      .update(req.body as Buffer)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature ?? ''), Buffer.from(expected))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(req.body.toString());
    // process payload...
    res.json({ ok: true });
  },
);
```

## Idempotency

VitaSync may deliver the same event more than once (on retries after network failures or 5xx responses). Your webhook handler must be **idempotent** — processing the same delivery twice should not cause duplicate actions.

Use the `X-VitaSync-Delivery` header as a deduplication key:

```ts
app.post('/webhooks/vitasync', async (req, reply) => {
  const deliveryId = req.headers['x-vitasync-delivery'] as string;

  // Check if already processed
  const exists = await db.query(
    'SELECT 1 FROM processed_webhooks WHERE delivery_id = $1',
    [deliveryId],
  );
  if (exists.rows.length > 0) {
    return reply.send({ ok: true, duplicate: true });
  }

  // Process the event...
  await handleEvent(req.body);

  // Mark as processed
  await db.query(
    'INSERT INTO processed_webhooks (delivery_id, processed_at) VALUES ($1, NOW())',
    [deliveryId],
  );

  return reply.send({ ok: true });
});
```

## Retry Schedule

If your endpoint does not return a `2xx` HTTP status or does not respond within 5 seconds, VitaSync retries with exponential backoff:

| Attempt | Delay After Previous |
|---------|---------------------|
| 1 | Immediate |
| 2 | 30 seconds |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

After 5 failed attempts, the delivery status is set to `failed` and no further retries are made.

**To handle retries gracefully:**

- Return `200 OK` as quickly as possible — before doing any heavy processing.
- Enqueue the event payload in a message queue (BullMQ, SQS, etc.) and process asynchronously.
- Never make synchronous external HTTP calls inside your webhook handler.

```ts
app.post('/webhooks/vitasync', async (req, reply) => {
  // Verify signature first
  // ...

  // Enqueue for async processing — respond immediately
  await queue.add('vitasync-webhook', req.body);
  return reply.send({ ok: true });
});
```

## Testing Locally

Use a tunneling tool like [ngrok](https://ngrok.com) or [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) to expose your local server:

```bash
ngrok http 3000
# Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

Then register the tunnel URL as your webhook:

```bash
curl -X POST http://localhost:3001/v1/webhooks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://abc123.ngrok.io/webhooks/vitasync",
    "secret": "my-local-dev-secret",
    "events": ["sync.completed", "sync.failed"]
  }'
```

## Monitoring Deliveries

Use the deliveries endpoint to inspect delivery history and debug failures:

```bash
curl "https://api.yourdomain.com/v1/webhooks/{webhookId}/deliveries" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

A failed delivery shows the HTTP status code returned by your server (or `0` for connection refused / timeout). Use this to diagnose why retries are failing.

## Common Issues

| Symptom | Solution |
|---------|---------|
| Signature mismatch | Ensure you are reading raw bytes before parsing JSON |
| Duplicate event processing | Implement idempotency using `X-VitaSync-Delivery` |
| Timeouts (delivery status `failed`) | Respond with `200` immediately, process async |
| No deliveries at endpoint | Verify `isActive: true` and URL is publicly reachable |
| All deliveries failing with `401` | Check that your secret matches the one used to create the webhook |
