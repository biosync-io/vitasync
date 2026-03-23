"use client"

import { useQuery } from "@tanstack/react-query"
import { type SystemComponent, type QueueStats, systemApi } from "../../../lib/api"

const STATUS_CONFIG = {
  healthy: { label: "Healthy", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", dot: "bg-emerald-500", ring: "ring-emerald-200 dark:ring-emerald-800/40", border: "border-emerald-200 dark:border-emerald-800/40" },
  degraded: { label: "Degraded", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", dot: "bg-amber-500", ring: "ring-amber-200 dark:ring-amber-800/40", border: "border-amber-200 dark:border-amber-800/40" },
  down: { label: "Down", color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", dot: "bg-red-500", ring: "ring-red-200 dark:ring-red-800/40", border: "border-red-200 dark:border-red-800/40" },
}

const COMPONENT_ICONS: Record<string, string> = {
  PostgreSQL: "🐘",
  Redis: "🔴",
  BullMQ: "📨",
  Providers: "🔌",
}

const QUEUE_ICONS: Record<string, string> = {
  sync: "🔄",
  webhooks: "🌐",
  notifications: "🔔",
  analytics: "📊",
  reports: "📋",
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function SystemDashboardPage() {
  const { data, isLoading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["system-status"],
    queryFn: systemApi.status,
    refetchInterval: 10_000,
  })

  const overall = data?.status ?? "healthy"
  const components = data?.components ?? []
  const queues = data?.queues ?? []
  const uptime = data?.uptime ?? 0
  const version = data?.version ?? "—"
  const oc = STATUS_CONFIG[overall]

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 animate-fade-in-down">System Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Real-time status of all infrastructure components. Auto-refreshes every 10 seconds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
            <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overall Status Banner */}
          <div className={`rounded-2xl border ${oc.border} ${oc.bg} p-5 flex items-center justify-between`}>
            <div className="flex items-center gap-4">
              <div className={`h-4 w-4 rounded-full ${oc.dot} ${overall === "healthy" ? "animate-pulse" : ""}`} />
              <div>
                <h2 className={`text-lg font-bold ${oc.color}`}>System {oc.label}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Version {version} · Uptime {formatUptime(uptime)}
                </p>
              </div>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{components.filter((c) => c.status === "healthy").length}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Healthy</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{components.filter((c) => c.status === "degraded").length}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Degraded</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{components.filter((c) => c.status === "down").length}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Down</p>
              </div>
            </div>
          </div>

          {/* Component Cards */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Infrastructure Components</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-grid">
              {components.map((c) => (
                <ComponentCard key={c.name} component={c} />
              ))}
            </div>
          </div>

          {/* Queue Status */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Message Queues (BullMQ)</h3>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      {["Queue", "Status", "Waiting", "Active", "Completed", "Failed", "Delayed"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {queues.map((q) => (
                      <QueueRow key={q.name} queue={q} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
                {queues.map((q) => (
                  <QueueMobileCard key={q.name} queue={q} />
                ))}
              </div>
            </div>
          </div>

          {/* Queue Summary Bar */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Queue Throughput</h3>
            <div className="space-y-3">
              {queues.map((q) => {
                const total = q.completed + q.failed || 1
                const successRate = Math.round((q.completed / total) * 100)
                return (
                  <div key={q.name} className="flex items-center gap-3">
                    <span className="text-base w-6 text-center">{QUEUE_ICONS[q.name] ?? "📦"}</span>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-28 capitalize">{q.name}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${q.failed > 0 ? "bg-gradient-to-r from-emerald-500 to-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${successRate}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-gray-500 w-16 text-right tabular-nums">
                      {q.completed + q.failed > 0 ? `${successRate}%` : "—"}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function ComponentCard({ component: c }: { component: SystemComponent }) {
  const sc = STATUS_CONFIG[c.status]
  return (
    <div className={`rounded-xl border ${sc.border} bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ${sc.ring}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{COMPONENT_ICONS[c.name] ?? "⚙️"}</span>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.name}</h4>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${sc.bg} ${sc.color}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} ${c.status === "healthy" ? "animate-pulse" : ""}`} />
          {sc.label}
        </span>
      </div>
      <div className="space-y-1">
        {c.latencyMs != null && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">Latency</span>
            <span className={`font-mono tabular-nums ${c.latencyMs < 50 ? "text-emerald-600" : c.latencyMs < 200 ? "text-amber-600" : "text-red-600"}`}>
              {c.latencyMs}ms
            </span>
          </div>
        )}
        {c.details && Object.entries(c.details).filter(([k]) => k !== "type" && k !== "error").map(([key, val]) => (
          <div key={key} className="flex justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
            <span className="text-gray-700 dark:text-gray-300 font-mono tabular-nums">
              {Array.isArray(val) ? val.join(", ") : String(val)}
            </span>
          </div>
        ))}
        {c.details?.error != null && (
          <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-2 py-1.5">
            <p className="text-[10px] text-red-600 dark:text-red-400 break-words">{String(c.details.error)}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function QueueRow({ queue: q }: { queue: QueueStats }) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span>{QUEUE_ICONS[q.name] ?? "📦"}</span>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{q.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        {q.paused ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">⏸ Paused</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-gray-700 dark:text-gray-300">
        {q.waiting > 0 ? <span className="font-semibold text-blue-600 dark:text-blue-400">{q.waiting}</span> : <span className="text-gray-400">0</span>}
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-gray-700 dark:text-gray-300">
        {q.active > 0 ? <span className="font-semibold text-indigo-600 dark:text-indigo-400">{q.active}</span> : <span className="text-gray-400">0</span>}
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-emerald-600 dark:text-emerald-400 font-mono">{q.completed.toLocaleString()}</td>
      <td className="px-4 py-3 text-sm tabular-nums font-mono">
        {q.failed > 0 ? <span className="text-red-600 dark:text-red-400 font-semibold">{q.failed.toLocaleString()}</span> : <span className="text-gray-400">0</span>}
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-gray-500 dark:text-gray-400">{q.delayed}</td>
    </tr>
  )
}

function QueueMobileCard({ queue: q }: { queue: QueueStats }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>{QUEUE_ICONS[q.name] ?? "📦"}</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{q.name}</span>
        </div>
        {q.paused ? (
          <span className="text-[10px] font-bold text-amber-600">⏸ Paused</span>
        ) : (
          <span className="text-[10px] font-bold text-emerald-600">● Active</span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div><p className="text-sm font-bold text-blue-600 tabular-nums">{q.waiting}</p><p className="text-[10px] text-gray-400">Wait</p></div>
        <div><p className="text-sm font-bold text-indigo-600 tabular-nums">{q.active}</p><p className="text-[10px] text-gray-400">Active</p></div>
        <div><p className="text-sm font-bold text-emerald-600 tabular-nums">{q.completed}</p><p className="text-[10px] text-gray-400">Done</p></div>
        <div><p className={`text-sm font-bold tabular-nums ${q.failed > 0 ? "text-red-600" : "text-gray-400"}`}>{q.failed}</p><p className="text-[10px] text-gray-400">Failed</p></div>
      </div>
    </div>
  )
}
