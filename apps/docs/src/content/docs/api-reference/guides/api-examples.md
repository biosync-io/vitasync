---
title: API Examples
description: Comprehensive curl examples for every VitaSync API endpoint with request and response samples.
---

import { Tabs, TabItem } from "@astrojs/starlight/components"

A quick-reference cookbook with `curl` examples for all VitaSync API endpoints. Every example uses `$API_KEY` and `$USER_ID` shell variables — set them first:

```bash
export API_KEY="vs_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export USER_ID="01JA4MNPQR8STUVWXYZ00001"
export BASE_URL="http://localhost:3001"
```

---

## Users

### Create a user

```bash
curl -X POST "$BASE_URL/v1/users" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "usr_abc123",
    "email": "alice@example.com",
    "displayName": "Alice",
    "gender": "female",
    "metadata": { "plan": "premium" }
  }'
```

```json
// 201 Created (or 200 if user already exists)
{
  "id": "01JA4MNPQR8STUVWXYZ00001",
  "externalId": "usr_abc123",
  "email": "alice@example.com",
  "displayName": "Alice",
  "gender": "female",
  "metadata": { "plan": "premium" },
  "createdAt": "2025-06-01T10:00:00.000Z",
  "updatedAt": "2025-06-01T10:00:00.000Z"
}
```

### List users

```bash
curl "$BASE_URL/v1/users" \
  -H "Authorization: Bearer $API_KEY"
```

### Update a user

```bash
curl -X PATCH "$BASE_URL/v1/users/$USER_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Alice W.",
    "gender": "female"
  }'
```

### Delete a user

```bash
# Requires admin scope
curl -X DELETE "$BASE_URL/v1/users/$USER_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

## OAuth & Connections

### Start OAuth flow

Redirect the user's browser to this URL:

```bash
# Returns a redirect URL — open in a browser, not curl
echo "$BASE_URL/v1/oauth/fitbit/authorize?userId=$USER_ID"
```

### List connections

```bash
curl "$BASE_URL/v1/users/$USER_ID/connections" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
[
  {
    "id": "01JA4MNPQR8STUVWXYZ00002",
    "providerId": "fitbit",
    "status": "active",
    "providerUserId": "ABC123",
    "lastSyncedAt": "2025-06-15T09:00:00.000Z",
    "createdAt": "2025-06-01T10:05:00.000Z"
  }
]
```

### Trigger a sync

```bash
CONNECTION_ID="01JA4MNPQR8STUVWXYZ00002"

curl -X POST "$BASE_URL/v1/users/$USER_ID/connections/$CONNECTION_ID/sync" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 202 Accepted
{
  "jobId": "sync-01JA4MNPQR8STUVWXYZ00099",
  "status": "queued"
}
```

### Disconnect a provider

```bash
curl -X DELETE "$BASE_URL/v1/users/$USER_ID/connections/$CONNECTION_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Health Data

### Query metrics

```bash
# All metrics
curl "$BASE_URL/v1/users/$USER_ID/health" \
  -H "Authorization: Bearer $API_KEY"

# Filtered by type and date range
curl "$BASE_URL/v1/users/$USER_ID/health?metricType=steps&from=2025-06-01T00:00:00Z&to=2025-06-07T23:59:59Z&limit=50" \
  -H "Authorization: Bearer $API_KEY"

# Cursor-based pagination
curl "$BASE_URL/v1/users/$USER_ID/health?metricType=heart_rate&limit=100&cursor=eyJpZCI6IjAxSkE0..." \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
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
    }
  ],
  "hasMore": true,
  "nextCursor": "eyJpZCI6IjAxSkE0..."
}
```

### Summary (counts per metric type)

```bash
curl "$BASE_URL/v1/users/$USER_ID/health/summary" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
{
  "steps": 180,
  "heart_rate": 4320,
  "calories": 180,
  "sleep_duration": 30,
  "weight": 12
}
```

### Timeseries (aggregated)

```bash
curl "$BASE_URL/v1/users/$USER_ID/health/timeseries?metricType=steps&from=2025-06-01T00:00:00Z&to=2025-06-30T23:59:59Z&bucket=day" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
{
  "metricType": "steps",
  "bucket": "day",
  "data": [
    { "timestamp": "2025-06-01T00:00:00.000Z", "avg": 8234, "min": 8234, "max": 8234, "count": 1 },
    { "timestamp": "2025-06-02T00:00:00.000Z", "avg": 11420, "min": 11420, "max": 11420, "count": 1 }
  ]
}
```

