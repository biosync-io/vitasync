export interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  metadata: {
    userId?: string;
    workspaceId?: string;
    requestId?: string;
    timestamp: string;
    version: number;
  };
}

/** Input metadata — timestamp and version are auto-filled by EventBus.publish(). */
export interface DomainEventInput<T = unknown> {
  id?: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  metadata?: {
    userId?: string;
    workspaceId?: string;
    requestId?: string;
    timestamp?: string;
    version?: number;
  };
}

export type EventHandler<T = unknown> = (
  event: DomainEvent<T>,
) => Promise<void>;

export interface EventBusOptions {
  redis?: { host: string; port: number } | string;
  channelPrefix?: string;
  enablePersistence?: boolean;
  maxRetries?: number;
  logger?: {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
}

export interface EventBusLogger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}
