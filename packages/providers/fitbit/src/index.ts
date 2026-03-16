import { OAuth2Provider, defaultSyncWindow, providerRegistry } from "@biosync-io/provider-core"
import type { OAuthTokens, ProviderDefinition, SyncDataPoint, SyncOptions } from "@biosync-io/types"
import { HealthMetricType, MetricUnit } from "@biosync-io/types"
import { z } from "zod"

// ── Fitbit API response schemas ───────────────────────────────

const FitbitTokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  user_id: z.string(),
  scope: z.string(),
})

const FitbitActivitySummary = z.object({
  summary: z.object({
    steps: z.number().optional(),
    caloriesOut: z.number().optional(),
    distances: z
      .array(
        z.object({
          activity: z.string(),
          distance: z.number(),
        }),
      )
      .optional(),
    floors: z.number().optional(),
    activeScore: z.number().optional(),
    fairlyActiveMinutes: z.number().optional(),
    veryActiveMinutes: z.number().optional(),
    lightlyActiveMinutes: z.number().optional(),
    sedentaryMinutes: z.number().optional(),
  }),
})

const FitbitHeartRateResponse = z.object({
  "activities-heart": z.array(
    z.object({
      dateTime: z.string(),
      value: z.object({
        restingHeartRate: z.number().optional(),
        heartRateZones: z
          .array(
            z.object({
              name: z.string(),
              minutes: z.number(),
              caloriesOut: z.number(),
              min: z.number(),
              max: z.number(),
            }),
          )
          .optional(),
      }),
    }),
  ),
})

const FitbitSleepResponse = z.object({
  sleep: z.array(
    z.object({
      logId: z.number(),
      startTime: z.string(),
      endTime: z.string(),
      duration: z.number(),
      efficiency: z.number(),
      levels: z
        .object({
          summary: z
            .object({
              light: z.object({ minutes: z.number() }).optional(),
              deep: z.object({ minutes: z.number() }).optional(),
              rem: z.object({ minutes: z.number() }).optional(),
              wake: z.object({ minutes: z.number() }).optional(),
            })
            .optional(),
        })
        .optional(),
    }),
  ),
  summary: z
    .object({
      totalMinutesAsleep: z.number().optional(),
      totalSleepRecords: z.number().optional(),
    })
    .optional(),
})

// ── Provider definition ───────────────────────────────────────

const FITBIT_DEFINITION: ProviderDefinition = {
  id: "fitbit",
  name: "Fitbit",
  description: "Sync activity, heart rate, sleep, and body metrics from Fitbit devices.",
  logoUrl: "https://vitasync.dev/provider-logos/fitbit.svg",
  docsUrl: "https://dev.fitbit.com/build/reference/web-api/",
  capabilities: {
    supportedMetrics: [
      HealthMetricType.STEPS,
      HealthMetricType.CALORIES,
      HealthMetricType.DISTANCE,
      HealthMetricType.FLOORS,
      HealthMetricType.ACTIVE_MINUTES,
      HealthMetricType.HEART_RATE,
      HealthMetricType.RESTING_HEART_RATE,
      HealthMetricType.SLEEP,
      HealthMetricType.SLEEP_SCORE,
      HealthMetricType.WEIGHT,
    ],
    supportsWebhooks: true,
    oauth2: true,
    oauth1: false,
    minSyncIntervalSeconds: 300,
  },
}

// ── Fitbit Provider ───────────────────────────────────────────

export class FitbitProvider extends OAuth2Provider {
  readonly definition = FITBIT_DEFINITION

  private static readonly BASE_URL = "https://api.fitbit.com"
  private static readonly AUTH_URL = "https://www.fitbit.com/oauth2/authorize"
  private static readonly TOKEN_URL = "https://api.fitbit.com/oauth2/token"
  private static readonly SCOPES = [
    "activity",
    "heartrate",
    "sleep",
    "weight",
    "nutrition",
    "profile",
  ]

  getAuthorizationUrl(state: string): URL {
    const url = new URL(FitbitProvider.AUTH_URL)
    url.searchParams.set("client_id", this.config.clientId)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", FitbitProvider.SCOPES.join(" "))
    url.searchParams.set("redirect_uri", this.config.redirectUri)
    url.searchParams.set("state", state)
    url.searchParams.set("expires_in", "604800") // 7 days
    return url
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      "base64",
    )

