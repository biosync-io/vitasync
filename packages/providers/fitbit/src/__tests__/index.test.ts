import { providerRegistry } from "@biosync-io/provider-core"
import type { SyncDataPoint } from "@biosync-io/types"
import { HealthMetricType } from "@biosync-io/types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  FITBIT_DEFINITION,
  FitbitProvider,
  generateCodeChallenge,
  generateCodeVerifier,
  registerFitbitProvider,
} from "../index.js"

// Mock global fetch for API calls
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

function createProvider() {
  return new FitbitProvider({
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    redirectUri: "https://app.test/callback",
  })
}

function mockApiResponse(data: unknown, headers?: Record<string, string>) {
  const headersMap = new Map(Object.entries(headers ?? {}))
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => headersMap.get(name) ?? null },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }
}

describe("PKCE", () => {
  it("generates a code verifier of at least 43 chars", () => {
    const verifier = generateCodeVerifier()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
  })

  it("generates unique verifiers", () => {
    const a = generateCodeVerifier()
    const b = generateCodeVerifier()
    expect(a).not.toBe(b)
  })

  it("generates a code challenge from a verifier", () => {
    const verifier = generateCodeVerifier()
    const challenge = generateCodeChallenge(verifier)
    expect(challenge).toBeTruthy()
    expect(challenge).not.toBe(verifier)
    // base64url: no +, /, or =
    expect(challenge).not.toMatch(/[+/=]/)
  })

  it("produces consistent challenge for same verifier", () => {
    const verifier = "test-verifier-constant"
    const c1 = generateCodeChallenge(verifier)
    const c2 = generateCodeChallenge(verifier)
    expect(c1).toBe(c2)
  })
})

