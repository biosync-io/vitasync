---
title: WHOOP
description: Connect WHOOP accounts to sync recovery, sleep, workouts, and physiological data.
---

import { Steps, Aside } from '@astrojs/starlight/components';

WHOOP is a recovery-focused wearable that continuously measures HRV, sleep, strain, and SpO2. It is designed around the concept of daily recovery scores — a measure of how ready your body is to perform.

## Authentication

WHOOP uses **OAuth 2.0** with standard authorization code flow.

- **Authorization URL:** `https://api.prod.whoop.com/oauth/oauth2/auth`
- **Token URL:** `https://api.prod.whoop.com/oauth/oauth2/token`
- **API Base URL:** `https://api.prod.whoop.com/developer/v1`

## Setting Up WHOOP OAuth Credentials

<Steps>

1. **Go to the WHOOP Developer Portal**

   Visit [developer.whoop.com](https://developer.whoop.com) and sign in with your WHOOP account.

2. **Create a new application**

   Click "Create Application" and fill in your app details.

3. **Set the Redirect URI**

   Add your callback URL:
   - Development: `http://localhost:3001/v1/oauth/whoop/callback`
   - Production: `https://api.yourdomain.com/v1/oauth/whoop/callback`

4. **Copy credentials**

   Note the **Client ID** and **Client Secret** from the app settings.

5. **Add to environment**

   ```bash
   WHOOP_CLIENT_ID=your_client_id
   WHOOP_CLIENT_SECRET=your_client_secret
   ```

</Steps>

## Requested Scopes

VitaSync requests these WHOOP scopes at authorization:

| Scope | Data Access |
|-------|-------------|
| `offline` | Refresh tokens for background sync |
| `read:recovery` | Daily recovery scores and HRV |
| `read:cycles` | Daily physiological cycles (strain, resting HR, SpO2) |
| `read:sleep` | Sleep sessions with stages |
| `read:workout` | Workout activities |
| `read:body_measurement` | Height, weight, max heart rate |
| `read:profile` | User profile information |

## Supported Metrics

| Metric Type | Unit | Notes |
|-------------|------|-------|
| `sleep` | `hours` | Duration + stages (`deep`, `light`, `rem`, `awake`) in `data` |
| `sleep_score` | `score` | WHOOP sleep performance score (0–100) |
| `respiratory_rate` | `breaths_per_min` | Overnight respiratory rate |
| `recovery_score` | `percent` | Daily recovery score (0–100%). WHOOP's flagship metric |
| `resting_heart_rate` | `bpm` | Overnight resting heart rate |
| `heart_rate_variability` | `ms` | Overnight RMSSD |
| `blood_oxygen` | `percent` | SpO2 during sleep |
| `strain_score` | `score` | Daily strain (0–21). Exertion over the day |
| `calories` | `kcal` | Total daily calories |
| `workout` | — | Workout activities (see Events API for full data) |
| `heart_rate` | `bpm` | Continuous HR during workouts |
| `distance` | `meters` | Distance for cardio activities |

## Sync Configuration

| Setting | Value |
|---------|-------|
| Minimum sync interval | 15 minutes (900 seconds) |
| Initial sync window | Last 30 days |
| Pagination | Cursor-based on all endpoints |

## Cursor-Based Pagination

WHOOP uses cursor-based pagination on all list endpoints. VitaSync handles this automatically during sync, iterating through all pages until it reaches data older than the sync window.

If you call the WHOOP API directly outside of VitaSync, use the `nextToken` field from each response as the `nextToken` query parameter in the next request.

## Recovery Model

WHOOP's recovery system is based on three concepts:

- **Strain** (0–21 Borg-like scale): How much exertion was placed on the body during the day. Includes workouts and all-day activity.
- **Recovery** (0–100%): How recovered the body is at time of waking, based on HRV, resting HR, sleep performance, and respiratory rate. WHOOP uses color-coded zones: red (0–33%), yellow (34–66%), green (67–100%).
- **Sleep performance**: How well the body slept relative to its own need, not a fixed target.

These feed distinct metric types in VitaSync:

| WHOOP Concept | VitaSync Metric Type |
|---------------|----------------------|
| Recovery % | `recovery_score` |
| Strain | `strain_score` |
| Sleep performance | `sleep_score` |
| HRV | `heart_rate_variability` |
| Resting HR | `resting_heart_rate` |

## Workout Sport Types

WHOOP supports over 100 sport/activity types. Examples include:

`running`, `cycling`, `swimming`, `strength_training`, `yoga`, `hiit`, `rowing`, `basketball`, `soccer`, `tennis`, `hiking`, `skiing`, `crossfit`, and many more.

The `activityType` field in VitaSync Events maps directly from WHOOP's sport ID using an internal translation table.

## Troubleshooting

| Symptom | Likely Cause |
|---------|-------------|
| No recovery data | WHOOP device not worn overnight or insufficient sleep data |
| Missing cycle data | User did not wear WHOOP for the full day |
| Sync fails with `401` | Access token expired — VitaSync should auto-refresh using `offline` scope |
| Low-resolution HR data | WHOOP only provides HR during recorded workouts, not all-day |
