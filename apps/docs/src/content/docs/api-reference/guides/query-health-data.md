---
title: Query Health Data
description: Use the health data endpoints to query metrics, timeseries, daily summaries, and personal records.
---

import { Aside, Tabs, TabItem } from '@astrojs/starlight/components';

VitaSync provides five health data endpoints that cover different query patterns — from raw data points to aggregated timeseries and per-day statistics.

All health endpoints require at minimum `read` scope.

## Base URL

```
GET /v1/users/{userId}/health
GET /v1/users/{userId}/health/summary
GET /v1/users/{userId}/health/timeseries
GET /v1/users/{userId}/health/daily-summaries
DELETE /v1/users/{userId}/health
```

---

## 1. Raw Health Metrics

Returns individual data points for a user, optionally filtered by metric type and date range.

```bash
curl "https://api.yourdomain.com/v1/users/01JA4.../health?metricType=steps&from=2025-06-01&to=2025-06-07&limit=100" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `metricType` | string | — | Filter to a single metric type (see full list below) |
| `from` | ISO 8601 date | — | Start of the date range (inclusive) |
| `to` | ISO 8601 date | — | End of the date range (inclusive) |
| `limit` | integer | `100` | Records per page (1–1000) |
| `offset` | integer | `0` | Skip N records (offset-based pagination) |
| `cursor` | string | — | Cursor for cursor-based pagination (see next page token) |

<Aside type="tip">
  Cursor-based pagination is more efficient for large datasets. Use the `nextCursor` from the previous response as `cursor` in the next request. Offset pagination is simpler but degrades on deep pages.
</Aside>

**Response** (`200 OK`):

```json
{
  "data": [
    {
      "id": "01JA4MNPQR8STUVWXYZ00010",
      "userId": "01JA4MNPQR8STUVWXYZ00001",
      "providerId": "fitbit",
      "metricType": "steps",
      "value": 9823,
      "unit": "count",
      "recordedAt": "2025-06-06T00:00:00.000Z",
      "data": null,
      "source": "user",
      "createdAt": "2025-06-07T09:00:00.000Z"
    },
    {
      "id": "01JA4MNPQR8STUVWXYZ00011",
      "userId": "01JA4MNPQR8STUVWXYZ00001",
      "providerId": "fitbit",
      "metricType": "steps",
      "value": 12401,
      "unit": "count",
      "recordedAt": "2025-06-05T00:00:00.000Z",
      "data": null,
      "source": "user",
      "createdAt": "2025-06-06T09:00:00.000Z"
    }
  ],
  "total": 42,
  "limit": 100,
  "offset": 0,
  "nextCursor": "eyJpZCI6IjAxSkE0Li4uIn0="
}
```

**Response fields:**

| Field | Description |
|-------|-------------|
| `data` | Array of metric data points |
| `metricType` | The type of metric (see full list below) |
| `value` | Scalar value for simple metrics (steps, HR, weight, etc.) |
| `unit` | Unit for the value (e.g. `count`, `bpm`, `kg`, `meters`) |
| `data` | Structured JSON for complex metrics (sleep stages, blood pressure, etc.) — `null` for scalar metrics |
| `recordedAt` | When the metric was recorded by the device |
| `source` | `user` (device-measured), `manual` (user-entered), or `computed` |
| `total` | Total matching records (for offset pagination UI) |
| `nextCursor` | Base64 cursor for fetching the next page (null when no more pages) |

### Complex metric data shapes

Some metrics use the `data` JSONB field instead of `value` for structured information:

**Sleep:**
```json
{
  "metricType": "sleep",
  "value": 7.4,
  "unit": "hours",
  "data": {
    "stages": {
      "deep": 95,
      "light": 220,
      "rem": 110,
      "awake": 20
    },
    "efficiency": 88,
    "startTime": "2025-06-05T23:30:00.000Z",
    "endTime": "2025-06-06T07:05:00.000Z"
  }
}
```

**Blood Pressure:**
```json
{
  "metricType": "blood_pressure",
  "value": null,
  "unit": "mmHg",
  "data": {
    "systolic": 118,
    "diastolic": 76,
    "pulse": 68
  }
}
```

**Heart Rate (intraday):**
```json
{
  "metricType": "heart_rate",
  "value": 72,
  "unit": "bpm",
  "data": {
    "min": 48,
    "max": 142,
    "resting": 58,
    "intraday": [
      { "time": "2025-06-06T08:00:00.000Z", "value": 72 },
      { "time": "2025-06-06T08:01:00.000Z", "value": 74 }
    ]
  }
}
```

---

## 2. Summary (Counts per Metric Type)

Returns the count of data points per metric type for a user. Useful for quickly checking what data is available.

```bash
curl "https://api.yourdomain.com/v1/users/01JA4.../health/summary" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Response** (`200 OK`):

