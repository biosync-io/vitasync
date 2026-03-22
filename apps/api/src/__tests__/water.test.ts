import { beforeEach, describe, expect, it, vi } from "vitest"
import { WaterIntakeService } from "../services/water-intake.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/water-intake.service.js", () => {
  const WaterIntakeService = vi.fn()
  WaterIntakeService.prototype.list = vi.fn()
  WaterIntakeService.prototype.create = vi.fn()
  WaterIntakeService.prototype.delete = vi.fn()
  WaterIntakeService.prototype.getDailySummary = vi.fn()
  WaterIntakeService.prototype.getWeeklyStats = vi.fn()
  return { WaterIntakeService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
}

const logId = "00000000-0000-0000-0000-000000000080"

const mockLog = {
  id: logId,
  userId: TEST_USER_ID,
  amountMl: 250,
  beverageType: "water",
  loggedAt: new Date("2025-06-01T08:00:00.000Z"),
}

describe("Water routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/water", () => {
    it("returns water intake logs", async () => {
      vi.mocked(WaterIntakeService.prototype.list).mockResolvedValue([mockLog] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/water`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/water`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/water", () => {
    it("creates a water log and returns 201", async () => {
      vi.mocked(WaterIntakeService.prototype.create).mockResolvedValue(mockLog as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/water`,
        payload: { amountMl: 250 },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 400 when amountMl is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/water`,
        payload: { beverageType: "coffee" },
      })

      expect(res.statusCode).toBe(400)
    })

    it("rejects amountMl > 5000", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/water`,
        payload: { amountMl: 6000 },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("DELETE /v1/users/:userId/water/:logId", () => {
    it("deletes a water log and returns 204", async () => {
      vi.mocked(WaterIntakeService.prototype.delete).mockResolvedValue(true as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/water/${logId}`,
      })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when log not found", async () => {
      vi.mocked(WaterIntakeService.prototype.delete).mockResolvedValue(false as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/water/${logId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/users/:userId/water/today", () => {
    it("returns daily water summary", async () => {
      const mockSummary = { totalMl: 1500, goalMl: 2500, percentComplete: 60, logs: 6 }
      vi.mocked(WaterIntakeService.prototype.getDailySummary).mockResolvedValue(mockSummary as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/water/today`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.totalMl).toBe(1500)
    })
  })

  describe("GET /v1/users/:userId/water/weekly", () => {
    it("returns weekly water stats", async () => {
      const mockWeekly = { avgDailyMl: 2000, daysMetGoal: 4, totalMl: 14000 }
      vi.mocked(WaterIntakeService.prototype.getWeeklyStats).mockResolvedValue(mockWeekly as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/water/weekly`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.avgDailyMl).toBe(2000)
    })
  })
})
