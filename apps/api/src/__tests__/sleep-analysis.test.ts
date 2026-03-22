import { beforeEach, describe, expect, it, vi } from "vitest"
import { SleepAnalysisService } from "../services/sleep-analysis.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/sleep-analysis.service.js", () => {
  const SleepAnalysisService = vi.fn()
  SleepAnalysisService.prototype.getSleepDebt = vi.fn()
  SleepAnalysisService.prototype.getSleepQualityReport = vi.fn()
  return { SleepAnalysisService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
  gender: "male",
}

const mockSleepDebt = {
  userId: TEST_USER_ID,
  debtMinutes: 120,
  avgDurationMinutes: 420,
  targetMinutes: 480,
  days: 14,
}

const mockQualityReport = {
  userId: TEST_USER_ID,
  avgScore: 75,
  avgDurationMinutes: 430,
  avgDeepSleepPct: 18,
  avgRemSleepPct: 22,
}

describe("Sleep analysis routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/sleep-analysis/debt", () => {
    it("returns sleep debt data", async () => {
      vi.mocked(SleepAnalysisService.prototype.getSleepDebt).mockResolvedValue(mockSleepDebt as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/sleep-analysis/debt`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.debtMinutes).toBe(120)
    })

    it("passes gender to service", async () => {
      const spy = vi.mocked(SleepAnalysisService.prototype.getSleepDebt).mockResolvedValue(mockSleepDebt as never)

      await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/sleep-analysis/debt`,
      })

      expect(spy).toHaveBeenCalledWith(TEST_USER_ID, 14, "male")
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/sleep-analysis/debt`,
      })

      expect(res.statusCode).toBe(404)
    })

    it("rejects days < 3", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/sleep-analysis/debt?days=1`,
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/users/:userId/sleep-analysis/quality", () => {
    it("returns sleep quality report", async () => {
      vi.mocked(SleepAnalysisService.prototype.getSleepQualityReport).mockResolvedValue(mockQualityReport as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/sleep-analysis/quality`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.avgScore).toBe(75)
    })

    it("rejects days < 7", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/sleep-analysis/quality?days=3`,
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
