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

## Health Score

The composite health score provides a single 0–100 number summarizing overall wellness, derived from five weighted sub-scores.

### Sub-Scores

| Sub-Score | Weight | Derived From |
|-----------|--------|-------------|
| **Sleep** | 25% | Sleep duration, efficiency, stage balance, consistency |
| **Activity** | 20% | Steps, active minutes, calories, workout frequency |
| **Cardio** | 20% | Resting HR, HRV, VO₂ max trends |
| **Recovery** | 20% | Recovery score, strain balance, readiness |
| **Body** | 15% | Weight stability, body composition, BMI |

### Calculation

Each sub-score is computed independently on a 0–100 scale, then combined:

```
healthScore = (sleep × 0.25) + (activity × 0.20) + (cardio × 0.20)
            + (recovery × 0.20) + (body × 0.15)
```

A **7-day rolling average** is applied to smooth day-to-day fluctuations and surface meaningful trends rather than noise.

### MCP Tool

```
get_health_scores(userId, from?, to?, limit?)
```

## Readiness Score

The readiness score (0–100) assesses daily recovery and training readiness using a 5-signal weighted model.

### Signal Weights

| Signal | Weight | Description |
|--------|--------|-------------|
| **HRV** | 30% | Overnight HRV (RMSSD) relative to personal baseline |
| **Sleep** | 25% | Composite of duration, efficiency, and stage balance |
| **Strain Recovery** | 20% | Previous-day strain vs. recovery response |
| **Resting Heart Rate** | 15% | Deviation from personal baseline RHR |
| **Physiological** | 10% | SpO₂, respiratory rate, skin temperature deviation |

### Auto-Personalization

After **14 days** of data collection, baselines shift from population defaults to personalized rolling averages. This adapts the scoring model to each individual's physiology.

### Training Recommendations

| Readiness Range | Status | Recommendation |
|----------------|--------|----------------|
| 80–100 | **Peak** | High-intensity training, competition ready |
| 60–79 | **Moderate** | Moderate training, maintain load |
| 40–59 | **Low** | Light activity, prioritize recovery |
| 0–39 | **Rest** | Active recovery only, possible illness/overtraining |

## Body Score

The body score evaluates body composition health using three components.

### Components

| Component | Metric | Scoring |
|-----------|--------|---------|
| **Weight Stability** | 14-day coefficient of variation (CV) | CV < 1% = 100; CV > 5% = 0; linear interpolation between |
| **Body Composition** | Body fat percentage | Scored against age- and gender-adjusted healthy ranges |
| **BMI** | Body mass index | 18.5–24.9 = optimal; tapered scoring outside range |

### Formula

```
bodyScore = (weightStability × 0.40) + (bodyComposition × 0.35) + (bmiScore × 0.25)
```

## Metabolic Efficiency

A composite index measuring how efficiently the body converts physiological inputs into performance, with gender-adjusted reference ranges.

### Sub-Indices

| Sub-Index | Method | Description |
|-----------|--------|-------------|
| **Cardiac Efficiency** | Buchheit method | Ratio of HRV to resting HR — higher values indicate more efficient cardiac autonomic regulation |
| **Energy Efficiency** | Activity-to-calorie ratio | How effectively active effort translates to energy expenditure |
| **Recovery Efficiency** | Cole model | Speed and completeness of HRV and RHR return to baseline after strain |
| **Aerobic Capacity Proxy** | Estimated VO₂ max scaling | Derived from HR/workload relationship when direct VO₂ max is unavailable |

### Composite Formula

```
metabolicEfficiency = (cardiac × 0.30) + (energy × 0.25)
                    + (recovery × 0.25) + (aerobic × 0.20)
```

All sub-indices are normalized to 0–100 and adjusted for gender using population reference data.

## Training Load

An impulse-response EWMA (Exponentially Weighted Moving Average) model that tracks training stress accumulation and dissipation.

### Metrics

| Metric | Window | Description |
|--------|--------|-------------|
| **Daily Strain** | — | TRIMP-like impulse from workout intensity and duration |
| **ATL** (Acute Training Load) | 7-day EWMA | Recent training stress — "fatigue" |
| **CTL** (Chronic Training Load) | 42-day EWMA | Long-term fitness adaptation — "fitness" |
| **TSB** (Training Stress Balance) | CTL − ATL | Net balance — "form" |

