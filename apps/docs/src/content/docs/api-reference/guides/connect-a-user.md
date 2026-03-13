---
title: Connect a User
description: Create a user, start the OAuth flow, and confirm a provider connection.
---

import { Steps } from '@astrojs/starlight/components';

This guide walks through the complete flow to connect a wearable provider for one of your end-users.

<Steps>

1. **Create the user**

   Map your own user identifier to a VitaSync user with `externalId`:

   ```bash
   curl -X POST http://localhost:3001/v1/users \
     -H "Authorization: Bearer $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"externalId": "usr_abc123", "email": "jane@example.com"}'
   ```

   ```json
   {
     "id": "01HXYZ...",
     "externalId": "usr_abc123",
     "email": "jane@example.com",
     "createdAt": "2026-03-13T00:00:00.000Z"
   }
   ```

   The call is **idempotent on `externalId`** — if the user already exists it is returned, not duplicated.

2. **Redirect to the OAuth authorization URL**

   From your backend, build the authorization URL and redirect the user's browser:

   ```
   GET /v1/oauth/fitbit/authorize?userId=01HXYZ...
   ```

   Replace `fitbit` with any supported provider slug (`garmin`, `whoop`, `strava`).

   In your frontend or backend, redirect to:

   ```js
   window.location.href =
     `${VITASYNC_API_URL}/v1/oauth/fitbit/authorize?userId=${user.id}`;
   ```

3. **VitaSync handles the callback**

   After the user grants access on the provider's site, they are redirected back to:

   ```
   /v1/oauth/fitbit/callback
   ```

   VitaSync exchanges the code for tokens, encrypts them, saves the connection, and enqueues an initial sync.

4. **Confirm the connection**

   ```bash
   curl http://localhost:3001/v1/users/01HXYZ.../connections \
     -H "Authorization: Bearer $API_KEY"
   ```

   ```json
   [
     {
       "id": "01HABC...",
       "providerId": "fitbit",
       "lastSyncedAt": "2026-03-13T00:01:00.000Z"
     }
   ]
   ```

5. **Trigger a manual sync (optional)**

   An initial sync is enqueued automatically after OAuth. To trigger another:

   ```bash
   curl -X POST \
     http://localhost:3001/v1/users/01HXYZ.../connections/01HABC.../sync \
     -H "Authorization: Bearer $API_KEY"
   # → 202 Accepted
   ```

</Steps>
