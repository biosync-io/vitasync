import type { SagaDefinition, SagaStep } from './types.js'

interface StepOptions<TContext> {
  execute: (context: TContext) => Promise<TContext>
  compensate?: (context: TContext, error: Error) => Promise<TContext>
  timeout?: number
  retries?: number
}

export class SagaBuilder<TContext = Record<string, unknown>> {
  private readonly name: string
  private readonly steps: SagaStep<TContext>[] = []
  private completeHandler?: (context: TContext) => Promise<void>
  private failedHandler?: (
    context: TContext,
    error: Error,
    failedStep: string,
  ) => Promise<void>

  constructor(name: string) {
    this.name = name
  }

  step(name: string, options: StepOptions<TContext>): this {
    const step: SagaStep<TContext> = { name, execute: options.execute }
    if (options.compensate != null) step.compensate = options.compensate
    if (options.timeout != null) step.timeout = options.timeout
    if (options.retries != null) step.retries = options.retries
    this.steps.push(step)
    return this
  }

  onComplete(handler: (context: TContext) => Promise<void>): this {
    this.completeHandler = handler
    return this
  }

  onFailed(
    handler: (
      context: TContext,
      error: Error,
      failedStep: string,
    ) => Promise<void>,
  ): this {
    this.failedHandler = handler
    return this
  }

  build(): SagaDefinition<TContext> {
    if (this.steps.length === 0) {
      throw new Error(`Saga "${this.name}" must have at least one step`)
    }

    const def: SagaDefinition<TContext> = {
      name: this.name,
      steps: [...this.steps],
    }
    if (this.completeHandler != null) def.onComplete = this.completeHandler
    if (this.failedHandler != null) def.onFailed = this.failedHandler
    return def
  }
}
