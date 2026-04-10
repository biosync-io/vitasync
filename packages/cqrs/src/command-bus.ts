import { CommandNotRegisteredError } from "./errors.ts";
import type { Command, CommandHandler, CommandMiddleware } from "./types.ts";

export class CommandBus {
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly middlewares: CommandMiddleware[] = [];

  /** Register a handler for a command type. Exactly one handler per type. */
  register<TPayload = unknown, TResult = unknown>(
    commandType: string,
    handler: CommandHandler<TPayload, TResult>,
  ): void {
    if (this.handlers.has(commandType)) {
      throw new Error(
        `Duplicate handler registration for command "${commandType}"`,
      );
    }
    this.handlers.set(commandType, handler as CommandHandler);
  }

  /** Add middleware that wraps every command dispatch. */
  use(middleware: CommandMiddleware): void {
    this.middlewares.push(middleware);
  }

  /** Dispatch a command through the middleware chain → handler. */
  async dispatch<TResult = unknown>(command: Command): Promise<TResult> {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      throw new CommandNotRegisteredError(command.type);
    }

    const execute = () => handler(command);

    // Build middleware chain from right to left (outermost middleware runs first)
    const chain = this.middlewares.reduceRight<() => Promise<unknown>>(
      (next, middleware) => () => middleware(command, next),
      execute,
    );

    return (await chain()) as TResult;
  }

  /** List all registered command types (useful for diagnostics). */
  getRegisteredCommands(): string[] {
    return [...this.handlers.keys()];
  }
}
