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
  /** Gender – gates gender-specific insights (e.g. womens_health) */
  gender?: string | null
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
  ANOMALY_DETECTED: "anomaly.detected",
  GOAL_COMPLETED: "goal.completed",
  ACHIEVEMENT_UNLOCKED: "achievement.unlocked",
  HEALTH_SCORE_UPDATED: "health_score.updated",
  REPORT_READY: "report.ready",
  EXPORT_READY: "export.ready",
  CHALLENGE_COMPLETED: "challenge.completed",
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
  // Client errors
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  UNSUPPORTED: "UNSUPPORTED",

  // Provider errors
  PROVIDER_ERROR: "PROVIDER_ERROR",
  PROVIDER_AUTH_FAILED: "PROVIDER_AUTH_FAILED",
  PROVIDER_RATE_LIMITED: "PROVIDER_RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_REFRESH_FAILED: "TOKEN_REFRESH_FAILED",

  // Data errors
  SYNC_FAILED: "SYNC_FAILED",
  DATA_INTEGRITY_ERROR: "DATA_INTEGRITY_ERROR",
  ENCRYPTION_ERROR: "ENCRYPTION_ERROR",

  // System errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  DATABASE_ERROR: "DATABASE_ERROR",
  QUEUE_ERROR: "QUEUE_ERROR",
} as const
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

// ── AppError ──────────────────────────────────────────────────

/**
 * Structured application error with HTTP status code and machine-readable code.
 * Throw from services; the Fastify error handler serialises it to `{ code, message }`.
 */
export class AppError extends Error {
  override readonly name = "AppError"

  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }

  // ── Convenience factories ──────────────────────────────────

  static notFound(resource: string, id?: string): AppError {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`
    return new AppError(msg, ErrorCode.NOT_FOUND, 404)
  }

  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, ErrorCode.VALIDATION_ERROR, 400, details)
  }

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError(message, ErrorCode.UNAUTHORIZED, 401)
  }

  static forbidden(message = "Insufficient permissions"): AppError {
    return new AppError(message, ErrorCode.FORBIDDEN, 403)
  }

  static conflict(message: string): AppError {
    return new AppError(message, ErrorCode.CONFLICT, 409)
  }

  static rateLimited(message = "Rate limit exceeded"): AppError {
    return new AppError(message, ErrorCode.RATE_LIMITED, 429)
  }

  static accountLocked(message = "Account is temporarily locked. Try again later."): AppError {
    return new AppError(message, ErrorCode.ACCOUNT_LOCKED, 423)
  }

  static unsupported(message: string): AppError {
    return new AppError(message, ErrorCode.UNSUPPORTED, 400)
  }

  static providerError(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, ErrorCode.PROVIDER_ERROR, 502, details)
  }

  static internal(message = "Internal server error"): AppError {
    return new AppError(message, ErrorCode.INTERNAL_ERROR, 500)
  }

  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    }
  }
}