### Daily summaries

```bash
curl "$BASE_URL/v1/users/$USER_ID/health/daily-summaries?from=2025-06-01&to=2025-06-07&metricTypes=steps,calories,heart_rate" \
  -H "Authorization: Bearer $API_KEY"
```

### Delete health data (GDPR)

```bash
curl -X DELETE "$BASE_URL/v1/users/$USER_ID/health" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Events

### List events (workouts, sleep sessions)

```bash
# All events
curl "$BASE_URL/v1/users/$USER_ID/events" \
  -H "Authorization: Bearer $API_KEY"

# Filtered by type
curl "$BASE_URL/v1/users/$USER_ID/events?eventType=workout&from=2025-06-01T00:00:00Z&to=2025-06-30T23:59:59Z&limit=20" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
{
  "data": [
    {
      "id": "01JA4MNPQR8STUVWXYZ00020",
      "userId": "01JA4MNPQR8STUVWXYZ00001",
      "providerId": "fitbit",
      "eventType": "workout",
      "startedAt": "2025-06-10T07:00:00.000Z",
      "endedAt": "2025-06-10T08:15:00.000Z",
      "data": {
        "activityType": "Running",
        "calories": 520,
        "distance": 8.2,
        "distanceUnit": "km",
        "avgHeartRate": 155,
        "maxHeartRate": 178
      }
    }
  ],
  "hasMore": false
}
```

### Get a single event

```bash
EVENT_ID="01JA4MNPQR8STUVWXYZ00020"

curl "$BASE_URL/v1/users/$USER_ID/events/$EVENT_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Personal Records

### List all records

```bash
curl "$BASE_URL/v1/users/$USER_ID/personal-records" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
[
  {
    "id": "01JA4MNPQR8STUVWXYZ00030",
    "metricType": "steps",
    "value": 24831,
    "recordedAt": "2025-05-14T00:00:00.000Z",
    "providerId": "fitbit"
  },
  {
    "id": "01JA4MNPQR8STUVWXYZ00031",
    "metricType": "vo2_max",
    "value": 48.2,
    "recordedAt": "2025-06-01T00:00:00.000Z",
    "providerId": "garmin"
  }
]
```

### Records by metric type

```bash
curl "$BASE_URL/v1/users/$USER_ID/personal-records/steps" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Mood Tracking

### Log mood

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/mood" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mood": "energetic",
    "score": 8,
    "energy": 9,
    "stress": 3,
    "notes": "Great morning run, feeling awesome",
    "tags": ["exercise", "outdoors"],
    "factors": ["good_sleep", "exercise"]
  }'
```

```json
// 201 Created
{
  "id": "01JA4MNPQR8STUVWXYZ00040",
  "userId": "01JA4MNPQR8STUVWXYZ00001",
  "mood": "energetic",
  "score": 8,
  "energy": 9,
  "stress": 3,
  "notes": "Great morning run, feeling awesome",
  "tags": ["exercise", "outdoors"],
  "factors": ["good_sleep", "exercise"],
  "recordedAt": "2025-06-15T08:30:00.000Z",
  "createdAt": "2025-06-15T08:30:00.000Z"
}
```

### List mood entries

```bash
curl "$BASE_URL/v1/users/$USER_ID/mood?from=2025-06-01T00:00:00Z&to=2025-06-30T23:59:59Z" \
  -H "Authorization: Bearer $API_KEY"
```

### Mood stats

```bash
curl "$BASE_URL/v1/users/$USER_ID/mood/stats" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Journal

### Create entry

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/journal" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Marathon Training Week 8",
    "body": "Completed a 20-mile long run today. Legs felt heavy in miles 16-18 but pushed through. Need to focus on hydration next week.",
    "moodScore": 4,
    "moodLabel": "accomplished",
    "gratitude": ["Supportive running group", "Cool weather"],
    "tags": ["marathon-training", "long-run"]
  }'
```

```json
// 201 Created
{
  "id": "01JA4MNPQR8STUVWXYZ00050",
  "userId": "01JA4MNPQR8STUVWXYZ00001",
  "title": "Marathon Training Week 8",
  "body": "Completed a 20-mile long run today...",
  "moodScore": 4,
  "moodLabel": "accomplished",
  "gratitude": ["Supportive running group", "Cool weather"],
  "tags": ["marathon-training", "long-run"],
  "entryDate": "2025-06-15T00:00:00.000Z",
  "createdAt": "2025-06-15T18:30:00.000Z"
}
```

