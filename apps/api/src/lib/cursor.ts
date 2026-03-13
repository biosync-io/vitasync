/**
 * Cursor utilities for stable cursor-based pagination.
 *
 * Cursors are opaque base64-encoded strings that encode the last seen row's
 * (id, timestamp) pair. This ensures consistent results even as rows are added
 * or deleted between pages.
 *
 * Format: base64(JSON.stringify({ id, ts }))
 */

interface CursorPayload {
  id: string
  ts: string // ISO timestamp
}

export function encodeCursor(id: string, ts: Date): string {
  const payload: CursorPayload = { id, ts: ts.toISOString() }
  return Buffer.from(JSON.stringify(payload)).toString("base64url")
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf-8")
    const parsed = JSON.parse(json) as unknown
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)["id"] !== "string" ||
      typeof (parsed as Record<string, unknown>)["ts"] !== "string"
    ) {
      throw new Error("Invalid cursor shape")
    }
    return parsed as CursorPayload
  } catch {
    throw new Error(`Invalid pagination cursor: ${cursor}`)
  }
}
