import { describe, expect, it } from "vitest"
import {
  FitbitActivitySummarySchema,
  FitbitBodyWeightResponseSchema,
  FitbitBreathingRateResponseSchema,
  FitbitHeartRateResponseSchema,
  FitbitHrvResponseSchema,
  FitbitSleepResponseSchema,
  FitbitSpO2ResponseSchema,
  FitbitTokenResponseSchema,
} from "../schemas.js"

describe("Fitbit Zod Schemas", () => {
  describe("FitbitTokenResponseSchema", () => {
    it("parses a valid token response", () => {
      const data = {
        access_token: "at_abc",
        refresh_token: "rt_xyz",
        token_type: "Bearer",
        expires_in: 28800,
        user_id: "ABC123",
        scope: "activity heartrate sleep",
      }
      expect(FitbitTokenResponseSchema.parse(data)).toEqual(data)
    })
  })

  describe("FitbitActivitySummarySchema", () => {
    it("parses activity data", () => {
      const data = {
        summary: {
          steps: 10234,
          caloriesOut: 2100,
          distances: [{ activity: "total", distance: 7.8 }],
          floors: 12,
          fairlyActiveMinutes: 30,
          veryActiveMinutes: 20,
        },
      }
      const result = FitbitActivitySummarySchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it("allows all optional fields", () => {
      const data = { summary: {} }
      expect(FitbitActivitySummarySchema.safeParse(data).success).toBe(true)
    })
  })

  describe("FitbitHeartRateResponseSchema", () => {
    it("parses heart rate data", () => {
      const data = {
        "activities-heart": [
          {
            dateTime: "2024-01-15",
            value: { restingHeartRate: 58 },
          },
        ],
      }
      expect(FitbitHeartRateResponseSchema.safeParse(data).success).toBe(true)
    })
  })

  describe("FitbitSleepResponseSchema", () => {
    it("parses sleep data with stages", () => {
      const data = {
        sleep: [
          {
            logId: 123,
            startTime: "2024-01-15T22:30:00",
            endTime: "2024-01-16T06:30:00",
            duration: 28800000,
            efficiency: 92,
            levels: {
              summary: {
                light: { minutes: 210 },
                deep: { minutes: 90 },
                rem: { minutes: 120 },
                wake: { minutes: 30 },
              },
            },
          },
        ],
      }
      expect(FitbitSleepResponseSchema.safeParse(data).success).toBe(true)
    })
  })

  describe("FitbitSpO2ResponseSchema", () => {
    it("parses SpO2 data", () => {
      const data = {
        dateTime: "2024-01-15",
        value: { avg: 96.2, min: 92.1, max: 99.0 },
      }
      expect(FitbitSpO2ResponseSchema.safeParse(data).success).toBe(true)
    })
  })

  describe("FitbitHrvResponseSchema", () => {
    it("parses HRV data", () => {
      const data = {
        hrv: [
          {
            dateTime: "2024-01-15",
            value: { dailyRmssd: 42.3, deepRmssd: 48.1 },
          },
        ],
      }
      expect(FitbitHrvResponseSchema.safeParse(data).success).toBe(true)
    })
  })

  describe("FitbitBreathingRateResponseSchema", () => {
    it("parses breathing rate data", () => {
      const data = {
        br: [
          {
            dateTime: "2024-01-15",
            value: { breathingRate: 15.4 },
          },
        ],
      }
      expect(FitbitBreathingRateResponseSchema.safeParse(data).success).toBe(true)
    })
  })

  describe("FitbitBodyWeightResponseSchema", () => {
    it("parses body weight data", () => {
      const data = {
        weight: [
          {
            logId: 456,
            date: "2024-01-15",
            time: "08:30:00",
            weight: 75.2,
            bmi: 23.4,
            fat: 18.5,
            source: "Aria",
          },
        ],
      }
      expect(FitbitBodyWeightResponseSchema.safeParse(data).success).toBe(true)
    })
  })
})
