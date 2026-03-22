import { beforeEach, describe, expect, it, vi } from "vitest"
import { MoodService } from "../services/mood.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/mood.service.js", () => {
  const MoodService = vi.fn()
  MoodService.prototype.create = vi.fn()
  MoodService.prototype.list = vi.fn()
  MoodService.prototype.getStats = vi.fn()
  return { MoodService }
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

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID, externalId: "u1", gender: "female" }
const mockMoodLog = { id: "ml-1", userId: TEST_USER_ID, mood: "calm", score: 4, energyLevel: 3, stressLevel: 2, recordedAt: new Date(), createdAt: new Date() }

describe("Mood routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("POST /v1/users/:userId/mood", () => {
    it("creates mood entry with score and mood label", async () => {
      vi.mocked(MoodService.prototype.create).mockResolvedValue(mockMoodLog as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/mood`,
        body: { mood: "calm", score: 4, energy: 3, stress: 2 },
      })

      expect(res.statusCode).toBe(201)
      expect(MoodService.prototype.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TEST_USER_ID, mood: "calm", score: 4 }),
      )
    })

    it("rejects when required score is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/mood`,
        body: { mood: "happy" },
      })

      expect(res.statusCode).toBe(400)
    })

    it("rejects when mood is a number instead of string", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/mood`,
        body: { mood: 3, score: 3 },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/users/:userId/mood", () => {
    it("lists mood logs", async () => {
      vi.mocked(MoodService.prototype.list).mockResolvedValue([mockMoodLog] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/mood`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })
  })
})
