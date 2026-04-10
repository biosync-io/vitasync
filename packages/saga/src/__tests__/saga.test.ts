import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { SagaOrchestrator } from '../saga.js'
import { SagaBuilder } from '../saga-builder.js'
import {
  SagaExecutionError,
  SagaCompensationError,
  SagaTimeoutError,
} from '../errors.js'
import type { SagaDefinition, SagaExecution } from '../types.js'

interface TestContext {
  steps: string[]
  compensations: string[]
  value: number
}

function createTestContext(): TestContext {
  return { steps: [], compensations: [], value: 0 }
}

describe('SagaOrchestrator', () => {
  let orchestrator: SagaOrchestrator

  beforeEach(() => {
    orchestrator = new SagaOrchestrator()
  })

  describe('happy path', () => {
    it('should execute all steps in order and return completed execution', async () => {
      const definition: SagaDefinition<TestContext> = {
        name: 'test-saga',
        steps: [
          {
            name: 'step-1',
            execute: async (ctx) => {
              ctx.steps.push('step-1')
              ctx.value += 10
              return ctx
            },
          },
          {
            name: 'step-2',
            execute: async (ctx) => {
              ctx.steps.push('step-2')
              ctx.value += 20
              return ctx
            },
          },
          {
            name: 'step-3',
            execute: async (ctx) => {
              ctx.steps.push('step-3')
              ctx.value += 30
              return ctx
            },
          },
        ],
      }

      orchestrator.define(definition)
      const result = await orchestrator.execute('test-saga', createTestContext())

      assert.equal(result.status, 'completed')
      assert.equal(result.sagaName, 'test-saga')
      assert.deepEqual(result.context.steps, ['step-1', 'step-2', 'step-3'])
      assert.equal(result.context.value, 60)
      assert.equal(result.stepResults.length, 3)
      assert.ok(result.id)
      assert.ok(result.startedAt)
      assert.ok(result.completedAt)

      for (const stepResult of result.stepResults) {
        assert.equal(stepResult.status, 'completed')
        assert.ok(stepResult.startedAt)
        assert.ok(stepResult.completedAt)
      }
    })

    it('should call onComplete handler when saga finishes successfully', async () => {
      let completeCalled = false
      let completeCtx: TestContext | undefined

      const definition: SagaDefinition<TestContext> = {
        name: 'complete-saga',
        steps: [
          {
            name: 'only-step',
            execute: async (ctx) => {
              ctx.steps.push('done')
              return ctx
            },
          },
        ],
        onComplete: async (ctx) => {
          completeCalled = true
          completeCtx = ctx
        },
      }

      orchestrator.define(definition)
      await orchestrator.execute('complete-saga', createTestContext())

      assert.ok(completeCalled)
      assert.deepEqual(completeCtx?.steps, ['done'])
    })

    it('should throw if saga is not defined', async () => {
      await assert.rejects(
        () => orchestrator.execute('nonexistent', createTestContext()),
        { message: 'Saga "nonexistent" is not defined' },
      )
    })
  })

  describe('compensation', () => {
    it('should compensate completed steps in reverse order when a step fails', async () => {
      const definition: SagaDefinition<TestContext> = {
        name: 'compensate-saga',
        steps: [
          {
            name: 'step-1',
            execute: async (ctx) => {
              ctx.steps.push('exec-1')
              return ctx
            },
            compensate: async (ctx) => {
              ctx.compensations.push('comp-1')
              return ctx
            },
          },
          {
            name: 'step-2',
            execute: async (ctx) => {
              ctx.steps.push('exec-2')
              return ctx
            },
            compensate: async (ctx) => {
              ctx.compensations.push('comp-2')
              return ctx
            },
          },
          {
            name: 'step-3',
            execute: async (ctx) => {
              throw new Error('step-3 failed')
            },
          },
        ],
      }

      orchestrator.define(definition)
      const result = await orchestrator.execute(
        'compensate-saga',
        createTestContext(),
      )

      assert.equal(result.status, 'failed')
      assert.deepEqual(result.context.steps, ['exec-1', 'exec-2'])
      // Compensations run in reverse: step-2 first, then step-1
      assert.deepEqual(result.context.compensations, ['comp-2', 'comp-1'])
      assert.equal(result.stepResults[2]!.status, 'failed')
      assert.equal(result.stepResults[1]!.status, 'compensated')
      assert.equal(result.stepResults[0]!.status, 'compensated')
    })

    it('should call onFailed handler after compensation', async () => {
      let failedCalled = false
      let failedStep = ''

      const definition: SagaDefinition<TestContext> = {
        name: 'fail-saga',
        steps: [
          {
            name: 'ok-step',
            execute: async (ctx) => ctx,
          },
          {
            name: 'bad-step',
            execute: async () => {
              throw new Error('boom')
            },
          },
        ],
        onFailed: async (_ctx, _err, step) => {
          failedCalled = true
          failedStep = step
        },
      }

      orchestrator.define(definition)
      await orchestrator.execute('fail-saga', createTestContext())

      assert.ok(failedCalled)
      assert.equal(failedStep, 'bad-step')
    })

    it('should skip steps without compensate function during compensation', async () => {
      const definition: SagaDefinition<TestContext> = {
        name: 'partial-comp',
        steps: [
          {
            name: 'step-1',
            execute: async (ctx) => {
              ctx.steps.push('exec-1')
              return ctx
            },
            compensate: async (ctx) => {
              ctx.compensations.push('comp-1')
              return ctx
            },
          },
          {
            name: 'step-2-no-comp',
            execute: async (ctx) => {
              ctx.steps.push('exec-2')
              return ctx
            },
            // no compensate
          },
          {
            name: 'step-3',
            execute: async () => {
              throw new Error('fail')
            },
          },
        ],
      }

      orchestrator.define(definition)
      const result = await orchestrator.execute(
        'partial-comp',
        createTestContext(),
      )

      assert.equal(result.status, 'failed')
      // Only step-1 has a compensate, step-2 is skipped
      assert.deepEqual(result.context.compensations, ['comp-1'])
    })
  })

  describe('compensation failure', () => {
    it('should throw SagaCompensationError when compensation itself fails', async () => {
      const definition: SagaDefinition<TestContext> = {
        name: 'comp-fail-saga',
        steps: [
          {
            name: 'step-1',
            execute: async (ctx) => {
              ctx.steps.push('exec-1')
              return ctx
            },
            compensate: async () => {
              throw new Error('compensation exploded')
            },
          },
          {
            name: 'step-2',
            execute: async () => {
              throw new Error('step-2 failed')
            },
          },
        ],
      }

      orchestrator.define(definition)

      await assert.rejects(
        () => orchestrator.execute('comp-fail-saga', createTestContext()),
        (error: unknown) => {
          assert.ok(error instanceof SagaCompensationError)
          assert.equal(error.compensationStep, 'step-1')
          assert.equal(error.originalError.message, 'step-2 failed')
          assert.equal(
            error.compensationError.message,
            'compensation exploded',
          )
          return true
        },
      )
    })
  })

  describe('timeout handling', () => {
    it('should fail a step that exceeds its timeout', async () => {
      const definition: SagaDefinition<TestContext> = {
        name: 'timeout-saga',
        steps: [
          {
            name: 'slow-step',
            execute: async (ctx) => {
              await new Promise((resolve) => setTimeout(resolve, 500))
              return ctx
            },
            timeout: 50,
          },
        ],
      }

      orchestrator.define(definition)
      const result = await orchestrator.execute(
        'timeout-saga',
        createTestContext(),
      )

      assert.equal(result.status, 'failed')
      assert.equal(result.stepResults[0]!.status, 'failed')
      assert.ok(result.stepResults[0]!.error?.includes('timeout'))
    })

    it('should succeed if step completes within timeout', async () => {
      const definition: SagaDefinition<TestContext> = {
        name: 'fast-saga',
        steps: [
          {
            name: 'fast-step',
            execute: async (ctx) => {
              ctx.steps.push('fast')
              return ctx
            },
            timeout: 5000,
          },
        ],
      }

      orchestrator.define(definition)
      const result = await orchestrator.execute(
        'fast-saga',
        createTestContext(),
      )

      assert.equal(result.status, 'completed')
      assert.deepEqual(result.context.steps, ['fast'])
    })
  })

  describe('retry logic', () => {
    it('should retry a step and succeed if it passes within retry count', async () => {
      let attempts = 0

      const definition: SagaDefinition<TestContext> = {
        name: 'retry-saga',
        steps: [
          {
            name: 'flaky-step',
            execute: async (ctx) => {
              attempts++
              if (attempts < 3) {
                throw new Error(`attempt ${attempts} failed`)
              }
              ctx.steps.push('flaky-succeeded')
              return ctx
            },
            retries: 2,
          },
        ],
      }

      orchestrator.define(definition)
      const result = await orchestrator.execute(
        'retry-saga',
        createTestContext(),
      )

      assert.equal(result.status, 'completed')
      assert.equal(attempts, 3) // 1 initial + 2 retries
      assert.deepEqual(result.context.steps, ['flaky-succeeded'])
    })

    it('should fail after exhausting all retries', async () => {
      let attempts = 0

      const definition: SagaDefinition<TestContext> = {
        name: 'retry-fail-saga',
        steps: [
          {
            name: 'always-fails',
            execute: async () => {
              attempts++
              throw new Error(`attempt ${attempts}`)
            },
            retries: 2,
          },
        ],
      }

      orchestrator.define(definition)
      const result = await orchestrator.execute(
        'retry-fail-saga',
        createTestContext(),
      )

      assert.equal(result.status, 'failed')
      assert.equal(attempts, 3) // 1 initial + 2 retries
      assert.ok(result.stepResults[0]!.error?.includes('attempt 3'))
    })
  })

  describe('execution state tracking', () => {
    it('should track execution state via persistExecution callback', async () => {
      const snapshots: SagaExecution[] = []

      const tracked = new SagaOrchestrator({
        persistExecution: async (exec) => {
          snapshots.push(structuredClone(exec))
        },
      })

      const definition: SagaDefinition<TestContext> = {
        name: 'tracked-saga',
        steps: [
          {
            name: 'step-a',
            execute: async (ctx) => {
              ctx.steps.push('a')
              return ctx
            },
          },
          {
            name: 'step-b',
            execute: async (ctx) => {
              ctx.steps.push('b')
              return ctx
            },
          },
        ],
      }

      tracked.define(definition)
      await tracked.execute('tracked-saga', createTestContext())

      // Expected snapshots: initial, step-a running, step-a completed,
      // step-b running, step-b completed, saga completed
      assert.ok(snapshots.length >= 5)

      const statuses = snapshots.map((s) => s.status)
      assert.ok(statuses.includes('running'))
      assert.ok(statuses.includes('completed'))

      const lastSnapshot = snapshots[snapshots.length - 1]!
      assert.equal(lastSnapshot.status, 'completed')
    })

    it('should fire onStepComplete callback for each successful step', async () => {
      const completedSteps: string[] = []

      const tracked = new SagaOrchestrator({
        onStepComplete: async (_exec, stepName) => {
          completedSteps.push(stepName)
        },
      })

      const definition: SagaDefinition<TestContext> = {
        name: 'callback-saga',
        steps: [
          {
            name: 'alpha',
            execute: async (ctx) => ctx,
          },
          {
            name: 'beta',
            execute: async (ctx) => ctx,
          },
        ],
      }

      tracked.define(definition)
      await tracked.execute('callback-saga', createTestContext())

      assert.deepEqual(completedSteps, ['alpha', 'beta'])
    })

    it('should fire onStepFailed callback when a step fails', async () => {
      const failedSteps: string[] = []

      const tracked = new SagaOrchestrator({
        onStepFailed: async (_exec, stepName) => {
          failedSteps.push(stepName)
        },
      })

      const definition: SagaDefinition<TestContext> = {
        name: 'fail-callback-saga',
        steps: [
          {
            name: 'good',
            execute: async (ctx) => ctx,
          },
          {
            name: 'bad',
            execute: async () => {
              throw new Error('nope')
            },
          },
        ],
      }

      tracked.define(definition)
      await tracked.execute('fail-callback-saga', createTestContext())

      assert.deepEqual(failedSteps, ['bad'])
    })

    it('should generate unique execution IDs', async () => {
      const definition: SagaDefinition<TestContext> = {
        name: 'id-saga',
        steps: [
          { name: 'step', execute: async (ctx) => ctx },
        ],
      }

      orchestrator.define(definition)

      const r1 = await orchestrator.execute('id-saga', createTestContext())
      const r2 = await orchestrator.execute('id-saga', createTestContext())

      assert.notEqual(r1.id, r2.id)
      assert.match(
        r1.id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
    })
  })
})

describe('SagaBuilder', () => {
  it('should build a saga definition with fluent API', () => {
    const definition = new SagaBuilder<TestContext>('my-saga')
      .step('step-1', {
        execute: async (ctx) => {
          ctx.steps.push('1')
          return ctx
        },
        compensate: async (ctx) => {
          ctx.compensations.push('1')
          return ctx
        },
      })
      .step('step-2', {
        execute: async (ctx) => {
          ctx.steps.push('2')
          return ctx
        },
        timeout: 5000,
        retries: 3,
      })
      .onComplete(async () => {})
      .onFailed(async () => {})
      .build()

    assert.equal(definition.name, 'my-saga')
    assert.equal(definition.steps.length, 2)
    assert.equal(definition.steps[0]!.name, 'step-1')
    assert.ok(definition.steps[0]!.compensate)
    assert.equal(definition.steps[1]!.name, 'step-2')
    assert.equal(definition.steps[1]!.timeout, 5000)
    assert.equal(definition.steps[1]!.retries, 3)
    assert.ok(definition.onComplete)
    assert.ok(definition.onFailed)
  })

  it('should throw if building with no steps', () => {
    assert.throws(
      () => new SagaBuilder('empty').build(),
      { message: 'Saga "empty" must have at least one step' },
    )
  })

  it('should work end-to-end with SagaOrchestrator', async () => {
    const orchestrator = new SagaOrchestrator()

    const definition = new SagaBuilder<TestContext>('e2e-saga')
      .step('init', {
        execute: async (ctx) => {
          ctx.steps.push('init')
          ctx.value = 1
          return ctx
        },
      })
      .step('process', {
        execute: async (ctx) => {
          ctx.steps.push('process')
          ctx.value *= 10
          return ctx
        },
      })
      .step('finalize', {
        execute: async (ctx) => {
          ctx.steps.push('finalize')
          ctx.value += 5
          return ctx
        },
      })
      .build()

    orchestrator.define(definition)
    const result = await orchestrator.execute('e2e-saga', createTestContext())

    assert.equal(result.status, 'completed')
    assert.deepEqual(result.context.steps, ['init', 'process', 'finalize'])
    assert.equal(result.context.value, 15)
  })
})

describe('SagaErrors', () => {
  it('SagaExecutionError should contain saga context', () => {
    const err = new SagaExecutionError({
      sagaName: 'my-saga',
      failedStep: 'step-2',
      executionId: 'abc-123',
      cause: new Error('original'),
    })

    assert.equal(err.name, 'SagaExecutionError')
    assert.equal(err.sagaName, 'my-saga')
    assert.equal(err.failedStep, 'step-2')
    assert.equal(err.executionId, 'abc-123')
    assert.equal(err.cause.message, 'original')
    assert.ok(err.message.includes('my-saga'))
    assert.ok(err.message.includes('step-2'))
  })

  it('SagaCompensationError should contain both errors', () => {
    const err = new SagaCompensationError({
      sagaName: 'my-saga',
      compensationStep: 'step-1',
      executionId: 'abc-123',
      originalError: new Error('original'),
      compensationError: new Error('comp-error'),
    })

    assert.equal(err.name, 'SagaCompensationError')
    assert.equal(err.originalError.message, 'original')
    assert.equal(err.compensationError.message, 'comp-error')
    assert.ok(err.message.includes('comp-error'))
    assert.ok(err.message.includes('original'))
  })

  it('SagaTimeoutError should contain step and timeout info', () => {
    const err = new SagaTimeoutError('slow-step', 5000)

    assert.equal(err.name, 'SagaTimeoutError')
    assert.equal(err.stepName, 'slow-step')
    assert.equal(err.timeoutMs, 5000)
    assert.ok(err.message.includes('5000'))
    assert.ok(err.message.includes('slow-step'))
  })
})
