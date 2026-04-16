import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-that-is-at-least-32-chars-long-for-hmac",
  },
}))

const { generateState, verifyState, clearStateStore } = await import("../lib/oauth-state.js")

const VALID_PAYLOAD = {
  userId: "00000000-0000-0000-0000-000000000003",
  workspaceId: "00000000-0000-0000-0000-000000000001",
  providerId: "fitbit",
}

describe("OAuth state management", () => {
  afterEach(() => {
    clearStateStore()
    vi.useRealTimers()
  })

  describe("generateState", () => {
    it("produces a string with base64url.signature format", () => {
      const state = generateState(VALID_PAYLOAD)
      expect(state).toContain(".")
      const parts = state.split(".")
      expect(parts).toHaveLength(2)
      expect(parts[0]?.length).toBeGreaterThan(0)
      expect(parts[1]?.length).toBeGreaterThan(0)
    })

    it("generates unique states for the same payload", () => {
      const a = generateState(VALID_PAYLOAD)
      const b = generateState(VALID_PAYLOAD)
      expect(a).not.toBe(b)
    })

    it("encodes payload data in the state", () => {
      const state = generateState(VALID_PAYLOAD)
      const dataBase64 = state.split(".")[0]
      const payload = JSON.parse(Buffer.from(dataBase64 ?? "", "base64url").toString())
      expect(payload.userId).toBe(VALID_PAYLOAD.userId)
      expect(payload.workspaceId).toBe(VALID_PAYLOAD.workspaceId)
      expect(payload.providerId).toBe(VALID_PAYLOAD.providerId)
      expect(payload.expiresAt).toBeTypeOf("number")
      expect(payload.nonce).toBeTypeOf("string")
    })
  })

  describe("verifyState", () => {
    it("returns payload for a valid state", () => {
      const state = generateState(VALID_PAYLOAD)
      const result = verifyState(state)

      expect(result).not.toBeNull()
      expect(result?.userId).toBe(VALID_PAYLOAD.userId)
      expect(result?.workspaceId).toBe(VALID_PAYLOAD.workspaceId)
      expect(result?.providerId).toBe(VALID_PAYLOAD.providerId)
    })

    it("returns null for tampered payload", () => {
      const state = generateState(VALID_PAYLOAD)
      // Modify the payload portion
      const tampered = `${Buffer.from('{"tamperedData":"evil"}').toString("base64url")}.${state.split(".")[1]}`
      expect(verifyState(tampered)).toBeNull()
    })

    it("returns null for tampered signature", () => {
      const state = generateState(VALID_PAYLOAD)
      const parts = state.split(".")
      const tampered = `${parts[0]}.invalidsignature`
      expect(verifyState(tampered)).toBeNull()
    })

    it("returns null for expired state", () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const state = generateState(VALID_PAYLOAD)

      // Advance time past the 10-minute expiry
      vi.setSystemTime(now + 11 * 60 * 1000)

      expect(verifyState(state)).toBeNull()
    })

    it("returns null for malformed state (no dot)", () => {
      expect(verifyState("nodotformat")).toBeNull()
    })

    it("returns null for empty string", () => {
      expect(verifyState("")).toBeNull()
    })

    it("returns null for state with empty parts", () => {
      expect(verifyState(".")).toBeNull()
      expect(verifyState("abc.")).toBeNull()
      expect(verifyState(".abc")).toBeNull()
    })

    it("returns null for invalid base64 payload", () => {
      expect(verifyState("not-valid-base64!@#.fakesig")).toBeNull()
    })

    it("returns null for replay (state consumed twice)", () => {
      const state = generateState(VALID_PAYLOAD)

      const first = verifyState(state)
      expect(first).not.toBeNull()

      const second = verifyState(state)
      expect(second).toBeNull()
    })
  })

  describe("server-side data (PKCE)", () => {
    it("stores and retrieves codeVerifier", () => {
      const state = generateState(VALID_PAYLOAD, {
        codeVerifier: "test-verifier-abc",
      })

      const result = verifyState(state)
      expect(result).not.toBeNull()
      expect(result?.codeVerifier).toBe("test-verifier-abc")
    })

    it("stores and retrieves requestTokenSecret", () => {
      const state = generateState(VALID_PAYLOAD, {
        requestTokenSecret: "oauth1-secret",
      })

      const result = verifyState(state)
      expect(result).not.toBeNull()
      expect(result?.requestTokenSecret).toBe("oauth1-secret")
    })

    it("does not return server-side data on replay", () => {
      const state = generateState(VALID_PAYLOAD, {
        codeVerifier: "secret-verifier",
      })

      verifyState(state) // consume
      const replay = verifyState(state)
      expect(replay).toBeNull()
    })
  })
})
