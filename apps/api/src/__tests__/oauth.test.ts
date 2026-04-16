import { beforeEach, describe, expect, it, vi } from "vitest"
import { ConnectionService } from "../services/connection.service.js"
import { buildTestApp, TEST_USER_ID, TEST_WORKSPACE_ID } from "./helpers.js"

// Mock DB so route registration doesn't fail (identity-providers calls getDb() eagerly)
vi.mock("@biosync-io/db", () => {
  const stub = new Proxy({}, { get: (_t, p) => (typeof p === "string" ? `col.${p}` : undefined) })
  return {
    getDb: () =>
      new Proxy(
        {},
        {
          get: () => () =>
            new Proxy(
              {},
              {
                get:
                  () =>
                  (..._a: unknown[]) =>
                    new Proxy({}, { get: () => () => [] }),
              },
            ),
        },
      ),
    providerConnections: stub,
    users: stub,
    identityProviders: stub,
    userIdentities: stub,
    apiKeys: stub,
  }
})

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
    OAUTH_REDIRECT_BASE_URL: "http://localhost:3001",
    JWT_SECRET: "test-jwt-secret-that-is-at-least-32-chars-long",
  },
}))

// Import state helpers after config mock is set up
const { generateState, clearStateStore } = await import("../lib/oauth-state.js")

describe("OAuth routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    clearStateStore()

    const { providerRegistry } = await import("@biosync-io/provider-core")
    vi.mocked(providerRegistry.isRegistered).mockReturnValue(true)

    vi.mocked(ConnectionService.prototype.getAuthorizationUrl).mockResolvedValue({
      url: "https://provider.com/auth?state=placeholder",
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

    it("replaces placeholder state with HMAC-signed state", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/oauth/fitbit/authorize?userId=${TEST_USER_ID}`,
      })

      expect(res.statusCode).toBe(302)
      const location = new URL(res.headers.location as string)
      const state = location.searchParams.get("state")
      expect(state).toBeTruthy()
      // HMAC state format: <base64url>.<signature>
      expect(state).toContain(".")
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

    it("returns 400 when state was signed for a different provider", async () => {
      const state = generateState({
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        providerId: "strava",
      })

      const res = await app.inject({
        method: "GET",
        url: `/v1/oauth/fitbit/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe("OAUTH_STATE_MISMATCH")
    })

    it("returns 400 for replayed state", async () => {
      const state = generateState({
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        providerId: "fitbit",
      })

      vi.mocked(ConnectionService.prototype.completeOAuth2).mockResolvedValue({
        id: "conn-123",
      } as never)

      // First use succeeds
      const res1 = await app.inject({
        method: "GET",
        url: `/v1/oauth/fitbit/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      })
      expect(res1.statusCode).toBe(200)

      // Replay is rejected
      const res2 = await app.inject({
        method: "GET",
        url: `/v1/oauth/fitbit/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      })
      expect(res2.statusCode).toBe(400)
      expect(res2.json().code).toBe("OAUTH_STATE_MISMATCH")
    })

    it("completes OAuth flow with valid state", async () => {
      const state = generateState({
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        providerId: "fitbit",
      })

      vi.mocked(ConnectionService.prototype.completeOAuth2).mockResolvedValue({
        id: "conn-123",
      } as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/oauth/fitbit/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.headers["content-type"]).toContain("text/html")
      expect(res.body).toContain("Connected")
    })
  })
})
