import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker } from '../circuit-breaker.js';
import { CircuitBreakerRegistry } from '../circuit-breaker-registry.js';
import { withRetry } from '../retry.js';
import { CircuitOpenError, CircuitTimeoutError } from '../errors.js';
import type { CircuitBreakerState } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const succeed = <T>(value: T) => () => Promise.resolve(value);
const fail = (msg = 'boom') => () => Promise.reject(new Error(msg));

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Create a breaker with fast thresholds suitable for testing. */
function createBreaker(
  overrides?: Record<string, unknown>,
): CircuitBreaker {
  return new CircuitBreaker({
    name: 'test',
    failureThreshold: 3,
    resetTimeoutMs: 80,
    halfOpenMaxAttempts: 3,
    successThreshold: 2,
    volumeThreshold: 3,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

describe('CircuitBreaker – state transitions', () => {
  it('starts in closed state', () => {
    const cb = createBreaker();
    assert.equal(cb.getMetrics().state, 'closed');
  });

  it('transitions closed → open after failure threshold in sliding window', async () => {
    const cb = createBreaker();

    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(fail()));
    }

    assert.equal(cb.getMetrics().state, 'open');
  });

  it('transitions open → half_open after resetTimeout', async () => {
    const cb = createBreaker({ resetTimeoutMs: 50 });

    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(fail()));
    }
    assert.equal(cb.getMetrics().state, 'open');

    await delay(60);
    // getMetrics triggers the lazy state evaluation
    assert.equal(cb.getMetrics().state, 'half_open');
  });

  it('transitions half_open → closed after success threshold', async () => {
    const cb = createBreaker({ resetTimeoutMs: 50, successThreshold: 2 });

    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(fail()));
    }

    await delay(60);
    assert.equal(cb.getMetrics().state, 'half_open');

    await cb.execute(succeed('ok'));
    await cb.execute(succeed('ok'));

    assert.equal(cb.getMetrics().state, 'closed');
  });

  it('transitions half_open → open on probe failure', async () => {
    const cb = createBreaker({ resetTimeoutMs: 50 });

    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(fail()));
    }

    await delay(60);
    assert.equal(cb.getMetrics().state, 'half_open');

    await assert.rejects(cb.execute(fail()));
    assert.equal(cb.getMetrics().state, 'open');
  });

  it('fires onStateChange callback on transitions', async () => {
    const transitions: [CircuitBreakerState, CircuitBreakerState][] = [];

    const cb = createBreaker({
      resetTimeoutMs: 50,
      successThreshold: 1,
      onStateChange: (from: CircuitBreakerState, to: CircuitBreakerState) => {
        transitions.push([from, to]);
      },
    });

    // closed → open
    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(fail()));
    }
    // open → half_open
    await delay(60);
    cb.getMetrics();
    // half_open → closed
    await cb.execute(succeed('ok'));

    assert.deepEqual(transitions, [
      ['closed', 'open'],
      ['open', 'half_open'],
      ['half_open', 'closed'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Fast-fail when open
// ---------------------------------------------------------------------------

describe('CircuitBreaker – fast-fail', () => {
  it('throws CircuitOpenError without executing fn when open', async () => {
    const cb = createBreaker();

    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(fail()));
    }
    assert.equal(cb.getMetrics().state, 'open');

    let fnCalled = false;
    await assert.rejects(
      cb.execute(async () => {
        fnCalled = true;
        return 'should not reach';
      }),
      (err: unknown) => {
        assert.ok(err instanceof CircuitOpenError);
        assert.equal(err.circuitName, 'test');
        assert.ok(err.metrics);
        return true;
      },
    );
    assert.equal(fnCalled, false);
  });

  it('rejects when half_open max attempts exhausted', async () => {
    const cb = createBreaker({
      resetTimeoutMs: 50,
      halfOpenMaxAttempts: 1,
      successThreshold: 1,
    });

    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(fail()));
    }

    await delay(60);
    assert.equal(cb.getMetrics().state, 'half_open');

    // First attempt is allowed (halfOpenAttempts goes to 1)
    await assert.rejects(cb.execute(fail()));
    // Second attempt should be rejected as max attempts reached
    await assert.rejects(
      cb.execute(succeed('ok')),
      (err: unknown) => err instanceof CircuitOpenError,
    );
  });
});

