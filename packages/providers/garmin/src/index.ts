import { defaultSyncWindow, OAuth1Provider, providerRegistry } from "@biosync-io/provider-core"
import type {
  OAuth1Tokens,
  ProviderDefinition,
  SyncDataPoint,
  SyncOptions,
} from "@biosync-io/types"
import { HealthMetricType, MetricUnit } from "@biosync-io/types"
import { OAuth } from "oauth"
import {
  GarminBodyCompResponseSchema,
  GarminDailiesResponseSchema,
  GarminHeartRateResponseSchema,
  GarminHrvResponseSchema,
  GarminPulseOxResponseSchema,
  GarminRespirationResponseSchema,
  GarminSleepResponseSchema,
  GarminStressResponseSchema,
} from "./schemas.js"

// ── Provider definition ───────────────────────────────────────

const GARMIN_DEFINITION: ProviderDefinition = {
  id: "garmin",
  name: "Garmin Connect",
  description: "Sync activity, sleep, heart rate, HRV, stress, and body data from Garmin devices.",
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
      HealthMetricType.STRESS,
      HealthMetricType.BLOOD_OXYGEN,
      HealthMetricType.RESPIRATORY_RATE,
      HealthMetricType.BODY_FAT,
      HealthMetricType.WEIGHT,
    ],
    supportsWebhooks: true,
    oauth2: false,
    oauth1: true,
    minSyncIntervalSeconds: 900, // 15 minutes
  },
}

// ── Garmin Provider ───────────────────────────────────────────

export class GarminProvider extends OAuth1Provider {
  readonly definition = GARMIN_DEFINITION

  private static readonly BASE_URL = "https://apis.garmin.com/wellness-api/rest"
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
            const garminUserId = (results as Record<string, unknown>)?.xoauth_garmin_userid as
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
    const startSec = Math.floor(startDate.getTime() / 1000)
    const endSec = Math.floor(endDate.getTime() / 1000)
    const requested = options?.dataTypes

    // Daily summaries → steps, distance, calories, floors, active minutes, resting HR
    if (
      includesAny(requested, [
        HealthMetricType.STEPS,
        HealthMetricType.DISTANCE,
        HealthMetricType.CALORIES,
        HealthMetricType.FLOORS,
        HealthMetricType.ACTIVE_MINUTES,
        HealthMetricType.RESTING_HEART_RATE,
      ])
    ) {
      yield* this.syncDailySummaries(tokens, startSec, endSec)
    }

    // Heart rate
    if (includesAny(requested, [HealthMetricType.HEART_RATE])) {
      yield* this.syncHeartRate(tokens, startSec, endSec)
    }

    // Sleep (also yields SpO2 and respiratory rate from sleep data)
    if (
      includesAny(requested, [
        HealthMetricType.SLEEP,
        HealthMetricType.BLOOD_OXYGEN,
        HealthMetricType.RESPIRATORY_RATE,
      ])
    ) {
      yield* this.syncSleep(tokens, startSec, endSec)
    }

    // HRV
    if (includesAny(requested, [HealthMetricType.HEART_RATE_VARIABILITY])) {
      yield* this.syncHrv(tokens, startSec, endSec)
    }

    // Stress
    if (includesAny(requested, [HealthMetricType.STRESS])) {
      yield* this.syncStress(tokens, startSec, endSec)
    }

    // Body composition → weight, body fat
    if (includesAny(requested, [HealthMetricType.WEIGHT, HealthMetricType.BODY_FAT])) {
      yield* this.syncBodyComposition(tokens, startSec, endSec)
    }

    // Pulse Ox (standalone)
    if (includesAny(requested, [HealthMetricType.BLOOD_OXYGEN])) {
      yield* this.syncPulseOx(tokens, startSec, endSec)
    }

