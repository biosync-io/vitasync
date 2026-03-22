import { beforeEach, describe, expect, it, vi } from "vitest"
import { NutritionService } from "../services/nutrition.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/nutrition.service.js", () => {
  const NutritionService = vi.fn()
  NutritionService.prototype.create = vi.fn()
  NutritionService.prototype.list = vi.fn()
  NutritionService.prototype.getDailySummary = vi.fn()
  NutritionService.prototype.getWeeklyAverage = vi.fn()
  return { NutritionService }
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
const mockLog = { id: "n-1", userId: TEST_USER_ID, mealType: "lunch", calories: 500, createdAt: new Date() }

describe("Nutrition routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("POST /v1/users/:userId/nutrition", () => {
    it("creates nutrition log mapping proteinG→proteinGrams correctly", async () => {
      vi.mocked(NutritionService.prototype.create).mockResolvedValue(mockLog as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/nutrition`,
        body: { mealType: "lunch", description: "Chicken salad", calories: 500, proteinG: 30, carbsG: 20, fatG: 15 },
      })

      expect(res.statusCode).toBe(201)
      expect(NutritionService.prototype.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mealType: "lunch",
          description: "Chicken salad",
          proteinGrams: 30,
          carbsGrams: 20,
          fatGrams: 15,
        }),
      )
    })

    it("accepts description field (not name)", async () => {
      vi.mocked(NutritionService.prototype.create).mockResolvedValue(mockLog as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/nutrition`,
        body: { mealType: "dinner", description: "Pasta" },
      })

      expect(res.statusCode).toBe(201)
      expect(NutritionService.prototype.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Pasta" }),
      )
    })

    it("maps consumedAt correctly from loggedAt", async () => {
      vi.mocked(NutritionService.prototype.create).mockResolvedValue(mockLog as never)
      const now = new Date().toISOString()

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/nutrition`,
        body: { mealType: "snack", loggedAt: now },
      })

      expect(res.statusCode).toBe(201)
      expect(NutritionService.prototype.create).toHaveBeenCalledWith(
        expect.objectContaining({ consumedAt: expect.any(Date) }),
      )
    })
  })
})
