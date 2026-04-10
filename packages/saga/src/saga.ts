import { randomUUID } from 'node:crypto'
import {
  SagaCompensationError,
  SagaExecutionError,
  SagaTimeoutError,
} from './errors.js'
import type {
  SagaDefinition,
  SagaExecution,
  SagaOrchestratorOptions,
  SagaStep,
} from './types.js'

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stepName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new SagaTimeoutError(stepName, timeoutMs))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function executeWithRetries<TContext>(
  step: SagaStep<TContext>,
  context: TContext,
): Promise<TContext> {
  const maxAttempts = (step.retries ?? 0) + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const promise = step.execute(context)
      if (step.timeout != null) {
        return await withTimeout(promise, step.timeout, step.name)
      }
      return await promise
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error
      }
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error(`Step "${step.name}" failed after ${maxAttempts} attempts`)
}

export class SagaOrchestrator {
  private readonly definitions = new Map<string, SagaDefinition<any>>()
  private readonly options: SagaOrchestratorOptions

  constructor(options: SagaOrchestratorOptions = {}) {
    this.options = options
  }

  define<TContext = Record<string, unknown>>(
    definition: SagaDefinition<TContext>,
  ): void {
    this.definitions.set(definition.name, definition)
  }

  async execute<TContext = Record<string, unknown>>(
    sagaName: string,
    initialContext: TContext,
  ): Promise<SagaExecution<TContext>> {
    const definition = this.definitions.get(sagaName) as
      | SagaDefinition<TContext>
      | undefined
    if (!definition) {
      throw new Error(`Saga "${sagaName}" is not defined`)
    }

    const execution: SagaExecution<TContext> = {
      id: randomUUID(),
      sagaName,
      status: 'running',
      context: initialContext,
      currentStep: 0,
      stepResults: definition.steps.map((step) => ({
        name: step.name,
        status: 'pending' as const,
        startedAt: '',
      })),
      startedAt: new Date().toISOString(),
    }

    await this.persist(execution)
    this.log('info', `Saga "${sagaName}" started (id: ${execution.id})`)

    let failedError: Error | undefined

    for (let i = 0; i < definition.steps.length; i++) {
      const step = definition.steps[i]!
      execution.currentStep = i
      const stepResult = execution.stepResults[i]!

      stepResult.status = 'running'
      stepResult.startedAt = new Date().toISOString()
      await this.persist(execution)

      this.log('debug', `Executing step "${step.name}" (${i + 1}/${definition.steps.length})`)

      try {
        execution.context = await executeWithRetries(step, execution.context)

        stepResult.status = 'completed'
        stepResult.completedAt = new Date().toISOString()
        await this.persist(execution)

        if (this.options.onStepComplete) {
          await this.options.onStepComplete(execution as SagaExecution, step.name)
        }

        this.log('debug', `Step "${step.name}" completed`)
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))

        stepResult.status = 'failed'
        stepResult.completedAt = new Date().toISOString()
        stepResult.error = err.message
        await this.persist(execution)

        if (this.options.onStepFailed) {
          await this.options.onStepFailed(execution as SagaExecution, step.name, err)
        }

        this.log('error', `Step "${step.name}" failed: ${err.message}`)

        failedError = new SagaExecutionError({
          sagaName,
          failedStep: step.name,
          executionId: execution.id,
          cause: err,
        })

        // Compensate completed steps in reverse order
        await this.compensate(execution, definition, i - 1, err)
        break
      }
    }

    if (failedError) {
      execution.status = 'failed'
      execution.completedAt = new Date().toISOString()
      await this.persist(execution)

      if (definition.onFailed) {
        const execError = failedError as SagaExecutionError
        await definition.onFailed(
          execution.context,
          failedError,
          execError.failedStep,
        )
      }

      this.log('error', `Saga "${sagaName}" failed (id: ${execution.id})`)
    } else {
      execution.status = 'completed'
      execution.completedAt = new Date().toISOString()
      await this.persist(execution)

      if (definition.onComplete) {
        await definition.onComplete(execution.context)
      }

      this.log('info', `Saga "${sagaName}" completed (id: ${execution.id})`)
    }

    return execution
  }

  private async compensate<TContext>(
    execution: SagaExecution<TContext>,
    definition: SagaDefinition<TContext>,
    fromIndex: number,
    originalError: Error,
  ): Promise<void> {
    execution.status = 'compensating'
    await this.persist(execution)

    this.log('info', `Starting compensation from step index ${fromIndex}`)

    for (let i = fromIndex; i >= 0; i--) {
      const step = definition.steps[i]!
      const stepResult = execution.stepResults[i]!

      if (!step.compensate) {
        this.log('debug', `No compensation for step "${step.name}", skipping`)
        continue
      }

      stepResult.status = 'compensating'
      await this.persist(execution)

      this.log('debug', `Compensating step "${step.name}"`)

      try {
        execution.context = await step.compensate(
          execution.context,
          originalError,
        )

        stepResult.status = 'compensated'
        stepResult.completedAt = new Date().toISOString()
        await this.persist(execution)

        this.log('debug', `Step "${step.name}" compensated`)
      } catch (compError) {
        const err =
          compError instanceof Error ? compError : new Error(String(compError))

        stepResult.status = 'failed'
        stepResult.error = `Compensation failed: ${err.message}`
        stepResult.completedAt = new Date().toISOString()
        await this.persist(execution)

        this.log(
          'error',
          `Compensation failed for step "${step.name}": ${err.message}`,
        )

        throw new SagaCompensationError({
          sagaName: execution.sagaName,
          compensationStep: step.name,
          executionId: execution.id,
          originalError,
          compensationError: err,
        })
      }
    }
  }

  private async persist<TContext>(
    execution: SagaExecution<TContext>,
  ): Promise<void> {
    if (this.options.persistExecution) {
      await this.options.persistExecution(execution as SagaExecution)
    }
  }

  private log(
    level: 'info' | 'error' | 'warn' | 'debug',
    message: string,
  ): void {
    if (this.options.logger) {
      this.options.logger[level](message)
    }
  }
}
