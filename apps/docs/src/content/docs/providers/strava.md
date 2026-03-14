---
title: Strava
description: Connect Strava accounts to sync workout activities including runs, rides, swims, and more.
---

import { Steps, Aside } from '@astrojs/starlight/components';

Strava is an activity-tracking platform designed around outdoor and fitness workouts — particularly running, cycling, swimming, and other endurance sports. VitaSync syncs Strava activities as structured events with GPS, heart rate, and performance metrics.

## Authentication

Strava uses **OAuth 2.0** with standard authorization code flow.

- **Authorization URL:** `https://www.strava.com/oauth/authorize`
- **Token URL:** `https://www.strava.com/oauth/token`
- **API Base URL:** `https://www.strava.com/api/v3`

## Setting Up Strava OAuth Credentials

<Steps>

1. **Go to Strava API Settings**

   Visit [strava.com/settings/api](https://www.strava.com/settings/api) and sign in.

2. **Create an application**

   Fill in the form:
   - **Application Name:** Your app name
   - **Category:** Choose the most appropriate category
   - **Club:** Optional
   - **Website:** Your app URL
   - **Authorization Callback Domain:**
     - For development: `localhost`
     - For production: `api.yourdomain.com`

3. **Copy credentials**

   Note the **Client ID** (numeric) and **Client Secret** from the API settings page.

4. **Add to environment**

   ```bash
   STRAVA_CLIENT_ID=12345
   STRAVA_CLIENT_SECRET=your_client_secret
   ```

</Steps>

<Aside type="note">
  Strava rate limits are relatively tight: 100 requests per 15 minutes, 1000 per day. VitaSync respects these limits through the `minSyncIntervalSeconds` setting and batched API calls.
</Aside>

## Requested Scopes

VitaSync requests the following Strava scopes:

| Scope | Data Access |
|-------|-------------|
| `activity:read_all` | All activities including private ones |
| `read` | Basic profile information |

## Supported Metrics

Strava is activity-centric. VitaSync syncs Strava data primarily through the **Events API**:

| Metric Type | Notes |
|-------------|-------|
| `workout` | Each Strava activity becomes an Event (see below) |
| `distance` | Extracted from activities per day |
| `calories` | Calories from activity data |
| `heart_rate` | Average/max HR per activity if recorded with HR monitor |

## Activity Data

Strava activities sync to the VitaSync Events API with full sport metadata:

```json
{
  "eventType": "workout",
  "activityType": "running",
  "startedAt": "2025-06-06T06:00:00.000Z",
  "endedAt": "2025-06-06T06:52:00.000Z",
  "durationSeconds": 3120,
  "distanceMeters": 8400,
  "caloriesKcal": 612,
  "avgHeartRate": 158,
  "maxHeartRate": 182,
  "providerId": "strava",
  "data": {
    "name": "Morning Run",
    "description": "Easy aerobic run",
    "type": "Run",
    "sportType": "Run",
    "commute": false,
    "trainer": false,
    "elevationGain": 65,
    "avgSpeed": 2.69,
    "maxSpeed": 3.81,
    "avgCadence": 168,
    "avgWatts": null,
    "kilojoules": null,
    "kudosCount": 4,
    "achievementCount": 2
  }
}
```

## Supported Activity Types

VitaSync maps all Strava `sport_type` values into the `activityType` field. Common types include:

| `activityType` | Strava `sport_type` |
|----------------|---------------------|
| `running` | `Run`, `TrailRun`, `VirtualRun` |
| `cycling` | `Ride`, `VirtualRide`, `GravelRide`, `MountainBikeRide` |
| `swimming` | `Swim` |
| `walking` | `Walk`, `Hike` |
| `skiing` | `AlpineSki`, `BackcountrySki`, `NordicSki` |
| `rowing` | `Rowing`, `VirtualRow` |
| `workout` | `WeightTraining`, `Crossfit`, `Elliptical`, `Workout` |

## Sync Configuration

| Setting | Value |
|---------|-------|
| Minimum sync interval | 15 minutes |
| Initial sync window | Last 30 days |
| Rate limit | 100 req/15min, 1000 req/day |

## Webhooks

Strava supports push subscriptions that notify VitaSync when new activities are uploaded. This reduces the need for frequent polling and can make new activity data available within seconds of the user finishing a workout.

To enable Strava push subscriptions, configure the public webhook URL in your Strava app settings.

## Comparing with Other Providers

| Feature | Strava | Fitbit | Garmin | WHOOP |
|---------|--------|--------|--------|-------|
| GPS workout data | Excellent | Limited | Excellent | Good |
| 24/7 heart rate | No | Yes | Yes | Yes |
| Sleep tracking | No | Yes | Yes | Yes |
| Recovery/HRV | No | Partial | Yes | Yes |
| Activity variety | Excellent | Limited | Good | Good |

Strava excels at workout logging and social features but does not track passive health metrics like resting HR, sleep, or continuous HR. For comprehensive health monitoring, pair Strava with Fitbit, Garmin, or WHOOP.

## Troubleshooting

| Symptom | Likely Cause |
|---------|-------------|
| No activities syncing | Activities may be set to private with tighter visibility; check `activity:read_all` scope |
| Missing heart rate on activities | Activity was recorded without a heart rate monitor |
| Rate limit errors | Too many users syncing simultaneously — VitaSync queues jobs to stay within limits |
| `401` on sync | Token expired; Strava access tokens expire after 6 hours — VitaSync refreshes automatically |
