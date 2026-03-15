---
title: Grafana Dashboards
description: Pre-built Grafana dashboards for visualizing VitaSync health data directly from PostgreSQL.
---

import { Aside, Steps, Card, CardGrid } from '@astrojs/starlight/components';

VitaSync ships **8 pre-built Grafana dashboards** that query the PostgreSQL database directly (no Prometheus required for health data). They are provisioned automatically when the monitoring stack starts — open Grafana and your dashboards are already there.

## Dashboard Overview

<CardGrid>
  <Card title="Platform Overview" icon="bars">
    Active users, total connections, sync volume, provider distribution. The home dashboard.
  </Card>
  <Card title="Workouts & Activity" icon="rocket">
    Distance, calories, workout count, heart rate, speed trends, and a full workout log table.
  </Card>
  <Card title="Sleep" icon="moon">
    Sleep duration, stages (deep / REM / light), score trend, awakenings, and day-of-week averages.
  </Card>
  <Card title="Heart Health" icon="heart">
    Resting heart rate, HRV, SpO₂, workout heart rate, and 7-day moving averages.
  </Card>
  <Card title="Body Metrics" icon="list-format">
    Weight, BMI, body fat %, muscle mass, bone mass, and visceral fat — with 7-day and 30-day moving averages.
  </Card>
  <Card title="Personal Records" icon="approve-check">
    All-time PRs table, records by metric type, and a timeline of when records were set.
  </Card>
  <Card title="Daily Activity" icon="forward-slash">
    Steps, active minutes, distance, floors climbed, and daily calorie expenditure.
  </Card>
  <Card title="Provider Health" icon="setting">
    Connection status, sync lag, stale connections, ingestion volume by provider, and errors.
  </Card>
</CardGrid>

All dashboards include:
- A **user filter** (`$userId`) to drill into a single user or view all users at once
- **Cross-dashboard navigation links** in the top bar
- **Moving average overlays** (7-day and 30-day where applicable)
- **Auto-refresh** every 60 seconds

## Quick Start

<Steps>

1. **Start the monitoring stack**

   Run it alongside the main VitaSync stack:

   ```bash
   docker compose \
     -f docker-compose.yml \
     -f monitoring/docker-compose.monitoring.yml \
     up -d
   ```

   Or start the monitoring stack on its own against an already-running VitaSync instance:

   ```bash
   cd monitoring
   docker compose -f docker-compose.monitoring.yml up -d
   ```

2. **Open Grafana**

   Navigate to [http://localhost:3030](http://localhost:3030).
   Default credentials: `admin` / `admin` (change these in production).

3. **Explore dashboards**

   Click **Dashboards** in the left sidebar and open the **VitaSync Health** folder. All 8 dashboards are ready to use.

</Steps>

<Aside>
Grafana provisioning runs automatically on startup. There is nothing to import manually.
</Aside>

## Environment Variables

The monitoring stack reads the following variables from your `.env` file (or shell environment):

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAFANA_USER` | `admin` | Grafana admin username |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |
| `GRAFANA_ROOT_URL` | `http://localhost:3030` | Public URL for share links |
| `POSTGRES_HOST` | `postgres` | PostgreSQL hostname (must be reachable from Grafana) |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_USER` | `vitasync` | PostgreSQL user |
| `POSTGRES_PASSWORD` | `changeme` | PostgreSQL password |
| `POSTGRES_DB` | `vitasync` | PostgreSQL database name |

<Aside type="caution">
Always set a strong `GRAFANA_PASSWORD` before exposing Grafana on the public internet.
</Aside>

## Dashboard Details

### 01 · Platform Overview (`vs-platform-overview`)

**Time range:** last 30 days
**Key panels:** total users, active connections, metrics ingested, events logged, provider distribution pie, daily sync volume timeseries, sync success/failure rate.

### 02 · Workouts (`vs-workouts`)

**Time range:** last 90 days
**Key panels:** total workout count, cumulative distance, total calories, training time, average heart rate; distance + calories per day (bars); activity type distribution; weekly workout frequency; HR trend with peak; average speed; full workout log.

### 03 · Sleep (`vs-sleep`)

**Time range:** last 30 days
**Data sources:** `events` (event_type = `sleep`), `health_metrics` (sleep_score, deep_sleep, rem_sleep, light_sleep, sleep_awakenings)
**Key panels:** average sleep duration + score; sleep stage stacked bars; 7-day moving average duration; score trend; awakenings; day-of-week average duration.

### 04 · Heart Health (`vs-heart-health`)

**Time range:** last 30 days
**Data sources:** `health_metrics` (resting_heart_rate, hrv, spo2, vo2_max), `events` (max_heart_rate, avg_heart_rate from workouts)
**Key panels:** resting HR + 7-day MA; HRV + 7-day MA; SpO₂; VO₂ max; workout HR (avg + peak); resting HR distribution histogram.

### 05 · Body Metrics (`vs-body-metrics`)

**Time range:** last 90 days
**Data sources:** `health_metrics` (weight, bmi, body_fat, muscle_mass, bone_mass, visceral_fat)
**Key panels:** latest weight + change vs period start; weight with 7-day and 30-day MA; body fat %; BMI; muscle + bone mass; visceral fat.

### 06 · Personal Records (`vs-personal-records`)

**Time range:** last 1 year
**Data source:** `personal_records` joined with `users`
**Key panels:** longest run, most steps, best VO₂ max, lowest resting HR, most calories, best HRV stat tiles; full PRs table; records by metric barchart; PRs set over time.

### 07 · Daily Activity (`vs-daily-activity`)

**Time range:** last 30 days
**Data sources:** `health_metrics` (steps, active_minutes, lightly_active_minutes, distance, floors, calories)
**Key panels:** average daily steps + best day; active minutes; daily distance; steps with 7-day MA; steps by day of week; floors climbed; calorie expenditure (active + total stacked).

### 08 · Provider Health (`vs-provider-health`)

**Time range:** last 7 days
**Data source:** `provider_connections`, `health_metrics`, `events`
**Key panels:** total / active / error connection counts; average sync lag; stale connections; full connections table with status + sync lag; ingestion volume by provider (pie + stacked timeseries); connection status distribution.

## Customisation

All dashboard JSON files live in `monitoring/grafana/dashboards/`. To modify a dashboard:

1. Edit it interactively in the Grafana UI.
2. Click **Dashboard settings → JSON Model** and copy the JSON.
3. Replace the corresponding file in `monitoring/grafana/dashboards/`.

Grafana re-reads the files every 30 seconds (`updateIntervalSeconds: 30` in the provisioning config), so your changes appear automatically.

<Aside type="note">
Variable `$userId` is a Grafana template variable populated from the `users` table. All SQL queries use the pattern `AND ('$userId' = 'all' OR user_id::text = '$userId')` to support the "All" option safely.
</Aside>

## Data Source

The dashboards use a single PostgreSQL datasource provisioned automatically:

```yaml
name: VitaSync PostgreSQL
uid: vitasync-pg
type: postgres
url: ${PG_HOST}:${PG_PORT}
database: ${PG_DATABASE}
```

All queries use raw SQL with Grafana's `$__timeFilter()` and `$__timeGroupAlias()` macros for time-range filtering and grouping.
