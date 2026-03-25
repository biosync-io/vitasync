---
title: Web Dashboard
description: Using the VitaSync web dashboard — PWA features, offline support, push notifications, sync jobs, theme picker, and settings.
---

import { Aside } from '@astrojs/starlight/components';

The VitaSync web dashboard (`apps/web`) is a Next.js 16 **Progressive Web App** available at **http://localhost:3000** (or your configured domain). It can be **installed** on desktop and mobile devices, works **offline** with cached data, and supports **push notifications**. It provides a management UI for users, provider connections, sync jobs, notifications, settings, and more.

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
| Algorithms | `/dashboard/algorithms` | Browsable catalog of analytics algorithms |
| Partner Events | `/dashboard/partner-events` | Inbound webhook log viewer |
| Body Metrics | `/dashboard/body-metrics` | Body composition with clinical charts |
| Settings | `/dashboard/settings` | Theme, preferences, auto-sync toggle |

## Progressive Web App (PWA)

The dashboard is a fully-featured PWA — installable, offline-capable, and push-enabled.

### Installation

When you visit the dashboard in a supported browser (Chrome, Edge, Safari 17+), an **Install VitaSync** prompt appears in the bottom-right corner. Click **Install** to add VitaSync to your home screen or app dock. The prompt can be dismissed and won't appear again.

You can also install from the browser's address bar (look for the install icon) or via the browser menu.

### Offline Support

VitaSync uses a **service worker** powered by [Workbox](https://developer.chrome.com/docs/workbox/) to cache pages and API responses:

| Strategy | Scope | Behaviour |
|----------|-------|-----------|
| **Precache** | Next.js build output | All pages and JS bundles cached at install time |
| **CacheFirst** | Static assets, fonts, images, icons | Served from cache instantly; long TTL |
| **NetworkFirst** | API data (`/api/v1/*`) | Tries network first with 10s timeout; falls back to cached response |
| **CacheFirst** | Next.js static chunks | Immutable build assets cached for 1 year |

When the device goes offline, a floating **"You're offline — showing cached data"** banner appears at the bottom of the screen. When connectivity returns, a brief **"Back online"** toast confirms reconnection.

If a page has never been cached, the app shows a branded **offline fallback page** with a retry button.

### Background Sync

Mutations made while offline (e.g., logging water intake, mood entries, journal notes) are queued in **IndexedDB** and replayed automatically when connectivity returns via the [Background Sync API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API).

### Push Notifications

VitaSync supports **Web Push** notifications via the VAPID protocol. To enable:

1. Generate VAPID keys: `pnpm --filter @biosync-io/web generate-vapid-keys`
2. Add the keys to your `.env` file:
   ```bash
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public-key>
   VAPID_PRIVATE_KEY=<private-key>
   VAPID_SUBJECT=mailto:admin@vitasync.io
   ```
3. Users can enable push notifications in their browser when prompted

Push notifications are delivered for health anomalies, goal completions, sync events, and other configurable alerts through the [notification system](/vitasync/dev-guides/notifications/).

### App Badge

On supported platforms (Chrome on Android/desktop, Safari on macOS), the app icon badge updates with the **unread notification count** using the [Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API).

### Periodic Background Sync

On Chromium browsers, VitaSync registers a **periodic background sync** (every 12 hours) to refresh health scores, readiness data, and insights in the cache — so the dashboard loads fresh data even before you open it.

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

## Algorithms

The **Algorithms** page (`/dashboard/algorithms`) provides a browsable catalog of all 54 analytics algorithms used by VitaSync's scoring engines.

### Features

- **Search** — find algorithms by name or description
- **Category filtering** — filter by category (health score, readiness, training load, metabolic, recovery, stress, circadian, body)
- **Algorithm cards** — each card shows the algorithm name, description, category, signal weights, and key thresholds
- **Expandable details** — click a card to view the full formula, input signals, and scoring ranges

This page is read-only and reflects the algorithm definitions used by the analytics engine. It serves as a reference for understanding how scores and metrics are calculated.

## Partner Events

The **Partner Events** page (`/dashboard/partner-events`) displays a real-time log of inbound webhooks received from connected providers (e.g. Garmin push notifications, Withings data updates).

### Features

- **Provider filter** — narrow by provider (Garmin, Withings, etc.)
- **Status filter** — filter by processing status (`received`, `processed`, `failed`, `ignored`)
- **Event details** — expandable rows showing the raw webhook payload, processing result, and timestamps
- **Auto-refresh** — the log refreshes every 10 seconds to show new events

Partner events are logged to the `partner_events` table and provide an audit trail for debugging sync issues with push-based providers.

## Body Metrics

The **Body Metrics** page (`/dashboard/body-metrics`) provides full-size charts for body composition and clinical vitals.

### Chart Types

| Chart | Reference Lines |
|-------|----------------|
| **SpO₂** | Normal (≥ 95%), concerning (92–94%), critical (< 92%) |
| **Temperature** | Normal range (36.1–37.2°C), fever threshold (38.0°C) |
| **Respiratory Rate** | Normal (12–20 breaths/min), tachypnea (> 25) |
| **Body Fat %** | Age- and gender-adjusted healthy ranges |
| **Weight** | Trend line with 14-day moving average |
| **BMI** | WHO categories (underweight / normal / overweight / obese) |

All charts include **clinical reference lines** so users can quickly see whether their values fall within healthy ranges.

## Activity

The **Activity** page (`/dashboard/activity`) now features event-type-specific expandable cards that display detailed information based on the activity type.

### Card Types

| Event Type | Expanded Details |
|------------|-----------------|
| **Workout** | Duration, calories, heart rate zones, peak HR, sport type, route map (if GPS available) |
| **Sleep** | Duration, efficiency, stage breakdown (deep/light/REM/awake), sleep score |
| **Activity** | Steps, distance, active minutes, floors, hourly breakdown |

Each card shows a summary row with key metrics and can be expanded to reveal the full dataset. Cards are sorted by date with infinite scroll pagination.

## Notification Logs

The **Notification Logs** page (`/dashboard/notification-logs`) provides a searchable, filterable activity log of every notification the system has attempted to deliver.

Each log entry shows:
- **Status** — `delivered`, `failed`, or `pending`
- **Channel** — which channel was used
- **Category & Severity** — the notification's classification
- **Timestamp** — when the delivery was attempted
- **Error** — if the delivery failed, the error message is shown

Use the filters at the top to narrow by status, channel, or date range. Failed deliveries include the error message to help debug configuration issues.
