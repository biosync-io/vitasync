---
title: Kubernetes / Helm
description: Deploy VitaSync to Kubernetes using the production-ready Helm chart.
---

import { Aside, Steps } from '@astrojs/starlight/components';

VitaSync ships a production-ready Helm chart (v0.4.0) at `helm/vitasync/` with **282 configurable values**:

- **HPA** (Horizontal Pod Autoscaler) for API and worker
- **PDB** (Pod Disruption Budget) for zero-downtime rolling updates
- **Ingress** support with TLS annotations
- **`pre-install`/`pre-upgrade` migration Job** that runs Drizzle migrations before pods are updated
- **Startup probes** on API and Web (failureThreshold: 12, periodSeconds: 5, ~60s window)
- **Init containers** — `wait-for-db` on API, `wait-for-migrations` on workers (ensures DB is ready and migrations are complete before main containers start)
- **RollingUpdate strategy** (`maxSurge: 1`, `maxUnavailable: 0`) for zero-downtime deployments
- **Helm test suite** — validates API and Web connectivity post-install
- **Secret validation gates** — refuses to install when placeholder secrets are detected
- Flexible secret management (inline values or `existingSecret`)

## Prerequisites

- Kubernetes 1.28+
- Helm 3.12+
- A PostgreSQL 16 database and Redis 7 (in-cluster or managed)

## Install

<Steps>

1. **Create the namespace**

   ```bash
   kubectl create namespace vitasync
   ```

2. **Create a secret (recommended)**

   ```bash
   kubectl create secret generic vitasync-secrets \
     --namespace vitasync \
     --from-literal=DATABASE_URL="postgresql://user:pass@host:5432/vitasync" \
     --from-literal=REDIS_URL="redis://host:6379" \
     --from-literal=JWT_SECRET="$(openssl rand -base64 32)" \
     --from-literal=ENCRYPTION_KEY="$(openssl rand -hex 32)"
   ```

3. **Install the chart**

   ```bash
   helm install vitasync ./helm/vitasync \
     --namespace vitasync \
     --set ingress.enabled=true \
     --set ingress.api.host=api.example.com \
     --set ingress.web.host=app.example.com \
     --set secrets.existingSecret=vitasync-secrets
   ```

4. **Verify the rollout**

   ```bash
   kubectl rollout status deployment/vitasync-api -n vitasync
   kubectl rollout status deployment/vitasync-worker -n vitasync
   kubectl rollout status deployment/vitasync-web -n vitasync
   ```

</Steps>

## Upgrade

```bash
helm upgrade vitasync ./helm/vitasync \
  --namespace vitasync \
  --reuse-values
```

The migration Job runs automatically before pods are replaced.

## Key Values

| Value | Default | Description |
|-------|---------|-------------|
| `api.replicaCount` | `2` | API pod replicas |
| `worker.replicaCount` | `1` | Worker pod replicas |
| `api.autoscaling.enabled` | `false` | Enable HPA for API |
| `worker.autoscaling.enabled` | `false` | Enable HPA for worker |
| `api.podDisruptionBudget.enabled` | `true` | PDB for API |
| `ingress.enabled` | `false` | Enable ingress resources |
| `ingress.api.host` | `""` | Hostname for the API ingress |
| `ingress.web.host` | `""` | Hostname for the web dashboard |
| `secrets.existingSecret` | `""` | Name of an existing Kubernetes Secret |

## Startup Probes

API and Web deployments include startup probes to handle slow container initialization:

```yaml
startupProbe:
  httpGet:
    path: /healthz
    port: http
  failureThreshold: 12
  periodSeconds: 5    # ~60 second window before pod is killed
```

This prevents Kubernetes from killing pods that take time to compile assets or establish database connections on startup.

## Init Containers

### API — `wait-for-db`

The API pod includes an init container that waits for PostgreSQL to accept connections before starting the main API container. This prevents crash loops when the database takes time to start.

### Workers — `wait-for-migrations`

Worker pods include an init container that waits for database migrations to complete (by checking a health endpoint on the API). This ensures workers never process jobs against a stale schema.

## Deployment Strategy

All deployments use `RollingUpdate` with zero-downtime settings:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

Combined with PDB, this guarantees at least one pod is always available during upgrades.

## Helm Test Suite

After installing or upgrading, run the built-in tests to validate connectivity:

```bash
helm test vitasync --namespace vitasync
```

The test suite creates temporary pods that:
- Verify the API responds at its `/healthz` endpoint
- Verify the Web dashboard is reachable
- Report success/failure for each check

## Secret Validation

The chart includes template-level validation that **refuses to install** if placeholder secrets are detected. This prevents accidental deployment with insecure defaults:

```bash
# This will fail with a clear error:
helm install vitasync ./helm/vitasync \
  --set secrets.jwtSecret="CHANGE_ME"
```

## Production Recommendations

- Use [External Secrets Operator](https://external-secrets.io) or [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) for secret management.
- Enable HPA: `api.autoscaling.enabled=true`, `worker.autoscaling.enabled=true`.
- Use a managed PostgreSQL (AWS RDS, GCP Cloud SQL, Supabase) and Redis (ElastiCache, Upstash) for reliability.
- Add `cert-manager` annotations to the ingress for automatic TLS via Let's Encrypt.

<Aside type="tip">
  The chart exposes 282 configurable values. See `helm/vitasync/values.yaml` for the full reference.
</Aside>
