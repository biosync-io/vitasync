import { providerRegistry } from "@biosync-io/provider-core"
import type { SyncDataPoint } from "@biosync-io/types"
import { HealthMetricType } from "@biosync-io/types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GARMIN_DEFINITION, GarminProvider, registerGarminProvider } from "../index.js"

// Mock the oauth module with a class-style constructor
vi.mock("oauth", () => {
  return {
    OAuth: class MockOAuth {
      getOAuthRequestToken(cb: (err: unknown, token: string, secret: string) => void) {
        cb(null, "req-token", "req-secret")
      }
      getOAuthAccessToken(
        _token: string,
        _secret: string,
        _verifier: string,
        cb: (err: unknown, token: string, secret: string, results: unknown) => void,
      ) {
        cb(null, "access-token", "access-secret", { xoauth_garmin_userid: "garmin-user-123" })
      }
      get(_url: string, _token: string, _secret: string, cb: (err: unknown, data: string) => void) {
        cb(null, "[]")
      }
    },
  }
})

function createProvider() {
  return new GarminProvider({
    consumerKey: "test-key",
    consumerSecret: "test-secret",
    redirectUri: "https://app.test/callback",
  })
}

/** Spy on getOAuthClient to inject a mock client with endpoint-specific responses. */
function mockApiGet(provider: GarminProvider, responseMap: Record<string, unknown>) {
  const mockGet = vi.fn(
    (url: string, _token: string, _secret: string, cb: (err: unknown, data: string) => void) => {
      for (const [key, value] of Object.entries(responseMap)) {
        if (url.includes(key)) {
          cb(null, JSON.stringify(value))
          return
        }
      }
      cb(null, "[]")
    },
  )

  vi.spyOn(provider as never, "getOAuthClient" as never).mockReturnValue({
    get: mockGet,
    getOAuthRequestToken: vi.fn(),
    getOAuthAccessToken: vi.fn(),
  } as never)
}

