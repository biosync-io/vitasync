---
title: Prometheus & Monitoring
description: Infrastructure monitoring with Prometheus, alerting rules, and custom PostgreSQL metrics for VitaSync.
---

VitaSync includes a complete monitoring stack based on **Prometheus** and **Grafana**. Prometheus collects infrastructure metrics from exporters, while Grafana dashboards query both Prometheus and PostgreSQL directly.

## Architecture

```
┌──────────────┐    scrape     ┌──────────────────────┐
│  Prometheus  │◄──────────────│  postgres-exporter    │◄── PostgreSQL
│  :9090       │◄──────────────│  redis-exporter       │◄── Redis
│              │◄──────────────│  node-exporter        │◄── Host OS
└──────┬───────┘               └──────────────────────┘
       │ query
       ▼
┌──────────────┐    SQL        ┌──────────────────────┐
│   Grafana    │──────────────►│  PostgreSQL           │
│   :3030      │               │  (health data)        │
└──────────────┘               └──────────────────────┘
```

**Two data paths:**
- **Infrastructure metrics** — Exporters → Prometheus → Grafana (PromQL)
- **Health data dashboards** — Grafana → PostgreSQL directly (SQL)

## Quick Start

Start the monitoring stack alongside VitaSync:

```bash
docker compose \
  -f docker-compose.yml \
  -f monitoring/docker-compose.monitoring.yml \
  up -d
```

| Service | URL | Credentials |
|---------|-----|-------------|
| **Grafana** | http://localhost:3030 | `admin` / `admin` |
| **Prometheus** | http://localhost:9090 | — |
| **postgres-exporter** | http://localhost:9187/metrics | — |
| **redis-exporter** | http://localhost:9121/metrics | — |
| **node-exporter** | http://localhost:9100/metrics | — |

## Prometheus Configuration

### Scrape Config

The scrape configuration lives at `monitoring/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s

scrape_configs:
  - job_name: postgres
    static_configs:
      - targets: ["postgres-exporter:9187"]

  - job_name: redis
    static_configs:
      - targets: ["redis-exporter:9121"]

  - job_name: node
    static_configs:
      - targets: ["node-exporter:9100"]

  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]
```

**Retention:** 90 days or 20 GB (whichever is reached first), configured in the docker-compose command flags.

### Verifying Scrape Targets

After starting the stack, verify all targets are healthy:

1. Open **Prometheus** at http://localhost:9090
2. Go to **Status → Targets**
3. All targets should show **State: UP**

Or via the API:

```bash
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health}'
```

Expected output:

```json
{ "job": "postgres", "health": "up" }
{ "job": "redis", "health": "up" }
{ "job": "node", "health": "up" }
{ "job": "prometheus", "health": "up" }
```

## Exporters

### PostgreSQL Exporter

