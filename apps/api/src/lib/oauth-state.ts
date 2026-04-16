import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { config } from "../config.js"

interface StatePayload {
  userId: string
  workspaceId: string
  providerId: string
}

interface VerifiedState extends StatePayload {
  expiresAt: number
}

const STATE_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Consumed states — prevents replay attacks.
 * Stores consumed state signatures with their expiry time for cleanup.
 */
const consumedStates = new Map<string, number>()

/**
 * Server-side data associated with a state token (e.g., PKCE code verifier).
 * Keyed by the state signature for quick lookup.
 */
const stateData = new Map<string, { codeVerifier?: string; requestTokenSecret?: string }>()

/** Remove expired entries from tracking maps. */
function cleanExpired(): void {
  const now = Date.now()
  for (const [key, expiresAt] of consumedStates) {
    if (now > expiresAt) consumedStates.delete(key)
  }
  for (const [key] of stateData) {
    // stateData entries that aren't consumed within 2x expiry are stale
    if (!stateData.has(key)) continue
  }
}

/**
 * Generate an HMAC-SHA256 signed OAuth state token.
 *
 * Format: `<base64url-encoded-payload>.<base64url-signature>`
 *
 * The payload contains `{ userId, workspaceId, providerId, expiresAt, nonce }`.
 * A nonce ensures uniqueness even for identical payload fields.
 */
export function generateState(
  payload: StatePayload,
  extra?: { codeVerifier?: string; requestTokenSecret?: string },
): string {
  cleanExpired()

  const expiresAt = Date.now() + STATE_EXPIRY_MS
  const nonce = randomBytes(16).toString("hex")
  const data = JSON.stringify({ ...payload, expiresAt, nonce })
  const dataBase64 = Buffer.from(data).toString("base64url")
  const signature = createHmac("sha256", config.JWT_SECRET).update(dataBase64).digest("base64url")

  if (extra?.codeVerifier !== undefined || extra?.requestTokenSecret !== undefined) {
    stateData.set(signature, extra)
  }

  return `${dataBase64}.${signature}`
}

/**
 * Verify and consume an HMAC-signed OAuth state token.
 *
 * Returns the decoded payload on success, or `null` if:
 * - the token is malformed
 * - the signature is invalid
 * - the token has expired
 * - the token has already been consumed (replay)
 *
 * On success, any associated server-side data (e.g., PKCE verifier)
 * is returned alongside the payload and then purged.
 */
export function verifyState(
  state: string,
): (VerifiedState & { codeVerifier?: string; requestTokenSecret?: string }) | null {
  try {
    const dotIndex = state.lastIndexOf(".")
    if (dotIndex === -1) return null

    const dataBase64 = state.slice(0, dotIndex)
    const signature = state.slice(dotIndex + 1)
    if (!dataBase64 || !signature) return null

    const expected = createHmac("sha256", config.JWT_SECRET).update(dataBase64).digest("base64url")

    // Constant-time comparison — must check lengths first
    const expectedBuf = Buffer.from(expected)
    const signatureBuf = Buffer.from(signature)
    if (expectedBuf.length !== signatureBuf.length) return null
    if (!timingSafeEqual(expectedBuf, signatureBuf)) return null

    const payload = JSON.parse(Buffer.from(dataBase64, "base64url").toString()) as {
      userId?: string
      workspaceId?: string
      providerId?: string
      expiresAt?: number
      nonce?: string
    }

    // Validate required fields
    if (
      typeof payload.userId !== "string" ||
      typeof payload.workspaceId !== "string" ||
      typeof payload.providerId !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null
    }

    // Check expiry
    if (payload.expiresAt < Date.now()) return null

    // Replay protection — each state can only be consumed once
    if (consumedStates.has(signature)) return null
    consumedStates.set(signature, payload.expiresAt)

    // Retrieve and purge associated server-side data
    const extra = stateData.get(signature)
    stateData.delete(signature)

    return {
      userId: payload.userId,
      workspaceId: payload.workspaceId,
      providerId: payload.providerId,
      expiresAt: payload.expiresAt,
      ...extra,
    }
  } catch {
    return null
  }
}

/**
 * Clear all state tracking data. For testing only.
 */
export function clearStateStore(): void {
  consumedStates.clear()
  stateData.clear()
}
