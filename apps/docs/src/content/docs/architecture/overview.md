---
title: Architecture Overview
description: How the VitaSync API, worker, and provider packages fit together.
---

import { Aside } from '@astrojs/starlight/components';

VitaSync is a TypeScript monorepo with three runtime applications and a set of shared packages.

## Repository Layout

```
vitasync/
├── apps/
│   ├── api/        # Fastify 5 REST API
│   ├── worker/     # BullMQ background worker
│   ├── web/        # Next.js 15 App Router dashboard
│   └── mcp/        # MCP server — expose health data + AI analytics to AI assistants
├── packages/
│   ├── types/      # Shared TypeScript types
│   ├── db/         # Drizzle ORM schemas + postgres.js client
│   ├── analytics/  # Correlation engine, anomaly detection, LLM context builder
│   ├── notifications/
│   │   ├── core/       # Abstract channel, registry, manager, shared types
│   │   ├── discord/    # Discord webhook embeds
│   │   ├── slack/      # Slack Block Kit
│   │   ├── teams/      # Microsoft Teams Adaptive Cards
│   │   ├── email/      # SMTP via nodemailer
│   │   ├── push/       # Web Push (VAPID)
│   │   ├── ntfy/       # ntfy.sh REST API
│   │   └── webhook/    # Generic webhook (HMAC-SHA256)
│   └── providers/
│       ├── core/   # Abstract providers + ProviderRegistry
│       ├── fitbit/
│       ├── garmin/
│       ├── strava/
│       └── whoop/
├── monitoring/
│   ├── docker-compose.monitoring.yml   # Grafana + Prometheus + exporters
│   ├── grafana/
│   │   ├── dashboards/                 # 8 pre-built health dashboards (JSON)
│   │   └── provisioning/               # Auto-provisioned datasource + folder
│   └── prometheus/                     # Scrape config + alerting rules
└── helm/vitasync/  # Production Helm chart
```

## Request Flow

```
Client
  │
  ▼
API (Fastify 5)
  ├─ auth plugin → verifies API key hash (SHA-256)
  ├─ GET  /v1/providers         → list registered providers
  ├─ POST /v1/users             → create / find user
  ├─ GET  /v1/oauth/:p/authorize → start OAuth flow
  ├─ GET  /v1/oauth/:p/callback  → exchange code, store tokens
  ├─ GET  /v1/users/:id/connections
  ├─ POST /v1/users/:id/connections/:cid/sync  → enqueue sync job
  ├─ GET  /v1/users/:id/health  → query metrics with filters
  ├─ GET  /v1/users/:id/analytics/context → LLM-ready biological context
  ├─ POST /v1/users/:id/analytics/correlations → auto-discover correlations
  ├─ POST /v1/users/:id/analytics/anomalies → detect anomalies
  ├─ GET  /v1/users/:id/notifications/channels → channel CRUD
  ├─ POST /v1/users/:id/notifications/rules → rule-based routing
  ├─ POST /v1/api-keys
  └─ POST /v1/webhooks

          │ BullMQ enqueue
          ▼
    Worker process
      ├─ sync queue: resolves provider, decrypts tokens, streams data
      │    ├─ bulk-inserts to health_metrics (idempotent)
      │    └─ enqueues webhook delivery + anomaly check
      ├─ analytics queue: compute correlations + health scores
      ├─ notifications queue: resolve rules → dispatch to channels
      │    ├─ Discord, Slack, Teams, Email, Push, ntfy, Webhook
      │    └─ log delivery results to notification_logs
      └─ webhooks queue: HMAC-signed HTTP delivery with retries

AI Assistant (Claude, GPT, Cursor…)
  │ MCP protocol (stdio or HTTP/SSE)
  ▼
MCP Server (apps/mcp)
  ├─ tool: query_health_metrics  → SELECT from health_metrics
  ├─ tool: list_users            → SELECT from users
  ├─ tool: list_connections      → SELECT from provider_connections
  ├─ tool: get_personal_records  → SELECT from personal_records
  ├─ tool: get_events            → SELECT from events
  ├─ tool: get_health_context    → LLM-ready biological context
  ├─ tool: get_anomaly_alerts    → detected anomalies with severity filters
  ├─ tool: get_correlations      → metric correlations with strength filter
  └─ tool: get_health_scores     → composite health scores
```

## Key Design Decisions

### Plugin-Based Providers

Each provider is an independent `packages/providers/<name>/` package that extends `OAuth2Provider` or `OAuth1Provider` from `@biosync-io/provider-core`. Providers register themselves into a singleton `ProviderRegistry` at startup. Adding a new provider requires **zero changes to the core packages**.

### Idempotent Writes

Health metrics are inserted with a composite unique index on `(userId, providerId, metricType, recordedAt)`. A sync job can safely be retried or re-triggered — duplicate rows are silently ignored via `ON CONFLICT DO NOTHING`.

### Async Generator Streaming

`provider.syncData()` is an `AsyncGenerator<SyncDataPoint>`. The worker consumes it lazily, batching rows before writing to the database, keeping memory usage flat regardless of how many records a provider returns.

### Multi-Tenancy via Workspaces

