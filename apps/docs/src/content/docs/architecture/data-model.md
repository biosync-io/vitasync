---
title: Data Model
description: The core database tables and TypeScript types that underpin VitaSync.
---

VitaSync uses **PostgreSQL 16** with **Drizzle ORM** for type-safe queries. All schema files live in `packages/db/src/schema/`.

## Core Tables

### `workspaces`

Isolates all data for a tenant.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | Primary key |
| `slug` | `text` | URL-safe identifier, unique |
| `createdAt` | `timestamptz` | |

### `api_keys`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `workspaceId` | `uuid` | FK → `workspaces` |
| `keyHash` | `text` | SHA-256 of the raw key — never stored in plain text |
| `label` | `text` | Human-readable name |
| `createdAt` | `timestamptz` | |

### `users`

Users are workspace-scoped and identified by a developer-supplied `externalId`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `workspaceId` | `uuid` | FK → `workspaces` |
| `externalId` | `text` | Your own user identifier |
| `email` | `text` | Optional |
| `createdAt` | `timestamptz` | |

### `connections`

One row per (user, provider) pair that has been OAuth-authorised.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `userId` | `uuid` | FK → `users` |
| `providerId` | `text` | e.g. `"fitbit"`, `"garmin"` |
| `accessToken` | `text` | AES-256-GCM encrypted |
| `refreshToken` | `text` | AES-256-GCM encrypted |
| `tokenExpiresAt` | `timestamptz` | |
| `lastSyncedAt` | `timestamptz` | |

### `health_metrics`

The central fact table. Unique on `(userId, providerId, metricType, recordedAt)`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `userId` | `uuid` | FK → `users` |
| `providerId` | `text` | Source provider |
| `metricType` | `text` | Enum — see below |
| `value` | `numeric` | |
| `unit` | `text` | e.g. `"count"`, `"bpm"`, `"kg"` |
| `recordedAt` | `timestamptz` | When the device recorded the measurement |
| `metadata` | `jsonb` | Provider-specific extra fields |
| `createdAt` | `timestamptz` | When VitaSync ingested the row |

## Metric Types

Defined in `packages/types/src/index.ts` as `HealthMetricType`:

| Value | Unit | Description |
|-------|------|-------------|
| `STEPS` | `count` | Step count |
| `HEART_RATE` | `bpm` | Heart rate |
| `RESTING_HEART_RATE` | `bpm` | Resting heart rate |
| `HRV` | `ms` | Heart rate variability (RMSSD) |
| `SLEEP_DURATION` | `minutes` | Total sleep time |
| `CALORIES` | `kcal` | Active calories burned |
| `DISTANCE` | `meters` | Distance covered |
| `ACTIVE_MINUTES` | `minutes` | Time in active zone |
| `SPO2` | `percent` | Blood oxygen saturation |
| `SKIN_TEMP` | `celsius` | Skin temperature |
| `RECOVERY_SCORE` | `score` | Provider recovery score (0–100) |
| `STRAIN` | `score` | Provider strain/exertion score |
| `WEIGHT` | `kg` | Body weight |
| `BODY_FAT` | `percent` | Body fat percentage |