    const response = await fetch(FitbitProvider.TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.config.redirectUri,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Fitbit token exchange failed: ${response.status} ${err}`)
    }

    const raw = FitbitTokenResponse.parse(await response.json())
    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      tokenType: raw.token_type,
      expiresAt: new Date(Date.now() + raw.expires_in * 1000),
      raw: { userId: raw.user_id, scope: raw.scope },
    }
  }

  async refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) throw new Error("No refresh token available")

    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      "base64",
    )

    const response = await fetch(FitbitProvider.TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Fitbit token refresh failed: ${response.status} ${err}`)
    }

    const raw = FitbitTokenResponse.parse(await response.json())
    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      tokenType: raw.token_type,
      expiresAt: new Date(Date.now() + raw.expires_in * 1000),
      raw: { userId: raw.user_id, scope: raw.scope },
    }
  }

  async *syncData(tokens: OAuthTokens, options?: SyncOptions): AsyncGenerator<SyncDataPoint> {
    const { startDate, endDate } = defaultSyncWindow(options)

    // Fitbit's daily summary endpoints take "YYYY-MM-DD" date ranges
    const start = startDate.toISOString().substring(0, 10)
    const end = endDate.toISOString().substring(0, 10)

    yield* this.#syncActivitySummary(tokens, start, end)
    yield* this.#syncHeartRate(tokens, start, end)
    yield* this.#syncSleep(tokens, start, end)
  }

  async *#syncActivitySummary(
    tokens: OAuthTokens,
    start: string,
    end: string,
  ): AsyncGenerator<SyncDataPoint> {
    const res = await this.#get(tokens, `/1/user/-/activities/date/${start}.json`)
    const parsed = FitbitActivitySummary.safeParse(res)
    if (!parsed.success) return

    const { summary } = parsed.data
    const recordedAt = new Date(`${start}T00:00:00Z`)

    if (summary.steps != null) {
      yield {
        providerId: "fitbit",
        metricType: HealthMetricType.STEPS,
        recordedAt,
        value: summary.steps,
        unit: MetricUnit.STEPS,
      }
    }

    if (summary.caloriesOut != null) {
      yield {
        providerId: "fitbit",
        metricType: HealthMetricType.CALORIES,
        recordedAt,
        value: summary.caloriesOut,
        unit: MetricUnit.KILOCALORIES,
      }
    }

    const totalDistance = summary.distances?.find((d) => d.activity === "total")?.distance
    if (totalDistance != null) {
      yield {
        providerId: "fitbit",
        metricType: HealthMetricType.DISTANCE,
        recordedAt,
        // Fitbit returns km
        value: totalDistance * 1000,
        unit: MetricUnit.METERS,
      }
    }

    if (summary.floors != null) {
      yield {
        providerId: "fitbit",
        metricType: HealthMetricType.FLOORS,
        recordedAt,
        value: summary.floors,
        unit: MetricUnit.FLOORS,
      }
    }

    const activeMinutes = (summary.fairlyActiveMinutes ?? 0) + (summary.veryActiveMinutes ?? 0)
    if (activeMinutes > 0) {
      yield {
        providerId: "fitbit",
        metricType: HealthMetricType.ACTIVE_MINUTES,
        recordedAt,
        value: activeMinutes,
        unit: MetricUnit.MINUTES,
      }
    }
  }

  async *#syncHeartRate(
    tokens: OAuthTokens,
    start: string,
    end: string,
  ): AsyncGenerator<SyncDataPoint> {
    const res = await this.#get(tokens, `/1/user/-/activities/heart/date/${start}/${end}.json`)
    const parsed = FitbitHeartRateResponse.safeParse(res)
    if (!parsed.success) return

    for (const entry of parsed.data["activities-heart"]) {
      const recordedAt = new Date(`${entry.dateTime}T00:00:00Z`)

      if (entry.value.restingHeartRate != null) {
        yield {
          providerId: "fitbit",
          metricType: HealthMetricType.RESTING_HEART_RATE,
          recordedAt,
          value: entry.value.restingHeartRate,
          unit: MetricUnit.BPM,
        }
      }
    }
  }

  async *#syncSleep(
    tokens: OAuthTokens,
    start: string,
    end: string,
  ): AsyncGenerator<SyncDataPoint> {
    const res = await this.#get(tokens, `/1.2/user/-/sleep/date/${start}/${end}.json`)
    const parsed = FitbitSleepResponse.safeParse(res)
    if (!parsed.success) return

    for (const session of parsed.data.sleep) {
      const recordedAt = new Date(session.startTime)

      yield {
        providerId: "fitbit",
        metricType: HealthMetricType.SLEEP,
        recordedAt,
        unit: MetricUnit.MINUTES,
        data: {
          startTime: session.startTime,
          endTime: session.endTime,
          durationMinutes: Math.round(session.duration / 60000),
          score: session.efficiency,
          stages: session.levels?.summary
            ? {
                light: session.levels.summary.light?.minutes ?? 0,
                deep: session.levels.summary.deep?.minutes ?? 0,
                rem: session.levels.summary.rem?.minutes ?? 0,
                awake: session.levels.summary.wake?.minutes ?? 0,
              }
            : undefined,
        },
      }
    }
  }

  async #get(tokens: OAuthTokens, path: string): Promise<unknown> {
    const response = await fetch(`${FitbitProvider.BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })

    if (response.status === 401) {
      throw new Error("FITBIT_TOKEN_EXPIRED")
    }

    if (!response.ok) {
      throw new Error(`Fitbit API error: ${response.status} ${path}`)
    }

    return response.json()
  }
}

// ── Auto-registration ─────────────────────────────────────────

/**
 * Call this function once at application startup to register the Fitbit provider.
 * The provider will only be registered if the required env vars are present.
 */
export function registerFitbitProvider() {
  const clientId = process.env.FITBIT_CLIENT_ID
  const clientSecret = process.env.FITBIT_CLIENT_SECRET
  const redirectBase = process.env.OAUTH_REDIRECT_BASE_URL

  if (!clientId || !clientSecret) {
    console.warn("[FitbitProvider] Skipping registration: FITBIT_CLIENT_ID/SECRET not set.")
    return
  }

  providerRegistry.register(FITBIT_DEFINITION, () => {
    return new FitbitProvider({
      clientId,
      clientSecret,
      redirectUri: `${redirectBase}/v1/oauth/callback/fitbit`,
    })
  })
}

export { FITBIT_DEFINITION }
