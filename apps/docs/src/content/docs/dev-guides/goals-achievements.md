---
title: Goals & Achievements
description: Set health goals, track progress, and unlock achievements based on real wearable data.
---

import { Aside, Steps } from '@astrojs/starlight/components';

VitaSync includes a full goal-setting and achievement system. Users can set measurable health goals (steps, sleep, heart rate, etc.) and the platform automatically evaluates progress based on synced wearable data. Achievements are awarded when milestones are reached.

## Goals

### Create a Goal

```bash
curl -X POST http://localhost:3001/v1/users/$USER_ID/goals \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "10K Steps Daily",
    "description": "Walk at least 10,000 steps every day",
    "category": "activity",
    "metricType": "steps",
    "targetValue": 10000,
    "targetUnit": "steps",
    "cadence": "daily",
    "startDate": "2025-01-01T00:00:00Z"
  }'
```

### Goal Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Goal name (max 200 chars) |
| `description` | string | No | Detailed description (max 1000 chars) |
| `category` | string | Yes | Category: `activity`, `sleep`, `heart`, `body`, `nutrition`, `custom` |
| `metricType` | string | Yes | The health metric to track (e.g. `steps`, `sleep_duration`, `resting_heart_rate`) |
| `targetValue` | number | Yes | Target value to reach |
| `targetUnit` | string | Yes | Unit of measurement |
| `cadence` | string | Yes | `daily`, `weekly`, `monthly`, or `one_time` |
| `startDate` | ISO 8601 | Yes | When to start tracking |
| `endDate` | ISO 8601 | No | Optional end date |

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/goals` | List goals (filter by `status`, `category`) |
| `POST` | `/v1/users/:userId/goals` | Create a goal |
| `GET` | `/v1/users/:userId/goals/:goalId` | Get goal details |
| `PUT` | `/v1/users/:userId/goals/:goalId` | Update a goal |
| `DELETE` | `/v1/users/:userId/goals/:goalId` | Delete a goal |
| `POST` | `/v1/users/:userId/goals/:goalId/evaluate` | Trigger manual progress evaluation |

### Progress Tracking

Goals track these progress fields automatically:

| Field | Description |
|-------|-------------|
| `currentValue` | Latest measured value |
| `bestValue` | Best value achieved |
| `currentStreak` | Current consecutive days/weeks meeting the goal |
| `longestStreak` | All-time longest streak |
| `percentComplete` | Progress toward target (0–100) |

Call the `evaluate` endpoint to trigger a manual progress check, or progress is updated automatically after each sync.

### Goal Statuses

| Status | Description |
|--------|-------------|
| `active` | Currently being tracked |
| `completed` | Target achieved |
| `abandoned` | User chose to stop tracking |

## Achievements

Achievements are awarded automatically when users hit milestones — personal records, streak targets, cumulative totals, etc.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/achievements` | List unlocked achievements (filter by `category`) |
| `GET` | `/v1/achievements/definitions` | List all available achievement definitions |
| `POST` | `/v1/users/:userId/achievements/check` | Trigger achievement evaluation |

### Achievement Structure

```json
{
  "achievementId": "steps_100k_week",
  "category": "activity",
  "name": "Century Walker",
  "description": "Walk 100,000 steps in a single week",
  "tier": "gold",
  "unlockedAt": "2025-03-15T14:30:00.000Z"
}
```

### Tiers

Achievements can have tiers for progressive difficulty:

| Tier | Typical requirement |
|------|-------------------|
| `bronze` | Entry-level milestone |
| `silver` | Moderate achievement |
| `gold` | Significant accomplishment |
| `platinum` | Elite-level milestone |

<Aside type="tip">
  When achievements are unlocked, the system can automatically send notifications if the user has configured a rule with the `achievement` category.
</Aside>

## Quick Start

<Steps>
1. **Create a daily steps goal**
   ```bash
   curl -X POST http://localhost:3001/v1/users/$USER_ID/goals \
     -H "Authorization: Bearer $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"title":"10K Steps","category":"activity","metricType":"steps","targetValue":10000,"targetUnit":"steps","cadence":"daily","startDate":"2025-01-01T00:00:00Z"}'
   ```

2. **Check progress after a sync**
   ```bash
   curl -X POST http://localhost:3001/v1/users/$USER_ID/goals/$GOAL_ID/evaluate \
     -H "Authorization: Bearer $API_KEY"
   ```

3. **View unlocked achievements**
   ```bash
   curl http://localhost:3001/v1/users/$USER_ID/achievements \
     -H "Authorization: Bearer $API_KEY"
   ```
</Steps>
