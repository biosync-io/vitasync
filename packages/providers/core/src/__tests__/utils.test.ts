import { describe, expect, it, vi } from "vitest"
import { buildAuthUrl, buildTokenResponse, isTokenExpired } from "../utils.js"

// ── buildTokenResponse ───────────────────────────────────────

describe("buildTokenResponse", () => {
  it("parses a standard OAuth2 token response with expires_in", () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const result = buildTokenResponse({
      access_token: "access-123",
      refresh_token: "refresh-456",
      token_type: "Bearer",
      expires_in: 3600,
    })

    expect(result.accessToken).toBe("access-123")
    expect(result.refreshToken).toBe("refresh-456")
    expect(result.tokenType).toBe("Bearer")
    expect(result.expiresAt).toBeInstanceOf(Date)
    expect(result.expiresAt?.getTime()).toBe(now + 3600 * 1000)
    expect(result.raw).toBeUndefined()

    vi.useRealTimers()
  })

  it("prefers expires_at over expires_in", () => {
    const epochSec = Math.floor(Date.now() / 1000) + 7200

    const result = buildTokenResponse({
      access_token: "at",
      expires_in: 3600,
      expires_at: epochSec,
    })

    expect(result.expiresAt?.getTime()).toBe(epochSec * 1000)
  })

  it("preserves extra fields in raw", () => {
    const result = buildTokenResponse({
      access_token: "at",
      refresh_token: "rt",
      athlete: { id: 42 },
      scope: "read",
    })

    expect(result.raw).toEqual({ athlete: { id: 42 }, scope: "read" })
  })

  it("handles minimal response (access_token only)", () => {
    const result = buildTokenResponse({ access_token: "at" })

    expect(result.accessToken).toBe("at")
    expect(result.refreshToken).toBeUndefined()
    expect(result.tokenType).toBeUndefined()
    expect(result.expiresAt).toBeUndefined()
    expect(result.raw).toBeUndefined()
  })

  it("throws on missing access_token", () => {
    expect(() => buildTokenResponse({ refresh_token: "rt" })).toThrow()
  })

  it("throws on non-object input", () => {
    expect(() => buildTokenResponse("not-an-object")).toThrow()
    expect(() => buildTokenResponse(null)).toThrow()
  })
})

// ── isTokenExpired ───────────────────────────────────────────

describe("isTokenExpired", () => {
  it("returns false when expiresAt is undefined", () => {
    expect(isTokenExpired({})).toBe(false)
  })

  it("returns false when token expires well in the future", () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
    expect(isTokenExpired({ expiresAt: futureDate })).toBe(false)
  })

  it("returns true when token is already expired", () => {
    const pastDate = new Date(Date.now() - 1000)
    expect(isTokenExpired({ expiresAt: pastDate })).toBe(true)
  })

  it("returns true when token expires within the default 5min buffer", () => {
    const almostExpired = new Date(Date.now() + 2 * 60 * 1000) // 2 min from now
    expect(isTokenExpired({ expiresAt: almostExpired })).toBe(true)
  })

  it("respects custom bufferMs", () => {
    const expiresIn10Min = new Date(Date.now() + 10 * 60 * 1000)
    // Not expired with default 5 min buffer
    expect(isTokenExpired({ expiresAt: expiresIn10Min })).toBe(false)
    // Expired with 15 min buffer
    expect(isTokenExpired({ expiresAt: expiresIn10Min }, 15 * 60 * 1000)).toBe(true)
  })

  it("handles ISO string expiresAt (JSON round-trip)", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000)
    expect(isTokenExpired({ expiresAt: future.toISOString() })).toBe(false)

    const past = new Date(Date.now() - 60 * 1000)
    expect(isTokenExpired({ expiresAt: past.toISOString() })).toBe(true)
  })

  it("handles epoch-ms number expiresAt", () => {
    const futureMs = Date.now() + 60 * 60 * 1000
    expect(isTokenExpired({ expiresAt: futureMs })).toBe(false)

    const pastMs = Date.now() - 60 * 1000
    expect(isTokenExpired({ expiresAt: pastMs })).toBe(true)
  })

  it("returns true for invalid date values", () => {
    expect(isTokenExpired({ expiresAt: "not-a-date" })).toBe(true)
    expect(isTokenExpired({ expiresAt: Number.NaN })).toBe(true)
  })
})

// ── buildAuthUrl ─────────────────────────────────────────────

describe("buildAuthUrl", () => {
  it("builds a URL with query parameters", () => {
    const url = buildAuthUrl("https://auth.example.com/authorize", {
      client_id: "abc",
      redirect_uri: "https://app.example.com/callback",
      scope: "read write",
      response_type: "code",
    })

    expect(url.origin).toBe("https://auth.example.com")
    expect(url.pathname).toBe("/authorize")
    expect(url.searchParams.get("client_id")).toBe("abc")
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/callback")
    expect(url.searchParams.get("scope")).toBe("read write")
    expect(url.searchParams.get("response_type")).toBe("code")
  })

  it("preserves existing query parameters on the base URL", () => {
    const url = buildAuthUrl("https://auth.example.com/authorize?existing=1", {
      client_id: "abc",
    })

    expect(url.searchParams.get("existing")).toBe("1")
    expect(url.searchParams.get("client_id")).toBe("abc")
  })

  it("returns a URL instance", () => {
    const url = buildAuthUrl("https://example.com", {})
    expect(url).toBeInstanceOf(URL)
  })
})
