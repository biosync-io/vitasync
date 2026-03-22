import { beforeEach, describe, expect, it, vi } from "vitest"
import { ConnectionService } from "../services/connection.service.js"
import { buildTestApp } from "./helpers.js"

vi.mock("../services/connection.service.js", () => {
  const ConnectionService = vi.fn()
  ConnectionService.prototype.getAuthorizationUrl = vi.fn()
  ConnectionService.prototype.completeOAuth2 = vi.fn()
  return { ConnectionService }
})

vi.mock("@biosync-io/provider-core", () => ({
  providerRegistry: {
    isRegistered: vi.fn().mockReturnValue(true),
    resolve: vi.fn().mockReturnValue({}),
  },
}))

vi.mock("../../config.js", () => ({
  config: {
    OAUTH_REDIRECT_BASE_URL: "http://localhost:3000",
  },
}))

const TEST_USER_ID = "00000000-0000-0000-0000-000000000003"

describe("OAuth routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()

    const { providerRegistry } = await import("@biosync-io/provider-core")
    vi.mocked(providerRegistry.isRegistered).mockReturnValue(true)

    vi.mocked(ConnectionService.prototype.getAuthorizationUrl).mockResolvedValue({
      url: "https://provider.com/auth?state=test",
      codeVerifier: undefined,
    } as never)

    app = await buildTestApp()
  })

  describe("GET /v1/oauth/:providerId/authorize", () => {
    it("redirects to provider authorization URL", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/oauth/fitbit/authorize?userId=${TEST_USER_ID}`,
      })

      expect(res.statusCode).toBe(302)
      expect(res.headers.location).toContain("https://provider.com/auth")
    })

    it("returns 404 for unregistered provider", async () => {
      const { providerRegistry } = await import("@biosync-io/provider-core")
      vi.mocked(providerRegistry.isRegistered).mockReturnValue(false)

      const res = await app.inject({
        method: "GET",
        url: `/v1/oauth/unknown/authorize?userId=${TEST_USER_ID}`,
      })

      expect(res.statusCode).toBe(404)
    })

    it("returns 400 when userId is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/oauth/fitbit/authorize",
      })

      expect(res.statusCode).toBe(400)
    })

    it("returns 400 when userId is not a valid UUID", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/oauth/fitbit/authorize?userId=not-a-uuid",
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/oauth/:providerId/callback", () => {
    it("returns 400 when code is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/oauth/fitbit/callback?state=some-state",
      })

      expect(res.statusCode).toBe(400)
    })

    it("returns 400 when state is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/oauth/fitbit/callback?code=some-code",
      })

      expect(res.statusCode).toBe(400)
    })

    it("returns 400 when OAuth error is present", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/oauth/fitbit/callback?error=access_denied&error_description=User+denied+access",
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe("OAUTH_ERROR")
    })

    it("returns 400 for invalid/expired state", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/oauth/fitbit/callback?code=auth-code&state=invalid-state",
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe("OAUTH_STATE_MISMATCH")
    })
  })
})
