import { beforeEach, describe, expect, it, vi } from "vitest"
import { GoalService } from "../services/goal.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/goal.service.js", () => {
  const GoalService = vi.fn()
  GoalService.prototype.create = vi.fn()
  GoalService.prototype.list = vi.fn()
  GoalService.prototype.evaluate = vi.fn()
  return { GoalService }
})

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  UserService.prototype.list = vi.fn()
  UserService.prototype.findOrCreate = vi.fn()
  UserService.prototype.update = vi.fn()
  UserService.prototype.delete = vi.fn()
  return { UserService }
})

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID, externalId: "u1" }
const mockGoal = { id: "g-1", userId: TEST_USER_ID, name: "Walk 10k", category: "activity", targetValue: 10000, cadence: "daily", createdAt: new Date() }

describe("Goals routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("POST /v1/users/:userId/goals", () => {
    it("creates goal with correct field mapping (title→name, targetUnit→unit)", async () => {
      vi.mocked(GoalService.prototype.create).mockResolvedValue(mockGoal as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/goals`,
        body: {
          title: "Walk 10k",
          category: "activity",
          metricType: "steps",
          targetValue: 10000,
          targetUnit: "steps",
          cadence: "daily",
          startDate: new Date().toISOString(),
        },
      })

      expect(res.statusCode).toBe(201)
      expect(GoalService.prototype.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Walk 10k",
          metricType: "steps",
          unit: "steps",
          startDate: expect.any(Date),
        }),
      )
    })

    it("rejects when required startDate is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/goals`,
        body: { title: "Test", category: "activity", metricType: "steps", targetValue: 100, targetUnit: "steps", cadence: "daily" },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
