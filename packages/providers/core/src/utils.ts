import { createHmac, timingSafeEqual } from "node:crypto"
import type { SyncDataPoint } from "@biosync-io/types"
import { HealthMetricType } from "@biosync-io/types"

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

/** Convert Pounds to Kilograms */
export const lbsToKg = (lbs: number) => lbs * 0.453592

/** Convert Kilograms to Pounds */
export const kgToLbs = (kg: number) => kg / 0.453592

/** Convert miles to meters */
export const milesToMeters = (miles: number) => miles * 1609.344

/** Convert meters to kilometers */
export const metersToKm = (meters: number) => meters / 1000
