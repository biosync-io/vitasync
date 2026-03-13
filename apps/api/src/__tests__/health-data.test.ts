import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildTestApp, TEST_USER_ID } from "./helpers.js"
import { HealthDataService } from "../services/health-data.service.js"

vi.mock("../services/health-data.service.js")

const mockMetric = {
  id: "00000000-0000-0000-0000-000000000020",
  userId: TEST_USER_ID,
  connectionId: "00000000-0000-0000-0000-000000000011",
  providerId: "fitbit",
  metricType: "steps",
  recordedAt: new Date("2025-06-01"),
  value: 8500,
  unit: "steps",
  data: null,
  createdAt: new Date("2025-06-01"),
}

describe("Health data routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/health", () => {
    it("returns paginated health data with hasMore flag", async () => {
      vi.mocked(HealthDataService.prototype.query).mockResolvedValue({
        data: [mockMetric] as never,
        hasMore: false,
        nextCursor: undefined,
      })

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.hasMore).toBe(false)
    })

    it("forwards metricType and date range filters", async () => {
      const spy = vi
        .mocked(HealthDataService.prototype.query)
        .mockResolvedValue({ data: [], hasMore: false })

      await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health?metricType=steps&from=2025-01-01T00:00:00.000Z&to=2025-12-31T23:59:59.000Z`,
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ metricType: "steps" }),
      )
    })

    it("rejects limit > 1000", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health?limit=9999`,
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/users/:userId/health/summary", () => {
    it("returns summary per metric type", async () => {
      vi.mocked(HealthDataService.prototype.summary).mockResolvedValue([
        { metricType: "steps", count: 30, earliest: "2025-01-01", latest: "2025-01-30" },
      ] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health/summary`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json() as Array<{ metricType: string }>
      expect(body[0]?.metricType).toBe("steps")
    })
  })

  describe("GET /v1/users/:userId/health/timeseries", () => {
    it("returns bucketed timeseries data", async () => {
      vi.mocked(HealthDataService.prototype.timeseries).mockResolvedValue([
        { bucket: "2025-06-01", avg: 8000, min: 7000, max: 9000, sum: 8000, count: 1 },
      ] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health/timeseries?metricType=steps&from=2025-06-01T00:00:00.000Z&to=2025-06-30T00:00:00.000Z&bucket=day`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.bucket).toBe("day")
    })

    it("returns 400 when metricType is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health/timeseries?from=2025-06-01T00:00:00.000Z&to=2025-06-30T00:00:00.000Z`,
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