```json
{
  "steps": 42,
  "heart_rate": 1440,
  "resting_heart_rate": 30,
  "sleep": 28,
  "calories": 42,
  "weight": 15,
  "blood_oxygen": 30,
  "heart_rate_variability": 28,
  "workout": 12
}
```

---

## 3. Timeseries (Aggregated Over Time)

Returns metric values bucketed over a time range. Useful for charting trends.

```bash
curl "https://api.yourdomain.com/v1/users/01JA4.../health/timeseries?metricType=steps&from=2025-06-01&to=2025-06-30&bucket=day" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `metricType` | string | Yes | — | The metric type to aggregate |
| `from` | ISO 8601 | Yes | — | Start of the range |
| `to` | ISO 8601 | Yes | — | End of the range |
| `bucket` | string | No | `day` | Time bucket size: `minute`, `hour`, `day`, `week`, or `month` |

**Response** (`200 OK`):

```json
{
  "metricType": "steps",
  "bucket": "day",
  "from": "2025-06-01T00:00:00.000Z",
  "to": "2025-06-30T00:00:00.000Z",
  "data": [
    { "timestamp": "2025-06-01T00:00:00.000Z", "value": 8241, "count": 1 },
    { "timestamp": "2025-06-02T00:00:00.000Z", "value": 10532, "count": 1 },
    { "timestamp": "2025-06-03T00:00:00.000Z", "value": null, "count": 0 },
    { "timestamp": "2025-06-04T00:00:00.000Z", "value": 7890, "count": 1 }
  ]
}
```

Gaps (days with no data) are included as `null` values so chart rendering remains continuous.

---

## 4. Daily Summaries

Returns per-day totals for one or more metrics. More efficient than fetching each metric separately when building a daily dashboard.

```bash
curl "https://api.yourdomain.com/v1/users/01JA4.../health/daily-summaries?from=2025-06-01&to=2025-06-07&metricTypes=steps,calories,heart_rate" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | ISO 8601 | Yes | Start date |
| `to` | ISO 8601 | Yes | End date |
| `metricTypes` | comma-separated string | No | Filter to specific metric types. Omit to return all available types |

**Response** (`200 OK`):

```json
[
  {
    "date": "2025-06-01",
    "metrics": {
      "steps": { "value": 8241, "unit": "count" },
      "calories": { "value": 1892, "unit": "kcal" },
      "heart_rate": { "value": 72, "unit": "bpm", "min": 48, "max": 142 }
    }
  },
  {
    "date": "2025-06-02",
    "metrics": {
      "steps": { "value": 10532, "unit": "count" },
      "calories": { "value": 2104, "unit": "kcal" },
      "heart_rate": { "value": 68, "unit": "bpm", "min": 52, "max": 118 }
    }
  }
]
```

---

## 5. Workouts and Events

Workouts, sleep sessions, and other structured events are separate from raw health metrics. They live in the events API:

