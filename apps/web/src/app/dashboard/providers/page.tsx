"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type ProviderDef, type Connection, providersApi, connectionsApi, usersApi, getRuntimeDefaultKey } from "../../../lib/api"

/** Resolve the public-facing API URL for display in docs/config sections */
function useApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // In browser: use current origin (works in any deployment)
    return window.location.origin
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
}

const PROVIDER_COLORS: Record<string, { bg: string; icon: string }> = {
  fitbit: { bg: "from-teal-400 to-cyan-500", icon: "⌚" },
  garmin: { bg: "from-blue-500 to-indigo-600", icon: "🏔️" },
  whoop: { bg: "from-orange-400 to-red-500", icon: "💪" },
  strava: { bg: "from-orange-500 to-orange-600", icon: "🏃" },
  withings: { bg: "from-green-400 to-emerald-500", icon: "🩺" },
  polar: { bg: "from-red-400 to-rose-500", icon: "❤️" },
}

/** All providers VitaSync supports — shown even if not configured */
const ALL_SUPPORTED_PROVIDERS: ProviderDef[] = [
  { id: "fitbit", name: "Fitbit", description: "Steps, heart rate, sleep, body composition, SpO₂, workouts. Syncs every 15 minutes.", authType: "oauth2", capabilities: ["steps", "heart_rate", "sleep", "body_fat", "blood_oxygen", "workout"], logoUrl: null },
  { id: "garmin", name: "Garmin", description: "Steps, GPS workouts, HRV, stress, body battery, sleep. Real-time push via webhooks.", authType: "oauth1" as "oauth2", capabilities: ["steps", "heart_rate", "heart_rate_variability", "sleep", "workout", "stress"], logoUrl: null },
  { id: "whoop", name: "WHOOP", description: "Recovery scores, HRV, sleep performance, strain, workouts. Webhook support for real-time.", authType: "oauth2", capabilities: ["recovery_score", "heart_rate_variability", "sleep", "strain_score", "workout", "blood_oxygen"], logoUrl: null },
  { id: "strava", name: "Strava", description: "Workouts, distance, calories, GPS routes, heart rate. On-demand sync.", authType: "oauth2", capabilities: ["workout", "distance", "calories", "heart_rate"], logoUrl: null },
  { id: "withings", name: "Withings", description: "Weight, body composition, blood pressure, sleep, temperature. Coming soon.", authType: "oauth2", capabilities: ["weight", "body_fat", "blood_pressure", "sleep", "temperature"], logoUrl: null },
  { id: "polar", name: "Polar", description: "Heart rate, workouts, sleep, recovery. Coming soon.", authType: "oauth2", capabilities: ["heart_rate", "workout", "sleep", "recovery_score"], logoUrl: null },
]

