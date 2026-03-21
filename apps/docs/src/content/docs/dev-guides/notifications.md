---
title: Notification System
description: Set up and configure the modular notification system — channels, rules, delivery, and the web UI.
---

import { Aside, Steps, Tabs, TabItem } from '@astrojs/starlight/components';

VitaSync includes a modular notification system that delivers alerts to users through 7 configurable channel types. Notifications are routed by **category** and **severity** using user-defined rules. All configuration is stored **per-user in the database** — no environment variables needed.

## Setup

The notification system is ready to use out of the box. There are **two ways** to configure it:

### Option A: Web Dashboard UI (recommended)

Navigate to **Dashboard → Notifications** at `http://localhost:3000/dashboard/notifications`. The UI provides:

- **Channels tab** — Add, edit, test, enable/disable, and delete notification channels. Each channel type has a dedicated form with the required configuration fields.
- **Routing Rules tab** — Create rules that match event categories and severity levels to one or more channels.
- **Test delivery** — Send a test notification to verify your channel config before going live.

### Option B: REST API

Use the API endpoints documented below to create channels and rules programmatically.

<Aside type="tip">
  All notification settings (SMTP credentials, webhook URLs, VAPID keys, etc.) are stored per-user in the `notification_channels` database table — **not** in environment variables. Each user can have their own independent set of channels and routing rules.
</Aside>

### Viewing Delivery Logs

Navigate to **Dashboard → Notification Logs** at `http://localhost:3000/dashboard/notification-logs` to see:

- Stats cards: total notifications, delivered, pending, failed
- Filterable log table with status and channel type filters
- Expandable rows showing the full payload and error details
- Auto-refreshes every 10 seconds

## Architecture

```
Event occurs (anomaly detected, goal reached, sync completed…)
    │
    ▼
API / Worker enqueues notification job onto `notifications` BullMQ queue
    │
    ▼
Notification Processor (worker)
    ├─ loads user's notification rules from DB
    ├─ filters rules by category + severity
    ├─ resolves target channels from matching rules
    ├─ dispatches to all channels in parallel via NotificationManager
    └─ logs delivery results to notification_logs table
```

## Supported Channels

