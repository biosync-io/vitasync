import { beforeEach, describe, expect, it, vi } from "vitest"
import { HealthScoreService } from "../services/health-score.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/health-score.service.js", () => {
  const HealthScoreService = vi.fn()
  HealthScoreService.prototype.getLatest = vi.fn()
  HealthScoreService.prototype.getHistory = vi.fn()
  HealthScoreService.prototype.computeForDate = vi.fn()
  return { HealthScoreService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
  gender: "male",
}

const mockScore = {
  id: "00000000-0000-0000-0000-000000000030",
  userId: TEST_USER_ID,
  overallScore: 82,
  date: "2025-06-01",
}

describe("Health scores routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/health-scores/latest", () => {
    it("returns the latest health score", async () => {
      vi.mocked(HealthScoreService.prototype.getLatest).mockResolvedValue(mockScore as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health-scores/latest`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.overallScore).toBe(82)
    })

    it("returns 404 when no scores exist", async () => {
      vi.mocked(HealthScoreService.prototype.getLatest).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health-scores/latest`,
      })

      expect(res.statusCode).toBe(404)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health-scores/latest`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/users/:userId/health-scores", () => {
    it("returns score history", async () => {
      vi.mocked(HealthScoreService.prototype.getHistory).mockResolvedValue([mockScore] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health-scores`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
    })

    it("rejects limit > 365", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/health-scores?limit=500`,
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("POST /v1/users/:userId/health-scores/compute", () => {
    it("triggers score computation and returns 201", async () => {
      vi.mocked(HealthScoreService.prototype.computeForDate).mockResolvedValue(mockScore as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/health-scores/compute`,
        payload: {},
      })

      expect(res.statusCode).toBe(201)
      expect(HealthScoreService.prototype.computeForDate).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.any(Date),
        "male",
      )
    })
  })
})