// ---------------------------------------------------------------------------
// Timeout handling
// ---------------------------------------------------------------------------

describe('CircuitBreaker – timeout', () => {
  it('throws CircuitTimeoutError when execution exceeds timeout', async () => {
    const cb = createBreaker({ timeout: 30 });

    await assert.rejects(
      cb.execute(() => delay(200).then(() => 'late')),
      (err: unknown) => {
        assert.ok(err instanceof CircuitTimeoutError);
        assert.equal(err.circuitName, 'test');
        assert.equal(err.timeoutMs, 30);
        return true;
      },
    );
  });

  it('succeeds when execution finishes before timeout', async () => {
    const cb = createBreaker({ timeout: 500 });

    const result = await cb.execute(async () => {
      await delay(10);
      return 42;
    });

    assert.equal(result, 42);
  });

  it('counts timeout as a failure', async () => {
    const cb = createBreaker({ timeout: 20 });

    await assert.rejects(cb.execute(() => delay(200).then(() => 'late')));

    const m = cb.getMetrics();
    assert.equal(m.failureCount, 1);
    assert.equal(m.consecutiveFailures, 1);
  });
});

// ---------------------------------------------------------------------------
// Metrics tracking
// ---------------------------------------------------------------------------

describe('CircuitBreaker – metrics', () => {
  it('tracks successes and failures', async () => {
    const cb = createBreaker({ volumeThreshold: 100 }); // high so it stays closed

    await cb.execute(succeed('a'));
    await cb.execute(succeed('b'));
    await assert.rejects(cb.execute(fail()));
    await cb.execute(succeed('c'));

    const m = cb.getMetrics();
    assert.equal(m.totalRequests, 4);
    assert.equal(m.successCount, 3);
    assert.equal(m.failureCount, 1);
    assert.equal(m.consecutiveSuccesses, 1);
    assert.equal(m.consecutiveFailures, 0);
    assert.ok(typeof m.lastSuccessTime === 'number');
    assert.ok(typeof m.lastFailureTime === 'number');
  });

  it('tracks consecutive failures', async () => {
    const cb = createBreaker({ volumeThreshold: 100 });

    await assert.rejects(cb.execute(fail()));
    await assert.rejects(cb.execute(fail()));

    assert.equal(cb.getMetrics().consecutiveFailures, 2);
    assert.equal(cb.getMetrics().consecutiveSuccesses, 0);
  });

  it('calls onSuccess / onFailure callbacks', async () => {
    let successDuration: number | undefined;
    let failureError: Error | undefined;

    const cb = createBreaker({
      volumeThreshold: 100,
      onSuccess: (d: number) => {
        successDuration = d;
      },
      onFailure: (e: Error) => {
        failureError = e;
      },
    });

    await cb.execute(succeed('ok'));
    assert.ok(typeof successDuration === 'number');
    assert.ok(successDuration >= 0);

    await assert.rejects(cb.execute(fail('oops')));
    assert.ok(failureError instanceof Error);
    assert.equal(failureError.message, 'oops');
  });
});

// ---------------------------------------------------------------------------
// Error filtering
// ---------------------------------------------------------------------------

describe('CircuitBreaker – error filtering', () => {
  it('does not count filtered-out errors as failures', async () => {
    const cb = createBreaker({
      errorFilter: (err: Error) => !err.message.includes('ignore'),
    });

    // This error should be ignored by the circuit breaker
    await assert.rejects(cb.execute(fail('please ignore me')));

    const m = cb.getMetrics();
    assert.equal(m.failureCount, 0);
    assert.equal(m.successCount, 1); // treated as success for CB purposes
  });

  it('counts matching errors as failures', async () => {
    const cb = createBreaker({
      errorFilter: (err: Error) => err.message.includes('fatal'),
    });

    await assert.rejects(cb.execute(fail('fatal crash')));

    assert.equal(cb.getMetrics().failureCount, 1);
  });
});

