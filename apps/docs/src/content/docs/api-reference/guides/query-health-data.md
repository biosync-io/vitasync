---
title: Query Health Data
description: Filter, paginate, and aggregate health metrics for your users.
---

## Basic Query

```bash
curl "http://localhost:3001/v1/users/01HXYZ.../health" \
  -H "Authorization: Bearer $API_KEY"
```

## Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `metricType` | string | Filter by metric type (e.g. `STEPS`, `HEART_RATE`) |
| `provider` | string | Filter by provider slug (e.g. `fitbit`, `garmin`) |
| `from` | ISO 8601 | Start of date range (inclusive) |
| `to` | ISO 8601 | End of date range (inclusive) |
| `limit` | integer | Max results (default: 100, max: 1000) |
| `offset` | integer | Pagination offset (default: 0) |

## Examples

**Last 7 days of steps:**

```bash
curl "http://localhost:3001/v1/users/01HXYZ.../health\
?metricType=STEPS\
&from=2026-03-06T00:00:00Z\
&to=2026-03-13T00:00:00Z\
&limit=7" \
  -H "Authorization: Bearer $API_KEY"
```

**Heart rate from a specific provider:**

```bash
curl "http://localhost:3001/v1/users/01HXYZ.../health\
?metricType=HEART_RATE&provider=garmin" \
  -H "Authorization: Bearer $API_KEY"
```

## Response

```json
{
  "data": [
    {
      "id": "01HMETRIC...",
      "userId": "01HXYZ...",
      "providerId": "fitbit",
      "metricType": "STEPS",
      "value": 9241,
      "unit": "count",
      "recordedAt": "2026-03-12T00:00:00.000Z",
      "metadata": {}
    }
  ],
  "total": 7
}
```

## Summary Endpoint

Get a count of available metrics per type without fetching all records:

```bash
curl http://localhost:3001/v1/users/01HXYZ.../health/summary \
  -H "Authorization: Bearer $API_KEY"
```

```json
{
  "STEPS": 180,
  "HEART_RATE": 180,
  "SLEEP_DURATION": 90,
  "RESTING_HEART_RATE": 180,
  "CALORIES": 180
}
```
