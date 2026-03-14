import { OAuth } from "oauth"
import type { OAuth1Tokens, SyncOptions, SyncDataPoint, ProviderDefinition } from "@biosync-io/types"
import { HealthMetricType, MetricUnit } from "@biosync-io/types"
import { OAuth1Provider, providerRegistry, defaultSyncWindow } from "@biosync-io/provider-core"

// ── Provider definition ───────────────────────────────────────

const GARMIN_DEFINITION: ProviderDefinition = {
  id: "garmin",
  name: "Garmin Connect",
  description: "Sync activity, sleep, heart rate, and fitness metrics from Garmin devices.",
  logoUrl: "https://vitasync.dev/provider-logos/garmin.svg",
  docsUrl: "https://developer.garmin.com/gc-developer-program/overview/",
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
      HealthMetricType.STRESS,
      HealthMetricType.WORKOUT,
    ],
    supportsWebhooks: true,
    oauth2: false,
    oauth1: true,
    minSyncIntervalSeconds: 3600,
  },
}

// ── Garmin Provider ───────────────────────────────────────────

/**
 * Garmin uses OAuth 1.0a with the Health API.
 *
 * Note: To access Garmin data you must apply for the Garmin Health API program:
 * https://developer.garmin.com/gc-developer-program/overview/
 */
export class GarminProvider extends OAuth1Provider {
  readonly definition = GARMIN_DEFINITION

  private static readonly BASE_URL = "https://healthapi.garmin.com/wellness-api/rest"
  private static readonly REQUEST_TOKEN_URL =
    "https://connectapi.garmin.com/oauth-service/oauth/request_token"
  private static readonly AUTH_URL = "https://connect.garmin.com/oauthConfirm"
  private static readonly ACCESS_TOKEN_URL =
    "https://connectapi.garmin.com/oauth-service/oauth/access_token"

  private getOAuthClient(): InstanceType<typeof OAuth> {
    return new OAuth(
      GarminProvider.REQUEST_TOKEN_URL,
      GarminProvider.ACCESS_TOKEN_URL,
      this.config.consumerKey,
      this.config.consumerSecret,
      "1.0",
      this.config.redirectUri,
      "HMAC-SHA1",
    )
  }

  async getRequestToken(): Promise<{ requestToken: string; requestTokenSecret: string }> {
    const client = this.getOAuthClient()
    return new Promise((resolve, reject) => {
      client.getOAuthRequestToken((err, token, secret) => {
        if (err) {
          reject(new Error(`Garmin request token failed: ${JSON.stringify(err)}`))
        } else {
          resolve({ requestToken: token, requestTokenSecret: secret })
        }
      })
    })
  }

  getAuthorizationUrl(requestToken: string): URL {
    const url = new URL(GarminProvider.AUTH_URL)
    url.searchParams.set("oauth_token", requestToken)
    return url
  }

  async exchangeVerifier(
    requestToken: string,
    requestTokenSecret: string,
    verifier: string,
  ): Promise<OAuth1Tokens> {
    const client = this.getOAuthClient()
    return new Promise((resolve, reject) => {
      client.getOAuthAccessToken(
        requestToken,
        requestTokenSecret,
        verifier,
        (err, token, secret, results) => {
          if (err) {
            reject(new Error(`Garmin access token failed: ${JSON.stringify(err)}`))
          } else {
            const garminUserId = (results as Record<string, unknown>)?.["xoauth_garmin_userid"] as
              | string
              | undefined
            resolve({
              token,
              tokenSecret: secret,
              ...(garminUserId !== undefined ? { userId: garminUserId } : {}),
              raw: results as Record<string, unknown>,
            })
          }
        },
      )
    })
  }

  async *syncData(tokens: OAuth1Tokens, options?: SyncOptions): AsyncGenerator<SyncDataPoint> {
    const { startDate, endDate } = defaultSyncWindow(options)
    const startSeconds = Math.floor(startDate.getTime() / 1000)
    const endSeconds = Math.floor(endDate.getTime() / 1000)

    yield* this.#syncDailySummaries(tokens, startSeconds, endSeconds)
    yield* this.#syncSleep(tokens, startSeconds, endSeconds)
  }