describe("FitbitProvider", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe("definition", () => {
    it("has the correct provider id", () => {
      expect(FITBIT_DEFINITION.id).toBe("fitbit")
    })

    it("declares OAuth 2.0 support", () => {
      expect(FITBIT_DEFINITION.capabilities.oauth2).toBe(true)
      expect(FITBIT_DEFINITION.capabilities.oauth1).toBe(false)
    })

    it("includes all required metric types", () => {
      const required = [
        HealthMetricType.STEPS,
        HealthMetricType.HEART_RATE,
        HealthMetricType.RESTING_HEART_RATE,
        HealthMetricType.HEART_RATE_VARIABILITY,
        HealthMetricType.SLEEP,
        HealthMetricType.SLEEP_SCORE,
        HealthMetricType.CALORIES,
        HealthMetricType.DISTANCE,
        HealthMetricType.FLOORS,
        HealthMetricType.ACTIVE_MINUTES,
        HealthMetricType.SPO2,
        HealthMetricType.RESPIRATORY_RATE,
        HealthMetricType.WEIGHT,
        HealthMetricType.BODY_FAT,
        HealthMetricType.BMI,
      ]
      for (const metric of required) {
        expect(FITBIT_DEFINITION.capabilities.supportedMetrics).toContain(metric)
      }
    })
  })

  describe("OAuth 2.0 flow", () => {
    it("getAuthorizationUrl includes required params", () => {
      const provider = createProvider()
      const url = provider.getAuthorizationUrl("test-state")
      expect(url.searchParams.get("client_id")).toBe("test-client-id")
      expect(url.searchParams.get("response_type")).toBe("code")
      expect(url.searchParams.get("state")).toBe("test-state")
      expect(url.searchParams.get("scope")).toContain("activity")
      expect(url.searchParams.get("scope")).toContain("oxygen_saturation")
    })

    it("exchangeCode returns parsed tokens", async () => {
      const provider = createProvider()
      mockFetch.mockResolvedValue(
        mockApiResponse({
          access_token: "at_test",
          refresh_token: "rt_test",
          token_type: "Bearer",
          expires_in: 28800,
          user_id: "USER123",
          scope: "activity heartrate",
        }),
      )

      const tokens = await provider.exchangeCode("auth-code-123")
      expect(tokens.accessToken).toBe("at_test")
      expect(tokens.refreshToken).toBe("rt_test")
      expect(tokens.raw?.userId).toBe("USER123")
    })

    it("refreshTokens returns new tokens", async () => {
      const provider = createProvider()
      mockFetch.mockResolvedValue(
        mockApiResponse({
          access_token: "at_refreshed",
          refresh_token: "rt_refreshed",
          token_type: "Bearer",
          expires_in: 28800,
          user_id: "USER123",
          scope: "activity heartrate",
        }),
      )

      const tokens = await provider.refreshTokens({
        accessToken: "old-at",
        refreshToken: "old-rt",
      })
      expect(tokens.accessToken).toBe("at_refreshed")
    })

    it("revokeTokens calls the revoke endpoint", async () => {
      const provider = createProvider()
      mockFetch.mockResolvedValue({ ok: true })

      await provider.revokeTokens({ accessToken: "at_to_revoke" })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url] = mockFetch.mock.calls[0] as [string]
      expect(url).toContain("/oauth2/revoke")
    })
  })

  describe("syncData", () => {
    it("yields activity data points", async () => {
      const provider = createProvider()
      mockFetch.mockResolvedValue(
        mockApiResponse({
          summary: {
            steps: 10234,
            caloriesOut: 2100,
            distances: [{ activity: "total", distance: 7.8 }],
            floors: 12,
            fairlyActiveMinutes: 30,
            veryActiveMinutes: 20,
          },
        }),
      )

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { accessToken: "at" },
        {
          startDate: new Date("2024-01-15"),
          endDate: new Date("2024-01-16"),
          dataTypes: [HealthMetricType.STEPS, HealthMetricType.CALORIES, HealthMetricType.DISTANCE],
        },
      )) {
        points.push(point)
      }

      expect(points.find((p) => p.metricType === HealthMetricType.STEPS)?.value).toBe(10234)
      expect(points.find((p) => p.metricType === HealthMetricType.CALORIES)?.value).toBe(2100)
      expect(points.find((p) => p.metricType === HealthMetricType.DISTANCE)?.value).toBe(7800)
    })

    it("yields SpO2 data", async () => {
      const provider = createProvider()
      mockFetch.mockResolvedValue(
        mockApiResponse({
          dateTime: "2024-01-15",
          value: { avg: 96.2, min: 92.1, max: 99.0 },
        }),
      )

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { accessToken: "at" },
        {
          startDate: new Date("2024-01-15"),
          endDate: new Date("2024-01-16"),
          dataTypes: [HealthMetricType.SPO2],
        },
      )) {
        points.push(point)
      }

      const spo2 = points.find((p) => p.metricType === HealthMetricType.SPO2)
      expect(spo2?.value).toBe(96.2)
    })

    it("yields HRV data", async () => {
      const provider = createProvider()
      mockFetch.mockResolvedValue(
        mockApiResponse({
          hrv: [
            {
              dateTime: "2024-01-15",
              value: { dailyRmssd: 42.3, deepRmssd: 48.1 },
            },
          ],
        }),
      )

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { accessToken: "at" },
        {
          startDate: new Date("2024-01-15"),
          endDate: new Date("2024-01-16"),
          dataTypes: [HealthMetricType.HEART_RATE_VARIABILITY],
        },
      )) {
        points.push(point)
      }

      const hrv = points.find((p) => p.metricType === HealthMetricType.HEART_RATE_VARIABILITY)
      expect(hrv?.value).toBe(42.3)
    })

    it("yields body weight + body fat + BMI", async () => {
      const provider = createProvider()
      mockFetch.mockResolvedValue(
        mockApiResponse({
          weight: [
            {
              logId: 1,
              date: "2024-01-15",
              time: "08:30:00",
              weight: 75.2,
              bmi: 23.4,
              fat: 18.5,
            },
          ],
        }),
      )

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { accessToken: "at" },
        {
          startDate: new Date("2024-01-15"),
          endDate: new Date("2024-01-16"),
          dataTypes: [HealthMetricType.WEIGHT, HealthMetricType.BODY_FAT, HealthMetricType.BMI],
        },
      )) {
        points.push(point)
      }

      expect(points.find((p) => p.metricType === HealthMetricType.WEIGHT)?.value).toBe(75.2)
      expect(points.find((p) => p.metricType === HealthMetricType.BODY_FAT)?.value).toBe(18.5)
      expect(points.find((p) => p.metricType === HealthMetricType.BMI)?.value).toBe(23.4)
    })

    it("gracefully handles invalid API responses", async () => {
      const provider = createProvider()
      mockFetch.mockResolvedValue(mockApiResponse({ invalid: true }))

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { accessToken: "at" },
        {
          startDate: new Date("2024-01-15"),
          endDate: new Date("2024-01-16"),
          dataTypes: [HealthMetricType.STEPS],
        },
      )) {
        points.push(point)
      }

      expect(points).toHaveLength(0)
    })

    it("respects dataTypes filter", async () => {
      const provider = createProvider()
      mockFetch.mockResolvedValue(
        mockApiResponse({
          dateTime: "2024-01-15",
          value: { avg: 96.2, min: 92.1, max: 99.0 },
        }),
      )

      const points: SyncDataPoint[] = []
      for await (const point of provider.syncData(
        { accessToken: "at" },
        {
          startDate: new Date("2024-01-15"),
          endDate: new Date("2024-01-16"),
          dataTypes: [HealthMetricType.SPO2],
        },
      )) {
        points.push(point)
      }

      // Only SpO2 should be fetched, not activity/heart/sleep
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const calledUrl = (mockFetch.mock.calls[0] as [string])[0]
      expect(calledUrl).toContain("/spo2/")
    })
  })

  describe("registerFitbitProvider", () => {
    beforeEach(() => {
      providerRegistry.clear()
    })

    it("skips registration when env vars are missing", () => {
      delete process.env.FITBIT_CLIENT_ID
      delete process.env.FITBIT_CLIENT_SECRET
      registerFitbitProvider()
      expect(providerRegistry.isRegistered("fitbit")).toBe(false)
    })

    it("registers when env vars are set", () => {
      process.env.FITBIT_CLIENT_ID = "test-id"
      process.env.FITBIT_CLIENT_SECRET = "test-secret"
      process.env.OAUTH_REDIRECT_BASE_URL = "http://localhost:3001"
      registerFitbitProvider()
      expect(providerRegistry.isRegistered("fitbit")).toBe(true)

      delete process.env.FITBIT_CLIENT_ID
      delete process.env.FITBIT_CLIENT_SECRET
    })
  })
})
