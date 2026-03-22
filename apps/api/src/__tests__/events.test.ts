import { beforeEach, describe, expect, it, vi } from "vitest"
import { EventService } from "../services/event.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/event.service.js", () => {
  const EventService = vi.fn()
  EventService.prototype.query = vi.fn()
  EventService.prototype.findById = vi.fn()
  return { EventService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
}

const eventId = "00000000-0000-0000-0000-000000000060"

const mockEvent = {
  id: eventId,
  userId: TEST_USER_ID,
  eventType: "workout",
  activityType: "running",
  startedAt: new Date("2025-06-01T07:00:00.000Z"),
  endedAt: new Date("2025-06-01T08:00:00.000Z"),
}

describe("Event routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/events", () => {
    it("returns events with cursor-based pagination", async () => {
      vi.mocked(EventService.prototype.query).mockResolvedValue({
        data: [mockEvent],
        hasMore: false,
        cursor: null,
      } as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/events`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("forwards eventType filter", async () => {
      const spy = vi.mocked(EventService.prototype.query).mockResolvedValue({
        data: [],
        hasMore: false,
        cursor: null,
      } as never)

      await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/events?eventType=workout`,
      })

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "workout" }))
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/events`,
      })

      expect(res.statusCode).toBe(404)
    })

    it("rejects invalid eventType", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/events?eventType=invalid`,
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/users/:userId/events/:eventId", () => {
    it("returns a single event", async () => {
      vi.mocked(EventService.prototype.findById).mockResolvedValue(mockEvent as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/events/${eventId}`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when event not found", async () => {
      vi.mocked(EventService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/events/${eventId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
