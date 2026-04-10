export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  successThreshold: number;
  timeout?: number;
  volumeThreshold?: number;
  errorFilter?: (error: Error) => boolean;
  onStateChange?: (
    from: CircuitBreakerState,
    to: CircuitBreakerState,
    name: string,
  ) => void;
  onSuccess?: (duration: number, name: string) => void;
  onFailure?: (error: Error, name: string) => void;
  logger?: { info: Function; warn: Function; error: Function };
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  retryOn?: (error: Error) => boolean;
}
