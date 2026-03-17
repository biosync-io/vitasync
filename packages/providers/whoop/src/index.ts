import { OAuth2Provider, defaultSyncWindow, providerRegistry } from "@biosync-io/provider-core"
import type { OAuthTokens, ProviderDefinition, SyncDataPoint, SyncOptions } from "@biosync-io/types"
import { HealthMetricType, MetricUnit } from "@biosync-io/types"
import { z } from "zod"

// ── Whoop API response schemas ────────────────────────────────

const WhoopTokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(), // seconds until expiry
})

/** Cursor-based pagination envelope used by all collection endpoints */
const WhoopPage = <T extends z.ZodTypeAny>(recordSchema: T) =>
  z.object({
    records: z.array(recordSchema),
    next_token: z.string().nullish(),
  })

const WhoopCycle = z.object({
  id: z.number(),
  user_id: z.number(),
  start: z.string(),
  end: z.string().nullish(),
  score_state: z.enum(["SCORED", "PENDING_SCORE", "UNSCORABLE"]),
  score: z
    .object({
      strain: z.number().optional(),
      kilojoule: z.number().optional(),
      average_heart_rate: z.number().optional(),
      max_heart_rate: z.number().optional(),
    })
    .optional(),
})

const WhoopRecovery = z.object({
  cycle_id: z.number(),
  user_id: z.number(),
  created_at: z.string(),
  score_state: z.enum(["SCORED", "PENDING_SCORE", "UNSCORABLE"]),
  score: z
    .object({
      recovery_score: z.number().optional(),
      resting_heart_rate: z.number().optional(),
      hrv_rmssd_milli: z.number().optional(),
      spo2_percentage: z.number().optional(),
      skin_temp_celsius: z.number().optional(),
    })
    .optional(),
})

const WhoopSleep = z.object({
  id: z.string(),
  user_id: z.number(),
  start: z.string(),
  end: z.string().nullable(),
  nap: z.boolean(),
  score_state: z.enum(["SCORED", "PENDING_SCORE", "UNSCORABLE"]),
  score: z
    .object({
      stage_summary: z
        .object({
          total_in_bed_time_milli: z.number(),
          total_awake_time_milli: z.number(),
          total_light_sleep_time_milli: z.number(),
          total_slow_wave_sleep_time_milli: z.number(),
          total_rem_sleep_time_milli: z.number(),
          disturbance_count: z.number().optional(),
          sleep_cycle_count: z.number().optional(),
        })
        .optional(),
      respiratory_rate: z.number().optional(),
      sleep_performance_percentage: z.number().optional(),
      sleep_consistency_percentage: z.number().optional(),
      sleep_efficiency_percentage: z.number().optional(),
    })
    .optional(),
})

