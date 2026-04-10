import {
  CircuitBreakerRegistry,
  type CircuitBreaker,
} from "@biosync-io/circuit-breaker"

const registry = new CircuitBreakerRegistry()

/**
 * Return (or lazily create) a per-provider circuit breaker.
 *
 * Each provider gets its own breaker so a single failing API (e.g. Garmin)
 * does not block syncs for healthy providers (e.g. Fitbit).
 */
export function getProviderCircuitBreaker(provider: string): CircuitBreaker {
  const existing = registry.get(provider)
  if (existing) return existing

  return registry.create(provider, {
    failureThreshold: 5,
    resetTimeoutMs: 60_000,
    halfOpenMaxAttempts: 2,
    successThreshold: 2,
    timeout: 30_000,
    onStateChange: (from, to, name) => {
      console.warn(
        JSON.stringify({
          msg: "Circuit breaker state change",
          provider: name,
          from,
          to,
        }),
      )
    },
    onFailure: (error, name) => {
      console.error(
        JSON.stringify({
          msg: "Circuit breaker recorded failure",
          provider: name,
          error: error.message,
        }),
      )
    },
  })
}

/** Snapshot of all provider circuit breaker metrics (for admin dashboards). */
export function getAllProviderMetrics() {
  return registry.getAllMetrics()
}

/** Reset a single provider's circuit breaker back to closed. */
export function resetProviderCircuitBreaker(provider: string): boolean {
  const breaker = registry.get(provider)
  if (!breaker) return false
  breaker.reset()
  return true
}
