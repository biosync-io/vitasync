---
title: Strava
description: Connect Strava accounts via OAuth 2.0 and sync activity data.
---

import { Steps, Aside } from '@astrojs/starlight/components';

## Overview

The Strava provider uses **OAuth 2.0** (Authorization Code flow) and fetches activity data from the [Strava API v3](https://developers.strava.com/docs/reference/).

## Supported Metrics

| Metric type | Unit | Strava field |
|-------------|------|--------------|
| `DISTANCE` | meters | `activity.distance` |
| `CALORIES` | kcal | `activity.calories` |
| `ACTIVE_MINUTES` | minutes | `activity.moving_time / 60` |
| `HEART_RATE` | bpm | `activity.average_heartrate` |

Each activity is stored as a separate row keyed to `activity.start_date`.

## Setup

<Steps>

1. **Create a Strava API application**

   Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app.

   Set **Authorization Callback Domain** to the hostname of your `OAUTH_REDIRECT_BASE_URL` (e.g. `localhost`).

2. **Add credentials to `.env`**

   ```bash
   STRAVA_CLIENT_ID=your_client_id
   STRAVA_CLIENT_SECRET=your_client_secret
   ```

3. **Restart the API and worker**

</Steps>

## Required Scopes

`activity:read_all`

<Aside type="note">
  Strava's `activity:read_all` scope is needed to read private activities. Without it, only public activities are returned.
</Aside>

## Rate Limits

Strava enforces: **100 requests per 15 minutes** and **1 000 requests per day** per app. The provider paginates activity lists at 200 items per page to minimise request count.
