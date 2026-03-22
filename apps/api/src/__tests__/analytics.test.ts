import { beforeEach, describe, expect, it, vi } from "vitest"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("@biosync-io/analytics", () => ({
  buildLLMContext: vi.fn(),
  computeCorrelations: vi.fn(),
  detectAnomalies: vi.fn(),
  predictRecovery: vi.fn(),
  analyzeCircadianRhythm: vi.fn(),
  computeMetabolicEfficiency: vi.fn(),
  computeStressResilience: vi.fn(),
}))

import {
  buildLLMContext,
  computeCorrelations,
  detectAnomalies,
  predictRecovery,
  analyzeCircadianRhythm,
  computeMetabolicEfficiency,
  computeStressResilience,
} from "@biosync-io/analytics"

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID }

describe("Analytics routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/analytics/context", () => {
    it("returns LLM-ready context", async () => {
      const mockContext = { summary: "healthy", metrics: [] }
      vi.mocked(buildLLMContext).mockResolvedValue(mockContext as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/analytics/context`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toEqual(mockContext)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/analytics/context`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/analytics/correlations", () => {
    it("returns computed correlations", async () => {
      const mockResults = [{ metricA: "steps", metricB: "sleep", strength: 0.8 }]
      vi.mocked(computeCorrelations).mockResolvedValue(mockResults as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/analytics/correlations`,
        payload: { days: 30 },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toEqual(mockResults)
      expect(body.count).toBe(1)
    })
  })

  describe("POST /v1/users/:userId/analytics/anomalies", () => {
    it("returns detected anomalies", async () => {
      const mockResults = [{ metric: "heart_rate", severity: "high" }]
      vi.mocked(detectAnomalies).mockResolvedValue(mockResults as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/analytics/anomalies`,
        payload: { lookbackDays: 7 },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().count).toBe(1)
    })
  })

  describe("GET /v1/users/:userId/analytics/recovery", () => {
    it("returns recovery prediction", async () => {
      const mockPrediction = { score: 85, status: "good" }
      vi.mocked(predictRecovery).mockResolvedValue(mockPrediction as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/analytics/recovery`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toEqual(mockPrediction)
    })
  })

  describe("GET /v1/users/:userId/analytics/circadian", () => {
    it("returns circadian rhythm analysis", async () => {
      const mockAnalysis = { chronotype: "morning", stability: 0.9 }
      vi.mocked(analyzeCircadianRhythm).mockResolvedValue(mockAnalysis as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/analytics/circadian`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toEqual(mockAnalysis)
    })
  })

  describe("GET /v1/users/:userId/analytics/metabolic", () => {
    it("returns metabolic efficiency score", async () => {
      const mockResult = { efficiency: 78 }
      vi.mocked(computeMetabolicEfficiency).mockResolvedValue(mockResult as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/analytics/metabolic`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toEqual(mockResult)
    })
  })

  describe("GET /v1/users/:userId/analytics/resilience", () => {
    it("returns stress resilience index", async () => {
      const mockResult = { index: 72, trend: "improving" }
      vi.mocked(computeStressResilience).mockResolvedValue(mockResult as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/analytics/resilience`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toEqual(mockResult)
    })
  })
})
