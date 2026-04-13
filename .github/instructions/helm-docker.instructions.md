---
applyTo: "helm/**,docker-compose*.yml,Dockerfile*,.dockerignore,.env*,monitoring/**"
---

# Infrastructure & Deployment Instructions

## Docker Compose Architecture

```yaml
services:
  api:            # Fastify API server (:3001)
  web:            # Next.js frontend (:3000)
  worker:         # BullMQ job processor
  mcp:            # MCP server for AI integrations
  postgres:       # PostgreSQL 16 Alpine (:5432)
  redis:          # Redis 7 Alpine (:6379)
```

### Service Dependencies
- `api` depends on: postgres (healthy), redis (healthy)
- `web` depends on: api (healthy)
- `worker` depends on: postgres (healthy), redis (healthy)

### Health Checks
- Node.js services: HTTP `GET /healthz` → 200 OK
- PostgreSQL: `pg_isready -U vitasync`
- Redis: `redis-cli ping`

## Dockerfiles

| File | Purpose | Base |
|------|---------|------|
| `apps/api/Dockerfile` | Fastify API server | node:22-alpine (multi-stage) |
| `apps/web/Dockerfile` | Next.js frontend | node:22-alpine (multi-stage) |
| `apps/worker/Dockerfile` | BullMQ worker | node:22-alpine (multi-stage) |
| `apps/mcp/Dockerfile` | MCP server | node:22-alpine (multi-stage) |

### Multi-Stage Build Pattern
```dockerfile
# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/*/package.json packages/*/
RUN pnpm install --frozen-lockfile --prod

# Stage 2: Build
FROM node:22-alpine AS builder
# ... build steps

# Stage 3: Production
FROM node:22-alpine AS runner
USER node
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
```

## Environment Variables

All configuration via `.env` file (see `.env.example`):

```bash
# Required
DATABASE_URL=postgresql://vitasync:changeme@localhost:5432/vitasync
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=your-32-byte-hex-key

# Application
API_PORT=3001
WEB_PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# OAuth (per provider)
FITBIT_CLIENT_ID=
FITBIT_CLIENT_SECRET=
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=
```

## Helm Chart

Located in `helm/vitasync/`:

```
helm/vitasync/
  Chart.yaml
  values.yaml
  templates/
    deployment-api.yaml
    deployment-web.yaml
    deployment-worker.yaml
    service.yaml
    configmap.yaml
    ingress.yaml
    NOTES.txt
    _helpers.tpl
```

### Key Helm Values
- `api.replicas` — API server replica count
- `worker.replicas` — Worker replica count
- `externalPostgresql.*` — External DB connection
- `externalRedis.*` — External Redis connection
- `ingress.enabled` — Enable ingress controller

### Install/Upgrade
```bash
helm upgrade --install vitasync helm/vitasync \
  --set api.env.DATABASE_URL=... \
  --set api.env.REDIS_URL=...
```

## Monitoring

Located in `monitoring/`:
- Grafana dashboards for API metrics, worker queues, provider sync status
- Prometheus configuration for scraping metrics endpoints

## Docker Compose Commands

```bash
# Development
docker compose -f docker-compose.dev.yml up -d

# Production
docker compose up -d

# View logs
docker compose logs -f api worker

# Rebuild after changes
docker compose up -d --build api
```

## Release Process

- Version is tracked in root `VERSION` file
- Docker tags: `latest` + semver for main, `beta` + `beta-<sha>` for beta branches
- Helm chart version tracks app version in `Chart.yaml`
