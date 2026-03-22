import { beforeEach, describe, expect, it, vi } from "vitest"
import { BiometricBaselineService } from "../services/biometric-baseline.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/biometric-baseline.service.js", () => {
  const BiometricBaselineService = vi.fn()
  BiometricBaselineService.prototype.getBaselines = vi.fn()
  BiometricBaselineService.prototype.getBaseline = vi.fn()
  BiometricBaselineService.prototype.computeAllBaselines = vi.fn()
  return { BiometricBaselineService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
}

const mockBaseline = {
  id: "00000000-0000-0000-0000-000000000050",
  userId: TEST_USER_ID,
  metricType: "resting_heart_rate",
  mean: 62,
  stdDev: 4.5,
  computedAt: new Date("2025-06-01"),
}

describe("Baselines routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/baselines", () => {
    it("returns baselines for a user", async () => {
      vi.mocked(BiometricBaselineService.prototype.getBaselines).mockResolvedValue([mockBaseline] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/baselines`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/baselines`,
      })

      expect(res.statusCode).toBe(404)
    })

    it("supports metricType query filter", async () => {
      vi.mocked(BiometricBaselineService.prototype.getBaselines).mockResolvedValue([mockBaseline] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/baselines?metricType=resting_heart_rate`,
      })

      expect(res.statusCode).toBe(200)
      expect(BiometricBaselineService.prototype.getBaselines).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ metricType: "resting_heart_rate" }),
      )
    })
  })

  describe("GET /v1/users/:userId/baselines/:metricType", () => {
    it("returns a single baseline", async () => {
      vi.mocked(BiometricBaselineService.prototype.getBaseline).mockResolvedValue(mockBaseline as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/baselines/resting_heart_rate`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when baseline not found", async () => {
      vi.mocked(BiometricBaselineService.prototype.getBaseline).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/baselines/resting_heart_rate`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/baselines/compute", () => {
    it("recomputes all baselines", async () => {
      vi.mocked(BiometricBaselineService.prototype.computeAllBaselines).mockResolvedValue([mockBaseline] as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/baselines/compute`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.count).toBe(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/baselines/compute`,
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
