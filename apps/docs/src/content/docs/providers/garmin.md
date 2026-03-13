---
title: Garmin
description: Connect Garmin Connect accounts via OAuth 1.0a and sync health metrics.
---

import { Aside, Steps } from '@astrojs/starlight/components';

## Overview

The Garmin provider uses **OAuth 1.0a** (the Garmin Health API does not support OAuth 2.0). It's implemented in `packages/providers/garmin/` and extends `OAuth1Provider` from `@biosync-io/provider-core`.

## Supported Metrics

| Metric type | Unit | Garmin endpoint |
|-------------|------|-----------------|
| `STEPS` | count | `/dailies` |
| `HEART_RATE` | bpm | `/dailies` |
| `RESTING_HEART_RATE` | bpm | `/dailies` |
| `HRV` | ms | `/hrv` |
| `SLEEP_DURATION` | minutes | `/sleeps` |
| `CALORIES` | kcal | `/dailies` |
| `DISTANCE` | meters | `/dailies` |
| `ACTIVE_MINUTES` | minutes | `/dailies` |

## Setup

<Steps>

1. **Apply for Garmin Health API access**

   Visit [developer.garmin.com](https://developer.garmin.com/health-api/overview/) and apply for API access. Garmin reviews applications manually — allow a few business days.

2. **Get your consumer key and secret**

   Once approved, you'll receive a **Consumer Key** and **Consumer Secret** from Garmin's developer portal.

3. **Set the callback URL**

   In your Garmin app settings, add:

   ```
   {OAUTH_REDIRECT_BASE_URL}/v1/oauth/garmin/callback
   ```

4. **Add credentials to `.env`**

   ```bash
   GARMIN_CONSUMER_KEY=your_consumer_key
   GARMIN_CONSUMER_SECRET=your_consumer_secret
   ```

5. **Restart the API and worker**

</Steps>

<Aside type="caution">
  OAuth 1.0a request signing is handled automatically by the `OAuth1Provider` base class. You do not need to implement signing yourself.
</Aside>

## Sync Behaviour

- Fetches daily summaries within the sync window.
- Garmin rate limits: 60 requests/minute per consumer key.
- HRV data is fetched separately as it has its own endpoint and is not always available.
