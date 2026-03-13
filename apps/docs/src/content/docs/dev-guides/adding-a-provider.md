---
title: Adding a Provider
description: Implement and register a new wearable provider in VitaSync.
---

import { Steps, Aside } from '@astrojs/starlight/components';

VitaSync's provider system is fully plugin-based. Adding a new wearable brand requires **no changes to the core packages** — just implement one class, register it, and add credentials.

## Step-by-Step

<Steps>

1. **Create the package**

   ```bash
   mkdir -p packages/providers/mydevice/src
   ```

   `packages/providers/mydevice/package.json`:

   ```json
   {
     "name": "@biosync-io/provider-mydevice",
     "version": "0.1.0",
     "private": true,
     "type": "module",
     "main": "./src/index.ts",
     "exports": {
       ".": "./src/index.ts"
     }
   }
   ```

2. **Implement the provider class**

   For OAuth 2.0 providers, extend `OAuth2Provider`:

   ```ts
   // packages/providers/mydevice/src/index.ts
   import {
     OAuth2Provider,
     providerRegistry,
     defaultSyncWindow,
   } from "@biosync-io/provider-core";
   import type {
     ProviderDefinition,
     OAuthTokens,
     SyncOptions,
     SyncDataPoint,
   } from "@biosync-io/types";
   import { HealthMetricType, MetricUnit } from "@biosync-io/types";

   export class MyDeviceProvider extends OAuth2Provider {
     readonly definition: ProviderDefinition = {
       id: "mydevice",
       name: "My Device",
       description: "My wearable brand",
       authType: "oauth2",
       capabilities: [HealthMetricType.STEPS, HealthMetricType.HEART_RATE],
       authorizationUrl: "https://api.mydevice.com/oauth/authorize",
       tokenUrl: "https://api.mydevice.com/oauth/token",
       scopes: ["activity", "heartrate"],
     };

     async *syncData(
       tokens: OAuthTokens,
       opts: SyncOptions,
     ): AsyncGenerator<SyncDataPoint> {
       const { from, to } = defaultSyncWindow(opts);

       const resp = await fetch(
         `https://api.mydevice.com/v1/activities?from=${from.toISOString()}&to=${to.toISOString()}`,
         { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
       );
       const data = await resp.json();

       for (const item of data.activities) {
         yield {
           metricType: HealthMetricType.STEPS,
           value: item.steps,
           unit: MetricUnit.COUNT,
           recordedAt: new Date(item.date),
         };
       }
     }

     async getAuthorizationUrl(redirectUri: string, state: string) {
       // return URL string for the OAuth authorize redirect
     }

     async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
       // exchange auth code for tokens
     }

     async refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> {
       // refresh access token using refresh token
     }
   }

   export function registerMyDeviceProvider() {
     if (!process.env.MYDEVICE_CLIENT_ID) return; // skip if not configured
     providerRegistry.register(
       new MyDeviceProvider().definition,
       () => new MyDeviceProvider(),
     );
   }
   ```

3. **Register in the API and Worker**

   In `apps/api/src/index.ts` and `apps/worker/src/index.ts`:

   ```ts
   import { registerMyDeviceProvider } from "@biosync-io/provider-mydevice";

   registerMyDeviceProvider();
   ```

4. **Add to the workspace dependencies**

   In `apps/api/package.json` and `apps/worker/package.json`:

   ```json
   {
     "dependencies": {
       "@biosync-io/provider-mydevice": "workspace:*"
     }
   }
   ```

5. **Add credentials to `.env.example`**

   ```bash
   # My Device
   MYDEVICE_CLIENT_ID=
   MYDEVICE_CLIENT_SECRET=
   ```

6. **Add to the Helm chart values**

   In `helm/vitasync/values.yaml`, add under `env`:

   ```yaml
   MYDEVICE_CLIENT_ID: ""
   MYDEVICE_CLIENT_SECRET: ""
   ```

</Steps>

<Aside type="tip">
  For OAuth 1.0a providers (like Garmin), extend `OAuth1Provider` instead. The base class handles HMAC-SHA1 request signing automatically.
</Aside>

## Verifying Registration

```bash
curl http://localhost:3001/v1/providers \
  -H "Authorization: Bearer $API_KEY"
```

Your provider should appear in the response once `MYDEVICE_CLIENT_ID` is set.
