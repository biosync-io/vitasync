"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { anomaliesApi, analyticsApi, usersApi, type AnomalyData } from "../../../lib/api"

/* ---------- constants ---------- */

const LOOKBACK_OPTIONS = [1, 3, 7, 14, 30] as const

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

const SEVERITY_DOT: Record<string, string> = {
  low: "bg-blue-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  acknowledged: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
}

const TICK_STYLE = { fill: "#9ca3af", fontSize: 11 }
const GRID_PROPS = { strokeDasharray: "3 3" as const, stroke: "#6b7280", strokeOpacity: 0.18 }
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    border: "1px solid rgba(55, 65, 81, 0.8)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#f3f4f6",
    backdropFilter: "blur(8px)",
  },
  itemStyle: { color: "#e5e7eb" },
  labelStyle: { color: "#9ca3af", marginBottom: "4px" },
}

/* ---------- helpers ---------- */

function zScorePercent(z: number) {
  return Math.min(Math.abs(z) / 5, 1) * 100
}

function zScoreBarColor(z: number) {
  const abs = Math.abs(z)
  if (abs >= 4) return "bg-red-500"
  if (abs >= 3) return "bg-orange-500"
  if (abs >= 2) return "bg-yellow-500"
  return "bg-blue-500"
}

/* ---------- component ---------- */

