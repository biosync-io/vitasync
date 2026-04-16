import { createHash, randomBytes } from "node:crypto"
import { defaultSyncWindow, OAuth2Provider, providerRegistry } from "@biosync-io/provider-core"
import type { OAuthTokens, ProviderDefinition, SyncDataPoint, SyncOptions } from "@biosync-io/types"
import { HealthMetricType, MetricUnit } from "@biosync-io/types"
import { RateLimitBudget } from "./rate-limiter.js"
import {
  FitbitActivitySummarySchema,
  FitbitBodyWeightResponseSchema,
  FitbitBreathingRateResponseSchema,
  FitbitHeartRateResponseSchema,
  FitbitHrvResponseSchema,
  FitbitSleepResponseSchema,
  FitbitSpO2ResponseSchema,
  FitbitTokenResponseSchema,
} from "./schemas.js"

// ── PKCE helpers ──────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url") // 43 chars
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}

// ── Provider definition ───────────────────────────────────────

const FITBIT_DEFINITION: ProviderDefinition = {
  id: "fitbit",
  name: "Fitbit",
  description: "Sync activity, sleep, heart rate, HRV, SpO2, and body data from Fitbit devices.",
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
      HealthMetricType.HEART_RATE_VARIABILITY,
      HealthMetricType.SLEEP,
      HealthMetricType.SLEEP_SCORE,
      HealthMetricType.SPO2,
      HealthMetricType.RESPIRATORY_RATE,
      HealthMetricType.WEIGHT,
      HealthMetricType.BODY_FAT,
      HealthMetricType.BMI,
    ],
    supportsWebhooks: true,
    oauth2: true,
    oauth1: false,
    minSyncIntervalSeconds: 300, // 5 minutes
  },
}

// ── Fitbit Provider ───────────────────────────────────────────

export class FitbitProvider extends OAuth2Provider {
  readonly definition = FITBIT_DEFINITION

