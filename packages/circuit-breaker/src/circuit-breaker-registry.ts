import { CircuitBreaker } from './circuit-breaker.js';
import type {
  CircuitBreakerOptions,
  CircuitBreakerMetrics,
} from './types.js';

export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly defaults: Partial<CircuitBreakerOptions>;

  constructor(defaults?: Partial<CircuitBreakerOptions>) {
    this.defaults = defaults ?? {};
  }

  create(
    name: string,
    options?: Partial<CircuitBreakerOptions>,
  ): CircuitBreaker {
    if (this.breakers.has(name)) {
      throw new Error(`Circuit breaker "${name}" already exists`);
    }

    const breaker = new CircuitBreaker({
      ...this.defaults,
      ...options,
      name,
    } as CircuitBreakerOptions);

    this.breakers.set(name, breaker);
    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [name, breaker] of this.breakers) {
      metrics[name] = breaker.getMetrics();
    }
    return metrics;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}
