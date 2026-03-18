<div align="center">

# VitaSync

**Self-hosted wearable health data aggregation platform**

[![CI](https://github.com/your-org/vitasync/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/vitasync/actions/workflows/ci.yml)
[![Docker](https://github.com/your-org/vitasync/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/your-org/vitasync/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://typescriptlang.org)

Connect Fitbit, Garmin, Withings, Polar, Strava — and more — to a single API you control.

</div>

---

## Overview

VitaSync is a fully TypeScript monorepo that gives you a production-ready, multi-tenant platform for collecting and querying health data from wearable devices. It is designed to be embedded in your own product: create users with your own IDs, connect their devices via OAuth, then query their health metrics through a clean REST API.

### Key features

| Feature | Details |
|---------|---------|
| **Plugin provider system** | Add a new device brand by implementing one abstract class and calling `register()` |
| **AI & Analytics** | Correlation engine, anomaly detection, health scores, and LLM-ready context endpoints for AI coaching |
| **Modular notifications** | Discord, Slack, Teams, Email, Push, ntfy, Webhook — rule-based routing with severity filtering |
| **Multi-tenant** | Workspaces isolate data; API keys are scoped per workspace |
| **Async-first** | BullMQ workers handle sync, webhook delivery, analytics, and notifications via `AsyncGenerator` |
| **Idempotent syncs** | Composite unique index on `(userId, providerId, metricType, recordedAt)` — re-running a sync is safe |
| **Secure by default** | OAuth tokens encrypted with AES-256-GCM; API keys stored as SHA-256 hashes only |
| **OpenAPI docs** | Swagger UI auto-generated at `/docs` |
| **MCP server** | Exposes health data + AI analytics to AI assistants (Claude, Cursor, VS Code Copilot) via the Model Context Protocol |
| **Grafana dashboards** | 8 pre-built health dashboards auto-provisioned from `monitoring/grafana/dashboards/` |
| **Web dashboard** | Next.js dashboard with sync-job monitor, accent theme picker, and auto-sync on provider connect |
| **Helm chart** | Production-ready chart with HPA, PDB, ingress, migration Job, and secret management |

---

## Architecture

```
vitasync/
├── apps/
│   ├── api/        # Fastify 5 REST API — routes, services, auth plugin
│   ├── worker/     # BullMQ worker — sync, analytics, notifications
│   ├── web/        # Next.js 15 App Router dashboard
│   └── mcp/        # MCP server — expose health data + AI analytics to AI assistants
├── packages/
│   ├── types/      # Shared TypeScript types (HealthMetric, ProviderDefinition…)
│   ├── db/         # Drizzle ORM schemas + postgres.js client
│   ├── analytics/  # Correlation engine, anomaly detection, LLM context builder
│   ├── notifications/
│   │   ├── core/       # Abstract channel, registry, manager, types
│   │   ├── discord/    # Discord webhook notifications
│   │   ├── slack/      # Slack Block Kit notifications
│   │   ├── teams/      # Microsoft Teams Adaptive Cards
│   │   ├── email/      # SMTP email (nodemailer)
│   │   ├── push/       # Web Push (VAPID)
│   │   ├── ntfy/       # ntfy.sh notifications
│   │   └── webhook/    # Generic webhook (HMAC-SHA256 signed)
│   └── providers/
│       ├── core/   # Abstract OAuth2Provider / OAuth1Provider + ProviderRegistry
│       ├── fitbit/ # Fitbit Connect implementation
│       └── garmin/ # Garmin Connect implementation
├── monitoring/
│   ├── docker-compose.monitoring.yml   # Grafana + Prometheus + exporters
│   ├── grafana/dashboards/             # 8 pre-built health dashboards
│   └── grafana/provisioning/           # Auto-provisioned datasource + folder
└── helm/vitasync/  # Helm chart for Kubernetes deployment
```

**Request flow:**

```
Client
  │
  ▼
API (Fastify)
  ├─ auth plugin → verifies API key hash
  ├─ routes/v1/oauth → OAuth2 authorization + callback
  ├─ routes/v1/users → CRUD for workspace users
  ├─ routes/v1/connections → list/disconnect, trigger sync
  ├─ routes/v1/health → query health metrics with filters
  ├─ routes/v1/analytics → LLM context, correlations, anomaly detection
  ├─ routes/v1/notifications → channel CRUD, rules, delivery logs
  ├─ routes/v1/api-keys → create/revoke API keys
  ├─ routes/v1/webhooks → CRUD + delivery history
  └─ routes/v1/providers → list available providers

  Sync trigger → BullMQ sync queue
                      │
                      ▼
               Worker process
                  ├─ resolves provider from registry
                  ├─ decrypts OAuth tokens
                  ├─ streams data via provider.syncData()
                  ├─ bulk-inserts to health_metrics (idempotent)
                  ├─ enqueues webhook delivery
                  ├─ runs anomaly detection → triggers notification if threshold met
                  └─ dispatches notifications via registered channels
```

---

## Quick start

### Docker (recommended)

```bash
# 1. Clone
git clone https://github.com/your-org/vitasync
cd vitasync

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET, ENCRYPTION_KEY, and provider credentials

# 3. Start everything
docker compose up -d

# 4. Watch logs
docker compose logs -f api worker
```

- **Web dashboard**: http://localhost:3000
- **API**: http://localhost:3001
- **OpenAPI docs**: http://localhost:3001/docs

### Local development

```bash
# Prerequisites: Node.js 22+, pnpm 10+, PostgreSQL 16, Redis 7

# Install dependencies
pnpm install

# Start dev servers (hot reload)
pnpm dev

# Run DB migrations
pnpm db:migrate
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection URL |
| `REDIS_URL` | ✅ | Redis connection URL (used by BullMQ) |
| `JWT_SECRET` | ✅ | Min 32-char secret for signing |
| `ENCRYPTION_KEY` | ✅ | 64-char hex (256-bit) for AES-256-GCM token encryption |
| `OAUTH_REDIRECT_BASE_URL` | ✅ | Public base URL for OAuth callbacks, e.g. `https://api.example.com` |
| `FITBIT_CLIENT_ID` | for Fitbit | From Fitbit developer console |
| `FITBIT_CLIENT_SECRET` | for Fitbit | From Fitbit developer console |
| `GARMIN_CONSUMER_KEY` | for Garmin | From Garmin Health API |
| `GARMIN_CONSUMER_SECRET` | for Garmin | From Garmin Health API |
| `SMTP_HOST` | for Email | SMTP server hostname |
| `SMTP_PORT` | for Email | SMTP port (default: `587`) |
| `SMTP_USER` | for Email | SMTP username |
| `SMTP_PASS` | for Email | SMTP password |
| `SMTP_FROM` | for Email | Sender address, e.g. `VitaSync <noreply@example.com>` |
| `VAPID_PUBLIC_KEY` | for Push | VAPID public key (generate with `web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | for Push | VAPID private key |
| `VAPID_SUBJECT` | for Push | VAPID subject, e.g. `mailto:admin@example.com` |

---

## API reference

Full OpenAPI spec at `/docs` when the server is running.

### Authentication

All API requests (except `/health`, `/docs`, `/v1/oauth/*`) require:

```
Authorization: Bearer vs_live_<key>
```

### Core endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/providers` | List available provider integrations |
| `POST` | `/v1/users` | Create or find a user by external ID |
| `GET` | `/v1/users` | List all users in workspace |
| `GET` | `/v1/oauth/:provider/authorize?userId=<id>` | Start OAuth flow |
| `GET` | `/v1/oauth/:provider/callback` | OAuth callback (handled internally) |
| `GET` | `/v1/users/:id/connections` | List a user's provider connections |
| `POST` | `/v1/users/:id/connections/:cid/sync` | Trigger immediate sync |
| `GET` | `/v1/users/:id/health` | Query health metrics (filterable) |
| `GET` | `/v1/users/:id/health/summary` | Count per metric type |
| `POST` | `/v1/api-keys` | Create an API key |
| `POST` | `/v1/webhooks` | Register a webhook |
| `GET` | `/v1/users/:id/analytics/context` | LLM-ready biological context (AI) |
| `POST` | `/v1/users/:id/analytics/correlations` | Auto-discover metric correlations |
| `POST` | `/v1/users/:id/analytics/anomalies` | Detect health anomalies |
| `GET` | `/v1/users/:id/notifications/channels` | List notification channels |
| `POST` | `/v1/users/:id/notifications/channels` | Register a notification channel |
| `POST` | `/v1/users/:id/notifications/channels/:cid/test` | Send a test notification |
| `GET` | `/v1/users/:id/notifications/rules` | List notification rules |
| `POST` | `/v1/users/:id/notifications/rules` | Create a notification rule |
| `GET` | `/v1/users/:id/notifications/logs` | Delivery log history |

### Example: connect a Fitbit user

```bash
# 1. Create a user
curl -X POST http://localhost:3001/v1/users \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"externalId":"user_123","email":"jane@example.com"}'

# 2. Redirect their browser to authorize Fitbit
# GET http://localhost:3001/v1/oauth/fitbit/authorize?userId=<user_id>

# 3. After OAuth callback completes, query their steps
curl "http://localhost:3001/v1/users/<user_id>/health?metricType=STEPS&limit=30" \
  -H "Authorization: Bearer $API_KEY"
```

## Adding a provider

1. Create `packages/providers/<name>/`:

```typescript
// packages/providers/mydevice/src/index.ts
import { OAuth2Provider, providerRegistry } from "@biosync-io/provider-core"
import type { ProviderDefinition, SyncOptions, SyncDataPoint } from "@biosync-io/types"

export class MyDeviceProvider extends OAuth2Provider {
  readonly definition: ProviderDefinition = {
    id: "mydevice",
    name: "My Device",
    description: "My wearable brand",
    authType: "oauth2",
    capabilities: ["steps", "heart_rate"],
    authorizationUrl: "https://mydevice.com/oauth/authorize",
    tokenUrl: "https://mydevice.com/oauth/token",
    scopes: ["activity", "heartrate"],
  }

  async *syncData(tokens: ProviderTokens, opts: SyncOptions): AsyncGenerator<SyncDataPoint> {
    // fetch and yield data points
  }

  // implement: getAuthorizationUrl, exchangeCode, refreshTokens
}

export function registerMyDeviceProvider() {
  if (!process.env.MYDEVICE_CLIENT_ID) return
  providerRegistry.register(new MyDeviceProvider().definition, () => new MyDeviceProvider())
}
```

2. Call `registerMyDeviceProvider()` in `apps/api/src/index.ts` and `apps/worker/src/index.ts`.

3. Add credentials to `.env.example` and the Helm `values.yaml`.

---

## Notification Channels

VitaSync includes a modular notification system supporting 7 channel types. Users configure channels and define rules that route notifications by category and severity.

### Supported channels

| Channel | Package | Transport |
|---------|---------|-----------|
| **Discord** | `@biosync-io/notification-discord` | Webhook embeds with severity-mapped colors |
| **Slack** | `@biosync-io/notification-slack` | Block Kit formatted messages |
| **Microsoft Teams** | `@biosync-io/notification-teams` | Adaptive Cards v1.4 |
| **Email** | `@biosync-io/notification-email` | SMTP via nodemailer with HTML templates |
| **Web Push** | `@biosync-io/notification-push` | VAPID-based web push notifications |
| **ntfy** | `@biosync-io/notification-ntfy` | [ntfy.sh](https://ntfy.sh) REST API |
| **Webhook** | `@biosync-io/notification-webhook` | Generic HTTP POST with HMAC-SHA256 signing |

### How it works

1. **Register a channel** — `POST /v1/users/:id/notifications/channels` with `channelType` and channel-specific `config` (e.g. webhook URL, SMTP settings).
2. **Create rules** — `POST /v1/users/:id/notifications/rules` to map categories (`anomaly`, `goal`, `achievement`, `sync`, `report`, `system`, `insight`) and minimum severity (`info`, `warning`, `critical`) to one or more channels.
3. **Automatic dispatch** — When an event occurs (e.g. anomaly detected), the worker resolves matching rules and dispatches to all configured channels in parallel via the `notifications` BullMQ queue.
4. **Test delivery** — `POST /v1/users/:id/notifications/channels/:cid/test` sends a test message through the worker.
5. **Audit log** — Every delivery is recorded in `notification_logs` and queryable via `GET /v1/users/:id/notifications/logs`.

### Adding a notification channel

1. Create `packages/notifications/<name>/` with a class extending `NotificationChannel` from `@biosync-io/notification-core`.
2. Implement `send(payload, config)` and `validateConfig(config)`.
3. Register with `channelRegistry.register("myChannel", new MyChannel())` in the worker.

---

## AI & Advanced Analytics

VitaSync provides built-in analytics that power AI-assisted health coaching.

### Correlation Engine

The correlation engine (`@biosync-io/analytics`) automatically discovers relationships between health metrics using Pearson and Spearman rank correlation:

- Analyzes pairwise metric correlations over configurable time windows (7–365 days)
- Filters for statistical significance (|r| > 0.3, p < 0.05)
- Persists results to the database for trend tracking
- API: `POST /v1/users/:id/analytics/correlations`

### Anomaly Detection

Multi-method anomaly detection identifies unusual health patterns:

- **Statistical**: Z-score (2.5σ) and IQR outlier detection
- **Clinical thresholds**: SpO₂ < 92%, HR > 120 bpm, temperature > 39.5°C, and more
- Automatically triggers notifications when thresholds are breached
- API: `POST /v1/users/:id/analytics/anomalies`

### LLM-Ready Context

The `buildLLMContext()` function produces a structured biological context package optimized for AI assistants:

- Metric baselines and trends
- Recent anomalies and active alerts
- Key correlations and health scores
- Natural language summary for direct prompt injection
- API: `GET /v1/users/:id/analytics/context`
- MCP: `get_health_context` tool

---

## MCP Server

The `apps/mcp` package is a [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI assistants query your VitaSync health data directly.

### Build

```bash
pnpm --filter @biosync-io/mcp build
```

### Connect to Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vitasync": {
      "command": "node",
      "args": ["/path/to/vitasync/apps/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://vitasync:changeme@localhost:5432/vitasync"
      }
    }
  }
}
```

The server exposes these tools:

| Tool | Description |
|------|-------------|
| `query_health_metrics` | Query health metrics by user, type, time range |
| `list_users` | List workspace users |
| `list_connections` | List provider connections with status |
| `get_events` | Query workout / sleep / activity events |
| `get_personal_records` | Retrieve all-time personal bests |
| `get_health_context` | LLM-ready biological context with baselines, trends, anomalies, correlations, and health scores |
| `get_anomaly_alerts` | Retrieve detected health anomalies with severity and status filters |
| `get_correlations` | Discover metric correlations with configurable minimum strength |
| `get_health_scores` | Retrieve composite health scores (overall, sleep, activity, cardio, recovery) |

---

## Grafana Dashboards

A monitoring stack with 8 pre-built health dashboards is included in `monitoring/`.

```bash
# Start alongside the main stack
docker compose \
  -f docker-compose.yml \
  -f monitoring/docker-compose.monitoring.yml \
  up -d
```

Open **http://localhost:3030** (admin / admin) and navigate to **Dashboards → VitaSync Health**.

| Dashboard | What it shows |
|-----------|---------------|
| Platform Overview | Users, connections, sync volume |
| Workouts | Distance, calories, HR, speed, workout log |
| Sleep | Duration, stages, score, awakenings |
| Heart Health | Resting HR, HRV, SpO₂, VO₂ max |
| Body Metrics | Weight, BMI, body fat %, muscle mass |
| Personal Records | All-time bests across all metric types |
| Daily Activity | Steps, active minutes, floors, calories |
| Provider Health | Connection status, sync lag, ingestion volume |

---

## Kubernetes / Helm

```bash
# Install with ingress enabled
helm install vitasync ./helm/vitasync \
  --namespace vitasync \
  --create-namespace \
  --set ingress.enabled=true \
  --set ingress.api.host=api.example.com \
  --set ingress.web.host=app.example.com \
  --set secrets.DATABASE_URL="postgresql://..." \
  --set secrets.REDIS_URL="redis://..." \
  --set secrets.JWT_SECRET="$(openssl rand -base64 32)" \
  --set secrets.ENCRYPTION_KEY="$(openssl rand -hex 32)"

# Upgrade
helm upgrade vitasync ./helm/vitasync --reuse-values

# Using an external secret (recommended for production)
helm install vitasync ./helm/vitasync \
  --set secrets.existingSecret=vitasync-prod-secrets
```

### Production tips

- Use [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) or [External Secrets Operator](https://external-secrets.io) and set `secrets.existingSecret`.
- Enable HPA: `api.autoscaling.enabled=true`, `worker.autoscaling.enabled=true`.
- Enable PDB: `api.podDisruptionBudget.enabled=true` (already on by default).
- The migration Job runs automatically as a `pre-install,pre-upgrade` Helm hook.

---

## Dashboard

The `apps/web` Next.js dashboard is available at **http://localhost:3000** and provides:

| Feature | Description |
|---------|-------------|
| **Sync Jobs** | Live table of BullMQ jobs — status badges (completed / failed / active / waiting), duration, last run time, and a manual refresh button. Auto-refreshes every 5 seconds. |
| **Theme picker** | Five accent colours (Indigo, Blue, Green, Purple, Rose) saved in `localStorage`. All UI chrome (buttons, links, focus rings) updates instantly. |
| **Auto-sync on connect** | When a user connects a new provider via OAuth the dashboard fires a sync automatically without any extra click. |
| **Auto-sync toggle** | In **Settings → Appearance** you can disable the auto-sync behaviour. The preference is saved in `localStorage` (`vitasync_auto_sync`). |

---

## Releases & Versioning

The canonical version is stored in the [`VERSION`](VERSION) file at the root of the repository. `package.json` files are **not** used for release versioning.

### Release channels

Docker images are published to `ghcr.io/your-org/vitasync-*` on every push:

| Branch | Channel | Example tags |
|--------|---------|-------------|
| `main` | **stable** | `1.2.3`, `1.2`, `1`, `latest`, `sha-abc1234` |
| `beta/**` | **beta** | `beta`, `beta-abc1234`, `sha-abc1234` |
| `feature/**`, `fix/**`, `alpha/**` | **alpha** | `alpha`, `alpha-abc1234`, `sha-abc1234` |

Pull a specific channel:

```bash
# latest stable release
docker pull ghcr.io/your-org/vitasync-api:latest

# latest beta
docker pull ghcr.io/your-org/vitasync-api:beta

# pinned alpha build
docker pull ghcr.io/your-org/vitasync-api:alpha-abc1234
```

### Automatic version bumps (Conventional Commits)

When a PR is merged to `main`, the `docker-publish` workflow reads the **PR title** and bumps the `VERSION` file automatically:

| PR title prefix | Bump | Example |
|-----------------|------|---------|
| `feat!:` or `BREAKING CHANGE` | **major** | `1.0.0 → 2.0.0` |
| `feat:` | **minor** | `1.0.0 → 1.1.0` |
| `fix:`, `chore:`, anything else | **patch** | `1.0.0 → 1.0.1` |

The workflow commits the bumped `VERSION` file back to `main` with a `chore: release vX.Y.Z` commit and a matching git tag (e.g. `v1.2.3`). **No manual label-setting or tag-pushing is needed.**

See [Contributing](apps/docs/src/content/docs/dev-guides/contributing.md) for the full PR title convention.

---

## Development commands

```bash
pnpm build          # Build all packages
pnpm dev            # Start all apps in watch mode
pnpm test           # Run all tests
pnpm lint           # Biome lint check
pnpm lint:fix       # Biome lint + auto-fix
pnpm format         # Biome format
pnpm typecheck      # tsc --noEmit across workspace
pnpm db:generate    # Generate Drizzle migration files
pnpm db:migrate     # Apply migrations (requires DATABASE_URL)
pnpm db:studio      # Open Drizzle Studio
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22, TypeScript 5.7 |
| API framework | Fastify 5 |
| ORM | Drizzle ORM 0.38 + postgres.js |
| Database | PostgreSQL 16 |
| Queue | BullMQ 5 + Redis 7 |
| Dashboard | Next.js 15 App Router + Tailwind CSS |
| MCP | @modelcontextprotocol/sdk 1.x |
| Analytics | Custom correlation engine + anomaly detector |
| Notifications | 7 channel providers (Discord, Slack, Teams, Email, Push, ntfy, Webhook) |
| Observability | Grafana 10.4 + Prometheus 2.51 |
| Monorepo | pnpm workspaces + Turborepo |
| Lint/format | Biome |
| Testing | Vitest |
| Containers | Docker + docker compose |
| Kubernetes | Helm 3 |
| CI/CD | GitHub Actions · Docker Publish (stable / beta / alpha channels) |

---

## License

MIT — see [LICENSE](LICENSE).