### List entries

```bash
curl "$BASE_URL/v1/users/$USER_ID/journal?limit=10" \
  -H "Authorization: Bearer $API_KEY"
```

### Update entry

```bash
ENTRY_ID="01JA4MNPQR8STUVWXYZ00050"

curl -X PATCH "$BASE_URL/v1/users/$USER_ID/journal/$ENTRY_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["marathon-training", "long-run", "milestone"]
  }'
```

### Delete entry

```bash
curl -X DELETE "$BASE_URL/v1/users/$USER_ID/journal/$ENTRY_ID" \
  -H "Authorization: Bearer $API_KEY"
```

### Journal stats

```bash
curl "$BASE_URL/v1/users/$USER_ID/journal/stats" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Habits

### Create a habit

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/habits" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Morning Meditation",
    "icon": "🧘",
    "color": "purple",
    "frequency": "daily"
  }'
```

```json
// 201 Created
{
  "id": "01JA4MNPQR8STUVWXYZ00060",
  "userId": "01JA4MNPQR8STUVWXYZ00001",
  "name": "Morning Meditation",
  "icon": "🧘",
  "color": "purple",
  "frequency": "daily",
  "targetDays": null,
  "active": true,
  "createdAt": "2025-06-01T08:00:00.000Z"
}
```

### List habits

```bash
curl "$BASE_URL/v1/users/$USER_ID/habits" \
  -H "Authorization: Bearer $API_KEY"
```

### Mark habit complete

```bash
HABIT_ID="01JA4MNPQR8STUVWXYZ00060"

curl -X POST "$BASE_URL/v1/users/$USER_ID/habits/$HABIT_ID/complete" \
  -H "Authorization: Bearer $API_KEY"
```

### Undo completion for a date

```bash
curl -X DELETE "$BASE_URL/v1/users/$USER_ID/habits/$HABIT_ID/complete/2025-06-15" \
  -H "Authorization: Bearer $API_KEY"
```

### Update a habit

```bash
curl -X PATCH "$BASE_URL/v1/users/$USER_ID/habits/$HABIT_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "frequency": "weekdays",
    "icon": "🧘‍♀️"
  }'
```

### Habits summary

```bash
curl "$BASE_URL/v1/users/$USER_ID/habits/summary" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Water Intake

### Log water

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/water" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500,
    "unit": "ml"
  }'
```

### Today's intake

```bash
curl "$BASE_URL/v1/users/$USER_ID/water/today" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
{
  "total": 2000,
  "unit": "ml",
  "goal": 3000,
  "logs": [
    { "id": "...", "amount": 500, "unit": "ml", "loggedAt": "2025-06-15T08:00:00.000Z" },
    { "id": "...", "amount": 750, "unit": "ml", "loggedAt": "2025-06-15T12:00:00.000Z" },
    { "id": "...", "amount": 750, "unit": "ml", "loggedAt": "2025-06-15T16:00:00.000Z" }
  ]
}
```

### Weekly summary

```bash
curl "$BASE_URL/v1/users/$USER_ID/water/weekly" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Nutrition

### Log a meal

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/nutrition" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mealType": "lunch",
    "name": "Grilled Chicken Salad",
    "calories": 450,
    "protein": 38,
    "carbs": 22,
    "fat": 18,
    "fiber": 6
  }'
```

### Daily summary

```bash
curl "$BASE_URL/v1/users/$USER_ID/nutrition/summary/daily?date=2025-06-15" \
  -H "Authorization: Bearer $API_KEY"
```

### Weekly summary

```bash
curl "$BASE_URL/v1/users/$USER_ID/nutrition/summary/weekly?from=2025-06-09" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Medications

### Add a medication

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/medications" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Vitamin D3",
    "dosage": "5000",
    "unit": "IU",
    "frequency": "daily",
    "timeOfDay": "morning",
    "notes": "Take with food"
  }'
```

### Log medication taken

```bash
MED_ID="01JA4MNPQR8STUVWXYZ00070"

curl -X POST "$BASE_URL/v1/users/$USER_ID/medications/$MED_ID/log" \
  -H "Authorization: Bearer $API_KEY"
```

### Medication adherence stats

