import type { Command, CommandMetadata, Query, QueryMetadata } from "./types.ts";

/** Fluent helper to create a well-formed Command object. */
export function createCommand<TPayload>(
  type: string,
  payload: TPayload,
  metadata: CommandMetadata,
): Command<TPayload> {
  return { type, payload, metadata };
}

/** Fluent helper to create a well-formed Query object. */
export function createQuery<TParams>(
  type: string,
  params: TParams,
  metadata: QueryMetadata,
): Query<TParams> {
  return { type, params, metadata };
}
