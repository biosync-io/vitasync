import type { CircuitBreakerMetrics } from './types.js';

export class CircuitOpenError extends Error {
  public readonly circuitName: string;
  public readonly metrics: CircuitBreakerMetrics;

  constructor(name: string, metrics: CircuitBreakerMetrics) {
    super(`Circuit breaker "${name}" is open`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
    this.metrics = { ...metrics };
  }
}

export class CircuitTimeoutError extends Error {
  public readonly circuitName: string;
  public readonly metrics: CircuitBreakerMetrics;
  public readonly timeoutMs: number;

  constructor(
    name: string,
    metrics: CircuitBreakerMetrics,
    timeoutMs: number,
  ) {
    super(`Circuit breaker "${name}" timed out after ${timeoutMs}ms`);
    this.name = 'CircuitTimeoutError';
    this.circuitName = name;
    this.metrics = { ...metrics };
    this.timeoutMs = timeoutMs;
  }
}
