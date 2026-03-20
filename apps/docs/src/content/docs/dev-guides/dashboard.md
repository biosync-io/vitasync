---
title: Web Dashboard
description: Using the VitaSync web dashboard — Sync Jobs, notifications, theme picker, and settings.
---

import { Aside } from '@astrojs/starlight/components';

The VitaSync web dashboard (`apps/web`) is a Next.js 16 App Router application available at **http://localhost:3000** (or your configured domain). It provides a management UI for users, provider connections, sync jobs, notifications, settings, and more.

## Navigation

| Section | Path | Description |
|---------|------|-------------|
| Dashboard | `/dashboard` | Overview with health scores, recent workouts, goals, insights |
| Health Score | `/dashboard/health-scores` | Composite wellness score visualization |
| Readiness | `/dashboard/readiness` | Recovery readiness and training load |
| Insights | `/dashboard/insights` | AI-generated health insights |
| Reports | `/dashboard/reports` | Health report generation |
| Anomalies | `/dashboard/anomalies` | Detected health anomalies |
| Correlations | `/dashboard/correlations` | Metric relationship discovery |
| Health Data | `/dashboard/health` | Raw health metric explorer |
| Sleep | `/dashboard/sleep` | Sleep analysis and tracking |
| Activity | `/dashboard/activity` | Workout history and training |
| Nutrition | `/dashboard/nutrition` | Nutrition and meal logging |
| Mood | `/dashboard/mood` | Mood and mental wellness tracking |
| Journal | `/dashboard/journal` | Daily journal with gratitude and mood tagging |
| Water Intake | `/dashboard/water` | Hydration tracking with daily goals |
| Habits | `/dashboard/habits` | Daily habit tracking with streaks |
| Symptoms | `/dashboard/symptoms` | Symptom logging |
| Medications | `/dashboard/medications` | Medication tracking |
| Training | `/dashboard/training` | Training plans and load |
| Goals | `/dashboard/goals` | Health goal tracking |
| Achievements | `/dashboard/achievements` | Unlocked badges |
| Challenges | `/dashboard/challenges` | Workspace-wide challenges |
| Providers | `/dashboard/providers` | Connected devices and OAuth |
| Users | `/dashboard/users` | Workspace user management |
| Sync Jobs | `/dashboard/sync-jobs` | Live BullMQ job queue monitor |
| Exports | `/dashboard/exports` | Data export management |
| Webhooks | `/dashboard/webhooks` | Webhook CRUD and delivery history |
| Notifications | `/dashboard/notifications` | Notification channel setup and rules |
| Notification Logs | `/dashboard/notification-logs` | Delivery history |
| API Keys | `/dashboard/api-keys` | API key management |
| Settings | `/dashboard/settings` | Theme, preferences, auto-sync toggle |

## Sync Jobs

The **Sync Jobs** page (`/dashboard/sync-jobs`) shows a live view of all BullMQ sync jobs across the queue.

![Sync Jobs screenshot placeholder]

### Status badges

| Badge | Meaning |
|-------|---------|
| `completed` (green) | Sync finished successfully |
| `failed` (red) | Sync encountered an error |
| `active` (blue) | Sync is currently running |
| `waiting` (yellow) | Job is queued, waiting for a worker |
| `delayed` (grey) | Job is scheduled for future execution |

The page **auto-refreshes every 5 seconds** so you can watch jobs progress in real time. Use the **Refresh** button to force an immediate reload.

<Aside type="tip">
  If a job is stuck in `active` state the worker may have crashed. Restart the worker service: `docker compose restart worker`.
</Aside>

## Theme Picker

VitaSync's dashboard supports **five accent colour themes**. The selected theme is saved in `localStorage` and applied instantly without a page reload.

| Theme | Colour |
|-------|--------|
| Indigo | `#4f46e5` (default) |
| Blue | `#2563eb` |
| Green | `#16a34a` |
| Purple | `#9333ea` |
| Rose | `#e11d48` |

To change the theme, go to **Settings → Appearance** and click a colour swatch. The entire dashboard (buttons, links, focus rings, active states) updates immediately.

The preference is stored under the `vitasync_accent` key in `localStorage` and is **per-browser** — different users on different browsers can each have their own theme.

## Auto-sync on Provider Connect

When a user connects a new provider via OAuth (e.g. Fitbit, Garmin, Strava), the dashboard automatically triggers an initial sync **without any extra click**. This means health data starts flowing as soon as the OAuth callback completes.

### How it works

The user detail page (`/dashboard/users/:id`) tracks previously-seen connection IDs. After the user returns from the OAuth tab, the page detects the new connection and calls `POST /v1/users/:id/connections/:cid/sync` automatically.

### Disabling auto-sync

Auto-sync can be toggled per-browser in **Settings → Appearance**:

1. Navigate to **Settings** in the sidebar.
2. Find the **Appearance** section.
3. Toggle **Auto-sync on connect** off.

The preference is stored under the `vitasync_auto_sync` key in `localStorage`. Setting the value to `"false"` disables auto-sync. Any other value (or the key being absent) is treated as enabled.

<Aside>
  The auto-sync toggle is a browser-local preference. It does not affect server-side behaviour or scheduled syncs — only the automatic trigger that fires when a new OAuth connection is detected on the user detail page.
</Aside>

## Settings Page

The **Settings** page (`/dashboard/settings`) is divided into three sections:

### API Reference

Lists the API base URL and links to the Swagger UI at `/docs`.

### API Keys

Create and manage API keys for programmatic access. Keys are shown in full **once** at creation time; the plaintext is never stored again.

### Appearance

- **Accent colour** — pick from five themes; saved to `localStorage`.
- **Auto-sync on connect** — enable or disable automatic sync when a new provider connection is detected.

## Notification Settings

The **Notification Settings** page (`/dashboard/notifications`) lets you manage notification channels and define routing rules — all stored in the database per user, no environment variables needed.

### Channels Tab

Manage delivery channels (Discord, Slack, Email, ntfy, Webhook, etc.):
- **Add Channel** — select a channel type, enter a name, and provide the channel-specific configuration (e.g. webhook URL, SMTP settings).
- **Test** — send a test message to verify the channel works before saving routing rules.
- **Enable / Disable** — toggle channels on or off without deleting them.
- **Delete** — remove a channel permanently.

### Routing Rules Tab

Define which notifications go to which channels:
- **Add Rule** — select a channel, then choose matching criteria: **category** (e.g. `sync`, `anomaly`, `achievement`), **severity** (e.g. `critical`, `warning`, `info`), or both.
- Rules are evaluated for every notification — if a notification matches a rule's criteria, it is delivered to that rule's channel.
- Priority ordering lets you control which rule takes precedence when multiple rules match.

<Aside type="tip">
  See the [Notification System guide](/vitasync/dev-guides/notifications/) for channel configuration examples and the full API reference.
</Aside>

## Notification Logs

The **Notification Logs** page (`/dashboard/notification-logs`) provides a searchable, filterable activity log of every notification the system has attempted to deliver.

Each log entry shows:
- **Status** — `delivered`, `failed`, or `pending`
- **Channel** — which channel was used
- **Category & Severity** — the notification's classification
- **Timestamp** — when the delivery was attempted
- **Error** — if the delivery failed, the error message is shown

Use the filters at the top to narrow by status, channel, or date range. Failed deliveries include the error message to help debug configuration issues.
