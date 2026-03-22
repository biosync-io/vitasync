import { beforeEach, describe, expect, it, vi } from "vitest"
import { ReadinessService } from "../services/readiness.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/readiness.service.js", () => {
  const ReadinessService = vi.fn()
  ReadinessService.prototype.getReadiness = vi.fn()
  ReadinessService.prototype.getTrainingLoad = vi.fn()
  ReadinessService.prototype.getTrainingLoadHistory = vi.fn()
  return { ReadinessService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
}

const mockReadiness = {
  userId: TEST_USER_ID,
  score: 78,
  status: "ready",
  date: "2025-06-01",
}

const mockTrainingLoad = {
  userId: TEST_USER_ID,
  atl: 65,
  ctl: 50,
  tsb: -15,
}

describe("Readiness routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/readiness", () => {
    it("returns current readiness state", async () => {
      vi.mocked(ReadinessService.prototype.getReadiness).mockResolvedValue(mockReadiness as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/readiness`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.score).toBe(78)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/readiness`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/users/:userId/training-load", () => {
    it("returns current training load (ATL/CTL/TSB)", async () => {
      vi.mocked(ReadinessService.prototype.getTrainingLoad).mockResolvedValue(mockTrainingLoad as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/training-load`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.atl).toBe(65)
      expect(body.ctl).toBe(50)
    })
  })

  describe("GET /v1/users/:userId/training-load/history", () => {
    it("returns historical training load", async () => {
      vi.mocked(ReadinessService.prototype.getTrainingLoadHistory).mockResolvedValue([mockTrainingLoad] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/training-load/history`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
    })

    it("rejects days > 365", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/training-load/history?days=500`,
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
