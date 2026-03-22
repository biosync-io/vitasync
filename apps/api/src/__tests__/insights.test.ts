import { beforeEach, describe, expect, it, vi } from "vitest"
import { InsightsService } from "../services/insights/index.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/insights/index.js", () => {
  const InsightsService = vi.fn()
  InsightsService.prototype.generateInsights = vi.fn()
  InsightsService.prototype.listAlgorithms = vi.fn()
  return { InsightsService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
  gender: "male",
}

const mockInsight = {
  category: "activity",
  type: "trend",
  title: "Steps trending up",
  description: "Your daily steps increased 15% this week",
}

describe("Insights routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/insights", () => {
    it("returns generated insights", async () => {
      vi.mocked(InsightsService.prototype.generateInsights).mockResolvedValue([mockInsight] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/insights`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.total).toBe(1)
    })

    it("filters out womens_health insights for male users", async () => {
      const womensInsight = { ...mockInsight, category: "womens_health" }
      vi.mocked(InsightsService.prototype.generateInsights).mockResolvedValue([mockInsight, womensInsight] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/insights`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.total).toBe(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/insights`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/insights/algorithms", () => {
    it("returns available algorithms", async () => {
      const algos = [{ name: "trend_detection", description: "Detects metric trends" }]
      vi.mocked(InsightsService.prototype.listAlgorithms).mockReturnValue(algos as never)

      const res = await app.inject({
        method: "GET",
        url: "/v1/insights/algorithms",
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.total).toBe(1)
    })
  })
})