The [postgres-exporter](https://github.com/prometheus-community/postgres_exporter) (v0.15.0) exposes both built-in and custom metrics.

**Built-in metrics include:**
- `pg_up` — database reachability
- `pg_stat_activity_count` — active connections
- `pg_stat_database_deadlocks_total` — deadlock count
- `pg_stat_database_tup_*` — row operations (inserts, updates, deletes)
- `pg_database_size_bytes` — database size
- `pg_stat_activity_max_tx_duration` — longest running transaction

**Custom VitaSync metrics** are defined in `monitoring/prometheus/postgres-queries.yml`:

| Metric | Type | Description |
|--------|------|-------------|
| `vitasync_users_total` | Gauge | Total registered users |
| `vitasync_provider_connections_total` | Gauge | Connections by provider and status |
| `vitasync_health_metrics_total` | Gauge | Total health data points |
| `vitasync_health_metrics_24h_total` | Gauge | Data points ingested (last 24h) |
| `vitasync_sync_jobs_total` | Gauge | Sync jobs by status (last 24h) |
| `vitasync_sync_duration_seconds_avg` | Gauge | Average sync duration (last hour) |
| `vitasync_sync_duration_seconds_max` | Gauge | Max sync duration (last hour) |
| `vitasync_stale_connections_total` | Gauge | Active connections not synced in 24h |
| `vitasync_notification_logs_total` | Gauge | Notifications by channel and status (last 24h) |

**Example PromQL queries:**

```promql
# Sync failure rate
vitasync_sync_jobs{status="failed"} / sum(vitasync_sync_jobs)

# Data ingestion trend (per hour)
rate(vitasync_health_metrics_total[1h])

# Connections per provider
vitasync_provider_connections_total{status="active"}
```

### Redis Exporter

The [redis-exporter](https://github.com/oliver006/redis_exporter) (v1.59.0) exposes:

| Metric | Description |
|--------|-------------|
| `redis_up` | Redis reachability |
| `redis_memory_used_bytes` | Current memory usage |
| `redis_memory_max_bytes` | Configured memory limit |
| `redis_connected_clients` | Connected client count |
| `redis_commands_processed_total` | Total commands processed |
| `redis_commands_duration_seconds_total` | Total command execution time |
| `redis_db_keys` | Keys per database |

**Useful for monitoring BullMQ queue health** — high memory or many keys can indicate job backlogs.

### Node Exporter

The [node-exporter](https://github.com/prometheus/node_exporter) (v1.8.0) provides host-level metrics:

- CPU usage, load averages
- Memory available/total
- Disk I/O and filesystem usage
- Network traffic

:::note
Node exporter requires Linux. It is skipped on macOS/Windows hosts.
:::

## Alerting Rules

Alert rules are defined in `monitoring/prometheus/rules/vitasync.yml` and organized into four groups:

### Database Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| `PostgreSQLDown` | `pg_up == 0` for 1m | 🔴 Critical |
| `PostgreSQLHighConnections` | Connections > 80 for 5m | 🟡 Warning |
| `PostgreSQLSlowQueries` | Query running > 5min | 🟡 Warning |
| `PostgreSQLDeadlocks` | Any deadlock detected | 🟡 Warning |

### Redis Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| `RedisDown` | `redis_up == 0` for 1m | 🔴 Critical |
| `RedisHighMemory` | Memory > 85% for 5m | 🟡 Warning |
| `RedisHighLatency` | Avg latency > 10ms for 5m | 🟡 Warning |

### Application Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| `SyncJobFailureRate` | Failure rate > 10% for 15m | 🟡 Warning |
| `StaleProviderConnections` | > 5 stale connections for 30m | 🟡 Warning |
| `NoMetricsIngested` | Zero metrics in 24h for 1h | 🟡 Warning |

### Host Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| `HighCPUUsage` | CPU > 85% for 10m | 🟡 Warning |
| `HighMemoryUsage` | Memory > 85% for 5m | 🟡 Warning |
| `DiskSpaceLow` | Disk > 85% for 10m | 🟡 Warning |

### Viewing Active Alerts

Open Prometheus at http://localhost:9090/alerts to see firing and pending alerts.

### Routing Alerts (Alertmanager)

To receive alert notifications, add [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/) to the monitoring stack:

```yaml
# Add to monitoring/docker-compose.monitoring.yml
alertmanager:
  image: prom/alertmanager:v0.27.0
  volumes:
    - ./prometheus/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
  ports:
    - "9093:9093"
  networks:
    - monitoring
```

Then add to `prometheus.yml`:

```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]
```

## Environment Variables

Configure the monitoring stack with these variables in your `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAFANA_USER` | `admin` | Grafana admin username |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |
| `GRAFANA_ROOT_URL` | `http://localhost:3030` | Public URL for links |
| `POSTGRES_HOST` | `postgres` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_USER` | `vitasync` | PostgreSQL user |
| `POSTGRES_PASSWORD` | `changeme` | PostgreSQL password |
| `POSTGRES_DB` | `vitasync` | PostgreSQL database |
| `REDIS_HOST` | `redis` | Redis host |

## Kubernetes

For Kubernetes deployments, monitoring is typically handled by the [Prometheus Operator](https://prometheus-operator.dev/) (kube-prometheus-stack). To integrate VitaSync:

### Pod Annotations

Add scrape annotations to your Helm values if you expose a `/metrics` endpoint:

```yaml
api:
  podAnnotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "3001"
    prometheus.io/path: "/metrics"
```

### ServiceMonitor (Prometheus Operator)

If using the Prometheus Operator, create a ServiceMonitor:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: vitasync-postgres-exporter
spec:
  selector:
    matchLabels:
      app: postgres-exporter
  endpoints:
    - port: metrics
      interval: 15s
```

### Deploying Exporters in Kubernetes

Deploy the same exporters as sidecar containers or separate deployments alongside your VitaSync Helm release. See the [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack) chart for a batteries-included setup.

## Troubleshooting

### Target shows DOWN in Prometheus

1. Check the exporter is running: `docker compose ps`
2. Verify network connectivity: `docker compose exec prometheus wget -qO- http://postgres-exporter:9187/metrics | head`
3. Check exporter logs: `docker compose logs postgres-exporter`

### No data in Grafana

1. Verify the datasource is configured: **Grafana → Connections → Data sources**
2. For Prometheus panels: check the datasource is set to `Prometheus` (not `VitaSync PostgreSQL`)
3. For SQL panels: test the query in **Explore** mode

### Custom queries not appearing

1. Verify `postgres-queries.yml` syntax: queries must return numeric values
2. Check exporter logs for query errors: `docker compose logs postgres-exporter`
3. Test directly: `curl -s http://localhost:9187/metrics | grep vitasync`
