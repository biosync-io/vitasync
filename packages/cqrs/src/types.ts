/** Metadata attached to every command. */
export interface CommandMetadata {
  userId: string;
  workspaceId: string;
  requestId?: string;
  timestamp: string;
}

/** Metadata attached to every query. */
export interface QueryMetadata {
  userId: string;
  workspaceId: string;
  requestId?: string;
}

/** Commands represent intent to change state. */
export interface Command<TPayload = unknown> {
  type: string;
  payload: TPayload;
  metadata: CommandMetadata;
}

/** Queries represent intent to read state. */
export interface Query<TParams = unknown> {
  type: string;
  params: TParams;
  metadata: QueryMetadata;
}

/** Handler for a single command type. */
export type CommandHandler<TPayload = unknown, TResult = unknown> = (
  command: Command<TPayload>,
) => Promise<TResult>;

/** Handler for a single query type. */
export type QueryHandler<TParams = unknown, TResult = unknown> = (
  query: Query<TParams>,
) => Promise<TResult>;

/** Middleware that wraps command dispatch (like Koa/Express). */
export type CommandMiddleware = (
  command: Command,
  next: () => Promise<unknown>,
) => Promise<unknown>;

/** Middleware that wraps query dispatch. */
export type QueryMiddleware = (
  query: Query,
  next: () => Promise<unknown>,
) => Promise<unknown>;

/** Minimal logger interface used by middleware. */
export interface CqrsLogger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}
