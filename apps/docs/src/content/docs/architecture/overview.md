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
│   └── mcp/        # MCP server — expose health data to AI assistants
├── packages/
│   ├── types/      # Shared TypeScript types
│   ├── db/         # Drizzle ORM schemas + postgres.js client
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
  ├─ POST /v1/api-keys
  └─ POST /v1/webhooks

          │ BullMQ enqueue
          ▼
    Worker process
      ├─ resolves provider from ProviderRegistry
      ├─ decrypts OAuth tokens (AES-256-GCM)
      ├─ streams data via provider.syncData() → AsyncGenerator
      ├─ bulk-inserts to health_metrics (idempotent)
      └─ enqueues webhook delivery job

AI Assistant (Claude, GPT, Cursor…)
  │ MCP protocol (stdio or HTTP/SSE)
  ▼
MCP Server (apps/mcp)
  ├─ tool: query_health_metrics  → SELECT from health_metrics
  ├─ tool: list_users            → SELECT from users
  ├─ tool: list_connections      → SELECT from provider_connections
  ├─ tool: get_personal_records  → SELECT from personal_records
  └─ tool: get_events            → SELECT from events (workouts, sleep…)
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

## MCP Server

`apps/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server built with the official `@modelcontextprotocol/sdk`. It connects directly to the VitaSync PostgreSQL database (read-only) and exposes health data as **MCP tools** that any MCP-compatible AI assistant can call.

This means you can ask an AI assistant things like _"How have my resting heart rate and HRV trended over the last 3 months?"_ or _"Show me my top 10 personal records"_ and it will fetch live data from your VitaSync instance.

See the [MCP Server guide](/dev-guides/mcp) for setup instructions.

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

See the [Grafana Dashboards guide](/dev-guides/grafana-dashboards) for setup instructions.
