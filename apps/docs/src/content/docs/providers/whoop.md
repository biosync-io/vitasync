---
title: Whoop
description: Connect Whoop accounts via OAuth 2.0 and sync recovery, strain, and sleep data.
---

import { Steps } from '@astrojs/starlight/components';

## Overview

The Whoop provider uses **OAuth 2.0** (Authorization Code flow) and fetches data from the [Whoop API v2](https://developer.whoop.com/api). Whoop exposes three core resources — **cycles** (daily strain), **recoveries**, and **sleeps** — each paginated with cursor-based pagination.

## Supported Metrics

| Metric type | Unit | Whoop resource |
|-------------|------|----------------|
| `STRAIN` | score | `/cycle` → `score.strain` |
| `CALORIES` | kcal | `/cycle` → `score.kilojoule` × 0.239 |
| `HEART_RATE` | bpm | `/cycle` → `score.average_heart_rate` |
| `RECOVERY_SCORE` | score | `/recovery` → `score.recovery_score` |
| `RESTING_HEART_RATE` | bpm | `/recovery` → `score.resting_heart_rate` |
| `HRV` | ms | `/recovery` → `score.hrv_rmssd_milli` |
| `SPO2` | percent | `/recovery` → `score.spo2_percentage` |
| `SKIN_TEMP` | celsius | `/recovery` → `score.skin_temp_celsius` |
| `SLEEP_DURATION` | minutes | `/sleep` → `score.stage_summary.total_in_bed_time_milli` |

## Setup

<Steps>

1. **Create a Whoop developer app**

   Visit [developer.whoop.com](https://developer.whoop.com/) and create an application.

   Set the redirect URI to:
   ```
   {OAUTH_REDIRECT_BASE_URL}/v1/oauth/whoop/callback
   ```

2. **Add credentials to `.env`**

   ```bash
   WHOOP_CLIENT_ID=your_client_id
   WHOOP_CLIENT_SECRET=your_client_secret
   ```

3. **Restart the API and worker**

</Steps>

## Required Scopes

`read:recovery` `read:cycles` `read:sleep` `read:profile` `read:body_measurement`

## Pagination

Whoop uses cursor-based pagination. The provider handles this automatically — each page's `next_token` is followed until all records within the sync window are fetched.
