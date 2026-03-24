---
title: Withings
description: Withings provider integration — clinical-grade body composition, blood pressure, and vital signs.
---

import { Steps, Aside } from '@astrojs/starlight/components';

Withings manufactures clinical-grade connected health devices — smart scales (Body+, Body Scan), hybrid smartwatches (ScanWatch), blood pressure monitors (BPM Connect), and thermometers (Thermo). It is the best provider in VitaSync for body composition and clinical vitals.

## Authentication

Withings uses **OAuth 2.0** with standard authorization code flow.

- **Authorization URL:** `https://account.withings.com/oauth2_user/authorize2`
- **Token URL:** `https://wbsapi.withings.net/v2/oauth2`
- **API Base URL:** `https://wbsapi.withings.net`

## Setting Up Withings OAuth Credentials

<Steps>

1. **Go to the Withings Developer Portal**

   Visit [developer.withings.com](https://developer.withings.com) and sign in or create a Withings account.

2. **Create a new application**

   Navigate to **My Dashboard → Create an Application**. Fill in:
   - **Application Name:** Your app name (e.g. "VitaSync Integration")
   - **Description:** Brief description of your integration
   - **Application Website:** Your app URL (or `http://localhost:3000` for development)

3. **Set the Callback URL**

   Add your OAuth callback URL:
   - Development: `http://localhost:3001/v1/oauth/withings/callback`
   - Production: `https://api.yourdomain.com/v1/oauth/withings/callback`

4. **Copy credentials**

   Note the **Client ID** and **Consumer Secret** from the app settings page.

5. **Add to environment**

   ```bash
   WITHINGS_CLIENT_ID=your_client_id
   WITHINGS_CLIENT_SECRET=your_consumer_secret
   ```

</Steps>

<Aside type="tip">
  Withings supports push notifications via webhooks — VitaSync automatically subscribes to data updates when a user connects their Withings account. New measurements are pushed in near-real-time.
</Aside>

## Requested Scopes

When a user connects their Withings account, VitaSync requests the following scopes:

| Scope | Data Access |
|-------|-------------|
| `user.metrics` | Weight, body fat, BMI, and other body measurements |
| `user.activity` | Steps, distance, calories |
| `user.sleepevents` | Sleep sessions with stage data |

## Supported Metrics

| Metric Type | Unit | Withings Measure Type | Notes |
|-------------|------|-----------------------|-------|
| `weight` | `kg` | Type 1 | Body weight from smart scale |
| `body_fat` | `percent` | Type 6 | Body fat percentage |
| `bmi` | `kg/m²` | Type — (computed) | Computed from weight and height |
| `blood_pressure_systolic` | `mmHg` | Type 10 | Systolic blood pressure |
| `blood_pressure_diastolic` | `mmHg` | Type 9 | Diastolic blood pressure |
| `blood_oxygen` | `percent` | Type 54 | SpO₂ from ScanWatch |
| `temperature` | `°C` | Type 71 | Body temperature from Thermo |
| `respiratory_rate` | `breaths/min` | Type 35 | Respiratory rate from ScanWatch |
| `sleep` | `hours` | Sleep API | Duration + stage breakdown (deep, light, REM, awake) |

### Measurement Type Mapping

Withings uses numeric measure type IDs in its API. VitaSync maps these to standard metric types:

| Withings Type ID | Withings Name | VitaSync Metric |
|-----------------|---------------|-----------------|
| 1 | Weight | `weight` |
| 6 | Fat Ratio | `body_fat` |
| 9 | Diastolic Blood Pressure | `blood_pressure_diastolic` |
| 10 | Systolic Blood Pressure | `blood_pressure_systolic` |
| 35 | Breathing Disturbances | `respiratory_rate` |
| 54 | SpO₂ | `blood_oxygen` |
| 71 | Body Temperature | `temperature` |

## Webhook (Push Notifications)

Withings supports push notifications. When a user connects their Withings account, VitaSync automatically:

1. Subscribes to measurement updates via `POST /notify/subscribe`
2. Receives a callback at `/v1/webhooks/withings` when new data is available
3. Fetches the new measurements and inserts them into `health_metrics`

This means body composition data, blood pressure readings, and temperature measurements appear in VitaSync within seconds of being recorded on the device.

## Sync Configuration

| Setting | Value |
|---------|-------|
| Minimum sync interval | 15 minutes (900 seconds) |
| Initial sync window | Last 30 days |
| Webhook support | Yes (push notifications) |
| API base URL | `https://wbsapi.withings.net` |

## Device Compatibility

VitaSync works with all Withings connected health devices:

| Device | Metrics |
|--------|---------|
| **Body+** / **Body Scan** | Weight, body fat %, BMI, muscle mass |
| **ScanWatch** / **ScanWatch Light** | SpO₂, respiratory rate, sleep, heart rate |
| **BPM Connect** / **BPM Core** | Systolic/diastolic blood pressure |
| **Thermo** | Body temperature |

## Troubleshooting

| Symptom | Likely Cause |
|---------|-------------|
| Connection fails at OAuth | Callback URL not registered in Withings app settings |
| No data after connection | User has no Withings devices linked to their account |
| Webhook not firing | Withings subscription expired — reconnect the user to re-subscribe |
| `401 Unauthorized` on sync | Access token expired and refresh failed — user should reconnect |
| Missing blood pressure data | User does not own a BPM Connect or BPM Core device |