  private static readonly BASE_URL = "https://api.fitbit.com"
  private static readonly AUTH_URL = "https://www.fitbit.com/oauth2/authorize"
  private static readonly TOKEN_URL = "https://api.fitbit.com/oauth2/token"
  private static readonly REVOKE_URL = "https://api.fitbit.com/oauth2/revoke"
  private static readonly SCOPES = [
    "activity",
    "heartrate",
    "sleep",
    "weight",
    "profile",
    "oxygen_saturation",
    "respiratory_rate",
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

    const raw = FitbitTokenResponseSchema.parse(await response.json())
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

    const raw = FitbitTokenResponseSchema.parse(await response.json())
    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      tokenType: raw.token_type,
      expiresAt: new Date(Date.now() + raw.expires_in * 1000),
      raw: { userId: raw.user_id, scope: raw.scope },
    }
  }

  async revokeTokens(tokens: OAuthTokens): Promise<void> {
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      "base64",
    )

    await fetch(FitbitProvider.REVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: tokens.accessToken }),
    })
  }

  async *syncData(tokens: OAuthTokens, options?: SyncOptions): AsyncGenerator<SyncDataPoint> {
    const { startDate, endDate } = defaultSyncWindow(options)
    const requested = options?.dataTypes
    const budget = new RateLimitBudget()

    const start = formatDate(startDate)
    const end = formatDate(endDate)

    // Activity + heart rate + sleep use date-range endpoints
    if (
      includesAny(requested, [
        HealthMetricType.STEPS,
        HealthMetricType.CALORIES,
        HealthMetricType.DISTANCE,
        HealthMetricType.FLOORS,
        HealthMetricType.ACTIVE_MINUTES,
      ])
    ) {
      yield* this.syncActivity(tokens, start, budget)
    }

    if (
      includesAny(requested, [HealthMetricType.HEART_RATE, HealthMetricType.RESTING_HEART_RATE])
    ) {
      yield* this.syncHeartRate(tokens, start, end, budget)
    }

    if (includesAny(requested, [HealthMetricType.SLEEP, HealthMetricType.SLEEP_SCORE])) {
      yield* this.syncSleep(tokens, start, end, budget)
    }

    if (includesAny(requested, [HealthMetricType.SPO2])) {
      yield* this.syncSpO2(tokens, start, budget)
    }

    if (includesAny(requested, [HealthMetricType.HEART_RATE_VARIABILITY])) {
      yield* this.syncHrv(tokens, start, budget)
    }

    if (includesAny(requested, [HealthMetricType.RESPIRATORY_RATE])) {
      yield* this.syncBreathingRate(tokens, start, budget)
    }

    if (
      includesAny(requested, [
        HealthMetricType.WEIGHT,
        HealthMetricType.BODY_FAT,
        HealthMetricType.BMI,
      ])
    ) {
      yield* this.syncBodyWeight(tokens, start, end, budget)
    }
  }

  // ── Data Fetchers ────────────────────────────────────────────

  private async *syncActivity(
    tokens: OAuthTokens,
    date: string,
    budget: RateLimitBudget,
  ): AsyncGenerator<SyncDataPoint> {
    const res = await this.apiGet(tokens, `/1/user/-/activities/date/${date}.json`, budget)
    if (!res) return

    const parsed = FitbitActivitySummarySchema.safeParse(res)
    if (!parsed.success) return

    const { summary } = parsed.data
    const recordedAt = new Date(`${date}T00:00:00Z`)

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

  private async *syncHeartRate(
    tokens: OAuthTokens,
    start: string,
    end: string,
    budget: RateLimitBudget,
  ): AsyncGenerator<SyncDataPoint> {
    const res = await this.apiGet(
      tokens,
      `/1/user/-/activities/heart/date/${start}/${end}.json`,
      budget,
    )
    if (!res) return

    const parsed = FitbitHeartRateResponseSchema.safeParse(res)
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

  private async *syncSleep(
    tokens: OAuthTokens,
    start: string,
    end: string,
    budget: RateLimitBudget,
  ): AsyncGenerator<SyncDataPoint> {
    const res = await this.apiGet(tokens, `/1.2/user/-/sleep/date/${start}/${end}.json`, budget)
    if (!res) return

    const parsed = FitbitSleepResponseSchema.safeParse(res)
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

  private async *syncSpO2(
    tokens: OAuthTokens,
    date: string,
    budget: RateLimitBudget,
  ): AsyncGenerator<SyncDataPoint> {
    const res = await this.apiGet(tokens, `/1/user/-/spo2/date/${date}.json`, budget)
    if (!res) return

    const parsed = FitbitSpO2ResponseSchema.safeParse(res)
    if (!parsed.success) return

    const recordedAt = new Date(`${parsed.data.dateTime}T00:00:00Z`)
    yield {
      providerId: "fitbit",
      metricType: HealthMetricType.SPO2,
      recordedAt,
      value: parsed.data.value.avg,
      unit: MetricUnit.PERCENT,
      data: { min: parsed.data.value.min, max: parsed.data.value.max },
    }
  }

  private async *syncHrv(
    tokens: OAuthTokens,
    date: string,
    budget: RateLimitBudget,
  ): AsyncGenerator<SyncDataPoint> {
    const res = await this.apiGet(tokens, `/1/user/-/hrv/date/${date}.json`, budget)
    if (!res) return

    const parsed = FitbitHrvResponseSchema.safeParse(res)
    if (!parsed.success) return

    for (const entry of parsed.data.hrv) {
      const recordedAt = new Date(`${entry.dateTime}T00:00:00Z`)
      yield {
        providerId: "fitbit",
        metricType: HealthMetricType.HEART_RATE_VARIABILITY,
        recordedAt,
        value: entry.value.dailyRmssd,
        unit: MetricUnit.MILLISECONDS,
        data: { deepRmssd: entry.value.deepRmssd },
      }
    }
  }

  private async *syncBreathingRate(
    tokens: OAuthTokens,
    date: string,
    budget: RateLimitBudget,
  ): AsyncGenerator<SyncDataPoint> {
    const res = await this.apiGet(tokens, `/1/user/-/br/date/${date}.json`, budget)
    if (!res) return

    const parsed = FitbitBreathingRateResponseSchema.safeParse(res)
    if (!parsed.success) return

    for (const entry of parsed.data.br) {
      const recordedAt = new Date(`${entry.dateTime}T00:00:00Z`)
      yield {
        providerId: "fitbit",
        metricType: HealthMetricType.RESPIRATORY_RATE,
        recordedAt,
        value: entry.value.breathingRate,
        unit: MetricUnit.BREATHS_PER_MINUTE,
      }
    }
  }

  private async *syncBodyWeight(
    tokens: OAuthTokens,
    start: string,
    end: string,
    budget: RateLimitBudget,
  ): AsyncGenerator<SyncDataPoint> {
    const res = await this.apiGet(
      tokens,
      `/1/user/-/body/log/weight/date/${start}/${end}.json`,
      budget,
    )
    if (!res) return

    const parsed = FitbitBodyWeightResponseSchema.safeParse(res)
    if (!parsed.success) return

    for (const entry of parsed.data.weight) {
      const recordedAt = new Date(`${entry.date}T${entry.time}`)

      yield {
        providerId: "fitbit",
        metricType: HealthMetricType.WEIGHT,
        recordedAt,
        value: entry.weight,
        unit: MetricUnit.KILOGRAMS,
      }

      if (entry.fat != null) {
        yield {
          providerId: "fitbit",
          metricType: HealthMetricType.BODY_FAT,
          recordedAt,
          value: entry.fat,
          unit: MetricUnit.PERCENT,
        }
      }

      if (entry.bmi != null) {
        yield {
          providerId: "fitbit",
          metricType: HealthMetricType.BMI,
          recordedAt,
          value: entry.bmi,
        }
      }
    }
  }

  // ── API helper ──────────────────────────────────────────────

  private async apiGet(
    tokens: OAuthTokens,
    path: string,
    budget: RateLimitBudget,
  ): Promise<unknown | null> {
    await budget.waitIfNeeded()

    const response = await fetch(`${FitbitProvider.BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })

    budget.update(response.headers)

    if (response.status === 401) {
      throw new Error("FITBIT_TOKEN_EXPIRED")
    }

    if (!response.ok) {
      throw new Error(`Fitbit API error: ${response.status} ${path}`)
    }

    return response.json()
  }
}

// ── Helpers ───────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toISOString().substring(0, 10)
}

function includesAny(requested: readonly string[] | undefined, types: readonly string[]): boolean {
  if (!requested) return true
  return types.some((t) => requested.includes(t))
}

// ── Auto-registration ─────────────────────────────────────────

export function registerFitbitProvider() {
  const clientId = process.env.FITBIT_CLIENT_ID
  const clientSecret = process.env.FITBIT_CLIENT_SECRET
  const redirectBase = process.env.OAUTH_REDIRECT_BASE_URL

  if (!clientId || !clientSecret) return // graceful skip

  providerRegistry.register(FITBIT_DEFINITION, () => {
    return new FitbitProvider({
      clientId,
      clientSecret,
      redirectUri: `${redirectBase}/v1/oauth/fitbit/callback`,
    })
  })
}

export { FITBIT_DEFINITION }