// ---------------------------------------------------------------------------
// Volume threshold
// ---------------------------------------------------------------------------

describe('CircuitBreaker – volume threshold', () => {
  it('does not open before volume threshold is met', async () => {
    const cb = createBreaker({ volumeThreshold: 5, failureThreshold: 3 });

    // 3 failures but only 3 requests < volumeThreshold of 5
    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(fail()));
    }

    assert.equal(cb.getMetrics().state, 'closed');
  });

  it('opens once volume threshold is met and failures exceed threshold', async () => {
    const cb = createBreaker({ volumeThreshold: 5, failureThreshold: 3 });

    // 2 successes + 3 failures = 5 total (meets volume threshold)
    await cb.execute(succeed('ok'));
    await cb.execute(succeed('ok'));
    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(fail()));
    }

    assert.equal(cb.getMetrics().state, 'open');
  });
});

// ---------------------------------------------------------------------------
// Manual reset
// ---------------------------------------------------------------------------

describe('CircuitBreaker – reset', () => {
  it('resets circuit to closed with zeroed counters', async () => {
    const cb = createBreaker();

    for (let i = 0; i < 3; i++) {
      await assert.rejects(cb.execute(fail()));
    }
    assert.equal(cb.getMetrics().state, 'open');

    cb.reset();

    const m = cb.getMetrics();
    assert.equal(m.state, 'closed');
    assert.equal(m.failureCount, 0);
    assert.equal(m.successCount, 0);
    assert.equal(m.totalRequests, 0);
    assert.equal(m.consecutiveFailures, 0);
    assert.equal(m.lastFailureTime, null);

    // Can execute again
    const result = await cb.execute(succeed('back'));
    assert.equal(result, 'back');
  });
});

// ---------------------------------------------------------------------------
// Concurrent executions
// ---------------------------------------------------------------------------

