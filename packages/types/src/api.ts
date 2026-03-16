/** Workspace — top-level tenant unit */
export interface Workspace {
  id: string
  name: string
  slug: string
  createdAt: Date
  updatedAt: Date
}

/** API Key — for authenticating workspace API calls */
export interface ApiKey {
  id: string
  workspaceId: string
  name: string
  /** First 8 chars of the key for display */
  keyPrefix: string
  scopes: ApiKeyScope[]
  lastUsedAt?: Date
  expiresAt?: Date
  createdAt: Date
}

export const ApiKeyScope = {
  READ: "read",
  WRITE: "write",
  ADMIN: "admin",
} as const
export type ApiKeyScope = (typeof ApiKeyScope)[keyof typeof ApiKeyScope]

/** End-user whose wearable devices are connected */
export interface User {
  id: string
  workspaceId: string
  /** Optional stable ID from the caller's own system */
  externalId?: string
  email?: string
  displayName?: string
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

/** Webhook endpoint registration */
export interface Webhook {
  id: string
  workspaceId: string
  url: string
  events: WebhookEvent[]
  isActive: boolean
  description?: string
  createdAt: Date
}

export const WebhookEvent = {
  SYNC_COMPLETED: "sync.completed",
  SYNC_FAILED: "sync.failed",
  CONNECTION_CREATED: "connection.created",
  CONNECTION_DISCONNECTED: "connection.disconnected",
  USER_CREATED: "user.created",
  USER_DELETED: "user.deleted",
} as const
export type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent]

// ── Pagination ──────────────────────────────────────────────────────────────

/** Offset-based pagination parameters */
export interface PaginationParams {
  limit?: number
  offset?: number
}

/** Result with offset-based pagination metadata */
export interface PaginatedResult<T> {
  data: T[]
  limit: number
  offset: number
  count: number
}

/**
 * Cursor-based pagination parameters.
 * Cursor is an opaque base64-encoded string encoding the last seen row's id + timestamp.
 * This enables stable, efficient pagination on large result sets without offset drift.
 */
export interface CursorPaginationParams {
  cursor?: string
  limit?: number
}

/** Result with cursor-based pagination metadata */
export interface CursorPaginatedResult<T> {
  data: T[]
  nextCursor?: string
  hasMore: boolean
}

// ── Webhooks ────────────────────────────────────────────────────────────────

/** A webhook delivery attempt */
export interface WebhookDelivery {
  id: string
  webhookId: string
  eventType: WebhookEvent
  payload: Record<string, unknown>
  status: "pending" | "delivered" | "failed"
  attempts: number
  lastAttemptedAt?: Date
  deliveredAt?: Date
  responseStatus?: number
  createdAt: Date
}

/** Sync job tracking record */
export interface SyncJob {
  id: string
  connectionId: string
  status: "pending" | "running" | "completed" | "failed"
  startedAt?: Date
  completedAt?: Date
  error?: string
  metricsSynced: number
  createdAt: Date
}

// ── API Errors ────────────────────────────────────────────────

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]
