import { z } from "zod"

// ── Token Response ───────────────────────────────────────────

export const FitbitTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  user_id: z.string(),
  scope: z.string(),
})

// ── Activity Summary ─────────────────────────────────────────

export const FitbitActivitySummarySchema = z.object({
  summary: z.object({
    steps: z.number().optional(),
    caloriesOut: z.number().optional(),
    distances: z.array(z.object({ activity: z.string(), distance: z.number() })).optional(),
    floors: z.number().optional(),
    activeScore: z.number().optional(),
    fairlyActiveMinutes: z.number().optional(),
    veryActiveMinutes: z.number().optional(),
    lightlyActiveMinutes: z.number().optional(),
    sedentaryMinutes: z.number().optional(),
    restingHeartRate: z.number().optional(),
  }),
})

// ── Heart Rate ───────────────────────────────────────────────

export const FitbitHeartRateResponseSchema = z.object({
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

// ── Sleep ────────────────────────────────────────────────────

export const FitbitSleepResponseSchema = z.object({
  sleep: z.array(
    z.object({
      logId: z.number(),
      dateOfSleep: z.string().optional(),
      startTime: z.string(),
      endTime: z.string(),
      duration: z.number(),
      efficiency: z.number(),
      isMainSleep: z.boolean().optional(),
      minutesAsleep: z.number().optional(),
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

// ── SpO2 ─────────────────────────────────────────────────────

export const FitbitSpO2ResponseSchema = z.object({
  dateTime: z.string(),
  value: z.object({
    avg: z.number(),
    min: z.number(),
    max: z.number(),
  }),
})

// ── HRV ──────────────────────────────────────────────────────

export const FitbitHrvResponseSchema = z.object({
  hrv: z.array(
    z.object({
      dateTime: z.string(),
      value: z.object({
        dailyRmssd: z.number(),
        deepRmssd: z.number().optional(),
      }),
    }),
  ),
})

// ── Respiratory Rate ─────────────────────────────────────────

export const FitbitBreathingRateResponseSchema = z.object({
  br: z.array(
    z.object({
      dateTime: z.string(),
      value: z.object({
        breathingRate: z.number(),
      }),
    }),
  ),
})

// ── Body Weight ──────────────────────────────────────────────

export const FitbitBodyWeightResponseSchema = z.object({
  weight: z.array(
    z.object({
      logId: z.number(),
      date: z.string(),
      time: z.string(),
      weight: z.number(),
      bmi: z.number().optional(),
      fat: z.number().optional(),
      source: z.string().optional(),
    }),
  ),
})
