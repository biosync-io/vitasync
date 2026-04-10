import { withRetry } from "@biosync-io/circuit-breaker"
import { getProviderCircuitBreaker } from "./circuit-breakers.js"

/**
 * Execute a provider API call through the circuit breaker **and** retry wrapper.
 *
 * Order of execution:
 *   circuit breaker → withRetry → actual provider call
 *
 * The circuit breaker gates the overall call; inside that gate, transient
 * failures are retried with exponential back-off + jitter.
 */
export async function resilientProviderCall<T>(
  provider: string,
  operation: () => Promise<T>,
  options?: { maxRetries?: number },
): Promise<T> {
  const breaker = getProviderCircuitBreaker(provider)
  return breaker.execute(() =>
    withRetry(operation, {
      maxRetries: options?.maxRetries ?? 3,
      baseDelayMs: 1_000,
      maxDelayMs: 15_000,
      jitter: true,
    }),
  )
}
