"use client"

import { useQuery } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"
import { type SystemStatus, systemApi } from "../../../../lib/api"
import { PageHeader, Card, CardHeader, CardContent, Badge, StatusDot, StatSkeleton, CardSkeleton } from "../../../../lib/components/ui"

const FALLBACK_BADGE = { label: "Unknown", class: "bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800/40", dot: "bg-gray-500" }

const STATUS_BADGE: Record<string, { label: string; class: string; dot: string }> = {
  operational: {
    label: "All Systems Operational",
    class: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40",
    dot: "bg-emerald-500",
  },
  degraded: {
    label: "Partial System Degradation",
    class: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40",
    dot: "bg-amber-500",
  },
  down: {
    label: "System Outage",
    class: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40",
    dot: "bg-red-500",
  },
}

const COMPONENT_ICONS: Record<string, string> = {
  database: "🐘",
  cache: "⚡",
  queue: "📋",
}

const FALLBACK_STATUS_STYLE = { bg: "bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800/40", text: "text-gray-700 dark:text-gray-400", dot: "bg-gray-500" }

const COMPONENT_STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  healthy: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  degraded: {
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  down: {
    bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
}

export default function SystemStatusPage() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery<SystemStatus>({
    queryKey: ["system-status"],
    queryFn: systemApi.status,
    refetchInterval: 15_000,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="System Status"
          subtitle="Real-time health monitoring for all VitaSync services."
        />
        <StatSkeleton count={4} />
        <CardSkeleton count={3} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-2" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="System Status"
          subtitle="Real-time health monitoring for all VitaSync services."
        />
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-accent-500 mb-3" />
            <p className="text-lg font-semibold text-accent-700 dark:text-accent-400">Failed to load system status</p>
            <p className="mt-2 text-sm text-gray-500">{error instanceof Error ? error.message : "Unable to connect to the API"}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const badge = STATUS_BADGE[data.status] ?? FALLBACK_BADGE

  const infraComponents = data.components.filter((c) => c.type !== "queue")
  const queueComponents = data.components.filter((c) => c.type === "queue")

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="System Status"
        subtitle="Real-time health monitoring for all VitaSync services."
        actions={
          <div className="flex items-center gap-3">
            {dataUpdatedAt > 0 && (
              <span className="text-xs text-gray-400">
                Checked {new Date(dataUpdatedAt).toLocaleTimeString()}
              </span>
            )}
            <span className="text-xs text-gray-400">Auto-refresh: 15s</span>
          </div>
        }
      />

      {/* Overall status banner */}
      <Card className={badge.class}>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <StatusDot
                status={data.status === "operational" ? "online" : data.status === "degraded" ? "warning" : "danger"}
                pulse={data.status === "operational"}
              />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{badge.label}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {data.summary.healthy} of {data.summary.total} services healthy
                </p>
              </div>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{data.summary.healthy}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Healthy</p>
              </div>
              {data.summary.degraded > 0 && (
                <div>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{data.summary.degraded}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Degraded</p>
                </div>
              )}
              {data.summary.down > 0 && (
                <div>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{data.summary.down}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Down</p>
                </div>
              )}
              <div>
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{data.summary.total}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Total</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backend status */}
      <Card>
        <CardHeader title="Backend Status" />
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Version</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{data.version}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Environment</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 capitalize">{data.environment}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Uptime</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{data.uptime}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Last Check</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{new Date(data.timestamp).toLocaleTimeString()}</p>
            </div>
            {data.hostname && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Hostname</p>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 font-mono truncate" title={data.hostname}>{data.hostname}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Kubernetes deployments (only shown when running in K8s) */}
      {data.deployments && data.deployments.length > 0 && (
        <Card className="border-brand-200/60 dark:border-brand-800/40">
          <CardHeader title="☸ Kubernetes Deployments" />
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.deployments.map((dep) => {
                const allReady = dep.readyReplicas === dep.replicas && dep.replicas > 0
                const hasUnavailable = dep.unavailableReplicas > 0
                return (
                  <Card key={dep.name} className={
                    allReady
                      ? "border-emerald-200 dark:border-emerald-800/40 bg-white/80 dark:bg-gray-900/80"
                      : hasUnavailable
                        ? "border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20"
                        : "border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20"
                  }>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{dep.name}</h3>
                        <Badge
                          variant={allReady ? "success" : hasUnavailable ? "danger" : "warning"}
                          dot
                          pulse={allReady}
                          size="sm"
                        >
                          {allReady ? "Healthy" : hasUnavailable ? "Degraded" : "Scaling"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{dep.readyReplicas}/{dep.replicas}</p>
                          <p className="text-[9px] uppercase tracking-wider text-gray-500">Ready</p>
                        </div>
                        {hasUnavailable && (
                          <div className="text-center">
                            <p className="text-lg font-bold text-red-600 dark:text-red-400">{dep.unavailableReplicas}</p>
                            <p className="text-[9px] uppercase tracking-wider text-gray-500">Unavailable</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Infrastructure components */}
      <Card>
        <CardHeader title="Infrastructure" />
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {infraComponents.map((comp) => {
              const style = COMPONENT_STATUS_STYLES[comp.status] ?? FALLBACK_STATUS_STYLE
              const icon = COMPONENT_ICONS[comp.type] ?? "🔧"
              return (
                <Card key={comp.name} className={style.bg}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{icon}</span>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{comp.name}</h3>
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{comp.type}</p>
                        </div>
                      </div>
                      <StatusDot
                        status={comp.status === "healthy" ? "online" : comp.status === "degraded" ? "warning" : "danger"}
                        label={comp.status === "healthy" ? "Healthy" : comp.status === "degraded" ? "Degraded" : "Down"}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {comp.latencyMs != null && (
                        <span className="text-[10px] text-gray-400">{comp.latencyMs}ms</span>
                      )}
                      {comp.details?.version != null && (
                        <span className="text-[10px] text-gray-400">v{String(comp.details?.version)}</span>
                      )}
                    </div>
                    {comp.error && (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-400 truncate" title={comp.error}>{comp.error}</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Queue status */}
      <Card>
        <CardHeader title="BullMQ Queues" />
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {queueComponents.map((comp) => {
              const style = COMPONENT_STATUS_STYLES[comp.status] ?? FALLBACK_STATUS_STYLE
              const d = (comp.details ?? {}) as Record<string, number>
              return (
                <Card key={comp.name} className={style.bg}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📋</span>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 capitalize">{comp.name.replace("Queue: ", "")}</h3>
                      </div>
                      <Badge
                        variant={comp.status === "healthy" ? "success" : "danger"}
                        dot
                        size="sm"
                      >
                        {comp.status === "healthy" ? "Healthy" : "Down"}
                      </Badge>
                    </div>
                    {comp.status === "healthy" && (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{d.active ?? 0}</p>
                          <p className="text-[9px] uppercase tracking-wider text-gray-500">Active</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{d.waiting ?? 0}</p>
                          <p className="text-[9px] uppercase tracking-wider text-gray-500">Waiting</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-red-600 dark:text-red-400">{d.failed ?? 0}</p>
                          <p className="text-[9px] uppercase tracking-wider text-gray-500">Failed</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{d.delayed ?? 0}</p>
                          <p className="text-[9px] uppercase tracking-wider text-gray-500">Delayed</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{d.completed ?? 0}</p>
                          <p className="text-[9px] uppercase tracking-wider text-gray-500">Completed</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-gray-600 dark:text-gray-400">{d.repeatableJobs ?? 0}</p>
                          <p className="text-[9px] uppercase tracking-wider text-gray-500">Scheduled</p>
                        </div>
                      </div>
                    )}
                    {comp.error && (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-400 truncate" title={comp.error}>{comp.error}</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Component health table */}
      <Card>
        <CardHeader title="Component Health" />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="pb-3 pr-4 pl-6">Status</th>
                  <th className="pb-3 pr-4">Component</th>
                  <th className="pb-3 pr-4">Latency</th>
                  <th className="pb-3 pr-4">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.components.map((comp) => {
                  const style = COMPONENT_STATUS_STYLES[comp.status] ?? FALLBACK_STATUS_STYLE
                  return (
                    <tr key={comp.name}>
                      <td className="py-3 pr-4 pl-6">
                        <StatusDot
                          status={comp.status === "healthy" ? "online" : comp.status === "degraded" ? "warning" : "danger"}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{comp.name}</span>
                        <span className="ml-2 text-[10px] text-gray-400">{comp.type}</span>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        {comp.latencyMs != null ? `${comp.latencyMs}ms` : "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs text-red-500 dark:text-red-400 max-w-xs truncate">
                        {comp.error ?? "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