```bash
curl "$BASE_URL/v1/users/$USER_ID/medications/$MED_ID/stats" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Symptoms

### Log a symptom

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/symptoms" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "symptom": "headache",
    "severity": 6,
    "notes": "Started after afternoon meeting",
    "tags": ["stress", "dehydration"]
  }'
```

### Top symptoms

```bash
curl "$BASE_URL/v1/users/$USER_ID/symptoms/top" \
  -H "Authorization: Bearer $API_KEY"
```

### Symptom patterns

```bash
curl "$BASE_URL/v1/users/$USER_ID/symptoms/patterns" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Goals

### Create a goal

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/goals" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Run 100 miles this month",
    "metricType": "distance",
    "targetValue": 160.9,
    "targetUnit": "km",
    "period": "monthly",
    "startDate": "2025-06-01",
    "endDate": "2025-06-30"
  }'
```

### List goals

```bash
curl "$BASE_URL/v1/users/$USER_ID/goals" \
  -H "Authorization: Bearer $API_KEY"
```

### Evaluate goal progress

```bash
GOAL_ID="01JA4MNPQR8STUVWXYZ00080"

curl -X POST "$BASE_URL/v1/users/$USER_ID/goals/$GOAL_ID/evaluate" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
{
  "goalId": "01JA4MNPQR8STUVWXYZ00080",
  "name": "Run 100 miles this month",
  "currentValue": 98.5,
  "targetValue": 160.9,
  "progress": 0.612,
  "onTrack": true,
  "daysRemaining": 15
}
```

---

## Achievements

### List user achievements

```bash
curl "$BASE_URL/v1/users/$USER_ID/achievements" \
  -H "Authorization: Bearer $API_KEY"
```

### List achievement definitions

```bash
curl "$BASE_URL/v1/achievements/definitions" \
  -H "Authorization: Bearer $API_KEY"
```

### Check for new achievements

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/achievements/check" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Challenges

### Create a challenge

```bash
curl -X POST "$BASE_URL/v1/challenges" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "June Step Challenge",
    "metricType": "steps",
    "targetValue": 300000,
    "startDate": "2025-06-01",
    "endDate": "2025-06-30",
    "description": "Walk 300K steps in June"
  }'
```

### Join a challenge

```bash
CHALLENGE_ID="01JA4MNPQR8STUVWXYZ00090"

curl -X POST "$BASE_URL/v1/challenges/$CHALLENGE_ID/join" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "'"$USER_ID"'" }'
```

### View leaderboard

```bash
curl "$BASE_URL/v1/challenges/$CHALLENGE_ID/leaderboard" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Health Scores

### Get latest score

```bash
curl "$BASE_URL/v1/users/$USER_ID/health-scores/latest" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
{
  "overallScore": 82,
  "components": {
    "activity": 88,
    "sleep": 75,
    "recovery": 84,
    "nutrition": 78
  },
  "computedAt": "2025-06-15T06:00:00.000Z"
}
```

### Score history

```bash
curl "$BASE_URL/v1/users/$USER_ID/health-scores?from=2025-06-01T00:00:00Z&to=2025-06-15T23:59:59Z" \
  -H "Authorization: Bearer $API_KEY"
```

### Compute score on demand

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/health-scores/compute" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Readiness & Training Load

### Get readiness

```bash
curl "$BASE_URL/v1/users/$USER_ID/readiness" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
{
  "score": 78,
  "level": "moderate",
  "factors": {
    "sleepQuality": 72,
    "recovery": 81,
    "trainingLoad": 75,
    "hrv": 85
  },
  "recommendation": "Light to moderate training recommended",
  "computedAt": "2025-06-15T06:00:00.000Z"
}
```

### Get training load

```bash
curl "$BASE_URL/v1/users/$USER_ID/training-load" \
  -H "Authorization: Bearer $API_KEY"
```

### Training load history

```bash
curl "$BASE_URL/v1/users/$USER_ID/training-load/history?from=2025-05-01T00:00:00Z&to=2025-06-15T23:59:59Z" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Training Plans

### Generate a plan

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/training-plans/generate" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "half_marathon",
    "startDate": "2025-07-01",
    "raceDate": "2025-10-15"
  }'
```

### List plans

```bash
curl "$BASE_URL/v1/users/$USER_ID/training-plans" \
  -H "Authorization: Bearer $API_KEY"
```

### Log plan progress

```bash
PLAN_ID="01JA4MNPQR8STUVWXYZ00095"

