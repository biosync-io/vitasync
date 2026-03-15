import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16 // 128-bit auth tag

/**
 * Encrypts a plaintext string using AES-256-GCM with a random IV.
 *
 * Output format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 *
 * @param plaintext - The string to encrypt
 * @param keyHex - A 64-character hex string (256-bit key), typically `ENCRYPTION_KEY` env var
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex")
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (64 hex chars)")
  }

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

/**
 * Decrypts a string encrypted with `encrypt()`.
 *
 * @param ciphertext - The `<iv>:<authTag>:<data>` string produced by `encrypt()`
 * @param keyHex - The same 64-character hex key used for encryption
 */
export function decrypt(ciphertext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex")
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (64 hex chars)")
  }

  const parts = ciphertext.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format: expected <iv>:<authTag>:<data>")
  }

  const [ivHex, authTagHex, dataHex] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const data = Buffer.from(dataHex, "hex")

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  return decipher.update(data).toString("utf8") + decipher.final("utf8")
}