    // Respiration (standalone)
    if (includesAny(requested, [HealthMetricType.RESPIRATORY_RATE])) {
      yield* this.syncRespiration(tokens, startSec, endSec)
    }
  }

  // ── Data Fetchers ────────────────────────────────────────────

  private async *syncDailySummaries(
    tokens: OAuth1Tokens,
    startSec: number,
    endSec: number,
  ): AsyncGenerator<SyncDataPoint> {
    const data = await this.apiGet(
      tokens,
      `/dailies?uploadStartTimeInSeconds=${startSec}&uploadEndTimeInSeconds=${endSec}`,
    )

    const parsed = GarminDailiesResponseSchema.safeParse(data)
    if (!parsed.success) return

    for (const day of parsed.data) {
      const recordedAt = new Date(`${day.calendarDate}T00:00:00Z`)
      const steps = day.totalSteps ?? day.steps
      const distance = day.totalDistanceInMeters ?? day.distanceInMeters
      const floors = day.floorsAscended ?? day.floorsClimbed

      if (steps != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.STEPS,
          recordedAt,
          value: steps,
          unit: MetricUnit.STEPS,
        }
      }

      if (distance != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.DISTANCE,
          recordedAt,
          value: distance,
          unit: MetricUnit.METERS,
        }
      }

      if (day.activeKilocalories != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.CALORIES,
          recordedAt,
          value: day.activeKilocalories,
          unit: MetricUnit.KILOCALORIES,
        }
      }

      if (floors != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.FLOORS,
          recordedAt,
          value: floors,
          unit: MetricUnit.FLOORS,
        }
      }

      const activeMinutes = computeActiveMinutes(
        day.activeSeconds ?? day.activeTimeInSeconds,
        day.highlyActiveSeconds,
      )
      if (activeMinutes != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.ACTIVE_MINUTES,
          recordedAt,
          value: activeMinutes,
          unit: MetricUnit.MINUTES,
        }
      }

      if (day.restingHeartRateInBeatsPerMinute != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.RESTING_HEART_RATE,
          recordedAt,
          value: day.restingHeartRateInBeatsPerMinute,
          unit: MetricUnit.BPM,
        }
      }
    }
  }

  private async *syncHeartRate(
    tokens: OAuth1Tokens,
    startSec: number,
    endSec: number,
  ): AsyncGenerator<SyncDataPoint> {
    const data = await this.apiGet(
      tokens,
      `/heartRates?uploadStartTimeInSeconds=${startSec}&uploadEndTimeInSeconds=${endSec}`,
    )

    const parsed = GarminHeartRateResponseSchema.safeParse(data)
    if (!parsed.success) return

    for (const entry of parsed.data) {
      const recordedAt = new Date(`${entry.calendarDate}T00:00:00Z`)

      if (entry.restingHeartRate != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.RESTING_HEART_RATE,
          recordedAt,
          value: entry.restingHeartRate,
          unit: MetricUnit.BPM,
        }
      }

      if (entry.maxHeartRate != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.HEART_RATE,
          recordedAt,
          value: entry.maxHeartRate,
          unit: MetricUnit.BPM,
          data: {
            max: entry.maxHeartRate,
            min: entry.minHeartRate,
            resting: entry.restingHeartRate,
          },
        }
      }
    }
  }

  private async *syncSleep(
    tokens: OAuth1Tokens,
    startSec: number,
    endSec: number,
  ): AsyncGenerator<SyncDataPoint> {
    const data = await this.apiGet(
      tokens,
      `/sleeps?uploadStartTimeInSeconds=${startSec}&uploadEndTimeInSeconds=${endSec}`,
    )

    const parsed = GarminSleepResponseSchema.safeParse(data)
    if (!parsed.success) return

    for (const session of parsed.data) {
      const recordedAt = new Date(session.startTimeInSeconds * 1000)
      const durationMinutes = Math.round(session.durationInSeconds / 60)
      const score = session.overallSleepScore?.value ?? session.sleepScores?.overallScore

      yield {
        providerId: "garmin",
        metricType: HealthMetricType.SLEEP,
        recordedAt,
        unit: MetricUnit.MINUTES,
        data: {
          startTime: recordedAt.toISOString(),
          durationMinutes,
          score,
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
          metricType: HealthMetricType.BLOOD_OXYGEN,
          recordedAt,
          value: session.averageSpO2Value,
          unit: MetricUnit.PERCENT,
        }
      }

      if (session.averageRespiration != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.RESPIRATORY_RATE,
          recordedAt,
          value: session.averageRespiration,
          unit: MetricUnit.BREATHS_PER_MINUTE,
        }
      }
    }
  }

  private async *syncHrv(
    tokens: OAuth1Tokens,
    startSec: number,
    endSec: number,
  ): AsyncGenerator<SyncDataPoint> {
    const data = await this.apiGet(
      tokens,
      `/hrv?uploadStartTimeInSeconds=${startSec}&uploadEndTimeInSeconds=${endSec}`,
    )

    const parsed = GarminHrvResponseSchema.safeParse(data)
    if (!parsed.success) return

    for (const entry of parsed.data) {
      const recordedAt = new Date(`${entry.calendarDate}T00:00:00Z`)
      const value = entry.lastNightAvg ?? entry.weeklyAvg

      if (value != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.HEART_RATE_VARIABILITY,
          recordedAt,
          value,
          unit: MetricUnit.MILLISECONDS,
          data: {
            weeklyAvg: entry.weeklyAvg,
            lastNightAvg: entry.lastNightAvg,
            lastNight5MinHigh: entry.lastNight5MinHigh,
            status: entry.status,
          },
        }
      }
    }
  }

  private async *syncStress(
    tokens: OAuth1Tokens,
    startSec: number,
    endSec: number,
  ): AsyncGenerator<SyncDataPoint> {
    const data = await this.apiGet(
      tokens,
      `/stressDetails?uploadStartTimeInSeconds=${startSec}&uploadEndTimeInSeconds=${endSec}`,
    )

    const parsed = GarminStressResponseSchema.safeParse(data)
    if (!parsed.success) return

    for (const entry of parsed.data) {
      if (entry.overallStressLevel == null) continue
      const recordedAt = new Date(`${entry.calendarDate}T00:00:00Z`)

      yield {
        providerId: "garmin",
        metricType: HealthMetricType.STRESS,
        recordedAt,
        value: entry.overallStressLevel,
        unit: MetricUnit.SCORE,
        data: {
          restSeconds: entry.restStressDurationInSeconds,
          lowSeconds: entry.lowStressDurationInSeconds,
          mediumSeconds: entry.mediumStressDurationInSeconds,
          highSeconds: entry.highStressDurationInSeconds,
        },
      }
    }
  }

  private async *syncBodyComposition(
    tokens: OAuth1Tokens,
    startSec: number,
    endSec: number,
  ): AsyncGenerator<SyncDataPoint> {
    const data = await this.apiGet(
      tokens,
      `/bodyComps?uploadStartTimeInSeconds=${startSec}&uploadEndTimeInSeconds=${endSec}`,
    )

    const parsed = GarminBodyCompResponseSchema.safeParse(data)
    if (!parsed.success) return

    for (const entry of parsed.data) {
      const recordedAt = new Date(`${entry.calendarDate}T00:00:00Z`)

      if (entry.weightInGrams != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.WEIGHT,
          recordedAt,
          value: entry.weightInGrams / 1000, // grams → kg
          unit: MetricUnit.KILOGRAMS,
        }
      }

      if (entry.bodyFat != null) {
        yield {
          providerId: "garmin",
          metricType: HealthMetricType.BODY_FAT,
          recordedAt,
          value: entry.bodyFat,
          unit: MetricUnit.PERCENT,
        }
      }
    }
  }

  private async *syncPulseOx(
    tokens: OAuth1Tokens,
    startSec: number,
    endSec: number,
  ): AsyncGenerator<SyncDataPoint> {
    const data = await this.apiGet(
      tokens,
      `/pulseOx?uploadStartTimeInSeconds=${startSec}&uploadEndTimeInSeconds=${endSec}`,
    )

    const parsed = GarminPulseOxResponseSchema.safeParse(data)
    if (!parsed.success) return

    for (const entry of parsed.data) {
      if (entry.averageSpO2 == null) continue
      const recordedAt = new Date(`${entry.calendarDate}T00:00:00Z`)

      yield {
        providerId: "garmin",
        metricType: HealthMetricType.BLOOD_OXYGEN,
        recordedAt,
        value: entry.averageSpO2,
        unit: MetricUnit.PERCENT,
        data: { lowest: entry.lowestSpO2 },
      }
    }
  }

  private async *syncRespiration(
    tokens: OAuth1Tokens,
    startSec: number,
    endSec: number,
  ): AsyncGenerator<SyncDataPoint> {
    const data = await this.apiGet(
      tokens,
      `/respiration?uploadStartTimeInSeconds=${startSec}&uploadEndTimeInSeconds=${endSec}`,
    )

    const parsed = GarminRespirationResponseSchema.safeParse(data)
    if (!parsed.success) return

    for (const entry of parsed.data) {
      const value = entry.avgWakingRespirationValue ?? entry.avgSleepRespirationValue
      if (value == null) continue
      const recordedAt = new Date(`${entry.calendarDate}T00:00:00Z`)

      yield {
        providerId: "garmin",
        metricType: HealthMetricType.RESPIRATORY_RATE,
        recordedAt,
        value,
        unit: MetricUnit.BREATHS_PER_MINUTE,
        data: {
          waking: entry.avgWakingRespirationValue,
          sleep: entry.avgSleepRespirationValue,
          highest: entry.highestRespirationValue,
          lowest: entry.lowestRespirationValue,
        },
      }
    }
  }

  // ── API helper ──────────────────────────────────────────────

  private async apiGet(tokens: OAuth1Tokens, path: string): Promise<unknown> {
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

// ── Helpers ───────────────────────────────────────────────────

/** Check if `requested` is unset (sync all) or includes any of `types`. */
function includesAny(requested: readonly string[] | undefined, types: readonly string[]): boolean {
  if (!requested) return true
  return types.some((t) => requested.includes(t))
}

/** Compute active minutes from Garmin's active/highly-active seconds. */
function computeActiveMinutes(
  activeSeconds: number | undefined,
  highlyActiveSeconds: number | undefined,
): number | undefined {
  if (activeSeconds == null && highlyActiveSeconds == null) return undefined
  return Math.round(((activeSeconds ?? 0) + (highlyActiveSeconds ?? 0)) / 60)
}

// ── Auto-registration ─────────────────────────────────────────

export function registerGarminProvider() {
  const consumerKey = process.env.GARMIN_CONSUMER_KEY
  const consumerSecret = process.env.GARMIN_CONSUMER_SECRET
  const redirectBase = process.env.OAUTH_REDIRECT_BASE_URL

  if (!consumerKey || !consumerSecret) return // graceful skip

  providerRegistry.register(GARMIN_DEFINITION, () => {
    return new GarminProvider({
      consumerKey,
      consumerSecret,
      redirectUri: `${redirectBase}/v1/oauth/garmin/callback`,
    })
  })
}

export { GARMIN_DEFINITION }