| Channel | Package | Transport | Config Keys |
|---------|---------|-----------|-------------|
| **Discord** | `@biosync-io/notification-discord` | Webhook with rich embeds | `webhookUrl` |
| **Slack** | `@biosync-io/notification-slack` | Block Kit messages | `webhookUrl` |
| **Microsoft Teams** | `@biosync-io/notification-teams` | Adaptive Cards v1.4 | `webhookUrl` |
| **Email** | `@biosync-io/notification-email` | SMTP via nodemailer | `host`, `port`, `user`, `pass`, `from`, `to` |
| **Web Push** | `@biosync-io/notification-push` | VAPID-based push | `endpoint`, `keys.p256dh`, `keys.auth` |
| **ntfy** | `@biosync-io/notification-ntfy` | [ntfy.sh](https://ntfy.sh) REST API | `serverUrl`, `topic`, `token` (optional) |
| **Webhook** | `@biosync-io/notification-webhook` | HTTP POST with HMAC-SHA256 | `url`, `secret` |

### Channel Configuration Examples

<Tabs>
  <TabItem label="Discord">
    1. In your Discord server, go to **Server Settings → Integrations → Webhooks → New Webhook**
    2. Copy the webhook URL
    3. In VitaSync, create a Discord channel with that URL:
    ```json
    {
      "channelType": "discord",
      "label": "Health Alerts",
      "config": { "webhookUrl": "https://discord.com/api/webhooks/123/abc..." }
    }
    ```
    Optionally set `botUsername` and `avatarUrl` for custom branding.
  </TabItem>
  <TabItem label="Slack">
    1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
    2. Enable **Incoming Webhooks** and create one for your channel
    3. Create a Slack channel:
    ```json
    {
      "channelType": "slack",
      "label": "Team Health Channel",
      "config": { "webhookUrl": "https://hooks.slack.com/services/T.../B.../..." }
    }
    ```
  </TabItem>
  <TabItem label="Email">
    Provide your SMTP server credentials:
    ```json
    {
      "channelType": "email",
      "label": "Personal Email",
      "config": {
        "host": "smtp.gmail.com",
        "port": 587,
        "user": "you@gmail.com",
        "pass": "app-password",
        "from": "VitaSync <you@gmail.com>",
        "to": "you@gmail.com"
      }
    }
    ```
    For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833).
  </TabItem>
  <TabItem label="ntfy">
    [ntfy](https://ntfy.sh) is a simple push notification service. You can use the public server or self-host.
    ```json
    {
      "channelType": "ntfy",
      "label": "Phone Alerts",
      "config": {
        "serverUrl": "https://ntfy.sh",
        "topic": "vitasync-health",
        "token": "tk_optional_access_token"
      }
    }
    ```
    Install the ntfy app on your phone and subscribe to the same topic.
  </TabItem>
  <TabItem label="Webhook">
    Send raw HTTP POST payloads to any URL with HMAC-SHA256 verification:
    ```json
    {
      "channelType": "webhook",
      "label": "Custom Integration",
      "config": {
        "url": "https://your-app.com/hooks/vitasync",
        "secret": "whsec_your_secret_key"
      }
    }
    ```
    The `X-VitaSync-Signature` header contains the HMAC signature.
  </TabItem>
</Tabs>

## Concepts

### Notification Payload

Every notification contains:

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Short summary |
| `body` | string | Detailed message |
| `severity` | `info` \| `warning` \| `critical` | Urgency level |
| `category` | string | Event type (see below) |
| `metadata` | object | Optional structured data (metric values, thresholds, etc.) |
| `url` | string | Optional deep link |
| `timestamp` | ISO 8601 | When the event occurred |

### Categories

| Category | Triggered by |
|----------|-------------|
| `anomaly` | Anomaly detector finds unusual health patterns |
| `goal` | User reaches a configured health goal |
| `achievement` | Personal record set or milestone reached |
| `sync` | Sync completed or failed |
| `report` | Scheduled health report generated |
| `system` | System events (connection issues, token expiry) |
| `insight` | AI-generated health insights |

### Severity Levels

Rules specify a **minimum severity**. A rule with `minSeverity: "warning"` matches both `warning` and `critical` notifications, but not `info`.

| Level | Use for |
|-------|---------|
| `info` | Informational — sync completed, daily report ready |
| `warning` | Attention needed — unusual metric pattern, token expiring |
| `critical` | Immediate attention — clinical threshold breached, SpO₂ < 92% |

## API Endpoints

### Channels

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/notifications/channels` | List all channels |
| `POST` | `/v1/users/:userId/notifications/channels` | Create a channel |
| `PUT` | `/v1/users/:userId/notifications/channels/:channelId` | Update a channel |
| `DELETE` | `/v1/users/:userId/notifications/channels/:channelId` | Delete a channel |
| `POST` | `/v1/users/:userId/notifications/channels/:channelId/test` | Send a test notification |

### Rules

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/notifications/rules` | List all rules |
| `POST` | `/v1/users/:userId/notifications/rules` | Create a rule |
| `PUT` | `/v1/users/:userId/notifications/rules/:ruleId` | Update a rule |
| `DELETE` | `/v1/users/:userId/notifications/rules/:ruleId` | Delete a rule |

### Delivery Logs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/notifications/logs` | Query delivery history |

## Quick Start

<Steps>
1. **Create a Discord channel**

   ```bash
   curl -X POST http://localhost:3001/v1/users/$USER_ID/notifications/channels \
     -H "Authorization: Bearer $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "channelType": "discord",
       "label": "Health Alerts",
       "config": {
         "webhookUrl": "https://discord.com/api/webhooks/123/abc..."
       }
     }'
   ```

2. **Create a rule for anomaly alerts**

   ```bash
   curl -X POST http://localhost:3001/v1/users/$USER_ID/notifications/rules \
     -H "Authorization: Bearer $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Critical anomalies to Discord",
       "categories": ["anomaly"],
       "minSeverity": "warning",
       "channelIds": ["<channel_id_from_step_1>"]
     }'
   ```

3. **Test the channel**

   ```bash
   curl -X POST http://localhost:3001/v1/users/$USER_ID/notifications/channels/<channel_id>/test \
     -H "Authorization: Bearer $API_KEY"
   ```

4. **Check delivery logs**

   ```bash
   curl http://localhost:3001/v1/users/$USER_ID/notifications/logs?limit=10 \
     -H "Authorization: Bearer $API_KEY"
   ```
</Steps>

## Adding a Notification Channel

To add a new channel type:

<Steps>
1. **Create the package**

   ```
   packages/notifications/<name>/
   ├── package.json
   ├── tsconfig.json
   └── src/
       └── index.ts
   ```

2. **Implement the channel class**

   ```typescript
   import { NotificationChannel } from "@biosync-io/notification-core"
   import type { NotificationPayload, NotificationResult, ChannelConfig } from "@biosync-io/notification-core"

   export class MyChannel extends NotificationChannel {
     readonly type = "my-channel" as const

     async send(payload: NotificationPayload, config: ChannelConfig): Promise<NotificationResult> {
       // Deliver the notification using config settings
       // Return { success: true } or { success: false, error: "..." }
     }

     validateConfig(config: ChannelConfig): boolean {
       // Return true if config has all required fields
       return Boolean(config.requiredField)
     }
   }
   ```

3. **Register in the worker**

   In `apps/worker/src/index.ts`:

   ```typescript
   import { MyChannel } from "@biosync-io/notification-my-channel"
   channelRegistry.register("my-channel", new MyChannel())
   ```

4. **Add to workspace config**

   Update `pnpm-workspace.yaml` if using a new glob, and add the dependency to `apps/worker/package.json`.
</Steps>

<Aside type="tip">
Channel implementations follow the same plugin pattern as providers — each is an independent package with zero coupling to the core system. Adding a new channel requires no changes to existing code.
</Aside>

## Database Tables

The notification system uses three tables:

- **`notification_channels`** — User's configured channel instances with channel-specific config (JSONB)
- **`notification_rules`** — Routing rules that map categories + severity to channels
- **`notification_logs`** — Delivery audit log with status, attempts, and error details

See the [Data Model](/vitasync/architecture/data-model) reference for full column definitions.

## Worker Queue

Notifications are processed by a dedicated BullMQ queue (`notifications`) with:

- **Concurrency**: 8 parallel jobs
- **Retries**: 3 attempts with exponential back-off
- Delivery results are logged to `notification_logs` after each attempt