```bash
curl "https://api.yourdomain.com/v1/users/01JA4.../events?eventType=workout&from=2025-06-01&to=2025-06-30&limit=20" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `eventType` | `workout`, `sleep`, `activity` | — | Filter by event type |
| `activityType` | string | — | For workouts: e.g. `running`, `cycling`, `swimming` |
| `from` | ISO 8601 | — | Start date |
| `to` | ISO 8601 | — | End date |
| `limit` | integer | `50` | 1–200 events per page |
| `cursor` | string | — | Cursor for pagination |

**Response:**

```json
{
  "data": [
    {
      "id": "01JA4MNPQR8STUVWXYZ00050",
      "eventType": "workout",
      "activityType": "running",
      "startedAt": "2025-06-06T06:00:00.000Z",
      "endedAt": "2025-06-06T06:45:00.000Z",
      "durationSeconds": 2700,
      "distanceMeters": 7200,
      "caloriesKcal": 520,
      "avgHeartRate": 158,
      "maxHeartRate": 181,
      "providerId": "garmin",
      "data": {
        "elevationGain": 85,
        "avgPace": "6:15",
        "laps": [
          { "distance": 1000, "time": 375, "avgHR": 152 }
        ]
      }
    }
  ],
  "nextCursor": "eyJpZCI6IjAx..."
}
```

---

## 6. Personal Records

VitaSync automatically tracks personal bests per metric type, updated after every sync.

```bash
curl "https://api.yourdomain.com/v1/users/01JA4.../personal-records" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Response:**

```json
[
  {
    "metricType": "steps",
    "category": "daily_max",
    "value": 18432,
    "unit": "count",
    "recordedAt": "2025-05-12T00:00:00.000Z",
    "providerId": "fitbit"
  },
  {
    "metricType": "heart_rate_variability",
    "category": "daily_max",
    "value": 68,
    "unit": "ms",
    "recordedAt": "2025-04-20T00:00:00.000Z",
    "providerId": "whoop"
  }
]
```

Get the record for a specific metric:

```bash
curl "https://api.yourdomain.com/v1/users/01JA4.../personal-records/steps?category=daily_max" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

---

## 7. GDPR: Delete All Health Data

Permanently deletes all health metrics for a user. This is irreversible. Requires `admin` scope.

```bash
curl -X DELETE "https://api.yourdomain.com/v1/users/01JA4.../health" \
  -H "Authorization: Bearer $VITASYNC_API_KEY"
```

**Response** (`200 OK`):

```json
{
  "deleted": 14732
}
```

This deletes health metrics only. To delete the user record itself, use `DELETE /v1/users/:userId`.

---

## Metric Type Reference

### Activity

| Metric Type | Unit | Description |
|-------------|------|-------------|
| `steps` | `count` | Daily step count |
| `distance` | `meters` | Distance traveled |
| `calories` | `kcal` | Active calories burned |
| `active_minutes` | `minutes` | Minutes in moderate+ activity zones |
| `floors` | `count` | Floors climbed (Fitbit only) |

### Cardiovascular

| Metric Type | Unit | Description |
|-------------|------|-------------|
| `heart_rate` | `bpm` | Heart rate samples (may include intraday in `data`) |
| `resting_heart_rate` | `bpm` | Daily resting heart rate |
| `heart_rate_variability` | `ms` | HRV (typically overnight RMSSD) |

### Sleep

| Metric Type | Unit | Description |
|-------------|------|-------------|
| `sleep` | `hours` | Total sleep duration; stage breakdown in `data` field |
| `sleep_score` | `score` | Provider composite sleep quality score (0–100) |

### Body Composition

| Metric Type | Unit | Description |
|-------------|------|-------------|
| `weight` | `kg` | Body weight |
| `body_fat` | `percent` | Body fat percentage |
| `bmi` | `index` | Body mass index |
| `blood_oxygen` | `percent` | Blood oxygen saturation (SpO2) |
| `blood_pressure` | `mmHg` | Systolic/diastolic in `data` field |
| `temperature` | `celsius` | Skin or body temperature |
| `blood_glucose` | `mmol_l` | Blood glucose level |

### Recovery and Readiness

| Metric Type | Unit | Description |
|-------------|------|-------------|
| `stress` | `score` | Stress level (Garmin: 0–100) |
| `hrv_status` | `status` | Text HRV status band (WHOOP/Garmin) |
| `recovery_score` | `percent` | WHOOP recovery percentage (0–100) |
| `readiness_score` | `score` | Oura-style readiness (0–100) |
| `strain_score` | `score` | WHOOP daily strain (0–21) |

### Breathing

| Metric Type | Unit | Description |
|-------------|------|-------------|
| `respiratory_rate` | `breaths_per_min` | Breaths per minute (typically overnight) |
| `spo2` | `percent` | Pulse oximetry reading |

### Workouts

| Metric Type | Description |
|-------------|-------------|
| `workout` | Individual workout session (use the Events API for structured data) |
