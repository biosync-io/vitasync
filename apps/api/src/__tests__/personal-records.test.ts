import { beforeEach, describe, expect, it, vi } from "vitest"
import { PersonalRecordService } from "../services/personal-record.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/personal-record.service.js", () => {
  const PersonalRecordService = vi.fn()
  PersonalRecordService.prototype.list = vi.fn()
  PersonalRecordService.prototype.findByType = vi.fn()
  return { PersonalRecordService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
}

const mockRecord = {
  id: "00000000-0000-0000-0000-000000000080",
  userId: TEST_USER_ID,
  metricType: "max_heart_rate",
  value: 195,
  recordedAt: new Date("2025-06-01"),
}

describe("Personal Records routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/personal-records", () => {
    it("returns personal records for a user", async () => {
      vi.mocked(PersonalRecordService.prototype.list).mockResolvedValue([mockRecord] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/personal-records`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/personal-records`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/users/:userId/personal-records/:metricType", () => {
    it("returns a specific personal record", async () => {
      vi.mocked(PersonalRecordService.prototype.findByType).mockResolvedValue(mockRecord as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/personal-records/max_heart_rate`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when record not found", async () => {
      vi.mocked(PersonalRecordService.prototype.findByType).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/personal-records/max_heart_rate`,
      })

      expect(res.statusCode).toBe(404)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/personal-records/max_heart_rate`,
      })

      expect(res.statusCode).toBe(404)
    })

    it("supports category query parameter", async () => {
      vi.mocked(PersonalRecordService.prototype.findByType).mockResolvedValue(mockRecord as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/personal-records/max_heart_rate?category=cardio`,
      })

      expect(res.statusCode).toBe(200)
      expect(PersonalRecordService.prototype.findByType).toHaveBeenCalledWith(
        TEST_USER_ID,
        "max_heart_rate",
        "cardio",
      )
    })
  })
})
