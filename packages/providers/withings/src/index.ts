import { OAuth2Provider, defaultSyncWindow, providerRegistry } from "@biosync-io/provider-core"
import type { OAuthTokens, ProviderDefinition, SyncDataPoint, SyncOptions } from "@biosync-io/types"
import { HealthMetricType, MetricUnit } from "@biosync-io/types"
import { z } from "zod"

// ── Withings API response schemas ─────────────────────────────

const WithingsTokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  userid: z.number(),
  scope: z.string().optional(),
})

const WithingsApiResponse = <T extends z.ZodTypeAny>(bodySchema: T) =>
  z.object({
    status: z.number(),
    body: bodySchema,
    error: z.string().optional(),
  })

/** Withings measurement types (meastypes) */
const MEAS_TYPE = {
  WEIGHT: 1,
  HEIGHT: 4,
  FAT_FREE_MASS: 5,
  FAT_RATIO: 6,       // Body fat %
  FAT_MASS_WEIGHT: 8,
  DIASTOLIC_BP: 9,
  SYSTOLIC_BP: 10,
  HEART_PULSE: 11,    // Heart rate during BP measurement
  TEMPERATURE: 12,
  SPO2: 54,
  BODY_TEMPERATURE: 71,
  SKIN_TEMPERATURE: 73,
  MUSCLE_MASS: 76,
  BONE_MASS: 88,
} as const

const WithingsMeasureGroup = z.object({
  grpid: z.number(),
  date: z.number(), // epoch seconds
  category: z.number(), // 1=real, 2=objective
  measures: z.array(
    z.object({
      type: z.number(),
      value: z.number(),
      unit: z.number(), // value * 10^unit = real value
    }),
  ),
})

const WithingsMeasureBody = z.object({
  measuregrps: z.array(WithingsMeasureGroup),
  more: z.number().optional(),
  offset: z.number().optional(),
})

const WithingsSleepSummary = z.object({
  id: z.number(),
  startdate: z.number(), // epoch
  enddate: z.number(),
  date: z.string(), // YYYY-MM-DD
  data: z.object({
    deepsleepduration: z.number().nullish(),
    lightsleepduration: z.number().nullish(),
    remsleepduration: z.number().nullish(),
    wakeupduration: z.number().nullish(),
    wakeupcount: z.number().nullish(),
    durationtosleep: z.number().nullish(), // latency
    sleep_score: z.number().nullish(),
    hr_average: z.number().nullish(),
    hr_min: z.number().nullish(),
    hr_max: z.number().nullish(),
    rr_average: z.number().nullish(), // respiratory rate
    sleep_efficiency: z.number().nullish(),
    total_sleep_time: z.number().nullish(),
    total_timeinbed: z.number().nullish(),
    snoring: z.number().nullish(),
    snoringepisodecount: z.number().nullish(),
  }),
})

const WithingsSleepBody = z.object({
  series: z.array(WithingsSleepSummary),
  more: z.boolean().optional(),
  offset: z.number().optional(),
})

const WithingsActivitySummary = z.object({
  date: z.string(), // YYYY-MM-DD
  steps: z.number().nullish(),
  distance: z.number().nullish(), // meters
  calories: z.number().nullish(),
  totalcalories: z.number().nullish(),
  elevation: z.number().nullish(), // meters climbed
  soft: z.number().nullish(), // light activity seconds
  moderate: z.number().nullish(), // moderate activity seconds
  intense: z.number().nullish(), // intense activity seconds
  hr_average: z.number().nullish(),
  hr_min: z.number().nullish(),
  hr_max: z.number().nullish(),
})

const WithingsActivityBody = z.object({
  activities: z.array(WithingsActivitySummary),
  more: z.boolean().optional(),
  offset: z.number().optional(),
})

// ── Provider definition ───────────────────────────────────────

