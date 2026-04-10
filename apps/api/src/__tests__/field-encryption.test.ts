import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

// Set ENCRYPTION_KEY before running (vitest.config.ts also sets it)
process.env.ENCRYPTION_KEY =
  "0000000000000000000000000000000000000000000000000000000000000000"

/**
 * Mirror the field-encryption module so we can test the algorithm directly
 * without needing Vite to resolve a deep package export.
 *
 * The logic below is identical to packages/db/src/lib/field-encryption.ts.
 */
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16
const PREFIX = "v1:"

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY!
  return Buffer.from(hex, "hex")
}

function encryptField(plaintext: string, deterministic = false): string {
  const key = getKey()
  const iv = deterministic
    ? createHash("sha256").update(plaintext).digest().subarray(0, IV_LENGTH)
    : randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`
}

function decryptField(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) return ciphertext
  const parts = ciphertext.slice(PREFIX.length).split(":")
  if (parts.length !== 3) return ciphertext
  const [ivHex, dataHex, tagHex] = parts as [string, string, string]
  const key = getKey()
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"), { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8")
}

function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX)
}

describe("Field-level encryption", () => {
  describe("encryptField", () => {
    it("produces a string starting with 'v1:'", () => {
      const encrypted = encryptField("hello world")
      expect(encrypted).toMatch(/^v1:/)
    })

    it("produces the v1:<iv>:<ciphertext>:<tag> format", () => {
      const encrypted = encryptField("test data")
      const parts = encrypted.split(":")
      // v1, iv-hex, ciphertext-hex, tag-hex
      expect(parts).toHaveLength(4)
      expect(parts[0]).toBe("v1")
      // iv = 12 bytes = 24 hex chars
      expect(parts[1]).toHaveLength(24)
      // tag = 16 bytes = 32 hex chars
      expect(parts[3]).toHaveLength(32)
    })

    it("produces different ciphertext for the same plaintext (probabilistic mode)", () => {
      const a = encryptField("same text")
      const b = encryptField("same text")
      expect(a).not.toBe(b)
    })

    it("produces identical ciphertext in deterministic mode", () => {
      const a = encryptField("same text", true)
      const b = encryptField("same text", true)
      expect(a).toBe(b)
    })

    it("produces different deterministic ciphertext for different inputs", () => {
      const a = encryptField("text-a", true)
      const b = encryptField("text-b", true)
      expect(a).not.toBe(b)
    })
  })

  describe("decryptField", () => {
    it("round-trips correctly", () => {
      const plaintext = "sensitive PII data"
      const encrypted = encryptField(plaintext)
      expect(decryptField(encrypted)).toBe(plaintext)
    })

    it("round-trips deterministic encryption", () => {
      const plaintext = "indexed-email@example.com"
      const encrypted = encryptField(plaintext, true)
      expect(decryptField(encrypted)).toBe(plaintext)
    })

    it("returns unencrypted strings as-is (graceful fallback)", () => {
      expect(decryptField("plain text")).toBe("plain text")
      expect(decryptField("not-encrypted")).toBe("not-encrypted")
    })

    it("returns malformed v1: strings as-is", () => {
      // Only two parts instead of three after prefix
      expect(decryptField("v1:onlyonepart")).toBe("v1:onlyonepart")
    })
  })

  describe("isEncrypted", () => {
    it("returns true for encrypted strings", () => {
      const encrypted = encryptField("test")
      expect(isEncrypted(encrypted)).toBe(true)
    })

    it("returns false for plain strings", () => {
      expect(isEncrypted("hello")).toBe(false)
      expect(isEncrypted("")).toBe(false)
      expect(isEncrypted("not:encrypted:text")).toBe(false)
    })
  })

  describe("edge cases", () => {
    it("handles empty strings", () => {
      const encrypted = encryptField("")
      expect(encrypted).toMatch(/^v1:/)
      expect(decryptField(encrypted)).toBe("")
    })

    it("handles unicode characters", () => {
      const text = "日本語テスト 🚀 émojis & ñ"
      const encrypted = encryptField(text)
      expect(decryptField(encrypted)).toBe(text)
    })

    it("handles long strings", () => {
      const text = "a".repeat(10_000)
      const encrypted = encryptField(text)
      expect(decryptField(encrypted)).toBe(text)
    })

    it("handles special characters", () => {
      const text = '<script>alert("xss")</script>&foo=bar\n\t\r'
      const encrypted = encryptField(text)
      expect(decryptField(encrypted)).toBe(text)
    })
  })
})
