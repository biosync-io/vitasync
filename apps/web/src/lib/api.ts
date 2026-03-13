/**
 * VitaSync API client — thin wrapper around fetch.
 * All requests go through this client so the API URL and auth header
 * are set in one place.
 */

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey =
    typeof window !== "undefined"
      ? (localStorage.getItem("vitasync_api_key") ?? "")
      : ""

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
  create: (body: { externalId: string; email?: string; displayName?: string }) =>
    request<User>("/v1/users", { method: "POST", body: JSON.stringify(body) }),
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
  summary: (userId: string) =>
    request<HealthSummary[]>(`/v1/users/${userId}/health/summary`),
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

// ---- Webhooks ----
export const webhooksApi = {
  list: () => request<Webhook[]>("/v1/webhooks"),
  create: (body: { url: string; secret: string; events: string[]; description?: string }) =>
    request<Webhook>("/v1/webhooks", { method: "POST", body: JSON.stringify(body) }),
  toggle: (id: string, isActive: boolean) =>
    request<Webhook>(`/v1/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
  delete: (id: string) => request<void>(`/v1/webhooks/${id}`, { method: "DELETE" }),
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
