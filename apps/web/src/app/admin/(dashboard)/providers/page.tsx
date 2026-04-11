"use client"

import { useQuery } from "@tanstack/react-query"
import { type ProviderDef, providersApi } from "../../../../lib/api"
import { PageHeader, Card, CardHeader, CardContent, Badge, CardSkeleton } from "../../../../lib/components/ui"

/** Resolve the public-facing origin for callback URL display */
function useOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin
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

/** Env vars required for each provider's OAuth credentials */
const PROVIDER_ENV_VARS: Record<string, string[]> = {
  fitbit: ["FITBIT_CLIENT_ID", "FITBIT_CLIENT_SECRET"],
  garmin: ["GARMIN_CONSUMER_KEY", "GARMIN_CONSUMER_SECRET"],
  strava: ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"],
  whoop: ["WHOOP_CLIENT_ID", "WHOOP_CLIENT_SECRET"],
  withings: ["WITHINGS_CLIENT_ID", "WITHINGS_CLIENT_SECRET"],
  polar: ["POLAR_CLIENT_ID", "POLAR_CLIENT_SECRET"],
}

export default function ProvidersPage() {
  const origin = useOrigin()

  const { data: apiProviders = [], isLoading } = useQuery<ProviderDef[]>({
    queryKey: ["providers"],
    queryFn: () => providersApi.list(),
  })

  const configuredIds = new Set(apiProviders.map((p) => p.id))
  const configuredCount = ALL_SUPPORTED_PROVIDERS.filter((p) => configuredIds.has(p.id)).length
  const totalCount = ALL_SUPPORTED_PROVIDERS.length

  const allProviders = ALL_SUPPORTED_PROVIDERS.map((sp) => ({
    ...sp,
    isConfigured: configuredIds.has(sp.id),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Providers"
        subtitle="Manage wearable provider integrations and OAuth credentials"
        badge={
          !isLoading ? (
            <Badge variant={configuredCount > 0 ? "success" : "default"} dot>
              {configuredCount} of {totalCount} configured
            </Badge>
          ) : undefined
        }
      />

      {/* Provider cards grid */}
      {isLoading ? (
        <CardSkeleton count={6} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allProviders.map((provider) => {
            const colors = PROVIDER_COLORS[provider.id] ?? { bg: "from-gray-400 to-gray-500", icon: "🔗" }
            const envVars = PROVIDER_ENV_VARS[provider.id]

            return (
              <Card key={provider.id} hover className={provider.isConfigured ? "border-emerald-300/60 dark:border-emerald-800/40" : undefined}>
                <CardContent>
                  {/* Header: icon + name + auth badge + status */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center text-2xl shadow-lg`}>
                        {colors.icon}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{provider.name}</h3>
                        <Badge variant={provider.authType === "oauth2" ? "info" : "purple"} size="sm">
                          {provider.authType?.toUpperCase() ?? "OAUTH2"}
                        </Badge>
                      </div>
                    </div>
                    <Badge variant={provider.isConfigured ? "success" : "default"} dot size="sm">
                      {provider.isConfigured ? "Configured" : "Not Configured"}
                    </Badge>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{provider.description}</p>

                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {provider.capabilities.map((cap) => (
                      <Badge key={cap} variant="default" size="sm" className="capitalize">
                        {cap.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>

                  {/* Status detail */}
                  {provider.isConfigured ? (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 px-4 py-2.5">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      </span>
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Enabled — accepting connections</span>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.06] px-4 py-3">
                      {envVars ? (
                        <>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Required environment variables</p>
                          <div className="space-y-1">
                            {envVars.map((v) => (
                              <code key={v} className="block text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.04] rounded px-2 py-1">
                                {v}
                              </code>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Requires companion app configuration</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* OAuth Callback URLs */}
      <Card>
        <CardHeader
          title="OAuth Callback URLs"
          subtitle="Register these callback URLs in each provider's developer console"
        />
        <CardContent className="space-y-2">
          {ALL_SUPPORTED_PROVIDERS.filter((p) => PROVIDER_ENV_VARS[p.id]).map((provider) => (
            <div key={provider.id} className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/[0.04] px-4 py-2.5">
              <span className="text-lg">{PROVIDER_COLORS[provider.id]?.icon ?? "🔗"}</span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">{provider.name}</span>
              <code className="flex-1 text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.04] rounded-lg px-3 py-1.5 overflow-auto select-all">
                {`${origin}/v1/oauth/${provider.id}/callback`}
              </code>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}