describe("GarminProvider", () => {
  describe("definition", () => {
    it("has the correct provider id", () => {
      expect(GARMIN_DEFINITION.id).toBe("garmin")
    })

    it("declares OAuth 1.0a support", () => {
      expect(GARMIN_DEFINITION.capabilities.oauth1).toBe(true)
      expect(GARMIN_DEFINITION.capabilities.oauth2).toBe(false)
    })

    it("supports webhook push", () => {
      expect(GARMIN_DEFINITION.capabilities.supportsWebhooks).toBe(true)
    })

    it("includes all required metric types", () => {
      const required = [
        HealthMetricType.STEPS,
        HealthMetricType.HEART_RATE,
        HealthMetricType.RESTING_HEART_RATE,
        HealthMetricType.HEART_RATE_VARIABILITY,
        HealthMetricType.SLEEP,
        HealthMetricType.STRESS,
        HealthMetricType.CALORIES,
        HealthMetricType.DISTANCE,
        HealthMetricType.FLOORS,
        HealthMetricType.ACTIVE_MINUTES,
        HealthMetricType.BLOOD_OXYGEN,
        HealthMetricType.RESPIRATORY_RATE,
        HealthMetricType.BODY_FAT,
        HealthMetricType.WEIGHT,
      ]
      for (const metric of required) {
        expect(GARMIN_DEFINITION.capabilities.supportedMetrics).toContain(metric)
      }
    })
  })

  describe("OAuth 1.0a flow", () => {
    it("getRequestToken returns token and secret", async () => {
      const provider = createProvider()
      const result = await provider.getRequestToken()
      expect(result.requestToken).toBe("req-token")
      expect(result.requestTokenSecret).toBe("req-secret")
    })

    it("getAuthorizationUrl constructs correct Garmin URL", () => {
      const provider = createProvider()
      const url = provider.getAuthorizationUrl("test-request-token")
      expect(url.origin).toBe("https://connect.garmin.com")
      expect(url.pathname).toBe("/oauthConfirm")
      expect(url.searchParams.get("oauth_token")).toBe("test-request-token")
    })

    it("exchangeVerifier returns access tokens with user ID", async () => {
      const provider = createProvider()
      const tokens = await provider.exchangeVerifier("req-token", "req-secret", "verifier-123")
      expect(tokens.token).toBe("access-token")
      expect(tokens.tokenSecret).toBe("access-secret")
      expect(tokens.userId).toBe("garmin-user-123")
    })
  })

  describe("syncData", () => {
    it("yields daily summary data points with Zod validation", async () => {
      const provider = createProvider()
      mockApiGet(provider, {
        "/dailies": [
          {
            summaryId: "day-1",
            calendarDate: "2024-01-15",
            totalSteps: 10234,
            totalDistanceInMeters: 7800,
            activeKilocalories: 456,
            floorsAscended: 12,
            restingHeartRateInBeatsPerMinute: 58,
            activeSeconds: 3600,
            highlyActiveSeconds: 1200,
          },
        ],
      })

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { token: "t", tokenSecret: "s" },
        { startDate: new Date("2024-01-15"), endDate: new Date("2024-01-16") },
      )) {
        points.push(point)
      }

      expect(points.length).toBeGreaterThanOrEqual(6)
      expect(points.find((p) => p.metricType === HealthMetricType.STEPS)?.value).toBe(10234)
      expect(points.find((p) => p.metricType === HealthMetricType.DISTANCE)?.value).toBe(7800)
      expect(points.find((p) => p.metricType === HealthMetricType.CALORIES)?.value).toBe(456)
      expect(points.find((p) => p.metricType === HealthMetricType.FLOORS)?.value).toBe(12)
      expect(points.find((p) => p.metricType === HealthMetricType.ACTIVE_MINUTES)?.value).toBe(80)
      expect(points.find((p) => p.metricType === HealthMetricType.RESTING_HEART_RATE)?.value).toBe(
        58,
      )
    })

    it("yields sleep data with SpO2 and respiration", async () => {
      const provider = createProvider()
      mockApiGet(provider, {
        "/sleeps": [
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
        ],
      })

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { token: "t", tokenSecret: "s" },
        { startDate: new Date("2024-01-15"), endDate: new Date("2024-01-16") },
      )) {
        points.push(point)
      }

      const sleep = points.find((p) => p.metricType === HealthMetricType.SLEEP)
      expect(sleep).toBeDefined()
      expect((sleep?.data as Record<string, unknown>)?.durationMinutes).toBe(480)

      expect(points.find((p) => p.metricType === HealthMetricType.BLOOD_OXYGEN)?.value).toBe(96.5)
      expect(points.find((p) => p.metricType === HealthMetricType.RESPIRATORY_RATE)).toBeDefined()
    })

    it("gracefully handles invalid API responses", async () => {
      const provider = createProvider()
      mockApiGet(provider, {
        "/dailies": "not-an-array",
        "/heartRates": null,
        "/sleeps": {},
        "/hrv": 42,
        "/stressDetails": false,
        "/bodyComps": "invalid",
        "/pulseOx": "nope",
        "/respiration": "bad",
      })

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { token: "t", tokenSecret: "s" },
        { startDate: new Date("2024-01-15"), endDate: new Date("2024-01-16") },
      )) {
        points.push(point)
      }

      expect(points).toHaveLength(0)
    })

    it("respects dataTypes filter", async () => {
      const provider = createProvider()
      mockApiGet(provider, {
        "/stressDetails": [{ calendarDate: "2024-01-15", overallStressLevel: 35 }],
      })

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { token: "t", tokenSecret: "s" },
        {
          startDate: new Date("2024-01-15"),
          endDate: new Date("2024-01-16"),
          dataTypes: [HealthMetricType.STRESS],
        },
      )) {
        points.push(point)
      }

      expect(points.length).toBeGreaterThanOrEqual(1)
      expect(points.every((p) => p.metricType === HealthMetricType.STRESS)).toBe(true)
    })

    it("yields HRV data", async () => {
      const provider = createProvider()
      mockApiGet(provider, {
        "/hrv": [
          {
            calendarDate: "2024-01-15",
            weeklyAvg: 45.2,
            lastNightAvg: 48.1,
            lastNight5MinHigh: 72.3,
            status: "BALANCED",
          },
        ],
      })

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { token: "t", tokenSecret: "s" },
        {
          startDate: new Date("2024-01-15"),
          endDate: new Date("2024-01-16"),
          dataTypes: [HealthMetricType.HEART_RATE_VARIABILITY],
        },
      )) {
        points.push(point)
      }

      const hrv = points.find((p) => p.metricType === HealthMetricType.HEART_RATE_VARIABILITY)
      expect(hrv?.value).toBe(48.1)
    })

    it("yields body composition data", async () => {
      const provider = createProvider()
      mockApiGet(provider, {
        "/bodyComps": [{ calendarDate: "2024-01-15", weightInGrams: 75000, bodyFat: 18.5 }],
      })

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { token: "t", tokenSecret: "s" },
        {
          startDate: new Date("2024-01-15"),
          endDate: new Date("2024-01-16"),
          dataTypes: [HealthMetricType.WEIGHT, HealthMetricType.BODY_FAT],
        },
      )) {
        points.push(point)
      }

      expect(points.find((p) => p.metricType === HealthMetricType.WEIGHT)?.value).toBe(75)
      expect(points.find((p) => p.metricType === HealthMetricType.BODY_FAT)?.value).toBe(18.5)
    })
  })

  describe("registerGarminProvider", () => {
    beforeEach(() => {
      providerRegistry.clear()
    })

    it("skips registration when env vars are missing", () => {
      delete process.env.GARMIN_CONSUMER_KEY
      delete process.env.GARMIN_CONSUMER_SECRET
      registerGarminProvider()
      expect(providerRegistry.isRegistered("garmin")).toBe(false)
    })

    it("registers when env vars are set", () => {
      process.env.GARMIN_CONSUMER_KEY = "test-key"
      process.env.GARMIN_CONSUMER_SECRET = "test-secret"
      process.env.OAUTH_REDIRECT_BASE_URL = "http://localhost:3001"
      registerGarminProvider()
      expect(providerRegistry.isRegistered("garmin")).toBe(true)

      delete process.env.GARMIN_CONSUMER_KEY
      delete process.env.GARMIN_CONSUMER_SECRET
    })
  })
})