curl -X POST "$BASE_URL/v1/users/$USER_ID/training-plans/$PLAN_ID/progress" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "week": 3,
    "completedWorkouts": 4,
    "notes": "Skipped Wednesday due to rain"
  }'
```

---

## Sleep Analysis

### Sleep debt

```bash
curl "$BASE_URL/v1/users/$USER_ID/sleep-analysis/debt" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
{
  "debtHours": 3.5,
  "avgDuration": 6.8,
  "targetDuration": 8.0,
  "trend": "improving",
  "daysAnalyzed": 14
}
```

### Sleep quality

```bash
curl "$BASE_URL/v1/users/$USER_ID/sleep-analysis/quality" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Analytics

### Biological context (LLM-ready)

```bash
curl "$BASE_URL/v1/users/$USER_ID/analytics/context" \
  -H "Authorization: Bearer $API_KEY"
```

### Discover correlations

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/analytics/correlations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": ["steps", "sleep_duration", "resting_heart_rate", "mood_score"],
    "from": "2025-03-01T00:00:00Z",
    "to": "2025-06-15T23:59:59Z"
  }'
```

```json
// 200 OK
{
  "correlations": [
    {
      "metricA": "steps",
      "metricB": "sleep_duration",
      "correlation": 0.42,
      "strength": "moderate",
      "direction": "positive"
    },
    {
      "metricA": "sleep_duration",
      "metricB": "resting_heart_rate",
      "correlation": -0.61,
      "strength": "strong",
      "direction": "negative"
    }
  ]
}
```

### Detect anomalies

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/analytics/anomalies" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": ["resting_heart_rate", "hrv", "spo2"],
    "from": "2025-06-01T00:00:00Z",
    "to": "2025-06-15T23:59:59Z"
  }'
```

### Recovery analysis

```bash
curl "$BASE_URL/v1/users/$USER_ID/analytics/recovery" \
  -H "Authorization: Bearer $API_KEY"
```

### Circadian rhythm

```bash
curl "$BASE_URL/v1/users/$USER_ID/analytics/circadian" \
  -H "Authorization: Bearer $API_KEY"
```

### Metabolic analysis

```bash
curl "$BASE_URL/v1/users/$USER_ID/analytics/metabolic" \
  -H "Authorization: Bearer $API_KEY"
```

### Resilience score

```bash
curl "$BASE_URL/v1/users/$USER_ID/analytics/resilience" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Baselines & Anomalies

### Compute baselines

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/baselines/compute" \
  -H "Authorization: Bearer $API_KEY"
```

### Get baseline for a metric

```bash
curl "$BASE_URL/v1/users/$USER_ID/baselines/resting_heart_rate" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
{
  "metricType": "resting_heart_rate",
  "mean": 62.3,
  "stdDev": 3.1,
  "min": 56,
  "max": 71,
  "p25": 60,
  "p50": 62,
  "p75": 64,
  "sampleSize": 90,
  "computedAt": "2025-06-15T06:00:00.000Z"
}
```

### List anomalies

```bash
curl "$BASE_URL/v1/users/$USER_ID/anomalies" \
  -H "Authorization: Bearer $API_KEY"
```

### Acknowledge an anomaly

```bash
ANOMALY_ID="01JA4MNPQR8STUVWXYZ00100"

curl -X POST "$BASE_URL/v1/users/$USER_ID/anomalies/$ANOMALY_ID/acknowledge" \
  -H "Authorization: Bearer $API_KEY"
```

### Dismiss an anomaly

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/anomalies/$ANOMALY_ID/dismiss" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Correlations

### Compute correlations

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/correlations/compute" \
  -H "Authorization: Bearer $API_KEY"
```

### List stored correlations

```bash
curl "$BASE_URL/v1/users/$USER_ID/correlations" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Snapshots

### Generate weekly snapshot

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/snapshots/generate/weekly" \
  -H "Authorization: Bearer $API_KEY"
```

### Generate monthly snapshot

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/snapshots/generate/monthly" \
  -H "Authorization: Bearer $API_KEY"
```

### List snapshots

```bash
curl "$BASE_URL/v1/users/$USER_ID/snapshots" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Reports & Exports

### Generate a report

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/reports/generate" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "weekly",
    "from": "2025-06-09T00:00:00Z",
    "to": "2025-06-15T23:59:59Z"
  }'
```

### List reports

```bash
curl "$BASE_URL/v1/users/$USER_ID/reports" \
  -H "Authorization: Bearer $API_KEY"
```

