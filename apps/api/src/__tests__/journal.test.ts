import { beforeEach, describe, expect, it, vi } from "vitest"
import { JournalService } from "../services/journal.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/journal.service.js", () => {
  const JournalService = vi.fn()
  JournalService.prototype.list = vi.fn()
  JournalService.prototype.create = vi.fn()
  JournalService.prototype.update = vi.fn()
  JournalService.prototype.delete = vi.fn()
  JournalService.prototype.getStats = vi.fn()
  return { JournalService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
}

const entryId = "00000000-0000-0000-0000-000000000070"

const mockEntry = {
  id: entryId,
  userId: TEST_USER_ID,
  title: "Great day",
  body: "Had a productive morning workout.",
  moodScore: 4,
  tags: ["fitness"],
  entryDate: new Date("2025-06-01"),
  createdAt: new Date("2025-06-01"),
}

describe("Journal routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/journal", () => {
    it("returns journal entries", async () => {
      vi.mocked(JournalService.prototype.list).mockResolvedValue([mockEntry] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/journal`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/journal`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/journal", () => {
    it("creates a journal entry and returns 201", async () => {
      vi.mocked(JournalService.prototype.create).mockResolvedValue(mockEntry as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/journal`,
        payload: {
          body: "Had a productive morning workout.",
          title: "Great day",
          moodScore: 4,
          tags: ["fitness"],
        },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 400 when body is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/journal`,
        payload: { title: "No body" },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("PATCH /v1/users/:userId/journal/:entryId", () => {
    it("updates a journal entry", async () => {
      vi.mocked(JournalService.prototype.update).mockResolvedValue({ ...mockEntry, title: "Updated" } as never)

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/users/${TEST_USER_ID}/journal/${entryId}`,
        payload: { title: "Updated" },
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when entry not found", async () => {
      vi.mocked(JournalService.prototype.update).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/users/${TEST_USER_ID}/journal/${entryId}`,
        payload: { title: "Updated" },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("DELETE /v1/users/:userId/journal/:entryId", () => {
    it("deletes a journal entry and returns 204", async () => {
      vi.mocked(JournalService.prototype.delete).mockResolvedValue(true as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/journal/${entryId}`,
      })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when entry not found", async () => {
      vi.mocked(JournalService.prototype.delete).mockResolvedValue(false as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/journal/${entryId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/users/:userId/journal/stats", () => {
    it("returns journal stats", async () => {
      const mockStats = { totalEntries: 30, avgMoodScore: 3.8, streakDays: 7 }
      vi.mocked(JournalService.prototype.getStats).mockResolvedValue(mockStats as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/journal/stats`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.totalEntries).toBe(30)
    })

    it("rejects days < 7", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/journal/stats?days=3`,
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
