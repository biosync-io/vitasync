import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

/**
 * Field-level AES-256-GCM encryption for PII at rest.
 *
 * Two modes:
 * - **Probabilistic** (default): unique IV per encryption → same plaintext
 *   produces different ciphertext.  Use for non-indexed fields.
 * - **Deterministic**: IV derived from plaintext hash (AES-SIV-like) →
 *   same plaintext always produces the same ciphertext.  Use for indexed
 *   lookups (e.g. email search).
 *
 * Format: `v1:<iv-hex>:<ciphertext-hex>:<auth-tag-hex>`
 */

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16
const PREFIX = "v1:"

let _keyBuffer: Buffer | null = null

function getKey(): Buffer {
  if (_keyBuffer) return _keyBuffer
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes)")
  }
  _keyBuffer = Buffer.from(hex, "hex")
  return _keyBuffer
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns the `v1:<iv>:<ciphertext>:<tag>` format.
 */
export function encryptField(plaintext: string, deterministic = false): string {
  const key = getKey()
  const iv = deterministic
    ? createHash("sha256").update(plaintext).digest().subarray(0, IV_LENGTH)
    : randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${PREFIX}${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`
}

/**
 * Decrypt a `v1:<iv>:<ciphertext>:<tag>` string back to plaintext.
 * Returns the original string if the input is not encrypted (graceful fallback).
 */
export function decryptField(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) return ciphertext // not encrypted → passthrough

  const parts = ciphertext.slice(PREFIX.length).split(":")
  if (parts.length !== 3) return ciphertext

  const [ivHex, dataHex, tagHex] = parts as [string, string, string]
  const key = getKey()
  const iv = Buffer.from(ivHex, "hex")
  const data = Buffer.from(dataHex, "hex")
  const tag = Buffer.from(tagHex, "hex")

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}

/**
 * Check whether a value is already encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX)
}
