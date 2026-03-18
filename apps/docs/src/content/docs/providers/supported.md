---
title: Supported Providers
description: Compare all supported wearable and fitness providers — data types, auth, sync intervals, and device compatibility.
---

import { Aside } from '@astrojs/starlight/components';

VitaSync currently supports four health and fitness providers. Use this page to quickly determine which provider covers the data you need.

## Provider Overview

| Provider | Auth Type | Min Sync Interval | Webhook Support | Setup Complexity |
|----------|-----------|-------------------|-----------------|-----------------|
| [Fitbit](/vitasync/providers/fitbit) | OAuth 2.0 + PKCE | 15 min | No (polling) | Easy |
| [Garmin](/vitasync/providers/garmin) | OAuth 1.0a | 30 min | Yes (push) | Medium (approval required) |
| [WHOOP](/vitasync/providers/whoop) | OAuth 2.0 | 15 min | No (polling) | Easy |
| [Strava](/vitasync/providers/strava) | OAuth 2.0 | On-demand | No (polling) | Easy |

## Metric Coverage Matrix

The table below shows which providers supply each metric type.

**Legend:** ✅ Full &nbsp; 🔶 Partial &nbsp; — Not available

| Metric | Fitbit | Garmin | WHOOP | Strava |
|--------|--------|--------|-------|--------|
| **Activity** | | | | |
| Steps | ✅ | ✅ | — | — |
| Distance | ✅ | ✅ | — | ✅ |
| Calories burned | ✅ | ✅ | ✅ (active) | ✅ |
| Active minutes | ✅ | ✅ | — | — |
| Floors climbed | ✅ | — | — | — |
| **Heart** | | | | |
| Heart rate (intraday) | ✅ 1-min | ✅ | — | 🔶 per-workout |
| Resting heart rate | ✅ | ✅ | ✅ | — |
| HRV (RMSSD) | ✅ | ✅ | ✅ | — |
| **Sleep** | | | | |
| Sleep stages (REM/Light/Deep) | ✅ | ✅ | ✅ | — |
| Sleep score | ✅ | ✅ | ✅ | — |
| **Body Composition** | | | | |
| Weight | ✅ (Fitbit scale) | ✅ | — | — |
| Body fat % | ✅ | ✅ | — | — |
| BMI | ✅ | — | — | — |
| **Oxygen & Respiratory** | | | | |
| SpO₂ | ✅ | ✅ | ✅ | — |
| Respiratory rate | ✅ | — | ✅ | — |
| **Recovery & Readiness** | | | | |
| Recovery score | — | — | ✅ | — |
| Readiness / Body Battery | — | ✅ | — | — |
| Strain score | — | — | ✅ | — |
| Stress level | — | ✅ | — | — |
| **Workouts / Events** | | | | |
| Workout events | ✅ | ✅ | ✅ | ✅ |
| Activity type mapping | ✅ | ✅ | 100+ sports | ✅ |
| Route / GPS data | — | ✅ | — | ✅ |

<Aside>
  Garmin is the only provider that **pushes** data to VitaSync in real time. All other providers are polled on the sync schedule or when you call the manual sync endpoint.
</Aside>

## Device Compatibility

| Provider | Device Examples | Form Factor |
|----------|----------------|-------------|
| Fitbit | Charge 6, Sense 2, Versa 4, Inspire 3 | Fitness tracker / Smartwatch |
| Garmin | Fenix 8, Forerunner 965, Venu 3, Vívoactive 5 | Smartwatch / GPS watch |
| WHOOP | WHOOP 4.0, WHOOP MG | Band (subscription-based) |
| Strava | Any GPS device that syncs to Strava | App / Connected device |

## Choosing a Provider

**Best for comprehensive health data:** Fitbit — covers the widest range of daily metrics including body composition and intraday heart rate.

**Best for athletes and training load:** WHOOP — deep recovery, strain, and HRV metrics designed for performance athletes.

**Best for GPS sports tracking:** Strava or Garmin — detailed workout events with route data, splits, and multi-sport support.

**Best for real-time sync:** Garmin — push-based webhook delivery means data arrives in VitaSync immediately without waiting for the next polling cycle.

**Best for quick setup:** Fitbit, WHOOP, or Strava — all use standard OAuth 2.0 and are available via self-service developer portals. Garmin requires manual approval.

## Environment Variables Reference

| Variable | Required By | Description |
|----------|-------------|-------------|
| `FITBIT_CLIENT_ID` | Fitbit | OAuth app client ID |
| `FITBIT_CLIENT_SECRET` | Fitbit | OAuth app client secret |
| `GARMIN_CONSUMER_KEY` | Garmin | OAuth 1.0a consumer key |
| `GARMIN_CONSUMER_SECRET` | Garmin | OAuth 1.0a consumer secret |
| `WHOOP_CLIENT_ID` | WHOOP | OAuth app client ID |
| `WHOOP_CLIENT_SECRET` | WHOOP | OAuth app client secret |
| `STRAVA_CLIENT_ID` | Strava | OAuth app client ID |
| `STRAVA_CLIENT_SECRET` | Strava | OAuth app client secret |

You only need variables for the providers you plan to use. VitaSync will show only configured providers via `GET /v1/providers`.
