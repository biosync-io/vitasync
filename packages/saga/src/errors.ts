export class SagaExecutionError extends Error {
  public readonly sagaName: string
  public readonly failedStep: string
  public readonly executionId: string
  public readonly cause: Error

  constructor(options: {
    sagaName: string
    failedStep: string
    executionId: string
    cause: Error
  }) {
    super(
      `Saga "${options.sagaName}" failed at step "${options.failedStep}": ${options.cause.message}`,
    )
    this.name = 'SagaExecutionError'
    this.sagaName = options.sagaName
    this.failedStep = options.failedStep
    this.executionId = options.executionId
    this.cause = options.cause
  }
}

export class SagaCompensationError extends Error {
  public readonly sagaName: string
  public readonly compensationStep: string
  public readonly executionId: string
  public readonly originalError: Error
  public readonly compensationError: Error

  constructor(options: {
    sagaName: string
    compensationStep: string
    executionId: string
    originalError: Error
    compensationError: Error
  }) {
    super(
      `Saga "${options.sagaName}" compensation failed at step "${options.compensationStep}": ${options.compensationError.message} (original error: ${options.originalError.message})`,
    )
    this.name = 'SagaCompensationError'
    this.sagaName = options.sagaName
    this.compensationStep = options.compensationStep
    this.executionId = options.executionId
    this.originalError = options.originalError
    this.compensationError = options.compensationError
  }
}

export class SagaTimeoutError extends Error {
  public readonly stepName: string
  public readonly timeoutMs: number

  constructor(stepName: string, timeoutMs: number) {
    super(`Step "${stepName}" exceeded timeout of ${timeoutMs}ms`)
    this.name = 'SagaTimeoutError'
    this.stepName = stepName
    this.timeoutMs = timeoutMs
  }
}
