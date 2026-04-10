import { performance } from 'node:perf_hooks';
import { CircuitOpenError, CircuitTimeoutError } from './errors.js';
import type {
  CircuitBreakerOptions,
  CircuitBreakerMetrics,
  CircuitBreakerState,
} from './types.js';

const DEFAULTS = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 3,
  successThreshold: 2,
  volumeThreshold: 10,
} as const;

interface ResolvedOptions {
  name: string;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  successThreshold: number;
  volumeThreshold: number;
  timeout: number | undefined;
  errorFilter: ((error: Error) => boolean) | undefined;
  onStateChange:
    | ((
        from: CircuitBreakerState,
        to: CircuitBreakerState,
        name: string,
      ) => void)
    | undefined;
  onSuccess: ((duration: number, name: string) => void) | undefined;
  onFailure: ((error: Error, name: string) => void) | undefined;
  logger:
    | { info: Function; warn: Function; error: Function }
    | undefined;
}

export class CircuitBreaker {
  private readonly opts: ResolvedOptions;

  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;

  private openedAt: number | null = null;
  private halfOpenAttempts = 0;
  private halfOpenSuccesses = 0;

  /** Sliding window of recent request outcomes for failure-rate tracking */
  private readonly window: boolean[] = [];

  constructor(options: CircuitBreakerOptions) {
    this.opts = {
      name: options.name,
      failureThreshold: options.failureThreshold ?? DEFAULTS.failureThreshold,
      resetTimeoutMs: options.resetTimeoutMs ?? DEFAULTS.resetTimeoutMs,
      halfOpenMaxAttempts:
        options.halfOpenMaxAttempts ?? DEFAULTS.halfOpenMaxAttempts,
      successThreshold: options.successThreshold ?? DEFAULTS.successThreshold,
      volumeThreshold: options.volumeThreshold ?? DEFAULTS.volumeThreshold,
      timeout: options.timeout,
      errorFilter: options.errorFilter,
      onStateChange: options.onStateChange,
      onSuccess: options.onSuccess,
      onFailure: options.onFailure,
      logger: options.logger,
    };
  }

  get name(): string {
    return this.opts.name;
  }

  /**
   * Execute an async operation through the circuit breaker.
   * Throws {@link CircuitOpenError} immediately if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.evaluateState();

    if (this.state === 'open') {
      throw new CircuitOpenError(this.opts.name, this.getMetrics());
    }

    if (
      this.state === 'half_open' &&
      this.halfOpenAttempts >= this.opts.halfOpenMaxAttempts
    ) {
      throw new CircuitOpenError(this.opts.name, this.getMetrics());
    }

    if (this.state === 'half_open') {
      this.halfOpenAttempts++;
    }

    const start = performance.now();

    try {
      const result =
        this.opts.timeout != null
          ? await this.withTimeout(fn, this.opts.timeout)
          : await fn();

      this.recordSuccess(performance.now() - start);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // If errorFilter is set and says "don't count as failure", treat as success
      if (this.opts.errorFilter && !this.opts.errorFilter(err)) {
        this.recordSuccess(performance.now() - start);
        throw err;
      }

      this.recordFailure(err);
      throw err;
    }
  }

  getMetrics(): CircuitBreakerMetrics {
    this.evaluateState();
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
    };
  }

  /** Manually reset the circuit breaker to closed state with zeroed counters. */
  reset(): void {
    const prev = this.state;
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.openedAt = null;
    this.halfOpenAttempts = 0;
    this.halfOpenSuccesses = 0;
    this.window.length = 0;

    if (prev !== 'closed') {
      this.opts.onStateChange?.(prev, 'closed', this.opts.name);
      this.opts.logger?.info(
        `Circuit breaker "${this.opts.name}" manually reset`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(
            new CircuitTimeoutError(
              this.opts.name,
              this.getMetrics(),
              timeoutMs,
            ),
          );
        }
      }, timeoutMs);

      fn().then(
        (value) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(value);
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        },
      );
    });
  }

  /** Transition from OPEN → HALF_OPEN when resetTimeout has elapsed. */
  private evaluateState(): void {
    if (this.state === 'open' && this.openedAt != null) {
      if (performance.now() - this.openedAt >= this.opts.resetTimeoutMs) {
        this.transitionTo('half_open');
      }
    }
  }

  private recordSuccess(durationMs: number): void {
    this.totalRequests++;
    this.successCount++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();

    this.pushWindow(true);
    this.opts.onSuccess?.(durationMs, this.opts.name);

    if (this.state === 'half_open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.opts.successThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  private recordFailure(error: Error): void {
    this.totalRequests++;
    this.failureCount++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();

    this.pushWindow(false);
    this.opts.onFailure?.(error, this.opts.name);

    if (this.state === 'half_open') {
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      this.evaluateThreshold();
    }
  }

  /**
   * In CLOSED state, check if the sliding window failure count has reached
   * the threshold (only once the volume threshold is met).
   */
  private evaluateThreshold(): void {
    if (this.window.length < this.opts.volumeThreshold) {
      return;
    }

    const failures = this.window.filter((ok) => !ok).length;
    if (failures >= this.opts.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private pushWindow(success: boolean): void {
    this.window.push(success);
    const maxSize = Math.max(
      this.opts.volumeThreshold,
      this.opts.failureThreshold * 2,
    );
    while (this.window.length > maxSize) {
      this.window.shift();
    }
  }

  private transitionTo(next: CircuitBreakerState): void {
    const prev = this.state;
    if (prev === next) return;

    this.state = next;

    switch (next) {
      case 'open':
        this.openedAt = performance.now();
        this.opts.logger?.warn(
          `Circuit breaker "${this.opts.name}" opened`,
        );
        break;
      case 'half_open':
        this.halfOpenAttempts = 0;
        this.halfOpenSuccesses = 0;
        this.opts.logger?.info(
          `Circuit breaker "${this.opts.name}" half-open, probing`,
        );
        break;
      case 'closed':
        this.halfOpenAttempts = 0;
        this.halfOpenSuccesses = 0;
        this.consecutiveFailures = 0;
        this.window.length = 0;
        this.opts.logger?.info(
          `Circuit breaker "${this.opts.name}" closed`,
        );
        break;
    }

    this.opts.onStateChange?.(prev, next, this.opts.name);
  }
}