const WITHINGS_DEFINITION: ProviderDefinition = {
  id: "withings",
  name: "Withings",
  description: "Sync weight, body composition, blood pressure, sleep, and activity from Withings devices.",
  logoUrl: "https://vitasync.dev/provider-logos/withings.svg",
  docsUrl: "https://developer.withings.com/api-reference/",
  capabilities: {
    supportedMetrics: [
      HealthMetricType.WEIGHT,
      HealthMetricType.BODY_FAT,
      HealthMetricType.BLOOD_PRESSURE,
      HealthMetricType.HEART_RATE,
      HealthMetricType.RESTING_HEART_RATE,
      HealthMetricType.SLEEP,
      HealthMetricType.SLEEP_SCORE,
      HealthMetricType.BLOOD_OXYGEN,
      HealthMetricType.TEMPERATURE,
      HealthMetricType.RESPIRATORY_RATE,
      HealthMetricType.STEPS,
      HealthMetricType.CALORIES,
      HealthMetricType.DISTANCE,
      HealthMetricType.ACTIVE_MINUTES,
    ],
    supportsWebhooks: false,
    oauth2: true,
    oauth1: false,
    minSyncIntervalSeconds: 900,
  },
}

// ── Withings Provider ─────────────────────────────────────────

export class WithingsProvider extends OAuth2Provider {
  readonly definition = WITHINGS_DEFINITION

  private static readonly API_URL = "https://wbsapi.withings.net"
  private static readonly AUTH_URL = "https://account.withings.com/oauth2_user/authorize2"
  private static readonly TOKEN_URL = "https://wbsapi.withings.net/v2/oauth2"
  private static readonly SCOPES = ["user.metrics", "user.activity"]

