import { describe, expect, it } from "vitest"
import {
  GarminBodyCompResponseSchema,
  GarminDailiesResponseSchema,
  GarminHeartRateResponseSchema,
  GarminHrvResponseSchema,
  GarminPulseOxResponseSchema,
  GarminRespirationResponseSchema,
  GarminSleepResponseSchema,
  GarminStressResponseSchema,
} from "../schemas.js"

describe("Garmin Zod Schemas", () => {
  describe("GarminDailiesResponseSchema", () => {
    it("parses a valid daily summary", () => {
      const data = [
        {
          summaryId: "abc-123",
          calendarDate: "2024-01-15",
          totalSteps: 10234,
          totalDistanceInMeters: 7800.5,
          activeKilocalories: 456,
          floorsAscended: 12,
          restingHeartRateInBeatsPerMinute: 58,
          averageStressLevel: 32,
          activeSeconds: 3600,
          highlyActiveSeconds: 1200,
        },
      ]
      const result = GarminDailiesResponseSchema.safeParse(data)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data[0]?.totalSteps).toBe(10234)
      }
    })

    it("allows missing optional fields", () => {
      const data = [{ summaryId: "abc", calendarDate: "2024-01-15" }]
      const result = GarminDailiesResponseSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it("rejects missing required fields", () => {
      const data = [{ totalSteps: 100 }]
      const result = GarminDailiesResponseSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe("GarminSleepResponseSchema", () => {
    it("parses valid sleep data", () => {
      const data = [
        {
          startTimeInSeconds: 1705276800,
          durationInSeconds: 28800,
          deepSleepDurationInSeconds: 5400,
          lightSleepDurationInSeconds: 14400,
          remSleepInSeconds: 5400,
          awakeDurationInSeconds: 3600,
          overallSleepScore: { value: 82 },
          averageSpO2Value: 96.5,
          averageRespiration: 15.2,
        },
      ]
      const result = GarminSleepResponseSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it("rejects sleep entry without required time fields", () => {
      const data = [{ durationInSeconds: 28800 }]
      const result = GarminSleepResponseSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe("GarminHeartRateResponseSchema", () => {
    it("parses heart rate data", () => {
      const data = [
        {
          calendarDate: "2024-01-15",
          maxHeartRate: 162,
          minHeartRate: 48,
          restingHeartRate: 55,
        },
      ]
      const result = GarminHeartRateResponseSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })

  describe("GarminHrvResponseSchema", () => {
    it("parses HRV data", () => {
      const data = [
        {
          calendarDate: "2024-01-15",
          weeklyAvg: 45.2,
          lastNightAvg: 48.1,
          lastNight5MinHigh: 72.3,
          status: "BALANCED",
        },
      ]
      const result = GarminHrvResponseSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })

  describe("GarminStressResponseSchema", () => {
    it("parses stress data", () => {
      const data = [
        {
          calendarDate: "2024-01-15",
          overallStressLevel: 35,
          restStressDurationInSeconds: 28800,
          lowStressDurationInSeconds: 14400,
          mediumStressDurationInSeconds: 7200,
          highStressDurationInSeconds: 3600,
        },
      ]
      const result = GarminStressResponseSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })

  describe("GarminBodyCompResponseSchema", () => {
    it("parses body composition data", () => {
      const data = [
        {
          calendarDate: "2024-01-15",
          weightInGrams: 75000,
          bodyFat: 18.5,
          bodyMassIndex: 23.4,
        },
      ]
      const result = GarminBodyCompResponseSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })

  describe("GarminPulseOxResponseSchema", () => {
    it("parses pulse ox data", () => {
      const data = [
        {
          calendarDate: "2024-01-15",
          averageSpO2: 96,
          lowestSpO2: 92,
        },
      ]
      const result = GarminPulseOxResponseSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })

  describe("GarminRespirationResponseSchema", () => {
    it("parses respiration data", () => {
      const data = [
        {
          calendarDate: "2024-01-15",
          avgWakingRespirationValue: 16.2,
          avgSleepRespirationValue: 14.8,
          highestRespirationValue: 22.1,
          lowestRespirationValue: 12.3,
        },
      ]
      const result = GarminRespirationResponseSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })
})
