import { beforeEach, describe, expect, it, vi } from "vitest"
import { TrainingPlanService } from "../services/training-plan.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/training-plan.service.js", () => {
  const TrainingPlanService = vi.fn()
  TrainingPlanService.prototype.list = vi.fn()
  TrainingPlanService.prototype.findById = vi.fn()
  TrainingPlanService.prototype.generate = vi.fn()
  TrainingPlanService.prototype.updateProgress = vi.fn()
  return { TrainingPlanService }
})

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID }
const planId = "00000000-0000-0000-0000-0000000000b0"

const mockPlan = {
  id: planId,
  userId: TEST_USER_ID,
  goal: "endurance",
  difficulty: "intermediate",
  durationWeeks: 8,
  daysPerWeek: 4,
  status: "active",
  createdAt: new Date("2025-06-01"),
}

describe("Training plans routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/training-plans", () => {
    it("returns user training plans", async () => {
      vi.mocked(TrainingPlanService.prototype.list).mockResolvedValue([mockPlan] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/training-plans`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/training-plans`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/users/:userId/training-plans/:planId", () => {
    it("returns a single training plan", async () => {
      vi.mocked(TrainingPlanService.prototype.findById).mockResolvedValue(mockPlan as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/training-plans/${planId}`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when plan not found", async () => {
      vi.mocked(TrainingPlanService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/training-plans/${planId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/training-plans/generate", () => {
    it("generates a plan and returns 201", async () => {
      vi.mocked(TrainingPlanService.prototype.generate).mockResolvedValue(mockPlan as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/training-plans/generate`,
        payload: {
          goal: "endurance",
          difficulty: "intermediate",
          durationWeeks: 8,
          daysPerWeek: 4,
        },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 400 for invalid goal", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/training-plans/generate`,
        payload: {
          goal: "invalid_goal",
          difficulty: "beginner",
          durationWeeks: 4,
          daysPerWeek: 3,
        },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("POST /v1/users/:userId/training-plans/:planId/progress", () => {
    it("updates plan progress", async () => {
      vi.mocked(TrainingPlanService.prototype.updateProgress).mockResolvedValue({
        ...mockPlan,
        status: "in_progress",
      } as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/training-plans/${planId}/progress`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when plan not found", async () => {
      vi.mocked(TrainingPlanService.prototype.updateProgress).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/training-plans/${planId}/progress`,
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
