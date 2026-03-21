---
title: Docker Compose
description: Run VitaSync locally or on a single server with Docker Compose.
---

import { Steps, Aside } from '@astrojs/starlight/components';

## Quick Start

<Steps>

1. **Clone and configure**

   ```bash
   git clone https://github.com/your-org/vitasync.git
   cd vitasync
   cp .env.example .env
   ```

   Edit `.env` — at minimum set:

   ```bash
   JWT_SECRET=$(openssl rand -base64 32)
   ENCRYPTION_KEY=$(openssl rand -hex 32)
   OAUTH_REDIRECT_BASE_URL=http://localhost:3001
   ```

2. **Start all services**

   ```bash
   docker compose up -d
   ```

   Services started:

   | Service | Port |
   |---------|------|
   | `api` | 3001 |
   | `worker` | — (background) |
   | `web` | 3000 |
   | `postgres` | 5432 |
   | `redis` | 6379 |

3. **Watch logs**

   ```bash
   docker compose logs -f api worker
   ```

4. **Stop**

   ```bash
   docker compose down
   ```

</Steps>

## Services

The `docker-compose.yml` defines the following services:

```yaml
services:
  api:      # Fastify REST API
  worker:   # BullMQ background sync worker
  web:      # Next.js dashboard
  postgres: # PostgreSQL 16
  redis:    # Redis 7
```

Database migrations run automatically as an `api` startup step — no manual action needed.

## Development Mode (hot reload)

```bash
docker compose -f docker-compose.dev.yml up
```

The dev compose file mounts source directories and runs apps with hot-reload via `pnpm dev`.

## Useful Commands

```bash
# Rebuild images after dependency changes
docker compose build

# Run database migrations manually
docker compose exec api pnpm db:migrate

# Open Drizzle Studio (DB explorer)
docker compose exec api pnpm db:studio

# Shell into the API container
docker compose exec api sh
```

<Aside type="tip">
  For production on a single server, use [Caddy](https://caddyserver.com/) or Nginx as a reverse proxy in front of the `api` and `web` services for automatic TLS.
</Aside>

## Pre-release Image Channels

Every push to any branch triggers a Docker build. Images are tagged according to their **channel**:

| Branch pattern | Channel | Available tags |
|---------------|---------|----------------|
| `main` | **stable** | `latest`, `1.2.3`, `1.2`, `1`, `sha-xxxxxxx` |
| `beta/**` | **beta** | `beta`, `beta-xxxxxxx`, `sha-xxxxxxx` |
| `feature/**`, `fix/**`, `alpha/**` | **alpha** | `alpha`, `alpha-xxxxxxx`, `sha-xxxxxxx` |

Images are published to `ghcr.io/your-org/vitasync-{api,worker,web}`.

```bash
# Pull a specific pre-release build for testing
docker pull ghcr.io/your-org/vitasync-api:beta

# Pin to an exact alpha sha
docker pull ghcr.io/your-org/vitasync-api:alpha-abc1234
```

<Aside type="caution">
  Alpha and beta images are built from feature branches and are **not production-ready**. They may contain breaking changes, incomplete migrations, or unstable behaviour.
</Aside>

To swap a single service image in your compose file while keeping the rest on `latest`:

```yaml
services:
  api:
    image: ghcr.io/your-org/vitasync-api:beta   # override just the API
  worker:
    image: ghcr.io/your-org/vitasync-worker:latest
  web:
    image: ghcr.io/your-org/vitasync-web:latest
```
