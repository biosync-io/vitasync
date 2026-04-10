import { CommandValidationError } from "./errors.ts";
import type {
  Command,
  CommandMiddleware,
  CqrsLogger,
  Query,
  QueryMiddleware,
} from "./types.ts";

/** Zod-compatible schema interface so we don't depend on zod at runtime. */
interface ZodLikeSchema {
  safeParse(data: unknown): {
    success: boolean;
    error?: { issues: readonly unknown[] };
  };
}

// ── Command middleware factories ────────────────────────────────────────

/** Log command dispatch, completion, and errors. */
export function loggingMiddleware(logger: CqrsLogger): CommandMiddleware {
  return async (command: Command, next: () => Promise<unknown>) => {
    const { type, metadata } = command;
    logger.info(`[CQRS] Dispatching command "${type}"`, {
      requestId: metadata.requestId,
      userId: metadata.userId,
    });

    const start = performance.now();
    try {
      const result = await next();
      const durationMs = Math.round(performance.now() - start);
      logger.info(`[CQRS] Command "${type}" completed in ${durationMs}ms`);
      return result;
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      logger.error(
        `[CQRS] Command "${type}" failed after ${durationMs}ms`,
        error,
      );
      throw error;
    }
  };
}

/** Validate command payloads against Zod schemas. */
export function validationMiddleware(
  schemas: Map<string, ZodLikeSchema>,
): CommandMiddleware {
  return async (command: Command, next: () => Promise<unknown>) => {
    const schema = schemas.get(command.type);
    if (schema) {
      const result = schema.safeParse(command.payload);
      if (!result.success) {
        throw new CommandValidationError(
          command.type,
          result.error?.issues ?? [],
        );
      }
    }
    return next();
  };
}

/** Track command execution duration via a callback. */
export function metricsMiddleware(
  onComplete: (commandType: string, durationMs: number, error?: Error) => void,
): CommandMiddleware {
  return async (command: Command, next: () => Promise<unknown>) => {
    const start = performance.now();
    try {
      const result = await next();
      onComplete(command.type, Math.round(performance.now() - start));
      return result;
    } catch (error) {
      onComplete(
        command.type,
        Math.round(performance.now() - start),
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  };
}

// ── Query middleware factories ──────────────────────────────────────────

/** In-memory query result caching with TTL. */
export function cachingMiddleware(
  cache: Map<string, { value: unknown; expiresAt: number }>,
  ttlMs: number,
): QueryMiddleware {
  return async (query: Query, next: () => Promise<unknown>) => {
    const key = `${query.type}:${JSON.stringify(query.params)}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const result = await next();
    cache.set(key, { value: result, expiresAt: Date.now() + ttlMs });
    return result;
  };
}
