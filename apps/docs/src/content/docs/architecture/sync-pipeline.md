---
title: Sync Pipeline
description: How VitaSync fetches wearable data from providers and stores it idempotently.
---

import { Aside } from '@astrojs/starlight/components';

## Overview

A sync runs entirely in the **worker** process via BullMQ. It can be triggered in two ways:

1. **Automatically** — after a successful OAuth callback (initial sync)
2. **On-demand** — via `POST /v1/users/:id/connections/:cid/sync`

## Step-by-Step

```
API receives sync trigger
    │
    ▼
Enqueue job onto `sync` BullMQ queue
    │
    ▼
Worker picks up job
    ├─ 1. Load connection from DB (providerId, encrypted tokens)
    ├─ 2. Decrypt access + refresh tokens (AES-256-GCM)
    ├─ 3. Resolve provider from ProviderRegistry
    ├─ 4. Check token expiry → refresh if needed, re-encrypt + save
    ├─ 5. Call provider.syncData(tokens, { from, to }) → AsyncGenerator
    ├─ 6. Consume generator in batches of 500
    │       └─ INSERT INTO health_metrics … ON CONFLICT DO NOTHING
    ├─ 7. Update connection.lastSyncedAt
    ├─ 8. Enqueue webhook delivery jobs for registered endpoints
    ├─ 9. Enqueue analytics job (correlations + health score update)
    └─ 10. Run anomaly detection → enqueue notification jobs if thresholds met
```

## Sync Window

The `from` / `to` range passed to `syncData()` is determined by:

- **First sync**: last 30 days
- **Subsequent syncs**: `connection.lastSyncedAt` → now

The `defaultSyncWindow()` helper in `@biosync-io/provider-core` handles this logic.

## Idempotency

Every metric row is inserted with:

```sql
INSERT INTO health_metrics (…)
VALUES (…)
ON CONFLICT (user_id, provider_id, metric_type, recorded_at) DO NOTHING;
```

This means re-triggering a sync — whether due to a retry, a user pressing "Sync now", or a BullMQ job re-queue — never creates duplicate rows.

## Retries & Back-Off

BullMQ is configured with:

- **3** automatic retries on failure
- **Exponential back-off** starting at 5 seconds
- Failed jobs move to a dead-letter queue visible in the Bull Board UI (available at `/admin/queues` in development)

## Webhook Delivery

After a sync completes, the worker enqueues one delivery job per registered webhook endpoint. Each delivery:

1. Signs the payload with HMAC-SHA256 (`X-VitaSync-Signature` header)
2. POSTs to the endpoint with a 10-second timeout
3. Retries up to 5 times with exponential back-off on non-2xx responses
4. Records delivery status in `webhook_deliveries` for audit and debugging

<Aside type="tip">
Delivery history is available via `GET /v1/webhooks/:id/deliveries`.
</Aside>

## Analytics Pipeline

After a sync completes, the worker enqueues an analytics job on the `analytics` queue (concurrency 3):

1. **Correlation update** — Recomputes pairwise metric correlations over the last 90 days
2. **Health score update** — Recalculates composite scores (overall, sleep, activity, cardio, recovery)
3. **Anomaly detection** — Checks the most recent data points against statistical and clinical thresholds

If anomalies are detected, the worker automatically enqueues notification jobs.

## Notification Delivery

The `notifications` queue (concurrency 8) dispatches alerts through user-configured channels:

```
Notification job arrives
    │
    ▼
Notification Processor
    ├─ 1. Load user's notification rules from DB
    ├─ 2. Filter rules by category + severity match
    ├─ 3. Resolve target notification_channels from matching rules
    ├─ 4. For each channel:
    │       ├─ Look up channel type → resolve from ChannelRegistry
    │       ├─ Call channel.send(payload, config)
    │       └─ Log result to notification_logs (success or failure)
    └─ 5. Return aggregated delivery results
```

Supported channels: Discord, Slack, Teams, Email, Web Push, ntfy, Webhook.

See the [Notification System guide](/dev-guides/notifications) for configuration details.

## BullMQ Queue Summary

| Queue | Concurrency | Purpose |
|-------|-------------|---------|
| `sync` | 5 | Provider data sync |
| `webhooks` | 10 | HMAC-signed webhook delivery |
| `analytics` | 3 | Correlation + health score computation |
| `reports` | 2 | Scheduled health reports |
| `notifications` | 8 | Multi-channel notification dispatch |
