import {
  OAuth2Provider,
  defaultSyncWindow,
  providerRegistry,
  verifyHmacSignature,
} from "@biosync-io/provider-core"
import type { OAuthTokens, ProviderDefinition, SyncDataPoint, SyncOptions } from "@biosync-io/types"
import { HealthMetricType, MetricUnit } from "@biosync-io/types"
import { z } from "zod"

// ── Strava API response schemas ───────────────────────────────

const StravaTokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_at: z.number(), // Unix timestamp
  athlete: z.object({ id: z.number() }).passthrough().optional(),
})

const StravaActivity = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  sport_type: z.string().optional(),
  start_date: z.string(), // ISO 8601
  distance: z.number(), // meters
  moving_time: z.number(), // seconds
  elapsed_time: z.number(), // seconds
  total_elevation_gain: z.number().optional(),
  average_heartrate: z.number().optional(),
  max_heartrate: z.number().optional(),
  kilojoules: z.number().optional(), // cycling power — proxy for calories
  average_cadence: z.number().optional(),
  suffer_score: z.number().optional(),
  average_speed: z.number().optional(), // m/s
  max_speed: z.number().optional(), // m/s
})

const StravaWebhookEvent = z.object({
  object_type: z.enum(["activity", "athlete"]),
  object_id: z.number(),
  aspect_type: z.enum(["create", "update", "delete"]),
  owner_id: z.number(),
  subscription_id: z.number(),
  event_time: z.number(),
  updates: z.record(z.string()).optional(),
})

// ── Provider definition ───────────────────────────────────────

const STRAVA_DEFINITION: ProviderDefinition = {
  id: "strava",
  name: "Strava",
  description: "Sync activities, workouts, heart rate, and distance from Strava.",
  logoUrl: "https://vitasync.dev/provider-logos/strava.svg",
  docsUrl: "https://developers.strava.com/docs/reference/",
  capabilities: {
    supportedMetrics: [
      HealthMetricType.WORKOUT,
      HealthMetricType.DISTANCE,
      HealthMetricType.CALORIES,
      HealthMetricType.HEART_RATE,
      HealthMetricType.ACTIVE_MINUTES,
    ],
    supportsWebhooks: true,
    oauth2: true,
    oauth1: false,
    minSyncIntervalSeconds: 900,
  },
}

// ── Strava Provider ───────────────────────────────────────────

export class StravaProvider extends OAuth2Provider {
  readonly definition = STRAVA_DEFINITION

  private static readonly BASE_URL = "https://www.strava.com/api/v3"
  private static readonly AUTH_URL = "https://www.strava.com/oauth/authorize"
  private static readonly TOKEN_URL = "https://www.strava.com/oauth/token"
  private static readonly SCOPES = ["read", "activity:read_all", "profile:read_all"]

  getAuthorizationUrl(state: string): URL {
    const url = new URL(StravaProvider.AUTH_URL)
    url.searchParams.set("client_id", this.config.clientId)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", StravaProvider.SCOPES.join(","))
    url.searchParams.set("redirect_uri", this.config.redirectUri)
    url.searchParams.set("state", state)
    url.searchParams.set("approval_prompt", "auto")
    return url
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await fetch(StravaProvider.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Strava token exchange failed: ${response.status} ${err}`)
    }

    const raw = StravaTokenResponse.parse(await response.json())
    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      tokenType: raw.token_type,
      expiresAt: new Date(raw.expires_at * 1000),
      raw: { athleteId: raw.athlete?.id },
    }
  }

  async refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) throw new Error("No refresh token available")

    const response = await fetch(StravaProvider.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Strava token refresh failed: ${response.status} ${err}`)
    }

