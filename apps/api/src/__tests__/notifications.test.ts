import { beforeEach, describe, expect, it, vi } from "vitest"
import { NotificationService } from "../services/notification.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/notification.service.js", () => {
  const NotificationService = vi.fn()
  NotificationService.prototype.listChannels = vi.fn()
  NotificationService.prototype.createChannel = vi.fn()
  NotificationService.prototype.updateChannel = vi.fn()
  NotificationService.prototype.deleteChannel = vi.fn()
  NotificationService.prototype.getChannel = vi.fn()
  NotificationService.prototype.listRules = vi.fn()
  NotificationService.prototype.createRule = vi.fn()
  NotificationService.prototype.updateRule = vi.fn()
  NotificationService.prototype.deleteRule = vi.fn()
  NotificationService.prototype.listLogs = vi.fn()
  return { NotificationService }
})

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID }
const channelId = "00000000-0000-0000-0000-000000000091"
const ruleId = "00000000-0000-0000-0000-000000000092"

const mockChannel = {
  id: channelId,
  userId: TEST_USER_ID,
  channelType: "email",
  label: "My Email",
  config: { email: "test@example.com" },
  enabled: true,
}

const mockRule = {
  id: ruleId,
  userId: TEST_USER_ID,
  name: "Critical alerts",
  categories: ["anomaly"],
  minSeverity: "critical",
  channelIds: [channelId],
  enabled: true,
}

describe("Notifications routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  // ─── Channel CRUD ───────────────────────────────────────────

  describe("GET /v1/users/:userId/notifications/channels", () => {
    it("returns notification channels", async () => {
      vi.mocked(NotificationService.prototype.listChannels).mockResolvedValue([mockChannel] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/notifications/channels`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/notifications/channels`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/notifications/channels", () => {
    it("creates a channel and returns 201", async () => {
      vi.mocked(NotificationService.prototype.createChannel).mockResolvedValue(mockChannel as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/notifications/channels`,
        payload: {
          channelType: "email",
          label: "My Email",
          config: { email: "test@example.com" },
        },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 400 for invalid channel type", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/notifications/channels`,
        payload: {
          channelType: "invalid",
          label: "Bad Channel",
          config: {},
        },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("PUT /v1/users/:userId/notifications/channels/:channelId", () => {
    it("updates a channel", async () => {
      vi.mocked(NotificationService.prototype.updateChannel).mockResolvedValue({
        ...mockChannel,
        label: "Updated",
      } as never)

      const res = await app.inject({
        method: "PUT",
        url: `/v1/users/${TEST_USER_ID}/notifications/channels/${channelId}`,
        payload: { label: "Updated" },
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when channel not found", async () => {
      vi.mocked(NotificationService.prototype.updateChannel).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "PUT",
        url: `/v1/users/${TEST_USER_ID}/notifications/channels/${channelId}`,
        payload: { label: "Updated" },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("DELETE /v1/users/:userId/notifications/channels/:channelId", () => {
    it("deletes a channel and returns 204", async () => {
      vi.mocked(NotificationService.prototype.deleteChannel).mockResolvedValue(true as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/notifications/channels/${channelId}`,
      })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when channel not found", async () => {
      vi.mocked(NotificationService.prototype.deleteChannel).mockResolvedValue(false as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/notifications/channels/${channelId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  // ─── Rule CRUD ──────────────────────────────────────────────

  describe("GET /v1/users/:userId/notifications/rules", () => {
    it("returns notification rules", async () => {
      vi.mocked(NotificationService.prototype.listRules).mockResolvedValue([mockRule] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/notifications/rules`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })
  })

  describe("POST /v1/users/:userId/notifications/rules", () => {
    it("creates a rule and returns 201", async () => {
      vi.mocked(NotificationService.prototype.createRule).mockResolvedValue(mockRule as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/notifications/rules`,
        payload: {
          name: "Critical alerts",
          categories: ["anomaly"],
          minSeverity: "critical",
          channelIds: [channelId],
        },
      })

      expect(res.statusCode).toBe(201)
    })
  })

  describe("PUT /v1/users/:userId/notifications/rules/:ruleId", () => {
    it("updates a rule", async () => {
      vi.mocked(NotificationService.prototype.updateRule).mockResolvedValue({
        ...mockRule,
        enabled: false,
      } as never)

      const res = await app.inject({
        method: "PUT",
        url: `/v1/users/${TEST_USER_ID}/notifications/rules/${ruleId}`,
        payload: { enabled: false },
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when rule not found", async () => {
      vi.mocked(NotificationService.prototype.updateRule).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "PUT",
        url: `/v1/users/${TEST_USER_ID}/notifications/rules/${ruleId}`,
        payload: { enabled: false },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("DELETE /v1/users/:userId/notifications/rules/:ruleId", () => {
    it("deletes a rule and returns 204", async () => {
      vi.mocked(NotificationService.prototype.deleteRule).mockResolvedValue(true as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/notifications/rules/${ruleId}`,
      })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when rule not found", async () => {
      vi.mocked(NotificationService.prototype.deleteRule).mockResolvedValue(false as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/notifications/rules/${ruleId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  // ─── Delivery Logs ─────────────────────────────────────────

  describe("GET /v1/users/:userId/notifications/logs", () => {
    it("returns notification logs", async () => {
      const mockLogs = [{ id: "log1", channelId, deliveredAt: new Date() }]
      vi.mocked(NotificationService.prototype.listLogs).mockResolvedValue(mockLogs as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/notifications/logs`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })
  })
})
