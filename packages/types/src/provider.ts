import type { HealthMetric, HealthMetricType } from "./health.js"

/** OAuth 2.0 token set returned after authorization */
export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  tokenType?: string
  expiresAt?: Date
  /** Raw provider response for any extra fields */
  raw?: Record<string, unknown>
}

/** OAuth 1.0a token set (e.g., Garmin) */
export interface OAuth1Tokens {
  token: string
  tokenSecret: string
  userId?: string
  raw?: Record<string, unknown>
}

export type ProviderTokens = OAuthTokens | OAuth1Tokens

/** Options controlling a data sync operation */
export interface SyncOptions {
  startDate?: Date
  endDate?: Date
  dataTypes?: HealthMetricType[]
  /** If true, re-sync data even if already synced in this window */
  force?: boolean
}

/** Capabilities reported by a provider */
export interface ProviderCapabilities {
  /** Which metric types this provider supports */
  supportedMetrics: HealthMetricType[]
  /** Whether push webhooks are supported (vs polling) */
  supportsWebhooks: boolean
  /** Whether the provider uses OAuth 2.0 */
  oauth2: boolean
  /** Whether the provider uses OAuth 1.0a */
  oauth1: boolean
  /** Minimum allowed sync interval in seconds */
  minSyncIntervalSeconds?: number
}

/** Static configuration describing a provider */
export interface ProviderDefinition {
  /** Stable lowercase identifier (e.g., "garmin", "fitbit") */
  id: string
  /** Human-readable display name */
  name: string
  description: string
  logoUrl?: string
  capabilities: ProviderCapabilities
  /** Link to provider OAuth developer console */
  docsUrl?: string
}

/** A registered user-provider connection */
export interface ProviderConnection {
  id: string
  userId: string
  providerId: string
  status: "active" | "revoked" | "expired" | "error"
  providerUserId?: string
  scopes?: string[]
  lastSyncedAt?: Date
  createdAt: Date
  updatedAt: Date
}

/** Result of a completed sync operation */
export interface SyncResult {
  connectionId: string
  providerId: string
  metricsSynced: number
  errors: string[]
  startedAt: Date
  completedAt: Date
}

/** Normalized data yielded during a sync */
export type SyncDataPoint = Omit<HealthMetric, "id" | "userId" | "connectionId" | "createdAt">
