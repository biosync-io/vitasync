<div align="center">

# VitaSync

**Self-hosted wearable health data aggregation platform**

[![CI](https://github.com/your-org/vitasync/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/vitasync/actions/workflows/ci.yml)
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
| **Multi-tenant** | Workspaces isolate data; API keys are scoped per workspace |
| **Async-first** | BullMQ workers handle sync + webhook delivery; `syncData` streams via `AsyncGenerator` |
| **Idempotent syncs** | Composite unique index on `(userId, providerId, metricType, recordedAt)` — re-running a sync is safe |
| **Secure by default** | OAuth tokens encrypted with AES-256-GCM; API keys stored as SHA-256 hashes only |
| **OpenAPI docs** | Swagger UI auto-generated at `/docs` || **MCP server** | Exposes health data to AI assistants (Claude, Cursor, VS Code Copilot) via the Model Context Protocol |
| **Grafana dashboards** | 8 pre-built health dashboards auto-provisioned from `monitoring/grafana/dashboards/` || **Helm chart** | Production-ready chart with HPA, PDB, ingress, migration Job, and secret management |

---

## Architecture

```
vitasync/
├── apps/
│   ├── api/        # Fastify 5 REST API — routes, services, auth plugin
│   ├── worker/     # BullMQ worker — sync processor, webhook dispatcher
│   ├── web/        # Next.js 15 App Router dashboard
│   └── mcp/        # MCP server — expose health data to AI assistants
├── packages/
│   ├── types/      # Shared TypeScript types (HealthMetric, ProviderDefinition…)
│   ├── db/         # Drizzle ORM schemas + postgres.js client
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
                  └─ enqueues webhook delivery
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

The server exposes these tools: `query_health_metrics`, `list_users`, `list_connections`, `get_events`, `get_personal_records`.

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
| Observability | Grafana 10.4 + Prometheus 2.51 |
| Monorepo | pnpm workspaces + Turborepo |
| Lint/format | Biome |
| Testing | Vitest |
| Containers | Docker + docker compose |
| Kubernetes | Helm 3 |
| CI/CD | GitHub Actions |

---

## License

MIT — see [LICENSE](LICENSE).
