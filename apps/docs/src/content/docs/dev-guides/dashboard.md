---
title: Web Dashboard
description: Using the VitaSync web dashboard — Sync Jobs, theme picker, and auto-sync settings.
---

import { Aside } from '@astrojs/starlight/components';

The VitaSync web dashboard (`apps/web`) is a Next.js 15 App Router application available at **http://localhost:3000** (or your configured domain). It provides a management UI for users, provider connections, sync jobs, settings, and more.

## Navigation

| Section | Path | Description |
|---------|------|-------------|
| Users | `/dashboard/users` | Browse workspace users and their provider connections |
| Sync Jobs | `/dashboard/sync-jobs` | Live view of background sync job queue |
| Webhooks | `/dashboard/webhooks` | Manage outbound webhook endpoints |
| Settings | `/dashboard/settings` | API keys, appearance, and preferences |

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
