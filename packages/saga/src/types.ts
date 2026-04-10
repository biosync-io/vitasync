export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated'

export interface SagaStep<TContext = Record<string, unknown>> {
  name: string
  execute: (context: TContext) => Promise<TContext>
  compensate?: (context: TContext, error: Error) => Promise<TContext>
  timeout?: number
  retries?: number
}

export interface SagaDefinition<TContext = Record<string, unknown>> {
  name: string
  steps: SagaStep<TContext>[]
  onComplete?: (context: TContext) => Promise<void>
  onFailed?: (
    context: TContext,
    error: Error,
    failedStep: string,
  ) => Promise<void>
}

export interface StepResult {
  name: string
  status: StepStatus
  startedAt: string
  completedAt?: string
  error?: string
}

export interface SagaExecution<TContext = Record<string, unknown>> {
  id: string
  sagaName: string
  status: 'running' | 'completed' | 'failed' | 'compensating'
  context: TContext
  currentStep: number
  stepResults: StepResult[]
  startedAt: string
  completedAt?: string
}

export interface SagaLogger {
  info: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

export interface SagaOrchestratorOptions {
  logger?: SagaLogger
  onStepComplete?: (
    execution: SagaExecution,
    stepName: string,
  ) => Promise<void>
  onStepFailed?: (
    execution: SagaExecution,
    stepName: string,
    error: Error,
  ) => Promise<void>
  persistExecution?: (execution: SagaExecution) => Promise<void>
}
