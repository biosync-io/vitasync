---
title: Health Tracking
description: Log mood, nutrition, medications, and symptoms alongside your wearable data.
---

import { Aside, Tabs, TabItem } from '@astrojs/starlight/components';

Beyond synced wearable data, VitaSync provides manual health tracking APIs for mood, nutrition, medications, and symptoms. These self-reported data points enrich AI analytics and correlation analysis.

## Mood Tracking

Log daily mood with scores, energy levels, stress, and tags.

### Log a Mood Entry

```bash
curl -X POST http://localhost:3001/v1/users/$USER_ID/mood \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mood": "happy",
    "score": 8,
    "energy": 7,
    "stress": 3,
    "tags": ["exercise", "good_sleep"],
    "notes": "Great morning run, felt energized all day"
  }'
```

### Mood Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mood` | string | Yes | Mood label (e.g. `happy`, `anxious`, `neutral`, `tired`) |
| `score` | number | Yes | Overall mood score (1–10) |
| `energy` | number | No | Energy level (1–10) |
| `stress` | number | No | Stress level (1–10) |
| `tags` | string[] | No | Context tags (max 10) |
| `factors` | string[] | No | Contributing factors (max 10) |
| `notes` | string | No | Free-text notes (max 2000 chars) |
| `recordedAt` | ISO 8601 | No | Defaults to now |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/mood` | List mood logs (filter by `from`, `to`, `mood`) |
| `POST` | `/v1/users/:userId/mood` | Create a mood entry |
| `GET` | `/v1/users/:userId/mood/stats` | Mood statistics for a period (`days` param, default 30) |

### Mood Stats Response

```json
{
  "averageScore": 7.2,
  "averageEnergy": 6.8,
  "averageStress": 4.1,
  "moodDistribution": { "happy": 12, "neutral": 8, "anxious": 3 },
  "topTags": ["exercise", "good_sleep", "social"],
  "trend": "improving"
}
```

---

## Nutrition Tracking

Log meals with full macronutrient breakdown and get daily/weekly summaries.

### Log a Meal

```bash
curl -X POST http://localhost:3001/v1/users/$USER_ID/nutrition \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mealType": "lunch",
    "description": "Grilled chicken salad",
    "calories": 520,
    "proteinG": 42,
    "carbsG": 30,
    "fatG": 22,
    "fiberG": 8,
    "waterMl": 500
  }'
```

### Nutrition Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mealType` | string | Yes | `breakfast`, `lunch`, `dinner`, `snack`, `supplement` |
| `description` | string | No | Meal description (max 500 chars) |
| `calories` | number | No | Total calories |
| `proteinG` | number | No | Protein in grams |
| `carbsG` | number | No | Carbohydrates in grams |
| `fatG` | number | No | Fat in grams |
| `fiberG` | number | No | Fiber in grams |
| `sugarG` | number | No | Sugar in grams |
| `sodiumMg` | number | No | Sodium in milligrams |
| `waterMl` | number | No | Water intake in milliliters |
| `loggedAt` | ISO 8601 | No | Defaults to now |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/nutrition` | List nutrition logs (filter by `from`, `to`, `mealType`) |
| `POST` | `/v1/users/:userId/nutrition` | Log a meal |
| `GET` | `/v1/users/:userId/nutrition/:logId` | Get a specific log |
| `PUT` | `/v1/users/:userId/nutrition/:logId` | Update a log |
| `DELETE` | `/v1/users/:userId/nutrition/:logId` | Delete a log |
| `GET` | `/v1/users/:userId/nutrition/summary/daily` | Daily macro totals (`date` param) |
| `GET` | `/v1/users/:userId/nutrition/summary/weekly` | Weekly averages |

---

## Medication Tracking

Track prescriptions, supplements, and adherence.

### Add a Medication

```bash
curl -X POST http://localhost:3001/v1/users/$USER_ID/medications \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Vitamin D3",
    "dosage": "5000 IU",
    "frequency": "daily",
    "timeOfDay": ["morning"],
    "startDate": "2025-01-01T00:00:00Z"
  }'
```

### Log Adherence

```bash
curl -X POST http://localhost:3001/v1/users/$USER_ID/medications/$MED_ID/log \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "taken",
    "scheduledAt": "2025-03-18T08:00:00Z",
    "takenAt": "2025-03-18T08:15:00Z"
  }'
```

### Adherence Statuses

| Status | Description |
|--------|-------------|
| `taken` | Medication was taken |
| `missed` | Dose was missed |
| `skipped` | Intentionally skipped |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/medications` | List medications (`activeOnly` filter, default `true`) |
| `POST` | `/v1/users/:userId/medications` | Add a medication |
| `GET` | `/v1/users/:userId/medications/:medId` | Get medication details |
| `PUT` | `/v1/users/:userId/medications/:medId` | Update a medication |
| `DELETE` | `/v1/users/:userId/medications/:medId` | Delete a medication |
| `POST` | `/v1/users/:userId/medications/:medId/log` | Log adherence |
| `GET` | `/v1/users/:userId/medications/:medId/logs` | List adherence logs |
| `GET` | `/v1/users/:userId/medications/:medId/stats` | Adherence stats (`days` param, default 30) |

---

## Symptom Tracking

Log symptoms with severity, body location, triggers, and relief measures. The system also analyzes patterns over time.

### Log a Symptom

```bash
curl -X POST http://localhost:3001/v1/users/$USER_ID/symptoms \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "symptomName": "Headache",
    "severity": 6,
    "bodyLocation": "frontal",
    "triggers": ["poor_sleep", "screen_time"],
    "reliefMeasures": ["ibuprofen", "rest"],
    "notes": "Started after 4 hours of continuous screen time"
  }'
```

### Symptom Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `symptomName` | string | Yes | Name of the symptom (max 200 chars) |
| `severity` | number | Yes | Severity scale (1–10) |
| `bodyLocation` | string | No | Body area affected (max 100 chars) |
| `duration` | string | No | Duration description (max 100 chars) |
| `triggers` | string[] | No | Known triggers (max 10) |
| `reliefMeasures` | string[] | No | Measures tried (max 10) |
| `notes` | string | No | Free-text notes (max 2000 chars) |
| `occurredAt` | ISO 8601 | No | Defaults to now |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/symptoms` | List symptom logs (filter by `from`, `to`, `symptom`) |
| `POST` | `/v1/users/:userId/symptoms` | Log a symptom |
| `GET` | `/v1/users/:userId/symptoms/:logId` | Get a specific log |
| `DELETE` | `/v1/users/:userId/symptoms/:logId` | Delete a log |
| `GET` | `/v1/users/:userId/symptoms/top` | Top symptoms by frequency (`days` param, default 30) |
| `GET` | `/v1/users/:userId/symptoms/patterns` | Pattern analysis (`days` param, default 90) |

<Aside type="tip">
  Symptom patterns are analyzed by the correlation engine. If headaches consistently follow poor sleep, this relationship will surface in the analytics correlations.
</Aside>
