import { beforeEach, describe, expect, it, vi } from "vitest"
import { WebhookService } from "../services/webhook.service.js"
import { TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/webhook.service.js", () => {
  const WebhookService = vi.fn()
  WebhookService.prototype.create = vi.fn()
  WebhookService.prototype.list = vi.fn()
  WebhookService.prototype.getById = vi.fn()
  WebhookService.prototype.update = vi.fn()
  WebhookService.prototype.delete = vi.fn()
  WebhookService.prototype.listDeliveries = vi.fn()
  return { WebhookService }
})

const webhookId = "00000000-0000-0000-0000-000000000090"

const mockWebhook = {
  id: webhookId,
  workspaceId: TEST_WORKSPACE_ID,
  url: "https://example.com/webhook",
  events: ["sync.completed"],
  isActive: true,
  createdAt: new Date("2025-06-01"),
}

describe("Webhook routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await buildTestApp()
  })

  describe("GET /v1/webhooks", () => {
    it("returns workspace webhooks", async () => {
      vi.mocked(WebhookService.prototype.list).mockResolvedValue([mockWebhook] as never)

      const res = await app.inject({ method: "GET", url: "/v1/webhooks" })

      expect(res.statusCode).toBe(200)
    })
  })

  describe("POST /v1/webhooks", () => {
    it("creates a webhook and returns 201", async () => {
      vi.mocked(WebhookService.prototype.create).mockResolvedValue(mockWebhook as never)

      const res = await app.inject({
        method: "POST",
        url: "/v1/webhooks",
        payload: {
          url: "https://example.com/webhook",
          secret: "supersecretvalue16chars",
          events: ["sync.completed"],
        },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 400 when secret is too short", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/webhooks",
        payload: {
          url: "https://example.com/webhook",
          secret: "short",
          events: ["sync.completed"],
        },
      })

      expect(res.statusCode).toBe(400)
    })

    it("returns 400 when events array is empty", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/webhooks",
        payload: {
          url: "https://example.com/webhook",
          secret: "supersecretvalue16chars",
          events: [],
        },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/webhooks/:webhookId", () => {
    it("returns a single webhook", async () => {
      vi.mocked(WebhookService.prototype.getById).mockResolvedValue(mockWebhook as never)

      const res = await app.inject({ method: "GET", url: `/v1/webhooks/${webhookId}` })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when not found", async () => {
      vi.mocked(WebhookService.prototype.getById).mockResolvedValue(null as never)

      const res = await app.inject({ method: "GET", url: `/v1/webhooks/${webhookId}` })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("PATCH /v1/webhooks/:webhookId", () => {
    it("updates a webhook", async () => {
      vi.mocked(WebhookService.prototype.update).mockResolvedValue({ ...mockWebhook, isActive: false } as never)

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/webhooks/${webhookId}`,
        payload: { isActive: false },
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when webhook not found", async () => {
      vi.mocked(WebhookService.prototype.update).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/webhooks/${webhookId}`,
        payload: { isActive: false },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("DELETE /v1/webhooks/:webhookId", () => {
    it("deletes a webhook and returns 204", async () => {
      vi.mocked(WebhookService.prototype.delete).mockResolvedValue(true as never)

      const res = await app.inject({ method: "DELETE", url: `/v1/webhooks/${webhookId}` })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when webhook not found", async () => {
      vi.mocked(WebhookService.prototype.delete).mockResolvedValue(false as never)

      const res = await app.inject({ method: "DELETE", url: `/v1/webhooks/${webhookId}` })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/webhooks/:webhookId/deliveries", () => {
    it("returns webhook deliveries", async () => {
      const mockDeliveries = [{ id: "d1", webhookId, statusCode: 200, deliveredAt: new Date() }]
      vi.mocked(WebhookService.prototype.listDeliveries).mockResolvedValue(mockDeliveries as never)

      const res = await app.inject({ method: "GET", url: `/v1/webhooks/${webhookId}/deliveries` })

      expect(res.statusCode).toBe(200)
    })
  })
})
