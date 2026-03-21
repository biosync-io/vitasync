---
title: Sleep Analysis & Biometrics
description: Deep sleep analysis, biometric baselines, health scores, snapshots, and AI-generated insights.
---

import { Aside } from '@astrojs/starlight/components';

VitaSync provides advanced sleep analysis, rolling biometric baselines, composite health scores, periodic health snapshots, and AI-generated insights — all computed from synced wearable data.

## Sleep Analysis

Go beyond raw sleep metrics with computed sleep debt and quality analysis.

### Sleep Debt

Calculates accumulated sleep debt based on a target of 8 hours per night.

```bash
curl http://localhost:3001/v1/users/$USER_ID/sleep-analysis/debt?days=14 \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "totalDebtMinutes": 180,
  "averageSleepMinutes": 420,
  "targetSleepMinutes": 480,
  "dailyDeficitMinutes": -60,
  "trend": "worsening",
  "days": 14
}
```

### Sleep Quality Report

Comprehensive sleep quality analysis over a configurable period.

```bash
curl http://localhost:3001/v1/users/$USER_ID/sleep-analysis/quality?days=30 \
  -H "Authorization: Bearer $API_KEY"
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/sleep-analysis/debt` | Sleep debt calculation (`days` param, default 14) |
| `GET` | `/v1/users/:userId/sleep-analysis/quality` | Sleep quality report (`days` param, default 30) |

---

## Biometric Baselines

Rolling statistical baselines for every health metric. Baselines power anomaly detection and trend analysis.

### How Baselines Work

1. Aggregates metric values over a 30-day rolling window
2. Computes: mean, standard deviation, min, max, median, 25th/75th percentiles
3. Determines trend direction and slope
4. Updates after each sync

### Get Current Baselines

```bash
curl http://localhost:3001/v1/users/$USER_ID/baselines \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "data": [
    {
      "metricType": "resting_heart_rate",
      "mean": 58.2,
      "stddev": 3.1,
      "min": 52,
      "max": 65,
      "median": 58,
      "p25": 56,
      "p75": 60,
      "sampleSize": 30,
      "trend": "decreasing",
      "trendSlope": -0.12
    }
  ]
}
```

### Get a Specific Metric Baseline

```bash
curl http://localhost:3001/v1/users/$USER_ID/baselines/resting_heart_rate \
  -H "Authorization: Bearer $API_KEY"
```

### Recompute Baselines

```bash
curl -X POST http://localhost:3001/v1/users/$USER_ID/baselines/compute \
  -H "Authorization: Bearer $API_KEY"
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/baselines` | List all baselines (optional `metricType` filter) |
| `GET` | `/v1/users/:userId/baselines/:metricType` | Get baseline for a specific metric |
| `POST` | `/v1/users/:userId/baselines/compute` | Recompute all baselines |

---

## Health Scores

Composite scores derived from multiple metrics, updated after each sync.

| Sub-score | Based on |
|-----------|----------|
| **Overall** | Weighted average of all sub-scores |
| **Sleep** | Duration, efficiency, stage balance, consistency |
| **Activity** | Steps, active minutes, calories, workout frequency |
| **Cardio** | Resting HR, HRV, VO₂ max trends |
| **Recovery** | Recovery score, strain balance, readiness |
| **Body** | Weight trend, body composition stability |

### Get Latest Score

```bash
curl http://localhost:3001/v1/users/$USER_ID/health-scores/latest \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "overallScore": 82,
  "sleepScore": 78,
  "activityScore": 85,
  "cardioScore": 80,
  "recoveryScore": 84,
  "bodyScore": 79,
  "grade": "B+",
  "deltaFromPrevious": 3,
  "weeklyAverage": 80,
  "percentileRank": 72,
  "date": "2025-03-18T00:00:00.000Z"
}
```

### Score History

```bash
curl "http://localhost:3001/v1/users/$USER_ID/health-scores?from=2025-03-01T00:00:00Z&limit=30" \
  -H "Authorization: Bearer $API_KEY"
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/health-scores/latest` | Latest composite score |
| `GET` | `/v1/users/:userId/health-scores` | Score history (filter by `from`, `to`, `limit`) |
| `POST` | `/v1/users/:userId/health-scores/compute` | Trigger score computation |

---

## Health Snapshots

Point-in-time summaries aggregating all key metrics for a period.

### Generate Snapshots

```bash
# Weekly snapshot
curl -X POST http://localhost:3001/v1/users/$USER_ID/snapshots/generate/weekly \
  -H "Authorization: Bearer $API_KEY"

# Monthly snapshot
curl -X POST http://localhost:3001/v1/users/$USER_ID/snapshots/generate/monthly \
  -H "Authorization: Bearer $API_KEY"
```

### Snapshot Content

Each snapshot includes averaged values for: steps, sleep minutes, resting heart rate, HRV, calories, active minutes, weight, stress, recovery, workout count, total distance, goal completion rate, and mood score.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/snapshots` | List snapshots (filter by `periodType`) |
| `GET` | `/v1/users/:userId/snapshots/:snapshotId` | Get a specific snapshot |
| `POST` | `/v1/users/:userId/snapshots/generate/weekly` | Generate weekly snapshot |
| `POST` | `/v1/users/:userId/snapshots/generate/monthly` | Generate monthly snapshot |

---

## AI Insights

AI-generated health insights derived from patterns in your data.

### Get Insights

```bash
curl "http://localhost:3001/v1/users/$USER_ID/insights?from=2025-03-01T00:00:00Z" \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "data": [
    {
      "type": "trend",
      "title": "Resting heart rate improving",
      "description": "Your resting HR has decreased 4.2% over the past 2 weeks, suggesting improving cardiovascular fitness.",
      "confidence": 0.85,
      "relatedMetrics": ["resting_heart_rate"]
    },
    {
      "type": "correlation",
      "title": "Sleep quality affects recovery",
      "description": "Days with 7+ hours of sleep show 23% higher recovery scores on average.",
      "confidence": 0.78,
      "relatedMetrics": ["sleep_duration", "recovery_score"]
    }
  ],
  "total": 2
}
```

### List Available Algorithms

```bash
curl http://localhost:3001/v1/insights/algorithms \
  -H "Authorization: Bearer $API_KEY"
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/insights` | Generate insights (optional `from`, `to`) |
| `GET` | `/v1/insights/algorithms` | List available insight algorithms |

<Aside type="tip">
  Insights with category `insight` can trigger notifications if the user has configured matching rules — great for proactive health coaching.
</Aside>