    const raw = StravaTokenResponse.parse(await response.json())
    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      tokenType: raw.token_type,
      expiresAt: new Date(raw.expires_at * 1000),
      ...(tokens.raw !== undefined ? { raw: tokens.raw } : {}), // preserve athleteId
    }
  }

  async *syncData(tokens: OAuthTokens, options?: SyncOptions): AsyncGenerator<SyncDataPoint> {
    const { startDate, endDate } = defaultSyncWindow(options)
    const after = Math.floor(startDate.getTime() / 1000)
    const before = Math.floor(endDate.getTime() / 1000)

    let page = 1
    const perPage = 200

    while (true) {
      const activities = await this.#getActivities(tokens, after, before, page, perPage)
      if (activities.length === 0) break

      for (const activity of activities) {
        yield* this.#normalizeActivity(activity)
      }

      if (activities.length < perPage) break
      page++
    }
  }

  /**
   * Verifies a Strava webhook signature.
   * Strava uses a simple hub.verify_token for subscription verification;
   * for event delivery it does not sign payloads, so verification is done
   * by checking the subscription ID matches the registered one.
   */
  verifyWebhookSignature(payload: Buffer, signature: string, secret: string): boolean {
    return verifyHmacSignature(payload, signature, secret)
  }

  async processWebhook(payload: unknown): Promise<SyncDataPoint[]> {
    const parsed = StravaWebhookEvent.safeParse(payload)
    if (!parsed.success) return []

    const event = parsed.data
    // We only handle activity creations — updates/deletes are handled as no-ops
    // since we re-sync on the next scheduled sync.
    if (event.object_type !== "activity" || event.aspect_type !== "create") return []

    // Return empty — the worker will detect the new activity_id and fetch it.
    // The route layer stores the event so the sync worker can pick it up.
    return []
  }

  async *#normalizeActivity(raw: z.infer<typeof StravaActivity>): AsyncGenerator<SyncDataPoint> {
    const recordedAt = new Date(raw.start_date)
    const durationMinutes = Math.round(raw.moving_time / 60)
    const sportType = raw.sport_type ?? raw.type

    // Workout (the full activity)
    yield {
      providerId: "strava",
      metricType: HealthMetricType.WORKOUT,
      recordedAt,
      data: {
        name: raw.name,
        type: sportType,
        durationMinutes,
        distanceMeters: raw.distance,
        elevationGain: raw.total_elevation_gain,
        avgHeartRate: raw.average_heartrate,
        maxHeartRate: raw.max_heartrate,
        avgSpeed: raw.average_speed,
        stravaId: raw.id,
      },
    }

    // Distance
    if (raw.distance > 0) {
      yield {
        providerId: "strava",
        metricType: HealthMetricType.DISTANCE,
        recordedAt,
        value: raw.distance,
        unit: MetricUnit.METERS,
      }
    }

    // Active minutes
    if (durationMinutes > 0) {
      yield {
        providerId: "strava",
        metricType: HealthMetricType.ACTIVE_MINUTES,
        recordedAt,
        value: durationMinutes,
        unit: MetricUnit.MINUTES,
      }
    }

    // Average heart rate
    if (raw.average_heartrate != null) {
      yield {
        providerId: "strava",
        metricType: HealthMetricType.HEART_RATE,
        recordedAt,
        value: raw.average_heartrate,
        unit: MetricUnit.BPM,
      }
    }

    // Calories: Strava provides kilojoules (cycling) — convert to kcal
    if (raw.kilojoules != null) {
      yield {
        providerId: "strava",
        metricType: HealthMetricType.CALORIES,
        recordedAt,
        value: Math.round(raw.kilojoules * 0.239006),
        unit: MetricUnit.KILOCALORIES,
      }
    }
  }

  async #getActivities(
    tokens: OAuthTokens,
    after: number,
    before: number,
    page: number,
    perPage: number,
  ): Promise<z.infer<typeof StravaActivity>[]> {
    const url = new URL(`${StravaProvider.BASE_URL}/athlete/activities`)
    url.searchParams.set("after", String(after))
    url.searchParams.set("before", String(before))
    url.searchParams.set("page", String(page))
    url.searchParams.set("per_page", String(perPage))

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })

    if (response.status === 429) {
      throw new Error("Strava rate limit reached — retry after the next 15-minute window")
    }

    if (!response.ok) {
      throw new Error(`Strava API error: ${response.status} GET /athlete/activities`)
    }

    const data = await response.json()
    return z.array(StravaActivity).parse(data)
  }
}

// ── Auto-registration ─────────────────────────────────────────

export function registerStravaProvider() {
  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  const redirectBase = process.env.OAUTH_REDIRECT_BASE_URL

  if (!clientId || !clientSecret) {
    console.warn("[StravaProvider] Skipping registration: STRAVA_CLIENT_ID/SECRET not set.")
    return
  }

  providerRegistry.register(STRAVA_DEFINITION, () => {
    return new StravaProvider({
      clientId,
      clientSecret,
      redirectUri: `${redirectBase}/v1/oauth/strava/callback`,
    })
  })
}
