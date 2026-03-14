---
title: Fitbit
description: Connect Fitbit accounts and sync activity, heart rate, sleep, nutrition, and body composition data.
---

import { Steps, Aside, Tabs, TabItem } from '@astrojs/starlight/components';

Fitbit is the most data-rich provider in VitaSync. It supports a wide range of metrics including intraday heart rate, sleep stages, body composition, and SpO2.

## Authentication

Fitbit uses **OAuth 2.0 with PKCE** (Proof Key for Code Exchange), making it safe to use from server-side applications without exposing the client secret in a redirect.

- **Authorization URL:** `https://www.fitbit.com/oauth2/authorize`
- **Token URL:** `https://api.fitbit.com/oauth2/token`
- **Code challenge method:** `S256`

## Setting Up Fitbit OAuth Credentials

<Steps>

1. **Go to the Fitbit Developer Portal**

   Visit [dev.fitbit.com/apps/new](https://dev.fitbit.com/apps/new) and sign in with your Fitbit account.

2. **Create a new app**

   Fill in the registration form:
   - **Application Name:** Your app name (e.g. "VitaSync Integration")
   - **Description:** Brief description of your integration
   - **Application Website URL:** Your app URL (or `http://localhost:3000` for development)
   - **Organization:** Your org name
   - **Organization Website URL:** Your org URL
   - **Terms of Service URL:** Required — use a placeholder for development
   - **Privacy Policy URL:** Required — use a placeholder for development
   - **OAuth 2.0 Application Type:** `Server` (not Personal or Browser)
   - **Callback URL:** `https://api.yourdomain.com/v1/oauth/fitbit/callback`
     For development: `http://localhost:3001/v1/oauth/fitbit/callback`

3. **Copy your credentials**

   After saving, note the **OAuth 2.0 Client ID** and **Client Secret** from the app detail page.

4. **Add to environment**

   ```bash
   FITBIT_CLIENT_ID=your_client_id
   FITBIT_CLIENT_SECRET=your_client_secret
   ```

</Steps>

<Aside type="tip">
  Fitbit requires separate callback URL registration per environment. Add both `http://localhost:3001/v1/oauth/fitbit/callback` (development) and your production URL to the app settings.
</Aside>

## Requested Scopes

When a user connects their Fitbit account, VitaSync requests the following scopes:

| Scope | Data Access |
|-------|-------------|
| `activity` | Steps, distance, calories, active minutes, floors, intraday activity |
| `heartrate` | Heart rate (continuous + resting), heart rate zones |
| `sleep` | Sleep sessions with stages (deep, light, REM, awake) |
| `weight` | Weight and body fat percentage |
| `oxygen_saturation` | SpO2 readings |
| `cardio_fitness` | Cardio fitness score (VO2 max estimate) |

## Supported Metrics

| Metric Type | Unit | Notes |
|-------------|------|-------|
| `steps` | `count` | Daily step total |
| `distance` | `meters` | Daily distance |
| `calories` | `kcal` | Active calories |
| `active_minutes` | `minutes` | Minutes in fat burn + cardio + peak zones |
| `floors` | `count` | Floors climbed (requires Fitbit with altimeter) |
| `heart_rate` | `bpm` | Intraday 1-minute resolution; includes min/max/zones in `data` |
| `resting_heart_rate` | `bpm` | Calculated daily resting HR |
| `sleep` | `hours` | Duration + stage breakdown (`deep`, `light`, `rem`, `awake` in minutes) in `data` |
| `weight` | `kg` | Body weight from Fitbit scale or manual entry |
| `body_fat` | `percent` | Body fat from scale |
| `blood_oxygen` | `percent` | SpO2 from wrist sensor |
| `heart_rate_variability` | `ms` | Overnight HRV (RMSSD) |

## Sync Configuration

| Setting | Value |
|---------|-------|
| Minimum sync interval | 15 minutes (900 seconds) |
| Initial sync window | Last 30 days |
| Intraday resolution | 1 minute (heart rate) |
| API base URL | `https://api.fitbit.com/1` or `1.2` for some endpoints |

## Sync Coverage Notes

- **Intraday heart rate** is available at 1-minute resolution if your Fitbit account grants intraday access. Personal app registrations (non-partner) do not receive intraday data through the standard API.
- **Sleep stages** are available for Fitbit trackers with heart rate sensors (Charge series, Versa, Sense, etc.). Older trackers without HR sensors only report sleep duration.
- **SpO2** requires a Fitbit device with blood oxygen sensor (Charge 4+, Versa 2+, Sense, etc.).
- **Body fat** requires a Fitbit Aria smart scale.

## Device Compatibility

VitaSync works with all Fitbit devices that support the Fitbit Web API, including:

- Charge series (Charge 4, 5, 6)
- Versa series (Versa 2, 3, 4)
- Sense and Sense 2
- Luxe, Inspire series

## Troubleshooting

| Symptom | Likely Cause |
|---------|-------------|
| Connection fails at OAuth | Callback URL not registered in Fitbit app settings |
| No intraday heart rate data | Account is not a Fitbit partner — intraday access requires a partner application |
| Missing sleep stages | Device does not have a heart rate sensor |
| `401 Unauthorized` on sync | Access token expired and refresh failed — user should reconnect |