  async *#syncDailySummaries(
    tokens: OAuth1Tokens,
    startSeconds: number,
    endSeconds: number,
  ): AsyncGenerator<SyncDataPoint> {
    // Garmin returns paged results
    const data = await this.#get(
      tokens,
      `/dailies?uploadStartTimeInSeconds=${startSeconds}&uploadEndTimeInSeconds=${endSeconds}`,
    )

    const summaries = (data as Record<string, unknown>)["dailies"] as Array<{
      calendarDate: string
      totalSteps?: number
      totalDistanceInMeters?: number
      activeKilocalories?: number
      floorsAscended?: number
      floorsDescended?: number
      averageHeartRateInBeatsPerMinute?: number
      restingHeartRateInBeatsPerMinute?: number
      highlyActiveSeconds?: number
      activeSeconds?: number
    }>

    if (!Array.isArray(summaries)) return

    for (const summary of summaries) {
      const recordedAt = new Date(`${summary.calendarDate}T00:00:00Z`)

      if (summary.totalSteps != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.STEPS,
          recordedAt,
          value: summary.totalSteps,
          unit: MetricUnit.STEPS,
        }
      }

      if (summary.totalDistanceInMeters != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.DISTANCE,
          recordedAt,
          value: summary.totalDistanceInMeters,
          unit: MetricUnit.METERS,
        }
      }

      if (summary.activeKilocalories != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.CALORIES,
          recordedAt,
          value: summary.activeKilocalories,
          unit: MetricUnit.KILOCALORIES,
        }
      }

      if (summary.restingHeartRateInBeatsPerMinute != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.RESTING_HEART_RATE,
          recordedAt,
          value: summary.restingHeartRateInBeatsPerMinute,
          unit: MetricUnit.BPM,
        }
      }
    }
  }

  async *#syncSleep(
    tokens: OAuth1Tokens,
    startSeconds: number,
    endSeconds: number,
  ): AsyncGenerator<SyncDataPoint> {
    const data = await this.#get(
      tokens,
      `/epochs/sleeps?uploadStartTimeInSeconds=${startSeconds}&uploadEndTimeInSeconds=${endSeconds}`,
    )

    const sessions = (data as Record<string, unknown>)["sleeps"] as Array<{
      startTimeInSeconds: number
      durationInSeconds: number
      overallSleepScore?: { value: number }
      deepSleepDurationInSeconds?: number
      lightSleepDurationInSeconds?: number
      remSleepInSeconds?: number
      awakeDurationInSeconds?: number
      averageSpO2Value?: number
      averageRespiration?: number
    }>

    if (!Array.isArray(sessions)) return

    for (const session of sessions) {
      const recordedAt = new Date(session.startTimeInSeconds * 1000)

      yield {
        providerId: "garmin",
        metricType: HealthMetricType.SLEEP,
        recordedAt,
        unit: MetricUnit.MINUTES,
        data: {
          startTime: recordedAt.toISOString(),
          durationMinutes: Math.round(session.durationInSeconds / 60),
          score: session.overallSleepScore?.value,
          stages: {
            deep: Math.round((session.deepSleepDurationInSeconds ?? 0) / 60),
            light: Math.round((session.lightSleepDurationInSeconds ?? 0) / 60),
            rem: Math.round((session.remSleepInSeconds ?? 0) / 60),
            awake: Math.round((session.awakeDurationInSeconds ?? 0) / 60),
          },
        },
      }

      if (session.averageSpO2Value != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.SPO2,
          recordedAt,
          value: session.averageSpO2Value,
          unit: MetricUnit.PERCENT,
        }
      }
    }
  }

  async #get(tokens: OAuth1Tokens, path: string): Promise<unknown> {
    const client = this.getOAuthClient()
    const url = `${GarminProvider.BASE_URL}${path}`
    return new Promise((resolve, reject) => {
      client.get(url, tokens.token, tokens.tokenSecret, (err, data) => {
        if (err) {
          reject(new Error(`Garmin API error ${path}: ${JSON.stringify(err)}`))
        } else {
          resolve(JSON.parse(data as string))
        }
      })
    })
  }
}

// ── Auto-registration ─────────────────────────────────────────

export function registerGarminProvider() {
  const consumerKey = process.env["GARMIN_CONSUMER_KEY"]
  const consumerSecret = process.env["GARMIN_CONSUMER_SECRET"]
  const redirectBase = process.env["OAUTH_REDIRECT_BASE_URL"]

  if (!consumerKey || !consumerSecret) {
    console.warn("[GarminProvider] Skipping registration: GARMIN_CONSUMER_KEY/SECRET not set.")
    return
  }

  providerRegistry.register(GARMIN_DEFINITION, () => {
    return new GarminProvider({
      consumerKey,
      consumerSecret,
      redirectUri: `${redirectBase}/v1/oauth/callback/garmin`,
    })
  })
}

export { GARMIN_DEFINITION }