export default function AnomaliesPage() {
  const { selectedUserId, setSelectedUserId, isAdmin } = useSelectedUser()
  const [severityFilter, setSeverityFilter] = useState("")
  const [lookbackDays, setLookbackDays] = useState<number>(7)
  const queryClient = useQueryClient()

  /* --- queries --- */

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
    enabled: isAdmin,
  })
  const users = usersResult?.data ?? []

  const { data: anomaliesResult, isLoading } = useQuery({
    queryKey: ["anomalies", selectedUserId, severityFilter],
    queryFn: () => anomaliesApi.list(selectedUserId, severityFilter ? { severity: severityFilter } : {}),
    enabled: !!selectedUserId,
  })
  const anomalies = anomaliesResult?.data ?? []

  // Analytics anomalies (lookback-based)
  const { data: analyticsResult, isLoading: analyticsLoading } = useQuery({
    queryKey: ["analytics-anomalies", selectedUserId, lookbackDays],
    queryFn: () => analyticsApi.anomalies(selectedUserId, lookbackDays),
    enabled: !!selectedUserId,
  })
  const analyticsAnomalies = (analyticsResult?.data ?? []) as AnomalyData[]

  // Merge both sources, deduplicate by id
  const allAnomalies = useMemo(() => {
    const map = new Map<string, AnomalyData>()
    for (const a of anomalies) map.set(a.id, a)
    for (const a of analyticsAnomalies) if (!map.has(a.id)) map.set(a.id, a)
    return Array.from(map.values()).sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
    )
  }, [anomalies, analyticsAnomalies])

  const detectMut = useMutation({
    mutationFn: () => anomaliesApi.detect(selectedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anomalies", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["analytics-anomalies", selectedUserId] })
    },
  })

  const ackMut = useMutation({
    mutationFn: (anomalyId: string) => anomaliesApi.acknowledge(selectedUserId, anomalyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anomalies", selectedUserId] })
    },
  })

  /* --- derived stats --- */

  const criticalCount = allAnomalies.filter((a) => a.severity === "critical").length
  const highCount = allAnomalies.filter((a) => a.severity === "high").length
  const warningCount = allAnomalies.filter((a) => a.severity === "medium").length
  const infoCount = allAnomalies.filter((a) => a.severity === "low").length

  // Timeline chart data: group by date, stack by severity
  const timelineData = useMemo(() => {
    const buckets: Record<string, Record<string, number>> = {}
    for (const a of allAnomalies) {
      const day = new Date(a.detectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      if (!buckets[day]) buckets[day] = { critical: 0, high: 0, medium: 0, low: 0 }
      const bucket = buckets[day]!
      const sev = a.severity in bucket ? a.severity : "low"
      bucket[sev] = (bucket[sev] ?? 0) + 1
    }
    return Object.entries(buckets).map(([date, counts]) => ({ date, ...counts }))
  }, [allAnomalies])

  // Severity distribution for pie chart
  const pieData = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const a of allAnomalies) {
      if (a.severity in counts) counts[a.severity] = (counts[a.severity] ?? 0) + 1
      else counts.low = (counts.low ?? 0) + 1
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, fill: SEVERITY_COLORS[name] ?? "#6b7280" }))
  }, [allAnomalies])

  const loading = isLoading || analyticsLoading

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 animate-fade-in-down">Anomaly Detection</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">AI-powered detection of unusual patterns in your health metrics.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => detectMut.mutate()} disabled={detectMut.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {detectMut.isPending ? "Scanning…" : "Run Detection"}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
        <div className="flex flex-wrap gap-6 items-end">
          {isAdmin && (
            <div>
              <label htmlFor="anom-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
              <select id="anom-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                <option value="">Select a user…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="anom-sev" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Severity</label>
            <select id="anom-sev" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Lookback</label>
            <div className="flex gap-1.5">
              {LOOKBACK_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setLookbackDays(d)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                    lookbackDays === d
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!selectedUserId && isAdmin && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view anomalies.</p>}

      {/* Summary stat cards */}
      {selectedUserId && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-grid">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Anomalies</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{allAnomalies.length}</p>
          </div>
          <div className="rounded-2xl border border-red-200 dark:border-red-800/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card text-center">
            <div className="mx-auto mb-1 h-2 w-2 rounded-full bg-red-500" />
            <p className="text-xs text-gray-500 dark:text-gray-400">Critical</p>
            <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{criticalCount}</p>
          </div>
          <div className="rounded-2xl border border-orange-200 dark:border-orange-800/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card text-center">
            <div className="mx-auto mb-1 h-2 w-2 rounded-full bg-orange-500" />
            <p className="text-xs text-gray-500 dark:text-gray-400">High</p>
            <p className="mt-1 text-2xl font-bold text-orange-600 dark:text-orange-400">{highCount}</p>
          </div>
          <div className="rounded-2xl border border-yellow-200 dark:border-yellow-800/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card text-center">
            <div className="mx-auto mb-1 h-2 w-2 rounded-full bg-yellow-500" />
            <p className="text-xs text-gray-500 dark:text-gray-400">Warning</p>
            <p className="mt-1 text-2xl font-bold text-yellow-600 dark:text-yellow-400">{warningCount}</p>
          </div>
        </div>
      )}

      {/* Charts row */}
      {selectedUserId && allAnomalies.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          {/* Timeline bar chart */}
          <div className="lg:col-span-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Anomaly Timeline</h3>
            {timelineData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timelineData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="date" tick={TICK_STYLE} tickLine={false} axisLine={false} />
                    <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar dataKey="critical" stackId="s" fill={SEVERITY_COLORS.critical} radius={[0, 0, 0, 0]} name="Critical" />
                    <Bar dataKey="high" stackId="s" fill={SEVERITY_COLORS.high} name="High" />
                    <Bar dataKey="medium" stackId="s" fill={SEVERITY_COLORS.medium} name="Warning" />
                    <Bar dataKey="low" stackId="s" fill={SEVERITY_COLORS.low} radius={[3, 3, 0, 0]} name="Info" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-gray-400">No timeline data available.</p>
            )}
          </div>

          {/* Severity pie / donut */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Severity Distribution</h3>
            {pieData.length > 0 ? (
              <div className="h-56 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-gray-400">No data.</p>
            )}
            {/* Legend */}
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              {pieData.map((entry) => (
                <span key={entry.name} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />
                  {entry.name} ({entry.value})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Anomaly table */}
      {selectedUserId && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Detected Anomalies</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">{allAnomalies.length} result{allAnomalies.length !== 1 ? "s" : ""}</span>
          </div>
          {loading ? (
            <div className="p-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
          ) : allAnomalies.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No anomalies detected. Run detection to scan recent data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400">
                    <th className="px-5 py-3 font-medium">Metric</th>
                    <th className="px-5 py-3 font-medium">Observed vs Expected</th>
                    <th className="px-5 py-3 font-medium">Z-Score</th>
                    <th className="px-5 py-3 font-medium">Severity</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Detected</th>
                    <th className="px-5 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {allAnomalies.map((a, idx) => {
                    const deviation = a.expectedValue ? (((a.observedValue - a.expectedValue) / a.expectedValue) * 100) : 0
                    return (
                      <tr
                        key={a.id}
                        className={`border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${
                          idx % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/10" : ""
                        }`}
                      >
                        {/* Metric */}
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{a.metricType?.replace(/_/g, " ")}</p>
                          {a.title && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{a.title}</p>}
                        </td>

                        {/* Observed vs Expected comparison */}
                        <td className="px-5 py-3">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono font-medium text-red-600 dark:text-red-400">{(a.observedValue ?? 0).toFixed(1)}</span>
                            <span className="text-gray-400 dark:text-gray-500">/</span>
                            <span className="font-mono text-gray-500 dark:text-gray-400">{(a.expectedValue ?? 0).toFixed(1)}</span>
                          </div>
                          {deviation !== 0 && (
                            <span className={`text-[10px] font-medium ${deviation > 0 ? "text-red-500" : "text-blue-500"}`}>
                              {deviation > 0 ? "+" : ""}{deviation.toFixed(1)}%
                            </span>
                          )}
                        </td>

                        {/* Z-Score with visual bar */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-600 dark:text-gray-400 w-12 shrink-0">{a.zScore.toFixed(2)}σ</span>
                            <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden min-w-[48px]">
                              <div
                                className={`h-full rounded-full ${zScoreBarColor(a.zScore)} transition-all`}
                                style={{ width: `${zScorePercent(a.zScore)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Severity badge */}
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[a.severity] ?? ""}`}>
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[a.severity] ?? "bg-gray-500"}`} />
                            {a.severity}
                          </span>
                        </td>

                        {/* Status badge */}
                        <td className="px-5 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status] ?? ""}`}>{a.status}</span>
                        </td>

                        {/* Date */}
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                          {new Date(a.detectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                            {new Date(a.detectedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="px-5 py-3">
                          {a.status === "new" && (
                            <button type="button" onClick={() => ackMut.mutate(a.id)} disabled={ackMut.isPending} className="rounded-lg bg-gray-200 dark:bg-gray-700 px-2.5 py-1 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors">
                              Acknowledge
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
