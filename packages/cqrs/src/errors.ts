export class CommandNotRegisteredError extends Error {
  public readonly commandType: string;

  constructor(commandType: string) {
    super(`No handler registered for command "${commandType}"`);
    this.name = "CommandNotRegisteredError";
    this.commandType = commandType;
  }
}

export class QueryNotRegisteredError extends Error {
  public readonly queryType: string;

  constructor(queryType: string) {
    super(`No handler registered for query "${queryType}"`);
    this.name = "QueryNotRegisteredError";
    this.queryType = queryType;
  }
}

export class CommandValidationError extends Error {
  public readonly commandType: string;
  public readonly issues: readonly unknown[];

  constructor(commandType: string, issues: readonly unknown[]) {
    super(`Validation failed for command "${commandType}"`);
    this.name = "CommandValidationError";
    this.commandType = commandType;
    this.issues = issues;
  }
}