describe('CircuitBreaker – concurrency', () => {
  it('handles concurrent requests correctly', async () => {
    const cb = createBreaker({ volumeThreshold: 100 });

    const results = await Promise.allSettled([
      cb.execute(succeed('a')),
      cb.execute(succeed('b')),
      cb.execute(fail('c')),
      cb.execute(succeed('d')),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    assert.equal(cb.getMetrics().totalRequests, 4);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('CircuitBreakerRegistry', () => {
  it('creates and retrieves breakers', () => {
    const reg = new CircuitBreakerRegistry();
    const cb = reg.create('fitbit-api', { failureThreshold: 5, resetTimeoutMs: 1000, halfOpenMaxAttempts: 2, successThreshold: 1 });

    assert.equal(cb.name, 'fitbit-api');
    assert.strictEqual(reg.get('fitbit-api'), cb);
    assert.equal(reg.get('unknown'), undefined);
  });

  it('throws when creating duplicate name', () => {
    const reg = new CircuitBreakerRegistry();
    reg.create('dup', { failureThreshold: 3, resetTimeoutMs: 100, halfOpenMaxAttempts: 1, successThreshold: 1 });

    assert.throws(
      () => reg.create('dup', { failureThreshold: 3, resetTimeoutMs: 100, halfOpenMaxAttempts: 1, successThreshold: 1 }),
      /already exists/,
    );
  });

  it('returns all breakers', () => {
    const reg = new CircuitBreakerRegistry();
    reg.create('a', { failureThreshold: 1, resetTimeoutMs: 100, halfOpenMaxAttempts: 1, successThreshold: 1 });
    reg.create('b', { failureThreshold: 1, resetTimeoutMs: 100, halfOpenMaxAttempts: 1, successThreshold: 1 });

    const all = reg.getAll();
    assert.equal(all.size, 2);
    assert.ok(all.has('a'));
    assert.ok(all.has('b'));
  });

  it('returns metrics for all breakers', async () => {
    const reg = new CircuitBreakerRegistry();
    const cb = reg.create('svc', { failureThreshold: 10, resetTimeoutMs: 100, halfOpenMaxAttempts: 1, successThreshold: 1, volumeThreshold: 100 });
    await cb.execute(succeed('ok'));

    const metrics = reg.getAllMetrics();
    assert.equal(metrics['svc']!.successCount, 1);
  });

  it('resets all breakers', async () => {
    const reg = new CircuitBreakerRegistry();
    const cb = reg.create('svc', { failureThreshold: 10, resetTimeoutMs: 100, halfOpenMaxAttempts: 1, successThreshold: 1, volumeThreshold: 100 });
    await cb.execute(succeed('ok'));

    reg.resetAll();
    assert.equal(cb.getMetrics().totalRequests, 0);
  });

  it('applies default options', async () => {
    const transitions: string[] = [];
    const reg = new CircuitBreakerRegistry({
      failureThreshold: 2,
      resetTimeoutMs: 50,
      halfOpenMaxAttempts: 1,
      successThreshold: 1,
      volumeThreshold: 2,
      onStateChange: (_f: unknown, to: unknown) => {
        transitions.push(to as string);
      },
    });
    const cb = reg.create('svc');

    await assert.rejects(cb.execute(fail()));
    await assert.rejects(cb.execute(fail()));
    assert.equal(cb.getMetrics().state, 'open');
  });
});

// ---------------------------------------------------------------------------
// Retry with backoff
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  it('returns on first success', async () => {
    const result = await withRetry(succeed('ok'), { maxRetries: 3 });
    assert.equal(result, 'ok');
  });

  it('retries up to maxRetries then throws', async () => {
    let attempts = 0;
    await assert.rejects(
      withRetry(
        () => {
          attempts++;
          return Promise.reject(new Error('fail'));
        },
        { maxRetries: 2, baseDelayMs: 10, jitter: false },
      ),
      /fail/,
    );
    assert.equal(attempts, 3); // initial + 2 retries
  });

  it('succeeds after transient failures', async () => {
    let attempts = 0;
    const result = await withRetry(
      () => {
        attempts++;
        if (attempts < 3) return Promise.reject(new Error('transient'));
        return Promise.resolve('recovered');
      },
      { maxRetries: 5, baseDelayMs: 10, jitter: false },
    );
    assert.equal(result, 'recovered');
    assert.equal(attempts, 3);
  });

  it('does not retry CircuitOpenError', async () => {
    let attempts = 0;
    await assert.rejects(
      withRetry(
        () => {
          attempts++;
          throw new CircuitOpenError('test', {
            state: 'open',
            failureCount: 5,
            successCount: 0,
            totalRequests: 5,
            lastFailureTime: Date.now(),
            lastSuccessTime: null,
            consecutiveFailures: 5,
            consecutiveSuccesses: 0,
          });
        },
        { maxRetries: 3, baseDelayMs: 10 },
      ),
      (err: unknown) => err instanceof CircuitOpenError,
    );
    assert.equal(attempts, 1);
  });

  it('respects retryOn filter', async () => {
    let attempts = 0;
    await assert.rejects(
      withRetry(
        () => {
          attempts++;
          return Promise.reject(new Error('non-retryable'));
        },
        {
          maxRetries: 3,
          baseDelayMs: 10,
          retryOn: (err: Error) => err.message !== 'non-retryable',
        },
      ),
      /non-retryable/,
    );
    assert.equal(attempts, 1);
  });

  it('applies exponential backoff timing', async () => {
    const starts: number[] = [];
    let attempts = 0;

    await assert.rejects(
      withRetry(
        () => {
          starts.push(Date.now());
          attempts++;
          return Promise.reject(new Error('fail'));
        },
        { maxRetries: 3, baseDelayMs: 30, jitter: false },
      ),
    );

    assert.equal(attempts, 4);

    // Verify delays increase: gap1 ≈ 30ms, gap2 ≈ 60ms, gap3 ≈ 120ms
    // With some tolerance for CI timing variance
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i]! - starts[i - 1]!;
      const expectedMin = 30 * 2 ** (i - 1) * 0.5; // generous lower bound
      assert.ok(
        gap >= expectedMin,
        `Gap ${i}: ${gap}ms should be >= ${expectedMin}ms`,
      );
    }
  });
});
