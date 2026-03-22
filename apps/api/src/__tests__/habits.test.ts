import { beforeEach, describe, expect, it, vi } from "vitest"
import { HabitsService } from "../services/habits.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/habits.service.js", () => {
  const HabitsService = vi.fn()
  HabitsService.prototype.listHabits = vi.fn()
  HabitsService.prototype.createHabit = vi.fn()
  HabitsService.prototype.updateHabit = vi.fn()
  HabitsService.prototype.deleteHabit = vi.fn()
  HabitsService.prototype.logCompletion = vi.fn()
  HabitsService.prototype.removeCompletion = vi.fn()
  HabitsService.prototype.getDailySummary = vi.fn()
  return { HabitsService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
}

const habitId = "00000000-0000-0000-0000-000000000060"

const mockHabit = {
  id: habitId,
  userId: TEST_USER_ID,
  name: "Drink water",
  icon: "💧",
  color: "blue",
  frequency: "daily",
  active: true,
  createdAt: new Date("2025-06-01"),
}

describe("Habits routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/habits", () => {
    it("returns habits for a user", async () => {
      vi.mocked(HabitsService.prototype.listHabits).mockResolvedValue([mockHabit] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/habits`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/habits`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/habits", () => {
    it("creates a habit and returns 201", async () => {
      vi.mocked(HabitsService.prototype.createHabit).mockResolvedValue(mockHabit as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/habits`,
        payload: { name: "Drink water" },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/habits`,
        payload: { name: "Drink water" },
      })

      expect(res.statusCode).toBe(404)
    })

    it("returns 400 when name is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/habits`,
        payload: {},
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("PATCH /v1/users/:userId/habits/:habitId", () => {
    it("updates a habit", async () => {
      vi.mocked(HabitsService.prototype.updateHabit).mockResolvedValue({ ...mockHabit, name: "Drink more water" } as never)

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/users/${TEST_USER_ID}/habits/${habitId}`,
        payload: { name: "Drink more water" },
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when habit not found", async () => {
      vi.mocked(HabitsService.prototype.updateHabit).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/users/${TEST_USER_ID}/habits/${habitId}`,
        payload: { name: "Updated" },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("DELETE /v1/users/:userId/habits/:habitId", () => {
    it("deletes a habit and returns 204", async () => {
      vi.mocked(HabitsService.prototype.deleteHabit).mockResolvedValue(true as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/habits/${habitId}`,
      })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when habit not found", async () => {
      vi.mocked(HabitsService.prototype.deleteHabit).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/habits/${habitId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/habits/:habitId/complete", () => {
    it("logs a habit completion and returns 201", async () => {
      const mockLog = { habitId, userId: TEST_USER_ID, completedDate: "2025-06-01" }
      vi.mocked(HabitsService.prototype.logCompletion).mockResolvedValue(mockLog as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/habits/${habitId}/complete`,
        payload: { date: "2025-06-01" },
      })

      expect(res.statusCode).toBe(201)
    })
  })

  describe("DELETE /v1/users/:userId/habits/:habitId/complete/:date", () => {
    it("removes a completion and returns 204", async () => {
      vi.mocked(HabitsService.prototype.removeCompletion).mockResolvedValue(true as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/habits/${habitId}/complete/2025-06-01`,
      })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when completion not found", async () => {
      vi.mocked(HabitsService.prototype.removeCompletion).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/habits/${habitId}/complete/2025-06-01`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/users/:userId/habits/summary", () => {
    it("returns daily summary", async () => {
      const mockSummary = { date: "2025-06-01", completed: 3, total: 5 }
      vi.mocked(HabitsService.prototype.getDailySummary).mockResolvedValue(mockSummary as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/habits/summary`,
      })

      expect(res.statusCode).toBe(200)
    })
  })
})
