---
title: Challenges & Training Plans
description: Create team competitions with leaderboards and generate AI-powered training plans.
---

import { Aside, Steps } from '@astrojs/starlight/components';

VitaSync supports workspace-wide fitness challenges with leaderboards and AI-generated training plans.

## Challenges

Challenges are multi-user competitions within a workspace. Users compete on a specific health metric over a defined time period.

### Create a Challenge

```bash
curl -X POST http://localhost:3001/v1/challenges \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "March Step Challenge",
    "description": "Who can walk the most steps this month?",
    "metricType": "steps",
    "goalValue": 300000,
    "startDate": "2025-03-01T00:00:00Z",
    "endDate": "2025-03-31T23:59:59Z",
    "maxParticipants": 50
  }'
```

### Challenge Lifecycle

<Steps>
1. **Draft** — Challenge is created but not yet visible to participants.
2. **Active** — Challenge is open for joining and scores are tracked.
3. **Completed** — End date has passed; final leaderboard is locked.
4. **Cancelled** — Challenge was cancelled before completion.
</Steps>

### Activate a Challenge

```bash
curl -X POST http://localhost:3001/v1/challenges/$CHALLENGE_ID/activate \
  -H "Authorization: Bearer $API_KEY"
```

### Join a Challenge

```bash
curl -X POST http://localhost:3001/v1/challenges/$CHALLENGE_ID/join \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "'$USER_ID'"}'
```

### View Leaderboard

```bash
curl http://localhost:3001/v1/challenges/$CHALLENGE_ID/leaderboard \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "data": [
    { "userId": "...", "rank": 1, "score": 125000, "dailyScores": { "2025-03-15": 12000 } },
    { "userId": "...", "rank": 2, "score": 98000, "dailyScores": { "2025-03-15": 9800 } }
  ]
}
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/challenges` | List workspace challenges (filter by `status`) |
| `POST` | `/v1/challenges` | Create a challenge |
| `GET` | `/v1/challenges/:challengeId` | Get challenge details |
| `POST` | `/v1/challenges/:challengeId/activate` | Activate a draft challenge |
| `POST` | `/v1/challenges/:challengeId/join` | Join a challenge |
| `POST` | `/v1/challenges/:challengeId/leave` | Leave a challenge |
| `GET` | `/v1/challenges/:challengeId/leaderboard` | View leaderboard |

---

## Training Plans

AI-generated training plans adapt to user goals, fitness level, and available time.

### Generate a Plan

```bash
curl -X POST http://localhost:3001/v1/users/$USER_ID/training-plans/generate \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "endurance",
    "difficulty": "intermediate",
    "durationWeeks": 12,
    "daysPerWeek": 4,
    "focusAreas": ["running", "cycling"]
  }'
```

### Plan Goals

| Goal | Focus |
|------|-------|
| `endurance` | Build aerobic capacity and distance |
| `strength` | Resistance training and power |
| `weight_loss` | Caloric deficit with mixed training |
| `general_fitness` | Balanced fitness improvement |
| `flexibility` | Mobility and stretching routines |

### Difficulty Levels

| Level | Description |
|-------|-------------|
| `beginner` | New to structured training |
| `intermediate` | Consistent training for 3+ months |
| `advanced` | Experienced athlete, high-intensity capable |

### Plan Response

```json
{
  "id": "01HX...",
  "userId": "...",
  "name": "12-Week Endurance Builder",
  "goal": "endurance",
  "difficulty": "intermediate",
  "durationWeeks": 12,
  "currentWeek": 1,
  "status": "active",
  "schedule": { "...weekly schedule..." },
  "weeklyTargets": { "...progressive targets..." },
  "adherenceRate": 0,
  "adaptive": true
}
```

<Aside type="tip">
  Adaptive plans (`adaptive: true`) automatically adjust difficulty based on actual performance data synced from wearables.
</Aside>

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/users/:userId/training-plans` | List plans (filter by `status`) |
| `GET` | `/v1/users/:userId/training-plans/:planId` | Get plan details |
| `POST` | `/v1/users/:userId/training-plans/generate` | Generate a new plan |
| `POST` | `/v1/users/:userId/training-plans/:planId/progress` | Update training progress |
