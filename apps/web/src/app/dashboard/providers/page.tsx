"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect, useCallback, useRef } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type ProviderDef, type Connection, providersApi, connectionsApi, getRuntimeDefaultKey } from "../../../lib/api"
import { Unplug } from "lucide-react"
import { PageHeader, Card, CardHeader, CardContent, CardSkeleton, Badge, StatusDot, Button, EmptyState } from "../../../lib/components/ui"

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
  google_health_connect: { bg: "from-green-500 to-blue-500", icon: "🤖" },
  apple_health: { bg: "from-pink-400 to-red-400", icon: "🍎" },
}

/** All providers VitaSync supports — shown even if not configured */
const ALL_SUPPORTED_PROVIDERS: ProviderDef[] = [
  { id: "fitbit", name: "Fitbit", description: "Steps, heart rate, sleep, body composition, SpO₂, workouts. Syncs every 15 minutes.", authType: "oauth2", capabilities: ["steps", "heart_rate", "sleep", "body_fat", "blood_oxygen", "workout"], logoUrl: null },
  { id: "garmin", name: "Garmin", description: "Steps, GPS workouts, HRV, stress, body battery, sleep. Real-time push via webhooks.", authType: "oauth1" as "oauth2", capabilities: ["steps", "heart_rate", "heart_rate_variability", "sleep", "workout", "stress"], logoUrl: null },
  { id: "whoop", name: "WHOOP", description: "Recovery scores, HRV, sleep performance, strain, workouts. Webhook support for real-time.", authType: "oauth2", capabilities: ["recovery_score", "heart_rate_variability", "sleep", "strain_score", "workout", "blood_oxygen"], logoUrl: null },
  { id: "strava", name: "Strava", description: "Workouts, distance, calories, GPS routes, heart rate. On-demand sync.", authType: "oauth2", capabilities: ["workout", "distance", "calories", "heart_rate"], logoUrl: null },
  { id: "withings", name: "Withings", description: "Weight, body composition, blood pressure, sleep, temperature.", authType: "oauth2", capabilities: ["weight", "body_fat", "blood_pressure", "sleep", "temperature"], logoUrl: null },
  { id: "polar", name: "Polar", description: "Heart rate, workouts, sleep, recovery.", authType: "oauth2", capabilities: ["heart_rate", "workout", "sleep", "recovery_score"], logoUrl: null },
  { id: "google_health_connect", name: "Google Health Connect", description: "Android on-device health hub. Aggregates data from Samsung Health, Fitbit, and 100+ apps. Requires companion app.", authType: "oauth2", capabilities: ["steps", "heart_rate", "sleep", "workout", "weight", "blood_oxygen"], logoUrl: null },
  { id: "apple_health", name: "Apple Health", description: "iOS health data hub. Aggregates data from Apple Watch, apps, and medical records. Requires companion app.", authType: "oauth2", capabilities: ["steps", "heart_rate", "sleep", "workout", "weight", "blood_oxygen", "heart_rate_variability"], logoUrl: null },
]

