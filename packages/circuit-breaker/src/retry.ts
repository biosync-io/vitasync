import { CircuitOpenError } from './errors.js';
import type { RetryOptions } from './types.js';

const DEFAULTS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  jitter: true,
};

/**
 * Execute {@link fn} with exponential back-off retry.
 *
 * Back-off formula: `delay = min(baseDelay × 2^attempt, maxDelay)`.
 * When jitter is enabled the delay is multiplied by a random factor in [0.5, 1.5).
 *
 * {@link CircuitOpenError} is never retried – the circuit is open and further
 * attempts would be pointless.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULTS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Never retry when the circuit is open
      if (err instanceof CircuitOpenError) {
        throw err;
      }

      // Last attempt exhausted
      if (attempt >= opts.maxRetries) {
        throw err;
      }

      // Caller-defined filter decides whether to retry
      if (opts.retryOn && !opts.retryOn(err)) {
        throw err;
      }

      let delay = Math.min(
        opts.baseDelayMs * 2 ** attempt,
        opts.maxDelayMs,
      );

      if (opts.jitter) {
        delay *= 0.5 + Math.random();
      }

      await sleep(delay);
    }
  }

  // Should be unreachable, but satisfies the compiler
  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
