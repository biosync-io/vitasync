---
title: Fitbit
description: Connect Fitbit accounts via OAuth 2.0 and sync health metrics.
---

import { Aside, Steps } from '@astrojs/starlight/components';

## Overview

The Fitbit provider uses **OAuth 2.0 with PKCE** (Authorization Code flow). It fetches activity, sleep, and body data from the [Fitbit Web API](https://dev.fitbit.com/build/reference/web-api/).

## Supported Metrics

| Metric type | Unit | Fitbit endpoint |
|-------------|------|-----------------|
| `STEPS` | count | `/activities/steps` |
| `HEART_RATE` | bpm | `/activities/heart` |
| `RESTING_HEART_RATE` | bpm | `/activities/heart` |
| `SLEEP_DURATION` | minutes | `/sleep` |
| `CALORIES` | kcal | `/activities/calories` |
| `DISTANCE` | meters | `/activities/distance` |
| `WEIGHT` | kg | `/body/weight` |
| `BODY_FAT` | percent | `/body/fat` |

## Setup

<Steps>

1. **Create a Fitbit app**

   Go to [dev.fitbit.com](https://dev.fitbit.com/apps/new) and create a new application:

   - **OAuth 2.0 Application Type**: Server
   - **Callback URL**: `{OAUTH_REDIRECT_BASE_URL}/v1/oauth/fitbit/callback`
   - **Default Access Type**: Read-Only

2. **Add credentials to `.env`**

   ```bash
   FITBIT_CLIENT_ID=your_client_id
   FITBIT_CLIENT_SECRET=your_client_secret
   ```

3. **Restart the API and worker**

   Fitbit will now appear in `GET /v1/providers` and its OAuth routes will be active.

</Steps>

## Required Scopes

VitaSync requests the following Fitbit scopes:

`activity` `heartrate` `sleep` `weight` `profile`

## Sync Behaviour

- Syncs daily summary data for each metric type within the configured window.
- Data is fetched day-by-day to respect Fitbit's per-endpoint rate limits (150 requests/hour).
- On the first sync, up to **30 days** of history is fetched.

<Aside type="tip">
  Fitbit's [intraday data](https://dev.fitbit.com/build/reference/web-api/intraday/) (minute-by-minute heart rate, steps) requires a **Personal** app type or explicit Fitbit approval. VitaSync requests intraday data if it is available for the token.
</Aside>
