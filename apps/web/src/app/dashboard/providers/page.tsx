"use client"

import { useQuery } from "@tanstack/react-query"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type ProviderDef, type Connection, providersApi, connectionsApi, usersApi } from "../../../lib/api"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

const PROVIDER_COLORS: Record<string, { bg: string; icon: string }> = {
  fitbit: { bg: "from-teal-400 to-cyan-500", icon: "⌚" },
  garmin: { bg: "from-blue-500 to-indigo-600", icon: "🏔️" },
  whoop: { bg: "from-orange-400 to-red-500", icon: "💪" },
  strava: { bg: "from-orange-500 to-orange-600", icon: "🏃" },
  withings: { bg: "from-green-400 to-emerald-500", icon: "🩺" },
  polar: { bg: "from-red-400 to-rose-500", icon: "❤️" },
}

export default function ProvidersPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()

  const { data: providers = [], isLoading } = useQuery<ProviderDef[]>({
    queryKey: ["providers"],
    queryFn: () => providersApi.list(),
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
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} isConnected={connectedProviderIds.has(provider.id)} selectedUserId={selectedUserId} />
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">OAuth Authorization URL</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          To connect a user to a provider, redirect their browser to:
        </p>
        <code className="block rounded-xl bg-gray-900 dark:bg-gray-950 px-5 py-3.5 text-sm text-emerald-400 font-mono overflow-auto">
          {`GET ${API_URL}/v1/oauth/{providerId}/authorize?userId={userId}`}
        </code>
      </div>
    </div>
  )
}

function ProviderCard({ provider, isConnected, selectedUserId }: { provider: ProviderDef; isConnected: boolean; selectedUserId: string }) {
  const colors = PROVIDER_COLORS[provider.id] ?? { bg: "from-gray-400 to-gray-500", icon: "🔗" }

  const handleConnect = () => {
    if (!selectedUserId) return
    window.open(`/api/v1/oauth/${provider.id}/authorize?userId=${selectedUserId}`, "_blank", "width=600,height=700")
  }

  return (
    <div className={`rounded-2xl border bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 group ${
      isConnected ? "border-emerald-300 dark:border-emerald-800/60" : "border-gray-200/60 dark:border-gray-800/60"
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center text-white text-lg shadow-lg group-hover:scale-110 transition-transform`}>
            {colors.icon}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{provider.name}</h3>
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
      {/* Connect / Connected */}
      {selectedUserId ? (
        isConnected ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Connected</span>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white hover:from-indigo-600 hover:to-purple-700 shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:-translate-y-0.5 transition-all duration-200"
          >
            Connect {provider.name}
          </button>
        )
      ) : (
        <p className="text-[10px] text-gray-400 italic">Select a user above to connect</p>
      )}
    </div>
  )
}
