import { createHash, randomBytes } from "node:crypto"

const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const KEY_BODY_LENGTH = 32

function toBase62(bytes: Buffer): string {
  let result = ""
  for (const byte of bytes) {
    result += BASE62_CHARS[byte % 62]
  }
  return result
}

export interface GeneratedApiKey {
  /** The full raw key — shown to user ONCE, never stored */
  raw: string
  /** SHA-256 hex hash — stored in DB */
  hash: string
  /** First 12 chars of raw key, displayed in UI for identification */
  prefix: string
}

/**
 * Generates a new API key in the format: `vs_live_<32-char-base62>`
 *
 * Only the `hash` and `prefix` should be persisted. The `raw` key is
 * returned once for display and must never be stored.
 */
export function generateApiKey(): GeneratedApiKey {
  const bodyBytes = randomBytes(KEY_BODY_LENGTH)
  const body = toBase62(bodyBytes)
  const env = process.env.NODE_ENV === "production" ? "live" : "test"
  const raw = `vs_${env}_${body}`

  const hash = createHash("sha256").update(raw).digest("hex")
  const prefix = raw.slice(0, 12)

  return { raw, hash, prefix }
}

/**
 * Hashes a raw key for lookup. Used during authentication to
 * find the matching DB record from an incoming `Authorization` header.
 */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}