  getAuthorizationUrl(state: string): URL {
    const url = new URL(WithingsProvider.AUTH_URL)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("client_id", this.config.clientId)
    url.searchParams.set("scope", WithingsProvider.SCOPES.join(","))
    url.searchParams.set("redirect_uri", this.config.redirectUri)
    url.searchParams.set("state", state)
    return url
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      action: "requesttoken",
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
    })

    const response = await fetch(WithingsProvider.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Withings token exchange failed: ${response.status} ${err}`)
    }

    const json = await response.json()
    const parsed = WithingsApiResponse(WithingsTokenResponse).parse(json)

    if (parsed.status !== 0) {
      throw new Error(`Withings token error: status=${parsed.status} ${parsed.error ?? ""}`)
    }

    const tok = parsed.body
    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      tokenType: tok.token_type,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000),
      raw: { userid: tok.userid },
    }
  }

  async refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) throw new Error("No refresh token available")

    const body = new URLSearchParams({
      action: "requesttoken",
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: tokens.refreshToken,
    })

    const response = await fetch(WithingsProvider.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Withings token refresh failed: ${response.status} ${err}`)
    }

    const json = await response.json()
    const parsed = WithingsApiResponse(WithingsTokenResponse).parse(json)

    if (parsed.status !== 0) {
      throw new Error(`Withings refresh error: status=${parsed.status} ${parsed.error ?? ""}`)
    }

    const tok = parsed.body
    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      tokenType: tok.token_type,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000),
      raw: { userid: tok.userid },
    }
  }

  async *syncData(tokens: OAuthTokens, options?: SyncOptions): AsyncGenerator<SyncDataPoint> {
    const { startDate, endDate } = defaultSyncWindow(options)

    yield* this.#syncMeasurements(tokens, startDate, endDate)
    yield* this.#syncSleep(tokens, startDate, endDate)
    yield* this.#syncActivity(tokens, startDate, endDate)
  }

  // ── Sync: Body Measurements ───────────────────────────────

  async *#syncMeasurements(tokens: OAuthTokens, start: Date, end: Date): AsyncGenerator<SyncDataPoint> {
    const json = await this.#post(tokens, "/measure", {
      action: "getmeas",
      startdate: Math.floor(start.getTime() / 1000).toString(),
      enddate: Math.floor(end.getTime() / 1000).toString(),
      category: "1", // real measurements only
    })

    const parsed = WithingsApiResponse(WithingsMeasureBody).safeParse(json)
    if (!parsed.success || parsed.data.status !== 0) return

    for (const group of parsed.data.body.measuregrps) {
      const recordedAt = new Date(group.date * 1000)

      for (const measure of group.measures) {
        const realValue = measure.value * 10 ** measure.unit

        switch (measure.type) {
          case MEAS_TYPE.WEIGHT:
            yield { providerId: "withings", metricType: HealthMetricType.WEIGHT, recordedAt, value: realValue, unit: MetricUnit.KILOGRAMS }
            break
          case MEAS_TYPE.FAT_RATIO:
            yield { providerId: "withings", metricType: HealthMetricType.BODY_FAT, recordedAt, value: realValue, unit: MetricUnit.PERCENT }
            break
          case MEAS_TYPE.SYSTOLIC_BP: {
            // Find matching diastolic in the same group
            const diastolic = group.measures.find((m) => m.type === MEAS_TYPE.DIASTOLIC_BP)
            if (diastolic) {
              yield {
                providerId: "withings",
                metricType: HealthMetricType.BLOOD_PRESSURE,
                recordedAt,
                data: {
                  systolic: realValue,
                  diastolic: diastolic.value * 10 ** diastolic.unit,
                },
              }
            }
            break
          }
          case MEAS_TYPE.HEART_PULSE:
            yield { providerId: "withings", metricType: HealthMetricType.HEART_RATE, recordedAt, value: realValue, unit: MetricUnit.BPM }
            break
          case MEAS_TYPE.SPO2:
            yield { providerId: "withings", metricType: HealthMetricType.BLOOD_OXYGEN, recordedAt, value: realValue, unit: MetricUnit.PERCENT }
            break
          case MEAS_TYPE.BODY_TEMPERATURE:
          case MEAS_TYPE.TEMPERATURE:
            yield { providerId: "withings", metricType: HealthMetricType.TEMPERATURE, recordedAt, value: realValue, unit: MetricUnit.CELSIUS }
            break
        }
      }
    }
  }

  // ── Sync: Sleep ───────────────────────────────────────────

  async *#syncSleep(tokens: OAuthTokens, start: Date, end: Date): AsyncGenerator<SyncDataPoint> {
    const json = await this.#post(tokens, "/v2/sleep", {
      action: "getsummary",
      startdateymd: start.toISOString().slice(0, 10),
      enddateymd: end.toISOString().slice(0, 10),
      data_fields: "deepsleepduration,lightsleepduration,remsleepduration,wakeupduration,wakeupcount,sleep_score,hr_average,hr_min,hr_max,rr_average,sleep_efficiency,total_sleep_time,total_timeinbed,durationtosleep",
    })

    const parsed = WithingsApiResponse(WithingsSleepBody).safeParse(json)
    if (!parsed.success || parsed.data.status !== 0) return

    for (const session of parsed.data.body.series) {
      const recordedAt = new Date(session.startdate * 1000)
      const d = session.data
      const totalSleepSec = d.total_sleep_time ?? 0
      const deepSec = d.deepsleepduration ?? 0
      const lightSec = d.lightsleepduration ?? 0
      const remSec = d.remsleepduration ?? 0
      const awakeSec = d.wakeupduration ?? 0

      yield {
        providerId: "withings",
        metricType: HealthMetricType.SLEEP,
        recordedAt,
        data: {
          startTime: new Date(session.startdate * 1000).toISOString(),
          endTime: new Date(session.enddate * 1000).toISOString(),
          durationMinutes: Math.round(totalSleepSec / 60),
          deepSleepMinutes: Math.round(deepSec / 60),
          lightSleepMinutes: Math.round(lightSec / 60),
          remSleepMinutes: Math.round(remSec / 60),
          awakeMinutes: Math.round(awakeSec / 60),
          sleepLatencyMinutes: d.durationtosleep ? Math.round(d.durationtosleep / 60) : undefined,
          sleepEfficiency: d.sleep_efficiency,
          wakeupCount: d.wakeupcount,
          hrAverage: d.hr_average,
          hrMin: d.hr_min,
          hrMax: d.hr_max,
          withingsSleepId: session.id,
        },
      }

      if (d.sleep_score != null) {
        yield { providerId: "withings", metricType: HealthMetricType.SLEEP_SCORE, recordedAt, value: d.sleep_score, unit: MetricUnit.SCORE }
      }

      if (d.rr_average != null) {
        yield { providerId: "withings", metricType: HealthMetricType.RESPIRATORY_RATE, recordedAt, value: d.rr_average, unit: MetricUnit.BREATHS_PER_MINUTE }
      }

      if (d.hr_average != null) {
        yield { providerId: "withings", metricType: HealthMetricType.RESTING_HEART_RATE, recordedAt, value: d.hr_average, unit: MetricUnit.BPM }
      }
    }
  }

  // ── Sync: Activity ────────────────────────────────────────

  async *#syncActivity(tokens: OAuthTokens, start: Date, end: Date): AsyncGenerator<SyncDataPoint> {
    const json = await this.#post(tokens, "/v2/measure", {
      action: "getactivity",
      startdateymd: start.toISOString().slice(0, 10),
      enddateymd: end.toISOString().slice(0, 10),
      data_fields: "steps,distance,calories,totalcalories,elevation,soft,moderate,intense,hr_average,hr_min,hr_max",
    })

    const parsed = WithingsApiResponse(WithingsActivityBody).safeParse(json)
    if (!parsed.success || parsed.data.status !== 0) return

    for (const day of parsed.data.body.activities) {
      const recordedAt = new Date(`${day.date}T00:00:00Z`)

      if (day.steps != null && day.steps > 0) {
        yield { providerId: "withings", metricType: HealthMetricType.STEPS, recordedAt, value: day.steps, unit: MetricUnit.STEPS }
      }

      if (day.distance != null && day.distance > 0) {
        yield { providerId: "withings", metricType: HealthMetricType.DISTANCE, recordedAt, value: day.distance, unit: MetricUnit.METERS }
      }

      if (day.totalcalories != null && day.totalcalories > 0) {
        yield { providerId: "withings", metricType: HealthMetricType.CALORIES, recordedAt, value: day.totalcalories, unit: MetricUnit.KILOCALORIES }
      }

      const activeMinutes = Math.round(((day.moderate ?? 0) + (day.intense ?? 0)) / 60)
      if (activeMinutes > 0) {
        yield { providerId: "withings", metricType: HealthMetricType.ACTIVE_MINUTES, recordedAt, value: activeMinutes, unit: MetricUnit.MINUTES }
      }
    }
  }

  // ── HTTP helper ───────────────────────────────────────────

  async #post(tokens: OAuthTokens, path: string, params: Record<string, string>): Promise<unknown> {
    const response = await fetch(`${WithingsProvider.API_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    })

    if (response.status === 401) {
      throw new Error("WITHINGS_TOKEN_EXPIRED")
    }

    if (!response.ok) {
      throw new Error(`Withings API error: ${response.status} ${path}`)
    }

    return response.json()
  }
}

// ── Auto-registration ─────────────────────────────────────────

export function registerWithingsProvider() {
  const clientId = process.env.WITHINGS_CLIENT_ID
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET
  const redirectBase = process.env.OAUTH_REDIRECT_BASE_URL

  if (!clientId || !clientSecret) {
    console.warn("[WithingsProvider] Skipping registration: WITHINGS_CLIENT_ID/SECRET not set.")
    return
  }

  providerRegistry.register(WITHINGS_DEFINITION, () => {
    return new WithingsProvider({
      clientId,
      clientSecret,
      redirectUri: `${redirectBase}/v1/oauth/withings/callback`,
    })
  })
}

export { WITHINGS_DEFINITION }
