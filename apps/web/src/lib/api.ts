/**
 * VitaSync API client — thin wrapper around fetch.
 * All requests go through this client so the API URL and auth header
 * are set in one place.
 */

// Relative prefix — browser calls /api/v1/... which the Next.js route handler
// proxies to INTERNAL_API_URL (vitasync-api:3001 in K8s, localhost:3001 in dev).
const API_URL = "/api"

// Cache for the runtime default key fetched from /api/config.
// NEXT_PUBLIC_* vars are baked in at build time; the /api/config route
// exposes the runtime DEFAULT_API_KEY env var injected by Helm in K8s.
let _runtimeDefaultKey: string | null = null

export async function getRuntimeDefaultKey(): Promise<string> {
  // Fast path: build-time NEXT_PUBLIC_ var (works in dev / CI)
  if (process.env.NEXT_PUBLIC_DEFAULT_API_KEY) return process.env.NEXT_PUBLIC_DEFAULT_API_KEY
  // Cache after first fetch so every request doesn't hit /api/config
  if (_runtimeDefaultKey !== null) return _runtimeDefaultKey
  try {
    const res = await fetch("/api/config")
    const data = await res.json()
    _runtimeDefaultKey = (data as { defaultApiKey?: string }).defaultApiKey ?? ""
  } catch {
    _runtimeDefaultKey = ""
  }
  return _runtimeDefaultKey
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const localKey =
    typeof window !== "undefined" ? localStorage.getItem("vitasync_api_key") : null
  const apiKey = localKey ?? (await getRuntimeDefaultKey())

  if (!apiKey) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/dashboard/settings")) {
      window.location.href = "/dashboard/settings?setup=1"
    }
    throw new Error("No API key configured.")
  }

  const hasBody = init?.body != null
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${apiKey}`,
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(body?.message ?? `API error: ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---- Providers ----
export const providersApi = {
  list: () => request<ProviderDef[]>("/v1/providers"),
}

// ---- Users ----
export const usersApi = {
  list: (opts?: { limit?: number; offset?: number }) =>
    request<User[]>(`/v1/users?limit=${opts?.limit ?? 50}&offset=${opts?.offset ?? 0}`),
  get: (id: string) => request<User>(`/v1/users/${id}`),
  create: (body: { externalId: string; email?: string; displayName?: string }) =>
    request<User>("/v1/users", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: { email?: string; displayName?: string }) =>
    request<User>(`/v1/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/v1/users/${id}`, { method: "DELETE" }),
}

// ---- Connections ----
export const connectionsApi = {
  list: (userId: string) => request<Connection[]>(`/v1/users/${userId}/connections`),
  sync: (userId: string, connectionId: string) =>
    request<{ message: string }>(`/v1/users/${userId}/connections/${connectionId}/sync`, {
      method: "POST",
    }),
  disconnect: (userId: string, connectionId: string) =>
    request<void>(`/v1/users/${userId}/connections/${connectionId}`, { method: "DELETE" }),
}

// ---- Health data ----
export const healthApi = {
  query: (
    userId: string,
    opts?: { metricType?: string; from?: string; to?: string; limit?: number; offset?: number },
  ) => {
    const params = new URLSearchParams()
    if (opts?.metricType) params.set("metricType", opts.metricType)
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    if (opts?.limit) params.set("limit", String(opts.limit))
    if (opts?.offset) params.set("offset", String(opts.offset))
    return request<{ data: HealthMetric[]; count: number }>(`/v1/users/${userId}/health?${params}`)
  },
  summary: (userId: string) => request<HealthSummary[]>(`/v1/users/${userId}/health/summary`),
}

// ---- API Keys ----
export const apiKeysApi = {
  list: () => request<ApiKey[]>("/v1/api-keys"),
  create: (body: { name: string; scopes: string[]; expiresAt?: string }) =>
    request<ApiKey & { rawKey: string }>("/v1/api-keys", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revoke: (id: string) => request<void>(`/v1/api-keys/${id}`, { method: "DELETE" }),
}

// ---- Sync Jobs ----
export const syncJobsApi = {
  list: () => request<{ jobs: SyncJob[] }>("/v1/sync-jobs"),
}

// ---- Webhooks ----
export const webhooksApi = {  list: () => request<Webhook[]>("/v1/webhooks"),
  create: (body: { url: string; secret: string; events: string[]; description?: string }) =>
    request<Webhook>("/v1/webhooks", { method: "POST", body: JSON.stringify(body) }),
  toggle: (id: string, isActive: boolean) =>
    request<Webhook>(`/v1/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
  delete: (id: string) => request<void>(`/v1/webhooks/${id}`, { method: "DELETE" }),
  deliveries: (id: string) => request<WebhookDelivery[]>(`/v1/webhooks/${id}/deliveries`),
}

// ---- Events ----
export const eventsApi = {
  list: (
    userId: string,
    opts?: { eventType?: string; from?: string; to?: string; limit?: number; cursor?: string },
  ) => {
    const params = new URLSearchParams()
    if (opts?.eventType) params.set("eventType", opts.eventType)
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    if (opts?.limit) params.set("limit", String(opts.limit))
    if (opts?.cursor) params.set("cursor", opts.cursor)
    return request<{ data: WorkoutEvent[]; nextCursor?: string; hasMore: boolean }>(
      `/v1/users/${userId}/events?${params}`,
    )
  },
}

// ---- Personal Records ----
export const personalRecordsApi = {
  list: (userId: string) =>
    request<{ data: PersonalRecord[] }>(`/v1/users/${userId}/personal-records`),
}

// ---- Shared types (local to client, not re-exported from @biosync-io/types to avoid SSR issues) ----
export interface ProviderDef {
  id: string
  name: string
  description: string
  authType: "oauth2" | "oauth1"
  capabilities: string[]
  logoUrl: string | null
}

export interface User {
  id: string
  externalId: string
  email: string | null
  displayName: string | null
  createdAt: string
}

export interface Connection {
  id: string
  userId: string
  providerId: string
  status: string
  connectedAt: string
  lastSyncedAt: string | null
}

export interface HealthMetric {
  id: string
  metricType: string
  recordedAt: string
  value: number
  unit: string | null
}

export interface HealthSummary {
  metricType: string
  count: number
  earliest: string
  latest: string
}

export interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export interface Webhook {
  id: string
  url: string
  events: string[]
  isActive: boolean
  description: string | null
  createdAt: string
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  eventType: string
  status: string
  attempts: number
  lastAttemptedAt: string | null
  deliveredAt: string | null
  responseStatus: number | null
  createdAt: string
}

export interface WorkoutEvent {
  id: string
  userId: string
  connectionId: string
  providerId: string
  eventType: "workout" | "sleep" | "activity"
  activityType: string | null
  title: string | null
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  distanceMeters: number | null
  caloriesKcal: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  avgSpeedMps: number | null
  elevationGainMeters: number | null
  notes: string | null
  createdAt: string
}

export interface PersonalRecord {
  id: string
  userId: string
  metricType: string
  category: string | null
  value: number
  unit: string | null
  recordedAt: string
  providerId: string
  updatedAt: string
}

export interface SyncJob {
  id: string | undefined
  state: "active" | "waiting" | "delayed" | "completed" | "failed"
  name: string
  data: { connectionId?: string; userId?: string; workspaceId?: string; type?: string }
  progress: number | object
  attemptsMade: number
  failedReason: string | null
  processedOn: number | null
  finishedOn: number | null
  timestamp: number
}