### EWMA Formula

```
EWMAₜ = EWMAₜ₋₁ + α × (valueₜ − EWMAₜ₋₁)
  where α = 2 / (window + 1)
```

### Status Classification

| TSB Range | Status | Interpretation |
|-----------|--------|---------------|
| > 25 | **Transition** | Detraining — fitness declining |
| 5 to 25 | **Fresh** | Optimal performance window |
| −10 to 5 | **Neutral** | Balanced training load |
| −25 to −10 | **Tired** | Accumulated fatigue, manage recovery |
| < −25 | **Overreaching** | High injury/burnout risk |

## Recovery Prediction

Uses the **Banister Fitness-Fatigue** model with a 4-factor adjustment to predict recovery timelines.

### Banister Model

```
performance(t) = fitness(t) − fatigue(t)
fitness(t)  = Σ w(i) × e^(−(t−i)/τ₁)     τ₁ = 42 days
fatigue(t)  = Σ w(i) × e^(−(t−i)/τ₂)     τ₂ = 7 days
```

### 4-Factor Adjustment

| Factor | Weight | Signal |
|--------|--------|--------|
| **Training Load Decay** | 30% | Rate of ATL reduction since last session |
| **Sleep Quality** | 25% | Composite sleep score over recovery window |
| **HRV Trajectory** | 25% | Direction and slope of HRV trend (rising = recovering) |
| **RHR Elevation** | 20% | How far above baseline RHR remains (lower = more recovered) |

The model outputs a predicted recovery percentage (0–100%) and estimated hours to full recovery.

## Stress Resilience Index

Measures autonomic nervous system resilience — the body's ability to absorb and recover from stressors.

### Components

| Component | Description |
|-----------|-------------|
| **Stressor Identification** | Detects training, sleep deficit, and physiological stress events |
| **HRV Recovery Days** | Number of days for HRV to return to baseline after a stressor |
| **Supercompensation Ratio** | Magnitude of HRV overshoot above baseline post-recovery (higher = more resilient) |
| **Allostatic Load** | Cumulative stress burden — sustained deviation of RHR, HRV, and sleep from baselines |

### Scoring

```
resilience = (recoverySpeed × 0.35) + (supercompensation × 0.30)
           + (1 − allostatic × 0.20) + (stressorAdaptation × 0.15)
```

| Score Range | Rating |
|-------------|--------|
| 80–100 | **Excellent** — rapid recovery, strong adaptation |
| 60–79 | **Good** — adequate resilience, room for improvement |
| 40–59 | **Moderate** — slow recovery, watch for overtraining |
| 0–39 | **Low** — poor resilience, reduce stressors and prioritize rest |

## Circadian Rhythm Analysis

Uses the **Munich Chronotype Questionnaire (MCTQ)** methodology to classify chronotype and detect circadian misalignment.

### Outputs

| Output | Description |
|--------|-------------|
| **Chronotype** | Classification based on mid-sleep on free days (MSF): early, moderate-early, intermediate, moderate-late, late |
| **Social Jet Lag** | Difference between work-day and free-day mid-sleep — values > 1 hour indicate circadian misalignment |
| **Optimal Sleep Window** | Recommended bed and wake times aligned with the user's natural circadian phase |
| **Circadian Alignment Score** | 0–100 score measuring how well actual sleep timing matches the user's chronotype |

### MCTQ Mid-Sleep Calculation

```
MSF = sleep_onset_free + (sleep_duration_free / 2)
MSFsc = MSF − 0.5 × (sleep_duration_free − average_sleep_need)
          (sleep-corrected mid-sleep on free days)
```

### Chronotype Classification

| MSFsc | Chronotype |
|-------|-----------|
| < 02:30 | Early ("lark") |
| 02:30–03:30 | Moderate early |
| 03:30–04:30 | Intermediate |
| 04:30–05:30 | Moderate late |
| > 05:30 | Late ("owl") |

## Worker Queues

Analytics processing runs on dedicated BullMQ queues:

| Queue | Concurrency | Purpose |
|-------|-------------|---------|
| `analytics` | 3 | Correlation computation, health score calculation |
| `notifications` | 8 | Dispatching anomaly alerts + other notifications |

The analytics queue processes jobs after each sync completes, ensuring correlations and health scores are always up to date.
