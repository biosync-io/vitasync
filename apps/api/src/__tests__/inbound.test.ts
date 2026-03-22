import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ConnectionService } from "../services/connection.service.js"
import { HealthDataService } from "../services/health-data.service.js"
import { buildTestApp } from "./helpers.js"

vi.mock("../services/connection.service.js", () => {
  const ConnectionService = vi.fn()
  ConnectionService.prototype.findByProviderUserId = vi.fn()
  return { ConnectionService }
})

vi.mock("../services/health-data.service.js", () => {
  const HealthDataService = vi.fn()
  HealthDataService.prototype.ingest = vi.fn()
  return { HealthDataService }
})

vi.mock("@biosync-io/provider-core", () => {
  const mockProvider = {
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    extractProviderUserId: vi.fn().mockReturnValue("provider-user-123"),
    processWebhook: vi.fn().mockResolvedValue([{ type: "heart_rate", value: 72 }]),
  }
  return {
    providerRegistry: {
      isRegistered: vi.fn().mockReturnValue(true),
      resolve: vi.fn().mockReturnValue(mockProvider),
    },
  }
})

const mockConnection = {
  id: "00000000-0000-0000-0000-000000000070",
  userId: "00000000-0000-0000-0000-000000000003",
  providerId: "fitbit",
}

describe("Inbound routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>
  const originalEnv = process.env

  beforeEach(async () => {
    vi.resetAllMocks()
    process.env = { ...originalEnv, FITBIT_WEBHOOK_SECRET: "test-secret" }

    // Re-apply mocks after reset
    const { providerRegistry } = await import("@biosync-io/provider-core")
    vi.mocked(providerRegistry.isRegistered).mockReturnValue(true)
    const mockProvider = {
      verifyWebhookSignature: vi.fn().mockReturnValue(true),
      extractProviderUserId: vi.fn().mockReturnValue("provider-user-123"),
      processWebhook: vi.fn().mockResolvedValue([{ type: "heart_rate", value: 72 }]),
    }
    vi.mocked(providerRegistry.resolve).mockReturnValue(mockProvider as never)

    vi.mocked(ConnectionService.prototype.findByProviderUserId).mockResolvedValue(mockConnection as never)

    app = await buildTestApp()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("POST /v1/inbound/:providerId/webhook", () => {
    it("processes a valid webhook and returns 200", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/inbound/fitbit/webhook",
        payload: { data: "test" },
        headers: {
          "x-webhook-signature": "valid-sig",
          "x-provider-user-id": "provider-user-123",
        },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ received: true })
    })

    it("returns 404 for unregistered provider", async () => {
      const { providerRegistry } = await import("@biosync-io/provider-core")
      vi.mocked(providerRegistry.isRegistered).mockReturnValue(false)

      const res = await app.inject({
        method: "POST",
        url: "/v1/inbound/unknown/webhook",
        payload: { data: "test" },
      })

      expect(res.statusCode).toBe(404)
    })

    it("returns 200 when no connection found (acknowledges)", async () => {
      vi.mocked(ConnectionService.prototype.findByProviderUserId).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "POST",
        url: "/v1/inbound/fitbit/webhook",
        payload: { data: "test" },
        headers: {
          "x-webhook-signature": "valid-sig",
          "x-provider-user-id": "provider-user-123",
        },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ received: true })
    })
  })
})
