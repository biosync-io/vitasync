import { describe, expect, it } from "vitest"
import { decrypt, encrypt } from "../lib/crypto.js"

const VALID_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

describe("AES-256-GCM crypto", () => {
  describe("encrypt / decrypt round-trip", () => {
    it("round-trips a simple string", () => {
      const plaintext = "hello world"
      const ciphertext = encrypt(plaintext, VALID_KEY)
      expect(decrypt(ciphertext, VALID_KEY)).toBe(plaintext)
    })

    it("round-trips JSON token data", () => {
      const tokens = JSON.stringify({
        accessToken: "at_abc123",
        refreshToken: "rt_xyz789",
        expiresAt: "2025-01-01T00:00:00.000Z",
      })
      const ciphertext = encrypt(tokens, VALID_KEY)
      expect(decrypt(ciphertext, VALID_KEY)).toBe(tokens)
    })

    it("round-trips empty string", () => {
      const ciphertext = encrypt("", VALID_KEY)
      expect(decrypt(ciphertext, VALID_KEY)).toBe("")
    })

    it("round-trips unicode and emoji", () => {
      const text = "日本語 🔐 émojis"
      const ciphertext = encrypt(text, VALID_KEY)
      expect(decrypt(ciphertext, VALID_KEY)).toBe(text)
    })
  })

  describe("encrypt", () => {
    it("produces different ciphertext for the same plaintext (random IV)", () => {
      const a = encrypt("same text", VALID_KEY)
      const b = encrypt("same text", VALID_KEY)
      expect(a).not.toBe(b)
    })

    it("produces iv:tag:data hex format", () => {
      const ciphertext = encrypt("test", VALID_KEY)
      const parts = ciphertext.split(":")
      expect(parts).toHaveLength(3)
      // IV = 12 bytes = 24 hex chars
      expect(parts[0]).toHaveLength(24)
      // Auth tag = 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32)
    })

    it("throws for invalid key length", () => {
      expect(() => encrypt("test", "short")).toThrow("32 bytes")
    })
  })

  describe("decrypt", () => {
    it("throws for invalid key length", () => {
      const ciphertext = encrypt("test", VALID_KEY)
      expect(() => decrypt(ciphertext, "short")).toThrow("32 bytes")
    })

    it("throws for malformed ciphertext format", () => {
      expect(() => decrypt("not-valid-format", VALID_KEY)).toThrow("Invalid ciphertext format")
    })

    it("throws for tampered ciphertext (wrong auth tag)", () => {
      const ciphertext = encrypt("test", VALID_KEY)
      const parts = ciphertext.split(":")
      // Tamper with the auth tag
      parts[1] = "00000000000000000000000000000000"
      expect(() => decrypt(parts.join(":"), VALID_KEY)).toThrow()
    })

    it("throws for wrong decryption key", () => {
      const otherKey = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
      const ciphertext = encrypt("secret", VALID_KEY)
      expect(() => decrypt(ciphertext, otherKey)).toThrow()
    })
  })
})
