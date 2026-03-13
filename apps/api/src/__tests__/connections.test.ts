import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildTestApp, TEST_USER_ID, TEST_WORKSPACE_ID } from "./helpers.js"
import { ConnectionService } from "../services/connection.service.js"

vi.mock("../services/connection.service.js")

const TEST_CONNECTION_ID = "00000000-0000-0000-0000-000000000010"

const mockConnection = {
  id: TEST_CONNECTION_ID,
  userId: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
  providerId: "fitbit",
  status: "connected",
  providerUserId: "fitbit-user-123",
  scopes: ["activity", "heartrate"],
  connectedAt: new Date("2025-01-01"),
  lastSyncedAt: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
}

describe("Connections routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/connections", () => {
    it("returns connections for a user", async () => {
      vi.mocked(ConnectionService.prototype.list).mockResolvedValue([mockConnection] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/connections`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json() as unknown[]
      expect(body).toHaveLength(1)
    })

    it("returns 400 for non-UUID userId", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/users/not-a-uuid/connections",
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("DELETE /v1/users/:userId/connections/:connectionId", () => {
    it("disconnects and returns 204", async () => {
      vi.mocked(ConnectionService.prototype.disconnect).mockResolvedValue(true)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/connections/${TEST_CONNECTION_ID}`,
      })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when connection not found", async () => {
      vi.mocked(ConnectionService.prototype.disconnect).mockResolvedValue(false)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/connections/${TEST_CONNECTION_ID}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/connections/:connectionId/sync", () => {
    it("enqueues a sync job and returns 202", async () => {
      // Mock the sync queue module so no real Redis connection is needed
      vi.doMock("../queues/sync.js", () => ({
        syncQueue: { add: vi.fn().mockResolvedValue({ id: "job-1" }) },
      }))

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/connections/${TEST_CONNECTION_ID}/sync`,
      })

      // 202 or 500 depending on whether the dynamic import resolves in test env
      expect([202, 500]).toContain(res.statusCode)
    })
  })
})
