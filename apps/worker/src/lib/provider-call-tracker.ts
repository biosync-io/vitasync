import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Lightweight tracker for outbound provider API calls.
 *
 * Wraps `globalThis.fetch` once at startup. Uses AsyncLocalStorage to
 * associate calls with the current sync job context without any changes
 * to provider code.
 */

interface CallStats {
  totalCalls: number
  totalErrors: number
  endpoints: Set<string>
}

const storage = new AsyncLocalStorage<CallStats>()
let installed = false

/** Install the global fetch interceptor (idempotent). */
export function installFetchTracker(): void {
  if (installed) return
  installed = true

  const originalFetch = globalThis.fetch

  globalThis.fetch = async function trackedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const stats = storage.getStore()

    if (stats) {
      stats.totalCalls++
      try {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        // Extract path without query params, mask IDs for grouping
        const parsed = new URL(url)
        stats.endpoints.add(`${init?.method ?? "GET"} ${parsed.hostname}${parsed.pathname}`)
      } catch {
        // Non-URL input — skip endpoint tracking
      }
    }

    try {
      const response = await originalFetch(input, init)
      if (stats && response.status >= 400) {
        stats.totalErrors++
      }
      return response
    } catch (err) {
      if (stats) stats.totalErrors++
      throw err
    }
  }
}

/**
 * Run an async function while tracking all fetch calls it makes.
 * Returns the function result and the accumulated call stats.
 */
export async function trackProviderCalls<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; stats: { totalCalls: number; totalErrors: number; endpoints: string[] } }> {
  const callStats: CallStats = { totalCalls: 0, totalErrors: 0, endpoints: new Set() }

  const result = await storage.run(callStats, fn)

  return {
    result,
    stats: {
      totalCalls: callStats.totalCalls,
      totalErrors: callStats.totalErrors,
      endpoints: [...callStats.endpoints],
    },
  }
}
