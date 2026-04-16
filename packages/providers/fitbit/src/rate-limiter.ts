const DEFAULT_BUDGET = 150
const RESERVE = 5 // stop making requests when this many remain

/**
 * Tracks Fitbit API rate limit budget (150 requests per hour per user).
 *
 * Usage:
 * 1. Call `canRequest()` before each API call
 * 2. Call `update(response)` after each API call to parse rate limit headers
 * 3. Call `waitIfNeeded()` to sleep until the rate limit window resets
 */
export class RateLimitBudget {
  private remaining: number
  private resetSeconds: number

  constructor(initialBudget = DEFAULT_BUDGET) {
    this.remaining = initialBudget
    this.resetSeconds = 0
  }

  /** Whether we have enough budget to make another request. */
  canRequest(): boolean {
    return this.remaining > RESERVE
  }

  /** Update budget from Fitbit response headers. */
  update(headers: { get(name: string): string | null }): void {
    const remaining = headers.get("Fitbit-Rate-Limit-Remaining")
    if (remaining != null) {
      this.remaining = Number(remaining)
    } else {
      this.remaining = Math.max(0, this.remaining - 1)
    }

    const reset = headers.get("Fitbit-Rate-Limit-Reset")
    if (reset != null) {
      this.resetSeconds = Number(reset)
    }
  }

  /**
   * If we're at or below the reserve threshold, wait until the rate limit
   * window resets. Returns immediately if budget is available.
   */
  async waitIfNeeded(): Promise<void> {
    if (this.remaining > RESERVE) return

    const waitMs = Math.max(1000, this.resetSeconds * 1000)
    await new Promise((resolve) => setTimeout(resolve, waitMs))

    // Assume budget is restored after waiting
    this.remaining = DEFAULT_BUDGET
  }

  /** Current remaining request count. */
  getRemaining(): number {
    return this.remaining
  }
}