### Export data

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/exports" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "json",
    "from": "2025-01-01T00:00:00Z",
    "to": "2025-06-15T23:59:59Z"
  }'
```

```json
// 202 Accepted
{
  "id": "01JA4MNPQR8STUVWXYZ00110",
  "status": "processing",
  "format": "json",
  "createdAt": "2025-06-15T12:00:00.000Z"
}
```

### Check export status

```bash
EXPORT_ID="01JA4MNPQR8STUVWXYZ00110"

curl "$BASE_URL/v1/users/$USER_ID/exports/$EXPORT_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Notifications

### Create a notification channel

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/notifications/channels" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "discord",
    "name": "My Discord",
    "config": {
      "webhookUrl": "https://discord.com/api/webhooks/1234567890/abcdef..."
    }
  }'
```

### Test a channel

```bash
CHANNEL_ID="01JA4MNPQR8STUVWXYZ00120"

curl -X POST "$BASE_URL/v1/users/$USER_ID/notifications/channels/$CHANNEL_ID/test" \
  -H "Authorization: Bearer $API_KEY"
```

### Create a notification rule

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/notifications/rules" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "01JA4MNPQR8STUVWXYZ00120",
    "event": "anomaly.detected",
    "conditions": {
      "severity": "high"
    }
  }'
```

### Get notification inbox

```bash
curl "$BASE_URL/v1/users/$USER_ID/notifications/inbox" \
  -H "Authorization: Bearer $API_KEY"
```

### Mark notifications as read

```bash
curl -X PATCH "$BASE_URL/v1/users/$USER_ID/notifications/inbox/read" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ids": ["01JA4MNPQR8STUVWXYZ00130", "01JA4MNPQR8STUVWXYZ00131"]
  }'
```

### Notification logs

```bash
curl "$BASE_URL/v1/users/$USER_ID/notifications/logs" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Insights & AI

### List insights

```bash
curl "$BASE_URL/v1/users/$USER_ID/insights" \
  -H "Authorization: Bearer $API_KEY"
```

### List insight algorithms

```bash
curl "$BASE_URL/v1/insights/algorithms" \
  -H "Authorization: Bearer $API_KEY"
```

### Chat with AI about health data

```bash
curl -X POST "$BASE_URL/v1/users/$USER_ID/chatbot" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How has my sleep quality changed over the past month?"
  }'
```

---

## Providers

### List available providers

```bash
curl "$BASE_URL/v1/providers" \
  -H "Authorization: Bearer $API_KEY"
```

```json
// 200 OK
[
  {
    "id": "fitbit",
    "name": "Fitbit",
    "authType": "oauth2",
    "metrics": ["steps", "heart_rate", "sleep_duration", "calories", "weight", "spo2"],
    "supportsWebhooks": true
  },
  {
    "id": "garmin",
    "name": "Garmin",
    "authType": "oauth1",
    "metrics": ["steps", "heart_rate", "sleep_duration", "calories", "vo2_max", "stress"],
    "supportsWebhooks": true
  }
]
```

### Get provider details

```bash
curl "$BASE_URL/v1/providers/fitbit" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Sync Jobs

### List recent sync jobs

```bash
curl "$BASE_URL/v1/sync-jobs" \
  -H "Authorization: Bearer $API_KEY"
```

### Sync job history

```bash
curl "$BASE_URL/v1/sync-jobs/history?limit=20" \
  -H "Authorization: Bearer $API_KEY"
```

### Sweep stale connections

```bash
curl -X POST "$BASE_URL/v1/sync-jobs/sweep" \
  -H "Authorization: Bearer $API_KEY"
```

---

## System

### Health check

```bash
curl "$BASE_URL/health"
```

```json
// 200 OK
"OK"
```

### System status (admin)

```bash
curl "$BASE_URL/v1/system/status" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "code": "NOT_FOUND",
  "message": "User not found"
}
```

| Status | Code | Meaning |
|--------|------|---------|
| `400` | `BAD_REQUEST` | Invalid request body or parameters |
| `401` | `UNAUTHORIZED` | Missing or invalid API key |
| `403` | `FORBIDDEN` | Insufficient scope |
| `404` | `NOT_FOUND` | Resource does not exist |
| `429` | `RATE_LIMITED` | Too many requests (default: 100/60s) |
| `500` | `INTERNAL_ERROR` | Server error |