Every resource (users, connections, metrics, webhooks, API keys) belongs to a **workspace**. API keys are scoped to a workspace and hashed before storage. This makes VitaSync safe to use as a backend for multi-tenant SaaS products.

### Modular Notification System

Notifications follow the same plugin pattern as providers. Each channel (Discord, Slack, Teams, Email, Push, ntfy, Webhook) is an independent package under `packages/notifications/` that extends the abstract `NotificationChannel` class from `@biosync-io/notification-core`. Channels register into a singleton `ChannelRegistry` at worker startup.

Users configure channels and define rules that map notification categories (`anomaly`, `goal`, `achievement`, `sync`, `report`, `system`, `insight`) and minimum severity levels (`info`, `warning`, `critical`) to specific channels. The `NotificationManager` resolves matching rules and dispatches to all configured channels in parallel via `Promise.allSettled`, logging every delivery attempt.

### AI & Analytics Pipeline

The `@biosync-io/analytics` package provides three core capabilities:

1. **Correlation Engine** — Computes pairwise Pearson and Spearman rank correlations across health metrics. Only statistically significant results (|r| > 0.3, p < 0.05) are retained and persisted.
2. **Anomaly Detector** — Uses Z-score analysis (2.5σ), IQR outlier detection, and clinical thresholds (SpO₂ < 92%, HR > 120, temp > 39.5°C) to identify unusual health patterns. Detected anomalies can trigger notifications automatically.
3. **LLM Context Builder** — `buildLLMContext()` produces a structured biological context package with baselines, trends, anomalies, correlations, health scores, and a natural language summary. This powers the MCP `get_health_context` tool and the REST `GET /analytics/context` endpoint.

## CI/CD & Release Pipeline

VitaSync uses GitHub Actions for all CI/CD. There are two key workflows:

### `docker-publish.yml` — build, version, and publish

Runs on every push to `main`, `feature/**`, `fix/**`, `alpha/**`, and `beta/**`.

```
Push to branch
      │
      ├─ (main only) release job
      │     ├─ reads PR title via GitHub API
      │     ├─ detects Conventional Commit type (feat / fix / feat! …)
      │     ├─ bumps VERSION file (major / minor / patch)
      │     └─ commits "chore: release vX.Y.Z" + git tag back to main
      │
      └─ build-and-push job
            ├─ determines channel: main → stable, beta/** → beta, else → alpha
            ├─ resolves version: stable uses bumped VERSION; pre-release appends channel+sha
            ├─ builds Docker images for api / worker / web
            └─ pushes to ghcr.io with channel-appropriate tags
```

**Stable tags** (main): `1.2.3`, `1.2`, `1`, `latest`, `sha-xxxxxxx`
**Beta tags** (beta/\*\*): `beta`, `beta-xxxxxxx`, `sha-xxxxxxx`
**Alpha tags** (everything else): `alpha`, `alpha-xxxxxxx`, `sha-xxxxxxx`

The `helm-package` job runs only after a successful stable release and publishes the Helm chart to GHCR.

### `pr-title-lint.yml` — enforce Conventional Commits

Runs on every pull request event. Validates that the PR title matches the Conventional Commit pattern:

```
<type>[optional scope][optional !]: <description>
```

Valid types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`.
An empty or whitespace-only title fails immediately. See the [Contributing guide](/vitasync/dev-guides/contributing) for examples.

### Version source of truth

The `VERSION` file at the repository root is the **single source of truth** for the release version. `package.json` files are not used for versioning. Only the `release` job (triggered on `main`) ever modifies `VERSION`.

---

## MCP Server

`apps/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server built with the official `@modelcontextprotocol/sdk`. It connects directly to the VitaSync PostgreSQL database (read-only) and exposes health data as **MCP tools** that any MCP-compatible AI assistant can call.

This means you can ask an AI assistant things like _"How have my resting heart rate and HRV trended over the last 3 months?"_ or _"What anomalies were detected this week?"_ and it will fetch live data from your VitaSync instance.

The server exposes 9 tools: `query_health_metrics`, `list_users`, `list_connections`, `get_events`, `get_personal_records`, `get_health_context`, `get_anomaly_alerts`, `get_correlations`, and `get_health_scores`.

See the [MCP Server guide](/vitasync/dev-guides/mcp) for setup instructions.

## Monitoring Stack

`monitoring/` contains a production-grade observability stack:

| Service | Port | Purpose |
|---------|------|---------|
| **Grafana** | `3030` | Health data dashboards + platform metrics |
| **Prometheus** | `9090` | Metrics collection |
| **postgres-exporter** | `9187` | PostgreSQL metrics for Prometheus |
| **redis-exporter** | `9121` | Redis metrics for Prometheus |

Eight pre-built Grafana dashboards are provisioned automatically:

| Dashboard | UID |
|-----------|-----|
| Platform Overview | `vs-platform` |
| Workouts & Activity | `vs-workouts` |
| Sleep | `vs-sleep` |
| Heart Health | `vs-heart-health` |
| Body Metrics | `vs-body-metrics` |
| Personal Records | `vs-personal-records` |
| Daily Activity | `vs-daily-activity` |
| Provider Health | `vs-provider-health` |

See the [Grafana Dashboards guide](/vitasync/dev-guides/grafana-dashboards) for setup instructions.