export default function ProvidersPage() {
  const { selectedUserId } = useSelectedUser()
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


  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["connections", selectedUserId],
    queryFn: () => connectionsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })

  const activeConnections = connections.filter((c) => c.status === "connected")
  const connectedProviderIds = new Set(activeConnections.map((c) => c.providerId))

  return (
    <div className="space-y-8">
      <PageHeader title="Connected Devices" subtitle="Connect your wearable devices and health apps to sync data automatically." />

      {/* Connected providers status */}
      {selectedUserId && connections.length > 0 && (
        <Card glow="vitality">
          <CardHeader title={`Connected Providers (${activeConnections.length})`} />
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {connections.map((conn) => {
                const colors = PROVIDER_COLORS[conn.providerId] ?? { bg: "from-gray-400 to-gray-500", icon: "🔗" }
                const isActive = conn.status === "connected"
                return (
                  <div key={conn.id} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 shadow-sm ${
                    isActive
                      ? "border-emerald-200 dark:border-emerald-800/40 bg-white/80 dark:bg-gray-900/80"
                      : "border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20"
                  }`}>
                    <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${colors.bg} flex items-center justify-center text-white text-sm shadow-md`}>
                      {colors.icon}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{conn.providerId}</span>
                      <StatusDot status={isActive ? "online" : "warning"} />
                      <Badge variant={isActive ? "success" : "warning"} dot>{isActive ? "Connected" : "Disconnected"}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedUserId && connections.length === 0 && !isLoading && (
        <EmptyState
          icon={Unplug}
          title="No providers connected"
          description="Connect a wearable device or health app below to start syncing your health data."
        />
      )}

      {isLoading ? (
        <CardSkeleton count={4} className="lg:grid-cols-3" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-grid">
          {allProviders.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} isConnected={connectedProviderIds.has(provider.id)} connection={connections.find((c) => c.providerId === provider.id)} isConfigured={provider.isConfigured} selectedUserId={selectedUserId} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader title="OAuth Authorization URL" />
        <CardContent>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            To connect a user to a provider, redirect their browser to:
          </p>
          <code className="block rounded-xl bg-gray-900 dark:bg-gray-950 px-5 py-3.5 text-sm text-emerald-400 font-mono overflow-auto">
            {`GET ${apiBaseUrl}/v1/oauth/{providerId}/authorize?userId={userId}`}
          </code>
        </CardContent>
      </Card>

      {/* Inbound Provider Webhooks */}
      <Card glow="brand">
        <CardHeader title="Inbound Provider Webhooks" subtitle="Some providers can push real-time updates to VitaSync instead of waiting for scheduled syncs. Configure the webhook URL in each provider's developer dashboard." />
        <CardContent>
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
                      <Badge key={evt} variant="info" size="sm">{evt}</Badge>
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
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 px-3 py-2">
                  <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">How to verify it&apos;s working:</p>
                  <ol className="text-[10px] text-emerald-600 dark:text-emerald-400 space-y-0.5 list-decimal list-inside">
                    <li>Check <a href="/dashboard/sync-jobs" className="underline font-medium">Sync Jobs</a> — webhook-triggered syncs appear here</li>
                    <li>Check API server logs: <code className="bg-emerald-100 dark:bg-emerald-800/30 px-1 rounded">docker compose logs api | grep &quot;inbound webhook&quot;</code></li>
                    <li>Check <a href="/dashboard/notification-logs" className="underline font-medium">Notification Logs</a> — sync failures appear if notification rules are set</li>
                    <li>In WHOOP app: log an activity or edit sleep → webhook fires within seconds</li>
                  </ol>
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
        </CardContent>
      </Card>
    </div>
  )
}

function ProviderCard({ provider, isConnected, connection, isConfigured, selectedUserId }: {
  provider: ProviderDef
  isConnected: boolean
  connection?: Connection | undefined
  isConfigured: boolean
  selectedUserId: string
}) {
  const colors = PROVIDER_COLORS[provider.id] ?? { bg: "from-gray-400 to-gray-500", icon: "🔗" }
  const [oauthModal, setOauthModal] = useState<{ userId: string } | null>(null)

  const isDisconnected = connection != null && !isConnected

  const handleConnect = () => {
    setOauthModal({ userId: selectedUserId })
  }

  return (
    <>
      <Card hover className={
        isConnected ? "border-emerald-300 dark:border-emerald-800/60 ring-1 ring-emerald-200 dark:ring-emerald-800/30"
          : isDisconnected ? "border-amber-300 dark:border-amber-800/60 ring-1 ring-amber-200 dark:ring-amber-800/30"
          : ""
      }>
        <CardContent>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center text-white text-2xl shadow-lg group-hover:scale-110 transition-transform`}>
                {colors.icon}
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{provider.name}</h3>
                <Badge variant="info" size="sm">
                  {provider.authType?.toUpperCase() ?? "OAUTH2"}
                </Badge>
              </div>
            </div>
            {isConnected && (
              <Badge variant="success" dot pulse>Active</Badge>
            )}
            {isDisconnected && (
              <Badge variant="warning" dot>Disconnected</Badge>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{provider.description}</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {provider.capabilities.map((cap) => (
              <Badge key={cap} variant="default" size="sm">
                {cap.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>

          {/* Connect button — always visible */}
          {isConnected ? (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <StatusDot status="success" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Connected & Syncing</span>
              </div>
              <span className="text-[10px] text-emerald-500">Auto-sync active</span>
            </div>
          ) : isDisconnected ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <StatusDot status="warning" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Disconnected</span>
                </div>
                <span className="text-[10px] text-amber-500">Sync paused</span>
              </div>
              <Button variant="secondary" onClick={handleConnect} className="w-full">
                🔄 Reconnect {provider.name}
              </Button>
            </div>
          ) : !isConfigured ? (
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/40 px-4 py-3 text-center">
              <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400">Coming Soon</p>
              <p className="text-[10px] text-indigo-500 dark:text-indigo-400/70 mt-0.5">{provider.name} integration is not yet enabled on this instance</p>
            </div>
          ) : (
            <Button variant="primary" onClick={handleConnect} className="w-full">
              🔗 Connect {provider.name}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* OAuth modal */}
      {oauthModal && (
        <OAuthModal
          providerId={provider.id}
          providerName={provider.name}
          providerIcon={colors.icon}
          providerBg={colors.bg}
          userId={oauthModal.userId}
          onClose={() => setOauthModal(null)}
        />
      )}
    </>
  )
}

// ── OAuth Modal ───────────────────────────────────────────────

type OAuthStatus = "idle" | "waiting" | "success" | "error"

function OAuthModal({ providerId, providerName, providerIcon, providerBg, userId, onClose }: {
  providerId: string
  providerName: string
  providerIcon: string
  providerBg: string
  userId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<OAuthStatus>("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const popupRef = useRef<Window | null>(null)

  const openPopup = useCallback(() => {
    setStatus("waiting")
    setErrorMsg("")
    const w = 500
    const h = 650
    const left = window.screenX + (window.outerWidth - w) / 2
    const top = window.screenY + (window.outerHeight - h) / 2
    popupRef.current = window.open(
      `/api/v1/oauth/${providerId}/authorize?userId=${userId}`,
      `vitasync-oauth-${providerId}`,
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`,
    )
  }, [providerId, userId])

  // Listen for result via postMessage OR localStorage (fallback when window.opener is null)
  useEffect(() => {
    function handleResult(data: { type?: string; success?: boolean; error?: string }) {
      if (data?.type !== "vitasync-oauth-result") return
      if (data.success) {
        setStatus("success")
        queryClient.invalidateQueries({ queryKey: ["connections"] })
      } else {
        setStatus("error")
        setErrorMsg(data.error ?? "Connection failed")
      }
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      handleResult(event.data)
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== "vitasync-oauth-result" || !event.newValue) return
      try {
        handleResult(JSON.parse(event.newValue))
      } catch {}
      // Clean up so it works on next connect attempt
      localStorage.removeItem("vitasync-oauth-result")
    }

    // Clear any stale result before starting
    localStorage.removeItem("vitasync-oauth-result")

    window.addEventListener("message", handleMessage)
    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener("message", handleMessage)
      window.removeEventListener("storage", handleStorage)
    }
  }, [queryClient])

  // Detect popup closed without completing OAuth
  useEffect(() => {
    if (status !== "waiting") return
    const interval = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        popupRef.current = null
        setStatus((s) => (s === "waiting" ? "error" : s))
        setErrorMsg((m) => m || "Authorization window was closed before completing.")
      }
    }, 500)
    return () => clearInterval(interval)
  }, [status])

  // Auto-close modal after success
  useEffect(() => {
    if (status !== "success") return
    const timer = setTimeout(onClose, 2000)
    return () => clearTimeout(timer)
  }, [status, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={status !== "waiting" ? onClose : undefined} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200/60 dark:border-gray-800/60 overflow-hidden animate-fade-in-down">
        {/* Header */}
        <div className={`bg-gradient-to-r ${providerBg} px-6 py-5 text-white`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{providerIcon}</span>
            <div>
              <h2 className="text-lg font-bold">Connect {providerName}</h2>
              <p className="text-sm opacity-90">Authorize VitaSync to access your data</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {status === "idle" && (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You&apos;ll be redirected to {providerName} to sign in and authorize access.
                A small window will open for the authorization — please complete the sign-in there.
              </p>
              <Button
                onClick={openPopup}
                className={`w-full rounded-xl bg-gradient-to-r ${providerBg} shadow-lg hover:-translate-y-0.5 transition-all duration-200`}
              >
                Sign in with {providerName}
              </Button>
            </div>
          )}

          {status === "waiting" && (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto h-12 w-12 rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-indigo-500 animate-spin" />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Waiting for authorization…</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Complete the sign-in in the popup window.</p>
              </div>
              <button
                type="button"
                onClick={openPopup}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Popup didn&apos;t open? Click here to try again
              </button>
            </div>
          )}

          {status === "success" && (
            <div className="text-center space-y-3 py-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <svg className="h-7 w-7 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{providerName} connected successfully!</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Your data will start syncing shortly.</p>
            </div>
          )}

          {status === "error" && (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <svg className="h-7 w-7 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Connection failed</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{errorMsg}</p>
              </div>
              <Button
                onClick={openPopup}
                className={`w-full rounded-xl bg-gradient-to-r ${providerBg} shadow-lg hover:-translate-y-0.5 transition-all duration-200`}
              >
                Try Again
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-6 py-3 flex justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              if (popupRef.current && !popupRef.current.closed) popupRef.current.close()
              onClose()
            }}
          >
            {status === "success" ? "Done" : "Cancel"}
          </Button>
        </div>
      </div>
    </div>
  )
}