const WhoopWorkout = z.object({
  id: z.string(),
  user_id: z.number(),
  start: z.string(),
  end: z.string().nullable(),
  sport_id: z.number(),
  score_state: z.enum(["SCORED", "PENDING_SCORE", "UNSCORABLE"]),
  score: z
    .object({
      strain: z.number().optional(),
      average_heart_rate: z.number().optional(),
      max_heart_rate: z.number().optional(),
      kilojoule: z.number().optional(),
      distance_meter: z.number().optional(),
      altitude_gain_meter: z.number().optional(),
      percent_recorded: z.number().optional(),
      zone_durations: z
        .object({
          zone_zero_milli: z.number().optional(),
          zone_one_milli: z.number().optional(),
          zone_two_milli: z.number().optional(),
          zone_three_milli: z.number().optional(),
          zone_four_milli: z.number().optional(),
          zone_five_milli: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
})

// ── WHOOP sport ID → human-readable name map ────────────────
// Source: https://developer.whoop.com/docs/developing/id-maps/sport-ids
const WHOOP_SPORT_NAMES: Record<number, string> = {
  [-1]: "Activity",
  0: "Running",
  1: "Cycling",
  16: "Baseball",
  17: "Basketball",
  18: "Rowing",
  19: "Fencing",
  20: "Field Hockey",
  21: "Football",
  22: "Golf",
  24: "Ice Hockey",
  25: "Lacrosse",
  27: "Rugby",
  28: "Sailing",
  29: "Skiing",
  30: "Soccer",
  31: "Softball",
  32: "Squash",
  33: "Swimming",
  34: "Tennis",
  35: "Track & Field",
  36: "Volleyball",
  37: "Water Polo",
  38: "Wrestling",
  39: "Boxing",
  42: "Dance",
  43: "Pilates",
  44: "Yoga",
  45: "Weightlifting",
  47: "Cross Country Skiing",
  48: "Functional Fitness",
  49: "Duathlon",
  51: "Gymnastics",
  52: "Hiking/Rucking",
  53: "Horseback Riding",
  55: "Kayaking",
  56: "Martial Arts",
  57: "Mountain Biking",
  59: "Powerlifting",
  60: "Rock Climbing",
  61: "Paddleboarding",
  62: "Triathlon",
  63: "Walking",
  64: "Surfing",
  65: "Elliptical",
  66: "Stairmaster",
  70: "Meditation",
  71: "Other",
  73: "Diving",
  74: "Operations",
  75: "Snowboarding",
  76: "Obstacle Course Racing",
  77: "Motor Racing",
  82: "HIIT",
  83: "Spin",
  84: "Jiu-jitsu",
  85: "Manual Labor",
  86: "Cricket",
  87: "Pickleball",
  88: "Inline Skating",
  89: "Box Fitness",
  90: "Spikeball",
  91: "Wheelchair Pushing",
  92: "Paddle Tennis",
  93: "Barre",
  94: "Stage Performance",
  95: "High Stress Work",
  96: "Parkour",
  97: "Lacrosse",
  98: "Hockey",
  99: "E-Sports",
  100: "Hunting",
  101: "Fishing",
}

// ── Provider definition ───────────────────────────────────────

const WHOOP_DEFINITION: ProviderDefinition = {
  id: "whoop",
  name: "WHOOP",
  description: "Sync recovery scores, HRV, sleep, strain, and workouts from your WHOOP strap.",
  logoUrl: "https://vitasync.dev/provider-logos/whoop.svg",
  docsUrl: "https://developer.whoop.com/api/",
  capabilities: {
    supportedMetrics: [
      HealthMetricType.SLEEP,
      HealthMetricType.SLEEP_SCORE,
      HealthMetricType.RESPIRATORY_RATE,
      HealthMetricType.RECOVERY_SCORE,
      HealthMetricType.RESTING_HEART_RATE,
      HealthMetricType.HEART_RATE_VARIABILITY,
      HealthMetricType.BLOOD_OXYGEN,
      HealthMetricType.STRAIN_SCORE,
      HealthMetricType.CALORIES,
      HealthMetricType.WORKOUT,
      HealthMetricType.HEART_RATE,
      HealthMetricType.DISTANCE,
    ],
    supportsWebhooks: false,
    oauth2: true,
    oauth1: false,
    minSyncIntervalSeconds: 900,
  },
}

// ── WHOOP Provider ────────────────────────────────────────────

export class WhoopProvider extends OAuth2Provider {
  readonly definition = WHOOP_DEFINITION

  private static readonly BASE_URL = "https://api.prod.whoop.com/developer/v2"
  private static readonly AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
  private static readonly TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
  private static readonly SCOPES = [
    "offline",
    "read:recovery",
    "read:cycles",
    "read:sleep",
    "read:workout",
    "read:body_measurement",
    "read:profile",
  ]

  getAuthorizationUrl(state: string): URL {
    const url = new URL(WhoopProvider.AUTH_URL)
    url.searchParams.set("client_id", this.config.clientId)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", WhoopProvider.SCOPES.join(" "))
    url.searchParams.set("redirect_uri", this.config.redirectUri)
    url.searchParams.set("state", state)
    return url
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
    })

    const response = await fetch(WhoopProvider.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`WHOOP token exchange failed: ${response.status} ${err}`)
    }

    const raw = WhoopTokenResponse.parse(await response.json())
    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      tokenType: raw.token_type,
      expiresAt: new Date(Date.now() + raw.expires_in * 1000),
    }
  }

  async refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) throw new Error("No refresh token available")

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    })

    const response = await fetch(WhoopProvider.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`WHOOP token refresh failed: ${response.status} ${err}`)
    }

    const raw = WhoopTokenResponse.parse(await response.json())
    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      tokenType: raw.token_type,
      expiresAt: new Date(Date.now() + raw.expires_in * 1000),
    }
  }

  async *syncData(tokens: OAuthTokens, options?: SyncOptions): AsyncGenerator<SyncDataPoint> {
    const { startDate, endDate } = defaultSyncWindow(options)

    // Sync in parallel-ish by iterating each endpoint sequentially.
    // Workouts and sleep cover most of the date range; cycles cover the rest.
    yield* this.#syncSleep(tokens, startDate, endDate)
    yield* this.#syncWorkouts(tokens, startDate, endDate)
    yield* this.#syncCycles(tokens, startDate, endDate)
  }

  // ── Private sync helpers ──────────────────────────────────

  async *#syncSleep(tokens: OAuthTokens, start: Date, end: Date): AsyncGenerator<SyncDataPoint> {
    for await (const sleep of this.#paginate(tokens, "/activity/sleep", WhoopSleep, start, end)) {
      if (sleep.score_state !== "SCORED" || !sleep.score) continue

      const recordedAt = new Date(sleep.start)
      const stages = sleep.score.stage_summary
      const durationMinutes = stages
        ? Math.round((stages.total_in_bed_time_milli - stages.total_awake_time_milli) / 60000)
        : undefined

      // Full structured sleep record
      yield {
        providerId: "whoop",
        metricType: HealthMetricType.SLEEP,
        recordedAt,
        data: {
          nap: sleep.nap,
          startTime: sleep.start,
          endTime: sleep.end,
          durationMinutes,
          lightSleepMinutes: stages
            ? Math.round(stages.total_light_sleep_time_milli / 60000)
            : undefined,
          deepSleepMinutes: stages
            ? Math.round(stages.total_slow_wave_sleep_time_milli / 60000)
            : undefined,
          remSleepMinutes: stages
            ? Math.round(stages.total_rem_sleep_time_milli / 60000)
            : undefined,
          awakeMinutes: stages ? Math.round(stages.total_awake_time_milli / 60000) : undefined,
          disturbanceCount: stages?.disturbance_count,
          sleepCycleCount: stages?.sleep_cycle_count,
          sleepEfficiency: sleep.score.sleep_efficiency_percentage,
          sleepConsistency: sleep.score.sleep_consistency_percentage,
          whoopSleepId: sleep.id,
        },
      }

      // Sleep score (performance percentage)
      if (sleep.score.sleep_performance_percentage != null) {
        yield {
          providerId: "whoop",
          metricType: HealthMetricType.SLEEP_SCORE,
          recordedAt,
          value: sleep.score.sleep_performance_percentage,
          unit: MetricUnit.SCORE,
        }
      }

      // Respiratory rate during sleep
      if (sleep.score.respiratory_rate != null) {
        yield {
          providerId: "whoop",
          metricType: HealthMetricType.RESPIRATORY_RATE,
          recordedAt,
          value: sleep.score.respiratory_rate,
          unit: MetricUnit.BREATHS_PER_MINUTE,
        }
      }
    }
  }

  async *#syncWorkouts(tokens: OAuthTokens, start: Date, end: Date): AsyncGenerator<SyncDataPoint> {
    for await (const workout of this.#paginate(
      tokens,
      "/activity/workout",
      WhoopWorkout,
      start,
      end,
    )) {
      if (workout.score_state !== "SCORED" || !workout.score) continue

      const recordedAt = new Date(workout.start)
      const durationSeconds = workout.end
        ? Math.round((new Date(workout.end).getTime() - recordedAt.getTime()) / 1000)
        : undefined
      const sportName = WHOOP_SPORT_NAMES[workout.sport_id] ?? "Activity"
      const score = workout.score

      // Full workout record
      yield {
        providerId: "whoop",
        metricType: HealthMetricType.WORKOUT,
        recordedAt,
        data: {
          type: sportName,
          sportId: workout.sport_id,
          durationSeconds,
          strain: score.strain,
          avgHeartRate: score.average_heart_rate,
          maxHeartRate: score.max_heart_rate,
          distanceMeters: score.distance_meter,
          altitudeGainMeters: score.altitude_gain_meter,
          percentRecorded: score.percent_recorded,
          zoneDuration: score.zone_durations,
          whoopWorkoutId: workout.id,
        },
      }

      // Distance
      if (score.distance_meter != null && score.distance_meter > 0) {
        yield {
          providerId: "whoop",
          metricType: HealthMetricType.DISTANCE,
          recordedAt,
          value: score.distance_meter,
          unit: MetricUnit.METERS,
        }
      }

      // Average heart rate
      if (score.average_heart_rate != null) {
        yield {
          providerId: "whoop",
          metricType: HealthMetricType.HEART_RATE,
          recordedAt,
          value: score.average_heart_rate,
          unit: MetricUnit.BPM,
        }
      }

      // Calories: WHOOP reports kilojoules — convert to kcal
      if (score.kilojoule != null && score.kilojoule > 0) {
        yield {
          providerId: "whoop",
          metricType: HealthMetricType.CALORIES,
          recordedAt,
          value: Math.round(score.kilojoule * 0.239006),
          unit: MetricUnit.KILOCALORIES,
        }
      }
    }
  }

  async *#syncCycles(tokens: OAuthTokens, start: Date, end: Date): AsyncGenerator<SyncDataPoint> {
    for await (const cycle of this.#paginate(tokens, "/cycle", WhoopCycle, start, end)) {
      if (cycle.score_state !== "SCORED" || !cycle.score) continue

      const recordedAt = new Date(cycle.start)

      // Daily strain score (0–21 scale)
      if (cycle.score.strain != null) {
        yield {
          providerId: "whoop",
          metricType: HealthMetricType.STRAIN_SCORE,
          recordedAt,
          value: cycle.score.strain,
          unit: MetricUnit.SCORE,
        }
      }

      // Total daily calories from kilojoules
      if (cycle.score.kilojoule != null && cycle.score.kilojoule > 0) {
        yield {
          providerId: "whoop",
          metricType: HealthMetricType.CALORIES,
          recordedAt,
          value: Math.round(cycle.score.kilojoule * 0.239006),
          unit: MetricUnit.KILOCALORIES,
        }
      }

      // Fetch this cycle's recovery data
      yield* this.#syncRecoveryForCycle(tokens, cycle.id, recordedAt)
    }
  }

  async *#syncRecoveryForCycle(
    tokens: OAuthTokens,
    cycleId: number,
    cycleStart: Date,
  ): AsyncGenerator<SyncDataPoint> {
    const response = await this.#get(tokens, `/cycle/${cycleId}/recovery`)
    if (!response.ok) {
      // 404 means no recovery data available for this cycle — not an error
      if (response.status === 404) return
      throw new Error(`WHOOP API error: ${response.status} GET /cycle/${cycleId}/recovery`)
    }

    const parsed = WhoopRecovery.safeParse(await response.json())
    if (!parsed.success) return

    const recovery = parsed.data
    if (recovery.score_state !== "SCORED" || !recovery.score) return

    const score = recovery.score
    const recordedAt = new Date(recovery.created_at)

    // Recovery score (0–100)
    if (score.recovery_score != null) {
      yield {
        providerId: "whoop",
        metricType: HealthMetricType.RECOVERY_SCORE,
        recordedAt,
        value: score.recovery_score,
        unit: MetricUnit.SCORE,
      }
    }

    // Resting heart rate
    if (score.resting_heart_rate != null) {
      yield {
        providerId: "whoop",
        metricType: HealthMetricType.RESTING_HEART_RATE,
        recordedAt,
        value: score.resting_heart_rate,
        unit: MetricUnit.BPM,
      }
    }

    // HRV (RMSSD in milliseconds)
    if (score.hrv_rmssd_milli != null) {
      yield {
        providerId: "whoop",
        metricType: HealthMetricType.HEART_RATE_VARIABILITY,
        recordedAt,
        value: Math.round(score.hrv_rmssd_milli),
        unit: MetricUnit.MILLISECONDS,
      }
    }

    // Blood oxygen (SpO2 %)
    if (score.spo2_percentage != null) {
      yield {
        providerId: "whoop",
        metricType: HealthMetricType.BLOOD_OXYGEN,
        recordedAt,
        value: score.spo2_percentage,
        unit: MetricUnit.PERCENT,
      }
    }
  }

  // ── Pagination helper ─────────────────────────────────────

  /**
   * Iterates all pages from a WHOOP collection endpoint, yielding individual
   * records. WHOOP uses cursor-based pagination via `nextToken` query parameter.
   */
  async *#paginate<T extends z.ZodTypeAny>(
    tokens: OAuthTokens,
    path: string,
    schema: T,
    start: Date,
    end: Date,
  ): AsyncGenerator<z.infer<T>> {
    const pageSchema = WhoopPage(schema)
    let nextToken: string | null | undefined

    do {
      const url = new URL(`${WhoopProvider.BASE_URL}${path}`)
      url.searchParams.set("start", start.toISOString())
      url.searchParams.set("end", end.toISOString())
      url.searchParams.set("limit", "25")
      if (nextToken) url.searchParams.set("nextToken", nextToken)

      const response = await this.#get(tokens, path, url)

      if (response.status === 429) {
        throw new Error("WHOOP rate limit reached — retry after the Retry-After interval")
      }
      if (!response.ok) {
        throw new Error(`WHOOP API error: ${response.status} GET ${path}`)
      }

      const page = pageSchema.parse(await response.json())
      for (const record of page.records) {
        yield record
      }

      nextToken = page.next_token
    } while (nextToken)
  }

  // ── HTTP helper ───────────────────────────────────────────

  async #get(tokens: OAuthTokens, path: string, url?: URL): Promise<Response> {
    const requestUrl = url ?? new URL(`${WhoopProvider.BASE_URL}${path}`)
    return fetch(requestUrl.toString(), {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: "application/json",
      },
    })
  }
}

// ── Auto-registration ─────────────────────────────────────────

export function registerWhoopProvider() {
  const clientId = process.env.WHOOP_CLIENT_ID
  const clientSecret = process.env.WHOOP_CLIENT_SECRET
  const redirectBase = process.env.OAUTH_REDIRECT_BASE_URL

  if (!clientId || !clientSecret) {
    console.warn("[WhoopProvider] Skipping registration: WHOOP_CLIENT_ID/SECRET not set.")
    return
  }

  providerRegistry.register(WHOOP_DEFINITION, () => {
    return new WhoopProvider({
      clientId,
      clientSecret,
      redirectUri: `${redirectBase}/v1/oauth/whoop/callback`,
    })
  })
}
