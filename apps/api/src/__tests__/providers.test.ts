import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildTestApp } from "./helpers.js"

vi.mock("@biosync-io/provider-core", () => {
  const mockDefinitions = [
    {
      id: "garmin",
      name: "Garmin",
      description: "Garmin Connect",
      capabilities: { oauth1: true, supportedMetrics: ["steps", "heart_rate"] },
      logoUrl: "https://example.com/garmin.png",
    },
    {
      id: "fitbit",
      name: "Fitbit",
      description: "Fitbit Web API",
      capabilities: { oauth1: false, supportedMetrics: ["steps", "sleep"] },
      logoUrl: null,
    },
  ]

  return {
    providerRegistry: {
      listDefinitions: vi.fn(() => mockDefinitions),
      getDefinition: vi.fn((id: string) => mockDefinitions.find((d) => d.id === id) ?? null),
    },
  }
})

import { providerRegistry } from "@biosync-io/provider-core"

describe("Provider routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildTestApp()
  })

  describe("GET /v1/providers", () => {
    it("returns all registered providers", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/providers" })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toHaveLength(2)
      expect(body[0].id).toBe("garmin")
      expect(body[0].authType).toBe("oauth1")
      expect(body[1].authType).toBe("oauth2")
    })
  })

  describe("GET /v1/providers/:providerId", () => {
    it("returns a single provider", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/providers/garmin" })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe("garmin")
      expect(body.name).toBe("Garmin")
    })

    it("returns 404 for unknown provider", async () => {
      vi.mocked(providerRegistry.getDefinition).mockReturnValue(null as never)

      const res = await app.inject({ method: "GET", url: "/v1/providers/unknown" })

      expect(res.statusCode).toBe(404)
    })
  })
})
