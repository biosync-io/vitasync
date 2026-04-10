import { QueryNotRegisteredError } from "./errors.ts";
import type { Query, QueryHandler, QueryMiddleware } from "./types.ts";

export class QueryBus {
  private readonly handlers = new Map<string, QueryHandler>();
  private readonly middlewares: QueryMiddleware[] = [];

  /** Register a handler for a query type. Exactly one handler per type. */
  register<TParams = unknown, TResult = unknown>(
    queryType: string,
    handler: QueryHandler<TParams, TResult>,
  ): void {
    if (this.handlers.has(queryType)) {
      throw new Error(
        `Duplicate handler registration for query "${queryType}"`,
      );
    }
    this.handlers.set(queryType, handler as QueryHandler);
  }

  /** Add middleware that wraps every query dispatch. */
  use(middleware: QueryMiddleware): void {
    this.middlewares.push(middleware);
  }

  /** Dispatch a query through the middleware chain → handler. */
  async dispatch<TResult = unknown>(query: Query): Promise<TResult> {
    const handler = this.handlers.get(query.type);
    if (!handler) {
      throw new QueryNotRegisteredError(query.type);
    }

    const execute = () => handler(query);

    const chain = this.middlewares.reduceRight<() => Promise<unknown>>(
      (next, middleware) => () => middleware(query, next),
      execute,
    );

    return (await chain()) as TResult;
  }

  /** List all registered query types (useful for diagnostics). */
  getRegisteredQueries(): string[] {
    return [...this.handlers.keys()];
  }
}
