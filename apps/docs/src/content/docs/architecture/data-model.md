---
title: Data Model
description: How VitaSync stores users, providers, health metrics, events, and personal records.
---

import { Aside } from '@astrojs/starlight/components';

VitaSync stores all health data in PostgreSQL using [Drizzle ORM](https://orm.drizzle.team). This reference explains every table, the relationships between them, and the JSON shapes used for complex metrics.

## Entity Relationships

```
workspaces
    |
    +-- users (many per workspace)
          |
          +-- provider_connections (one per provider per user)
          |         |
          |         +-- sync_jobs
          |         +-- health_metrics (via userId + providerId)
          |         +-- events (via userId + providerId)
          |
          +-- personal_records (one per metricType+category per user)
          |
          +-- notification_channels (many per user)
          |         |
          |         +-- notification_logs (delivery audit trail)
          |
          +-- notification_rules (route categories → channels)
          |
          +-- mood_logs (mood & mental wellness)
          +-- journal_entries (daily journal)
          +-- water_intake (hydration tracking)
          +-- habits (habit definitions)
          |       +-- habit_logs (daily completions)
          +-- nutrition_logs (meal/food tracking)
          +-- medications (medication tracking)
          +-- symptom_logs (symptom occurrences)
          +-- goals (health goals)
          +-- achievements (unlocked badges)
          +-- training_plans (workout plans)
          +-- health_scores (composite wellness scores)
          +-- health_reports (generated reports)
          +-- health_snapshots (point-in-time snapshots)
          +-- biometric_baselines (rolling baselines)
          +-- anomaly_alerts (detected anomalies)
          +-- correlations (metric relationships)
          +-- training_load (fitness/fatigue/form)

workspaces
    |
    +-- api_keys
    +-- webhooks
          |
          +-- webhook_deliveries
```

## Tables

### `workspaces`

Top-level tenant. All data is isolated per workspace.

| Column | Type | Notes |
|--------|------|-------|
| `id` | ULID | Primary key |
| `name` | text | Display name |
| `slug` | text | URL-safe unique identifier |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

### `users`

A user corresponds to one person with one or more wearable devices.

| Column | Type | Notes |
|--------|------|-------|
| `id` | ULID | Primary key |
| `workspaceId` | ULID | FK → `workspaces.id` |
| `externalId` | text | Your system's user ID. Unique per workspace |
| `email` | text | Optional |
| `displayName` | text | Optional |
| `metadata` | jsonb | Arbitrary key-value data you want to store alongside the user |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

Unique constraint: `(workspaceId, externalId)`

### `api_keys`

Workspace-level API keys used to authenticate all API requests.

| Column | Type | Notes |
|--------|------|-------|
| `id` | ULID | Primary key |
| `workspaceId` | ULID | FK → `workspaces.id` |
| `name` | text | Human-readable label |
| `keyHash` | text | SHA-256 hash of the raw key — raw key never stored |
| `keyPrefix` | text | First 8 characters of the raw key (for identification in logs) |
| `scopes` | text[] | Array of: `read`, `write`, `admin` |
| `expiresAt` | timestamptz | Null = never expires |
| `lastUsedAt` | timestamptz | Updated on every authenticated request |
| `createdAt` | timestamptz | |

### `provider_connections`

Stores OAuth tokens for each user-provider pair. Tokens are encrypted before storage.

| Column | Type | Notes |
|--------|------|-------|
| `id` | ULID | Primary key |
| `userId` | ULID | FK → `users.id` |
| `providerId` | text | `fitbit`, `garmin`, `whoop`, `strava` |
| `encryptedTokens` | text | AES-256-GCM encrypted JSON (accessToken, refreshToken, expiresAt) |
| `status` | text | `active`, `error`, `disconnected` |
| `lastSyncedAt` | timestamptz | Null until first sync completes |
| `connectedAt` | timestamptz | When OAuth was completed |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

Unique constraint: `(userId, providerId)` — one connection per provider per user.

<Aside type="note">
  Tokens are encrypted with AES-256-GCM using the `ENCRYPTION_KEY` environment variable. Set `ENCRYPTION_KEY` to a 64-character hex string (32 random bytes). Losing this key means all stored tokens become unreadable — all users would need to reconnect.
</Aside>

### `health_metrics`

Stores individual health data points from provider syncs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | ULID | Primary key |
| `userId` | ULID | FK → `users.id` |
| `providerId` | text | Which provider supplied this data point |
| `metricType` | text | See [Metric Types](#metric-types) below |
| `value` | numeric | Scalar value for simple metrics (null for complex metrics) |
| `unit` | text | Unit string, e.g. `count`, `bpm`, `kg`, `meters` |
| `data` | jsonb | Structured data for complex metrics (sleep stages, etc.) — null for scalar metrics |
| `source` | text | `user` (device-measured), `manual`, or `computed` |
| `recordedAt` | timestamptz | When the device recorded the measurement |
| `createdAt` | timestamptz | When VitaSync ingested it |

Unique constraint: `(userId, providerId, metricType, recordedAt)` — prevents duplicate ingestion across multiple syncs.

### `events`

Structured events such as workout sessions and sleep sessions. These are richer than scalar metrics and stored separately.

| Column | Type | Notes |
|--------|------|-------|
| `id` | ULID | Primary key |
| `userId` | ULID | FK → `users.id` |
| `providerId` | text | |
| `providerEventId` | text | Provider-assigned event ID (for deduplication) |
| `eventType` | text | `workout`, `sleep`, `activity` |
| `activityType` | text | For workouts: `running`, `cycling`, `swimming`, `strength_training`, etc. |
| `startedAt` | timestamptz | Event start time |
| `endedAt` | timestamptz | Event end time |
| `durationSeconds` | integer | Duration in seconds |
| `distanceMeters` | numeric | Distance for movement-based activities |
| `caloriesKcal` | numeric | Calories burned |
| `avgHeartRate` | integer | Average heart rate (bpm) |
| `maxHeartRate` | integer | Maximum heart rate (bpm) |
| `data` | jsonb | Provider-specific extended data (laps, elevation, sleep stages, etc.) |
| `createdAt` | timestamptz | |

Unique constraint: `(userId, providerId, providerEventId)`.

### `personal_records`

Tracks lifetime bests per metric type for each user. Automatically updated after every successful sync.

| Column | Type | Notes |
|--------|------|-------|
| `id` | ULID | Primary key |
| `userId` | ULID | FK → `users.id` |
| `metricType` | text | See Metric Types below |
| `category` | text | e.g. `daily_max`, `daily_min`, `all_time_max` |
| `value` | numeric | The record value |
| `unit` | text | |
| `recordedAt` | timestamptz | When the record was set |
| `providerId` | text | Which provider's data set this record |
| `updatedAt` | timestamptz | |

Unique constraint: `(userId, metricType, category)`.

### `webhooks`

Registered HTTP endpoints for event delivery.

| Column | Type | Notes |
|--------|------|-------|
| `id` | ULID | Primary key |
| `workspaceId` | ULID | FK → `workspaces.id` |
| `url` | text | Your HTTPS endpoint |
| `secretHash` | text | HMAC signing secret, hashed for storage |
| `events` | text[] | Subscribed event types |
| `isActive` | boolean | If false, no deliveries are made |
| `description` | text | Optional label |
| `createdAt` | timestamptz | |

### `webhook_deliveries`

Delivery log for every attempted webhook event delivery.

| Column | Type | Notes |
|--------|------|-------|
| `id` | ULID | Primary key |
| `webhookId` | ULID | FK → `webhooks.id` |
| `event` | text | Event type string |
| `payload` | jsonb | Full request body that was sent |
| `status` | text | `pending`, `delivered`, `failed` |
| `statusCode` | integer | HTTP response code from your server |
| `attemptCount` | integer | Number of delivery attempts so far |
| `deliveredAt` | timestamptz | Null until successfully delivered |
| `createdAt` | timestamptz | |

### `sync_jobs`

Tracks the state of each background sync execution.

| Column | Type | Notes |
|--------|------|-------|
| `id` | ULID | Primary key |
| `connectionId` | ULID | FK → `provider_connections.id` |
| `status` | text | `pending`, `running`, `completed`, `failed` |
| `metricsSynced` | integer | Number of data points written |
| `error` | text | Error message if status is `failed` |
| `startedAt` | timestamptz | |
| `completedAt` | timestamptz | |
| `createdAt` | timestamptz | |

### `notification_channels`

Stores user-configured notification channel instances. Each row represents a specific channel (e.g. "Work Slack", "Personal Discord").

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `userId` | UUID | FK → `users.id` (cascade delete) |
| `channelType` | varchar(30) | `discord`, `slack`, `teams`, `email`, `push`, `ntfy`, `webhook` |
| `label` | varchar(100) | Human-readable name |
| `config` | jsonb | Channel-specific settings (webhook URL, SMTP config, etc.) |
| `enabled` | boolean | Whether this channel is active |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

Indexed on `(userId)` and `(userId, channelType)`.

### `notification_rules`

Determines which events trigger which channels. A rule links event categories and minimum severity to a set of notification channels.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `userId` | UUID | FK → `users.id` (cascade delete) |
| `name` | varchar(100) | Human-readable rule name |
| `categories` | jsonb | Array of categories: `anomaly`, `goal`, `achievement`, `sync`, `report`, `system`, `insight` |
| `minSeverity` | varchar(20) | Minimum severity to match: `info`, `warning`, `critical` |
| `channelIds` | jsonb | Array of `notification_channels.id` to deliver to |
| `enabled` | boolean | Whether the rule is active |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

Indexed on `(userId)`.

### `notification_logs`

Delivery audit log for every notification dispatch attempt.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `userId` | UUID | FK → `users.id` (cascade delete) |
| `channelId` | UUID | FK → `notification_channels.id` (cascade delete) |
| `channelType` | varchar(30) | Denormalized for fast querying |
| `title` | varchar(255) | Notification title |
| `payload` | jsonb | Full payload sent |
| `status` | varchar(20) | `pending`, `delivered`, `failed` |
| `attempts` | integer | Number of delivery attempts |
| `error` | varchar(2000) | Error message if failed |
| `deliveredAt` | timestamptz | Null until successful |
| `createdAt` | timestamptz | |

Indexed on `(userId)`, `(channelId)`, and `(status)`.

---

## Metric Types

### Activity

| Type | Unit | Description |
|------|------|-------------|
| `steps` | `count` | Step count |
| `distance` | `meters` | Distance traveled |
| `calories` | `kcal` | Active calories burned |
| `active_minutes` | `minutes` | Time in moderate+ intensity zones |
| `floors` | `count` | Floors climbed (Fitbit) |

### Cardiovascular

| Type | Unit | Description |
|------|------|-------------|
| `heart_rate` | `bpm` | Instantaneous or average heart rate |
| `resting_heart_rate` | `bpm` | Daily resting heart rate |
| `heart_rate_variability` | `ms` | RMSSD-based HRV (overnight) |

### Sleep

| Type | Unit | Description |
|------|------|-------------|
| `sleep` | `hours` | Sleep duration; stage breakdown in `data` |
| `sleep_score` | `score` | Composite sleep quality score (0–100) |

### Body Composition

| Type | Unit | Description |
|------|------|-------------|
| `weight` | `kg` | Body weight |
| `body_fat` | `percent` | Body fat percentage |
| `bmi` | `index` | Body mass index |
| `blood_oxygen` | `percent` | Blood oxygen via pulse oximetry |
| `blood_pressure` | `mmHg` | Systolic/diastolic in `data.systolic`/`data.diastolic` |
| `temperature` | `celsius` | Skin or core temperature |
| `blood_glucose` | `mmol_l` | Blood glucose |

### Recovery

| Type | Unit | Description |
|------|------|-------------|
| `stress` | `score` | Stress score (Garmin: 0–100) |
| `hrv_status` | `status` | HRV band: `poor`, `balanced`, `good`, `optimal` |
| `recovery_score` | `percent` | WHOOP recovery (0–100%) |
| `readiness_score` | `score` | Daily readiness (0–100) |
| `strain_score` | `score` | WHOOP daily strain (0–21) |

### Breathing

| Type | Unit | Description |
|------|------|-------------|
| `respiratory_rate` | `breaths_per_min` | Breaths per minute (overnight average) |
| `spo2` | `percent` | SpO2 from pulse oximetry |

### Workouts

| Type | Description |
|------|-------------|
| `workout` | Workout session marker; full data in the Events API |

---

## Complex Metric Data Structures

### Sleep (`data` field)

```json
{
  "stages": {
    "deep": 95,
    "light": 220,
    "rem": 110,
    "awake": 20
  },
  "efficiency": 88,
  "consistency": 74,
  "startTime": "2025-06-05T23:15:00.000Z",
  "endTime": "2025-06-06T07:00:00.000Z",
  "score": 82
}
```

### Blood Pressure (`data` field)

```json
{
  "systolic": 118,
  "diastolic": 76,
  "pulse": 68
}
```

### Heart Rate (intraday, `data` field)

```json
{
  "min": 46,
  "max": 148,
  "resting": 56,
  "zones": {
    "fat_burn": 42,
    "cardio": 28,
    "peak": 8
  }
}
```

### Workout Event (`data` field)

```json
{
  "sport": "running",
  "elevationGain": 85,
  "elevationLoss": 82,
  "avgPace": "6:15",
  "avgCadence": 168,
  "avgPower": null,
  "laps": [
    { "lapNumber": 1, "distance": 1000, "time": 375, "avgHR": 152 }
  ],
  "hrZones": {
    "zone1": 180,
    "zone2": 420,
    "zone3": 810,
    "zone4": 1080,
    "zone5": 210
  }
}
```

## Wellness Tracking Tables

### `journal_entries`

Daily journal entries with mood tagging, gratitude lists, and searchable content.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `user_id` | uuid | FK → users, cascade delete |
| `title` | varchar(200) | Optional title/headline |
| `body` | text | Main journal content (markdown-friendly) |
| `mood_score` | double | Mood 1–5 at time of writing |
| `mood_label` | varchar(50) | happy, calm, anxious, sad, energized, tired, grateful, reflective |
| `gratitude` | jsonb | Array of gratitude strings |
| `tags` | jsonb | Array of tag strings |
| `entry_date` | timestamptz | When the entry is for |
| `created_at` | timestamptz | Row creation time |
| `updated_at` | timestamptz | Last update time |

Index: `(user_id, entry_date)`

### `water_intake`

Individual hydration logs with beverage type and daily goal tracking.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `user_id` | uuid | FK → users, cascade delete |
| `amount_ml` | integer | Amount in milliliters |
| `beverage_type` | varchar(30) | water, tea, coffee, juice, other |
| `note` | varchar(200) | Optional context note |
| `daily_goal_ml` | integer | Daily goal snapshot (default 2500) |
| `logged_at` | timestamptz | When the intake was logged |
| `created_at` | timestamptz | Row creation time |

Index: `(user_id, logged_at)`

### `habits`

User-defined habit definitions with streak tracking.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `user_id` | uuid | FK → users, cascade delete |
| `name` | varchar(100) | Habit name |
| `icon` | varchar(10) | Emoji icon |
| `color` | varchar(20) | UI color (blue, green, red, etc.) |
| `frequency` | varchar(20) | daily, weekdays, custom |
| `target_days` | jsonb | Array of day numbers (0=Sun, 6=Sat) |
| `active` | boolean | Whether the habit is active |
| `current_streak` | integer | Current consecutive day streak |
| `longest_streak` | integer | Best streak ever |
| `created_at` | timestamptz | Row creation time |
| `updated_at` | timestamptz | Last update time |

Index: `(user_id)`

### `habit_logs`

One row per habit per day when completed.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `habit_id` | uuid | FK → habits, cascade delete |
| `user_id` | uuid | FK → users, cascade delete |
| `completed_date` | date | The date the habit was completed |
| `note` | varchar(200) | Optional note |
| `created_at` | timestamptz | Row creation time |

Indexes: `(habit_id, completed_date)`, `(user_id, completed_date)`
