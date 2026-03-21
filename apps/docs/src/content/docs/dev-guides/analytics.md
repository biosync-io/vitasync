---
title: AI & Analytics
description: Correlation engine, anomaly detection, health scores, and LLM-ready context for AI-assisted health coaching.
---

import { Aside } from '@astrojs/starlight/components';

The `@biosync-io/analytics` package provides built-in health data analytics that power AI-assisted coaching. It includes a correlation engine, anomaly detector, and an LLM context builder designed to produce structured data for AI assistants.

## Correlation Engine

Automatically discovers relationships between health metrics using statistical analysis.

### How It Works

1. Aggregates daily metric values over a configurable window (7–365 days)
2. Computes **Pearson** (linear) and **Spearman** (rank-based) correlation coefficients for every metric pair
3. Filters for statistical significance: |r| > 0.3 and p < 0.05
4. Persists results to the `metric_correlations` table for trend tracking

### API

```
POST /v1/users/:userId/analytics/correlations
```

**Request body:**

```json
{
  "days": 90
}
```

**Response:**

```json
{
  "data": [
    {
      "metricA": "resting_heart_rate",
      "metricB": "sleep_score",
      "pearson": -0.62,
      "spearman": -0.58,
      "pValue": 0.001,
      "sampleSize": 87,
      "strength": "moderate",
      "direction": "negative"
    }
  ],
  "count": 12
}
```

### MCP Tool

```
get_correlations(userId, minStrength?, days?)
```

Returns discovered correlations with optional minimum strength filter.

## Anomaly Detection

Multi-method anomaly detection identifies unusual health patterns using three approaches.

### Detection Methods

| Method | Description | Threshold |
|--------|-------------|-----------|
| **Z-Score** | Standard deviation from the mean | > 2.5σ |
| **IQR** | Interquartile range outlier detection | 1.5 × IQR beyond Q1/Q3 |
| **Clinical** | Hard-coded medical thresholds | See table below |

### Clinical Thresholds

| Metric | Threshold | Severity |
|--------|-----------|----------|
| SpO₂ | < 92% | `critical` |
| Heart Rate | > 120 bpm (resting) | `critical` |
| Heart Rate | < 40 bpm (resting) | `critical` |
| Temperature | > 39.5°C | `critical` |
| Temperature | < 35.0°C | `warning` |
| Blood Glucose | > 11.1 mmol/L | `warning` |
| Blood Glucose | < 3.9 mmol/L | `critical` |
| Respiratory Rate | > 25 breaths/min | `warning` |
| Respiratory Rate | < 8 breaths/min | `critical` |

<Aside type="caution">
Clinical thresholds are informational and not intended as medical advice. They are based on commonly accepted clinical ranges and should be reviewed with a healthcare provider.
</Aside>

### API

```
POST /v1/users/:userId/analytics/anomalies
```

**Request body:**

```json
{
  "lookbackDays": 1
}
```

**Response:**

```json
{
  "data": [
    {
      "metricType": "blood_oxygen",
      "value": 89,
      "method": "clinical_threshold",
      "severity": "critical",
      "message": "SpO2 89% is below clinical threshold of 92%",
      "recordedAt": "2025-06-15T03:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Automatic Notifications

When anomalies are detected during background analytics processing, the worker automatically enqueues notification jobs with category `anomaly` and the appropriate severity. Users who have configured notification rules matching the `anomaly` category will receive alerts through their configured channels.

### MCP Tool

```
get_anomaly_alerts(userId, severity?, status?, limit?)
```

## LLM-Ready Context

The `buildLLMContext()` function produces a comprehensive biological context package optimized for AI assistants.

### What's Included

| Section | Content |
|---------|---------|
| **Baselines** | 30-day rolling averages for all key metrics |
| **Trends** | Direction and magnitude of recent metric changes |
| **Anomalies** | Active anomaly alerts with severity and detection method |
| **Correlations** | Top metric correlations with strength and direction |
| **Health Scores** | Latest composite scores (overall, sleep, activity, cardio, recovery) |
| **Summary** | Natural language paragraph summarizing the user's current health state |

### API

```
GET /v1/users/:userId/analytics/context
```

**Response:**

```json
{
  "data": {
    "baselines": {
      "resting_heart_rate": { "mean": 58.2, "stdDev": 3.1, "sampleSize": 30 },
      "sleep_score": { "mean": 78.5, "stdDev": 8.2, "sampleSize": 28 }
    },
    "trends": [
      { "metric": "resting_heart_rate", "direction": "decreasing", "changePercent": -4.2 }
    ],
    "anomalies": [],
    "correlations": [
      { "metricA": "sleep_score", "metricB": "recovery_score", "pearson": 0.72 }
    ],
    "healthScores": {
      "overall": 82, "sleep": 78, "activity": 85, "cardio": 80, "recovery": 84
    },
    "summary": "Overall health is good. Resting heart rate has been trending down over the past 2 weeks. Sleep quality and recovery scores are strongly correlated. No anomalies detected."
  }
}
```

### MCP Tool

```
get_health_context(userId)
```

This is the recommended first tool call when an AI assistant needs to understand a user's health state. The structured context + natural language summary provides everything needed for informed health coaching responses.

### Usage in AI Prompts

When connected via MCP, an AI assistant can use the context like this:

```
User: "How am I doing health-wise this week?"

AI calls: get_health_context(userId)
AI receives: structured baselines, trends, anomalies, scores, summary
AI responds with personalized, data-driven health insights
```

## Health Scores

Composite health scores are computed from multiple underlying metrics.

| Score | Derived from |
|-------|-------------|
| **Overall** | Weighted average of all sub-scores |
| **Sleep** | Sleep duration, efficiency, stage balance, consistency |
| **Activity** | Steps, active minutes, calories, workout frequency |
| **Cardio** | Resting HR, HRV, VO₂ max trends |
| **Recovery** | Recovery score, strain balance, readiness |

### MCP Tool

```
get_health_scores(userId, from?, to?, limit?)
```

## Worker Queues

Analytics processing runs on dedicated BullMQ queues:

| Queue | Concurrency | Purpose |
|-------|-------------|---------|
| `analytics` | 3 | Correlation computation, health score calculation |
| `notifications` | 8 | Dispatching anomaly alerts + other notifications |

The analytics queue processes jobs after each sync completes, ensuring correlations and health scores are always up to date.
