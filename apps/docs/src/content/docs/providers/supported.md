---
title: Supported Providers
description: Wearable platforms and fitness services available in VitaSync.
---

VitaSync ships with four providers out of the box. Each is an independent package under `packages/providers/`.

## Available Providers

| Provider | Package | Auth | Metrics |
|----------|---------|------|---------|
| [Fitbit](/providers/fitbit/) | `@biosync-io/provider-fitbit` | OAuth 2.0 | Steps, heart rate, sleep, calories, distance, weight |
| [Garmin](/providers/garmin/) | `@biosync-io/provider-garmin` | OAuth 1.0a | Steps, heart rate, sleep, HRV, calories, distance |
| [Whoop](/providers/whoop/) | `@biosync-io/provider-whoop` | OAuth 2.0 | Strain, recovery, HRV, resting HR, SpO2, skin temp, sleep |
| [Strava](/providers/strava/) | `@biosync-io/provider-strava` | OAuth 2.0 | Distance, calories, active minutes |

## Enabling Providers

Providers are enabled by setting their credential environment variables. If the credentials are absent, the provider is not registered and its OAuth routes are not mounted.

```bash
# Fitbit
FITBIT_CLIENT_ID=your_client_id
FITBIT_CLIENT_SECRET=your_client_secret

# Garmin (OAuth 1.0a uses consumer key/secret)
GARMIN_CONSUMER_KEY=your_consumer_key
GARMIN_CONSUMER_SECRET=your_consumer_secret

# Whoop
WHOOP_CLIENT_ID=your_client_id
WHOOP_CLIENT_SECRET=your_client_secret

# Strava
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
```

You can confirm which providers are active:

```bash
curl http://localhost:3001/v1/providers \
  -H "Authorization: Bearer $API_KEY"
```

## Adding a New Provider

See the [Adding a Provider](/dev-guides/adding-a-provider/) guide to integrate any wearable brand that exposes an OAuth API.
