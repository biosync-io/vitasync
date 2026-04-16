import { createHmac, timingSafeEqual } from "node:crypto"
import type { OAuthTokens } from "@biosync-io/types"
import { z } from "zod"

// ── Token Parsing ─────────────────────────────────────────────

/**
 * Zod schema for a standard flat OAuth 2.0 token endpoint response.
 *
 * Handles the common RFC 6749 fields (`access_token`, `refresh_token`,
 * `token_type`, `expires_in`) plus the `expires_at` epoch variant used
 * by providers like Strava.
 *
 * NOTE: This is intentionally scoped to flat responses. Providers with
 * non-standard shapes (e.g. Withings wraps in `body`) should parse
 * their own envelope first, then pass the inner object here.
 */
const oauthTokenResponseSchema = z
  .object({
    access_token: z.string(),
    refresh_token: z.string().optional(),
    token_type: z.string().optional(),
    expires_in: z.number().optional(),
    expires_at: z.number().optional(),
  })
  .passthrough()

/**
 * Parse a standard OAuth 2.0 token endpoint response into `OAuthTokens`.
 *
 * - `expires_at` (epoch seconds) takes precedence over `expires_in`.
 * - Extra fields beyond the standard set are preserved in `raw`.
 */
export function buildTokenResponse(raw: unknown): OAuthTokens {
  const parsed = oauthTokenResponseSchema.parse(raw)

  let expiresAt: Date | undefined
  if (parsed.expires_at != null) {
    expiresAt = new Date(parsed.expires_at * 1000)
  } else if (parsed.expires_in != null) {
    expiresAt = new Date(Date.now() + parsed.expires_in * 1000)
  }

  // Collect extra fields not part of the standard token set
  const { access_token, refresh_token, token_type, expires_in, expires_at, ...extra } = parsed
  const hasExtra = Object.keys(extra).length > 0

  const tokens: OAuthTokens = { accessToken: access_token }
  if (refresh_token !== undefined) tokens.refreshToken = refresh_token
  if (token_type !== undefined) tokens.tokenType = token_type
  if (expiresAt !== undefined) tokens.expiresAt = expiresAt
  if (hasExtra) tokens.raw = extra as Record<string, unknown>

  return tokens
}

// ── Token Expiry ──────────────────────────────────────────────

const DEFAULT_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Check whether an OAuth token is expired (or will expire within `bufferMs`).
 *
 * Handles `Date`, ISO string, and epoch-ms number inputs for `expiresAt`
 * to support JSON-round-tripped token objects.
 *
 * Returns `true` if the token is expired or the timestamp is invalid.
 * Returns `false` if `expiresAt` is undefined (cannot determine expiry).
 */
export function isTokenExpired(
  tokens: { expiresAt?: Date | string | number },
  bufferMs: number = DEFAULT_BUFFER_MS,
): boolean {
  if (tokens.expiresAt == null) return false

  const expiresAt = tokens.expiresAt instanceof Date ? tokens.expiresAt : new Date(tokens.expiresAt)

  if (Number.isNaN(expiresAt.getTime())) return true

  return expiresAt.getTime() - bufferMs <= Date.now()
}

// ── URL Builder ───────────────────────────────────────────────

/**
 * Construct an authorization URL with query parameters appended.
 */
export function buildAuthUrl(base: string, params: Record<string, string>): URL {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url
}

// ── HMAC Verification ─────────────────────────────────────────

/**
 * Verify an HMAC-SHA256 signature in constant time to prevent timing attacks.
 */
export function verifyHmacSignature(
  payload: Buffer,
  signature: string,
  secret: string,
  algorithm: "sha256" | "sha1" = "sha256",
): boolean {
  const expected = createHmac(algorithm, secret).update(payload).digest("hex")
  const expectedBuf = Buffer.from(expected, "hex")
  const receivedBuf = Buffer.from(signature.replace(/^sha\d+=/, ""), "hex")

  if (expectedBuf.length !== receivedBuf.length) return false
  return timingSafeEqual(expectedBuf, receivedBuf)
}

// ── Date Utilities ────────────────────────────────────────────

/**
 * Clamp a date to a valid range (provider APIs often reject far-future dates).
 */
export function clampDate(date: Date, min?: Date, max?: Date): Date {
  let result = date
  if (min && result < min) result = min
  if (max && result > max) result = max
  return result
}

/**
 * Build a default sync window: [startDate, endDate] where endDate defaults to
 * now and startDate defaults to 30 days ago.
 */
export function defaultSyncWindow(opts?: { startDate?: Date; endDate?: Date }) {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  return {
    startDate: opts?.startDate ?? thirtyDaysAgo,
    endDate: opts?.endDate ?? now,
  }
}

// ── Unit Conversions ──────────────────────────────────────────

/** Convert Pounds to Kilograms */
export const lbsToKg = (lbs: number) => lbs * 0.453592

/** Convert Kilograms to Pounds */
export const kgToLbs = (kg: number) => kg / 0.453592

/** Convert miles to meters */
export const milesToMeters = (miles: number) => miles * 1609.344

/** Convert meters to kilometers */
export const metersToKm = (meters: number) => meters / 1000