export default function ProvidersPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const apiBaseUrl = useApiBaseUrl()

  const { data: apiProviders = [], isLoading } = useQuery<ProviderDef[]>({
    queryKey: ["providers"],
    queryFn: () => providersApi.list(),
  })

  // Merge: show all supported providers, mark which are configured
  const configuredIds = new Set(apiProviders.map((p) => p.id))
  const allProviders = ALL_SUPPORTED_PROVIDERS.map((sp) => {
    const configured = apiProviders.find((p) => p.id === sp.id)
    return { ...sp, ...(configured ?? {}), isConfigured: configuredIds.has(sp.id) }
  })

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["connections", selectedUserId],
    queryFn: () => connectionsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })

  const connectedProviderIds = new Set(connections.map((c) => c.providerId))

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-down">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Providers</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Connect wearable devices via OAuth. Each user can connect to multiple providers simultaneously.
        </p>
      </div>

      {/* User select */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
        <label htmlFor="prov-user" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Select User to View Connections</label>
        <select id="prov-user" className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/40 transition-all" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {/* Connected providers status */}
      {selectedUserId && connections.length > 0 && (
        <div className="rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50/60 to-teal-50/30 dark:from-emerald-950/30 dark:to-teal-950/15 backdrop-blur-xl p-5 shadow-card">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-3">Connected Providers ({connections.length})</h2>
          <div className="flex flex-wrap gap-3">
            {connections.map((conn) => {
              const colors = PROVIDER_COLORS[conn.providerId] ?? { bg: "from-gray-400 to-gray-500", icon: "🔗" }
              return (
                <div key={conn.id} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-white/80 dark:bg-gray-900/80 px-4 py-2.5 shadow-sm">
                  <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${colors.bg} flex items-center justify-center text-white text-sm shadow-md`}>
                    {colors.icon}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{conn.providerId}</span>
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Connected
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton loader — items have no stable identity
            <div key={i} className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-grid">
          {allProviders.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} isConnected={connectedProviderIds.has(provider.id)} isConfigured={provider.isConfigured} selectedUserId={selectedUserId} users={users} onSelectUser={setSelectedUserId} />
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">OAuth Authorization URL</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          To connect a user to a provider, redirect their browser to:
        </p>
        <code className="block rounded-xl bg-gray-900 dark:bg-gray-950 px-5 py-3.5 text-sm text-emerald-400 font-mono overflow-auto">
          {`GET ${apiBaseUrl}/v1/oauth/{providerId}/authorize?userId={userId}`}
        </code>
      </div>

      {/* Inbound Provider Webhooks */}
      <div className="rounded-2xl border border-blue-200/60 dark:border-blue-800/40 bg-gradient-to-br from-blue-50/60 to-indigo-50/30 dark:from-blue-950/30 dark:to-indigo-950/15 backdrop-blur-xl p-6 shadow-card">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">Inbound Provider Webhooks</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Some providers can push real-time updates to VitaSync instead of waiting for scheduled syncs.
          Configure the webhook URL in each provider&apos;s developer dashboard.
        </p>

        <div className="space-y-4">
          {/* WHOOP */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-sm shadow-md">💪</div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">WHOOP Webhooks</h3>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Supported</span>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Webhook URL (paste in WHOOP Developer Dashboard)</p>
                <code className="block rounded-lg bg-gray-900 dark:bg-gray-950 px-4 py-2.5 text-xs text-emerald-400 font-mono overflow-auto select-all">
                  {`${apiBaseUrl}/v1/inbound/whoop/webhook`}
                </code>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Events received</p>
                <div className="flex flex-wrap gap-1.5">
                  {["workout.updated", "workout.deleted", "sleep.updated", "sleep.deleted", "recovery.updated", "recovery.deleted"].map((evt) => (
                    <span key={evt} className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">{evt}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Setup steps</p>
                <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                  <li>Go to <a href="https://developer-dashboard.whoop.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">WHOOP Developer Dashboard</a></li>
                  <li>Open your app settings → Webhooks section</li>
                  <li>Paste the URL above and select <strong>v2</strong> model version</li>
                  <li>Set <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-[10px]">WHOOP_WEBHOOK_SECRET</code> env var to your app&apos;s client secret</li>
                  <li>Save — WHOOP will now push real-time workout/sleep/recovery events</li>
                </ol>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2">
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  <strong>Signature verification:</strong> VitaSync validates every incoming webhook using HMAC-SHA256 with <code className="bg-amber-100 dark:bg-amber-800/30 px-1 rounded">X-WHOOP-Signature</code> and <code className="bg-amber-100 dark:bg-amber-800/30 px-1 rounded">X-WHOOP-Signature-Timestamp</code> headers.
                </p>
              </div>
            </div>
          </div>

          {/* Other providers */}
          <div className="rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-800/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-1">
                {["⌚", "🏔️", "🏃"].map((icon, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static icons
                  <div key={i} className="h-6 w-6 rounded-md bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs border-2 border-white dark:border-gray-900">{icon}</div>
                ))}
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Fitbit, Garmin, Strava — use scheduled polling (every 15 min)</p>
                <p className="text-[10px] text-gray-400">Webhook support can be added per provider. See the developer docs for extending.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProviderCard({ provider, isConnected, isConfigured, selectedUserId, users, onSelectUser }: {
  provider: ProviderDef
  isConnected: boolean
  isConfigured: boolean
  selectedUserId: string
  users: Array<{ id: string; displayName: string | null; externalId: string | null }>
  onSelectUser: (id: string) => void
}) {
  const colors = PROVIDER_COLORS[provider.id] ?? { bg: "from-gray-400 to-gray-500", icon: "🔗" }
  const [showUserPicker, setShowUserPicker] = useState(false)

  const handleConnect = () => {
    if (!selectedUserId) {
      setShowUserPicker(true)
      return
    }
    window.open(`/api/v1/oauth/${provider.id}/authorize?userId=${selectedUserId}`, "_blank", "width=600,height=700")
  }

  const handleSelectAndConnect = (userId: string) => {
    onSelectUser(userId)
    setShowUserPicker(false)
    // Small delay to let state propagate
    setTimeout(() => {
      window.open(`/api/v1/oauth/${provider.id}/authorize?userId=${userId}`, "_blank", "width=600,height=700")
    }, 100)
  }

  return (
    <div className={`rounded-2xl border bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 group ${
      isConnected ? "border-emerald-300 dark:border-emerald-800/60 ring-1 ring-emerald-200 dark:ring-emerald-800/30" : "border-gray-200/60 dark:border-gray-800/60"
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center text-white text-2xl shadow-lg group-hover:scale-110 transition-transform`}>
            {colors.icon}
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{provider.name}</h3>
            <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${
              provider.authType === "oauth2"
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
            }`}>
              {provider.authType?.toUpperCase() ?? "OAUTH2"}
            </span>
          </div>
        </div>
        {isConnected && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{provider.description}</p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {provider.capabilities.map((cap) => (
          <span key={cap} className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 capitalize">
            {cap.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {/* Connect button — always visible */}
      {isConnected ? (
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 px-4 py-2.5">
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">✓ Connected & Syncing</span>
          <span className="text-[10px] text-emerald-500">Auto-sync active</span>
        </div>
      ) : !isConfigured ? (
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 px-4 py-3 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">🔒 Not Configured</p>
          <p className="text-[10px] text-gray-400">Add credentials to <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">.env</code> to enable</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={handleConnect}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 text-sm font-bold text-white hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all duration-200"
          >
            🔗 Connect {provider.name}
          </button>

          {/* Inline user picker — shown when no user selected */}
          {showUserPicker && !selectedUserId && (
            <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-3 animate-fade-in">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-2">Select a user to connect:</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectAndConnect(u.id)}
                    className="w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    {u.displayName || u.externalId}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
