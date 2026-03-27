import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Lightweight tracker for outbound provider API calls.
 *
 * Wraps `globalThis.fetch` once at startup. Uses AsyncLocalStorage to
 * associate calls with the current sync job context without any changes
 * to provider code.
 */

interface EndpointStats {
  calls: number
  success: number
  errors: number
}

interface CallStats {
  totalCalls: number
  totalErrors: number
  byEndpoint: Map<string, EndpointStats>
}

const storage = new AsyncLocalStorage<CallStats>()
let installed = false

function resolveEndpoint(input: RequestInfo | URL, init?: RequestInit): string {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const parsed = new URL(url)
    return `${init?.method ?? "GET"} ${parsed.hostname}${parsed.pathname}`
  } catch {
    return "UNKNOWN"
  }
}

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
    if (!stats) return originalFetch(input, init)

    stats.totalCalls++
    const endpoint = resolveEndpoint(input, init)
    const ep = stats.byEndpoint.get(endpoint) ?? { calls: 0, success: 0, errors: 0 }
    ep.calls++

    try {
      const response = await originalFetch(input, init)
      if (response.status >= 400) {
        stats.totalErrors++
        ep.errors++
      } else {
        ep.success++
      }
      stats.byEndpoint.set(endpoint, ep)
      return response
    } catch (err) {
      stats.totalErrors++
      ep.errors++
      stats.byEndpoint.set(endpoint, ep)
      throw err
    }
  }
}

export interface ProviderCallStatsResult {
  totalCalls: number
  totalErrors: number
  endpoints: Array<{ endpoint: string; calls: number; success: number; errors: number }>
}

/**
 * Run an async function while tracking all fetch calls it makes.
 * Returns the function result and the accumulated call stats.
 */
export async function trackProviderCalls<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; stats: ProviderCallStatsResult }> {
  const callStats: CallStats = { totalCalls: 0, totalErrors: 0, byEndpoint: new Map() }

  const result = await storage.run(callStats, fn)

  return {
    result,
    stats: {
      totalCalls: callStats.totalCalls,
      totalErrors: callStats.totalErrors,
      endpoints: [...callStats.byEndpoint.entries()]
        .map(([endpoint, s]) => ({ endpoint, ...s }))
        .sort((a, b) => b.calls - a.calls),
    },
  }
}
