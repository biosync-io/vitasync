---
title: Garmin
description: Connect Garmin Connect accounts using OAuth 1.0a to sync activity, health, and GPS workout data.
---

import { Steps, Aside } from '@astrojs/starlight/components';

Garmin Connect is a push-based data platform with an extensive health and fitness data set, including GPS workout tracking, sleep, stress, body battery, and VO2 max.

## Authentication

Garmin uses **OAuth 1.0a** with **HMAC-SHA1** request signing — an older but widely used protocol. Unlike OAuth 2.0, it does not use bearer tokens; instead, each request is signed with the consumer secret and the user's token secret.

VitaSync handles the OAuth 1.0a signing transparently using the `oauth` npm package.

## Setting Up Garmin OAuth Credentials

<Steps>

1. **Apply for Garmin Developer Access**

   Go to [developer.garmin.com/gc-developer-program/overview/](https://developer.garmin.com/gc-developer-program/overview/) and apply for API access. Garmin reviews applications manually — allow 1–3 business days for approval.

2. **Create an application**

   Once approved, log in to the developer portal and create a new application. Note the **Consumer Key** and **Consumer Secret**.

3. **Register your callback URL**

   Set the OAuth callback URL to:
   - Development: `http://localhost:3001/v1/oauth/garmin/callback`
   - Production: `https://api.yourdomain.com/v1/oauth/garmin/callback`

4. **Add to environment**

   ```bash
   GARMIN_CONSUMER_KEY=your_consumer_key
   GARMIN_CONSUMER_SECRET=your_consumer_secret
   ```

</Steps>

<Aside type="note">
  Garmin's API is not publicly open — access requires approval. Garmin typically approves integrations for fitness apps and coaching platforms. Consumer/personal apps may be rejected.
</Aside>

## Supported Metrics

| Metric Type | Unit | Notes |
|-------------|------|-------|
| `steps` | `count` | Daily step total |
| `distance` | `meters` | Daily distance |
| `calories` | `kcal` | Total calories (active + resting) |
| `heart_rate` | `bpm` | Continuous wrist HR |
| `resting_heart_rate` | `bpm` | Daily resting HR |
| `sleep` | `hours` | Sleep duration + light/deep/REM stages in `data` |
| `heart_rate_variability` | `ms` | Overnight HRV |
| `stress` | `score` | Stress level 0–100 (higher = more stress) |
| `blood_oxygen` | `percent` | SpO2 (supported devices only) |
| `spo2` | `percent` | Pulse oximetry during sleep |
| `workout` | — | GPS activities synced to Garmin Connect (see Events API) |

## Sync Configuration

| Setting | Value |
|---------|-------|
| Minimum sync interval | 30 minutes (1800 seconds) |
| Initial sync window | Last 30 days |
| API architecture | Pull (polling) or Push (webhooks) |
| Webhook support | Yes (`supportsWebhooks: true`) |

## Push vs. Pull Sync

Garmin supports two sync modes:

**Pull (default):** VitaSync polls the Garmin Health API on the sync schedule, fetching daily summaries, activities, and health data.

**Push (Garmin Health API webhooks):** Garmin pushes data to VitaSync in real time when a device syncs with the Garmin Connect app. Configure the push URL in the Garmin Developer Portal as `https://api.yourdomain.com/v1/garmin/push`.

Push mode is lower latency but requires a publicly accessible VitaSync instance.

## Workout Data

Garmin workouts sync to the VitaSync Events API with rich GPS and training data. Example workout event:

```json
{
  "eventType": "workout",
  "activityType": "running",
  "startedAt": "2025-06-06T06:00:00.000Z",
  "endedAt": "2025-06-06T06:50:00.000Z",
  "durationSeconds": 3000,
  "distanceMeters": 8100,
  "caloriesKcal": 598,
  "avgHeartRate": 155,
  "maxHeartRate": 178,
  "data": {
    "elevationGain": 124,
    "elevationLoss": 121,
    "avgPace": "6:10",
    "avgCadence": 170,
    "avgPower": null,
    "vo2MaxEstimate": 52,
    "laps": []
  }
}
```

## Supported Garmin Devices

Garmin Connect API works with all Garmin devices that sync to the Garmin Connect platform, including:

- Forerunner series (255, 265, 955, 965, etc.)
- Fenix series (6, 7, 8)
- Venu series
- Vivoactive series
- Vivosmart series
- epix series

## Troubleshooting

| Symptom | Likely Cause |
|---------|-------------|
| OAuth flow fails with `401` | Invalid consumer key/secret |
| No workout data | User has not synced their device to Garmin Connect recently |
| Missing stress/body battery | Feature requires Garmin device with sensors (not all devices) |
| Push webhooks not arriving | Server not publicly accessible, or push URL not registered |
