import { beforeEach, describe, expect, it, vi } from "vitest"
import { SymptomService } from "../services/symptom.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/symptom.service.js", () => {
  const SymptomService = vi.fn()
  SymptomService.prototype.create = vi.fn()
  SymptomService.prototype.list = vi.fn()
  SymptomService.prototype.getTopSymptoms = vi.fn()
  SymptomService.prototype.getPatterns = vi.fn()
  return { SymptomService }
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
const mockSymptom = { id: "s-1", userId: TEST_USER_ID, symptom: "Headache", severity: 3, startedAt: new Date(), createdAt: new Date() }

describe("Symptom routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("POST /v1/users/:userId/symptoms", () => {
    it("creates symptom with correct field names", async () => {
      vi.mocked(SymptomService.prototype.create).mockResolvedValue(mockSymptom as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/symptoms`,
        body: { symptom: "Headache", severity: 3, bodyLocation: "head", triggers: ["stress"] },
      })

      expect(res.statusCode).toBe(201)
      expect(SymptomService.prototype.create).toHaveBeenCalledWith(
        expect.objectContaining({ symptom: "Headache", severity: 3, bodyLocation: "head" }),
      )
    })

    it("accepts optional fields as undefined (not null)", async () => {
      vi.mocked(SymptomService.prototype.create).mockResolvedValue(mockSymptom as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/symptoms`,
        body: { symptom: "Fatigue", severity: 2 },
      })

      expect(res.statusCode).toBe(201)
    })

    it("rejects when symptom name is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/symptoms`,
        body: { severity: 3 },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/users/:userId/symptoms/patterns", () => {
    it("returns patterns with frequentTriggers and frequentLocations", async () => {
      vi.mocked(SymptomService.prototype.getPatterns).mockResolvedValue({
        frequentTriggers: [{ trigger: "stress", count: 5 }],
        frequentLocations: [{ location: "head", count: 3 }],
        severityTrend: "stable",
      } as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/symptoms/patterns`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.frequentTriggers).toBeDefined()
      expect(body.frequentLocations).toBeDefined()
      expect(body.severityTrend).toBe("stable")
    })
  })
})
