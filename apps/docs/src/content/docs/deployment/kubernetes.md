---
title: Kubernetes / Helm
description: Deploy VitaSync to Kubernetes using the production-ready Helm chart.
---

import { Aside, Steps } from '@astrojs/starlight/components';

VitaSync ships a production-ready Helm chart at `helm/vitasync/` with:

- **HPA** (Horizontal Pod Autoscaler) for API and worker
- **PDB** (Pod Disruption Budget) for zero-downtime rolling updates
- **Ingress** support with TLS annotations
- **`pre-install`/`pre-upgrade` migration Job** that runs Drizzle migrations before pods are updated
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

## Production Recommendations

- Use [External Secrets Operator](https://external-secrets.io) or [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) for secret management.
- Enable HPA: `api.autoscaling.enabled=true`, `worker.autoscaling.enabled=true`.
- Use a managed PostgreSQL (AWS RDS, GCP Cloud SQL, Supabase) and Redis (ElastiCache, Upstash) for reliability.
- Add `cert-manager` annotations to the ingress for automatic TLS via Let's Encrypt.

<Aside type="tip">
  See `helm/vitasync/values.yaml` for the full list of configurable values.
</Aside>
