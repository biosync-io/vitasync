import { beforeEach, describe, expect, it, vi } from "vitest"
import { AchievementService } from "../services/achievement.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/achievement.service.js", () => {
  const AchievementService = vi.fn()
  AchievementService.prototype.listForUser = vi.fn()
  AchievementService.prototype.getDefinitions = vi.fn()
  AchievementService.prototype.checkAndAward = vi.fn()
  return { AchievementService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
}

const mockAchievement = {
  id: "00000000-0000-0000-0000-000000000040",
  userId: TEST_USER_ID,
  achievementKey: "first_steps",
  unlockedAt: new Date("2025-06-01"),
}

describe("Achievement routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/achievements", () => {
    it("returns user achievements", async () => {
      vi.mocked(AchievementService.prototype.listForUser).mockResolvedValue([mockAchievement] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/achievements`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/achievements`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/achievements/definitions", () => {
    it("returns all achievement definitions", async () => {
      const defs = [{ key: "first_steps", name: "First Steps", description: "Walk 1000 steps" }]
      vi.mocked(AchievementService.prototype.getDefinitions).mockReturnValue(defs as never)

      const res = await app.inject({
        method: "GET",
        url: "/v1/achievements/definitions",
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
    })
  })

  describe("POST /v1/users/:userId/achievements/check", () => {
    it("triggers achievement check and returns newly awarded", async () => {
      vi.mocked(AchievementService.prototype.checkAndAward).mockResolvedValue([mockAchievement] as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/achievements/check`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.count).toBe(1)
    })
  })
})
