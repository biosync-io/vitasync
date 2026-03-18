"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import {
  type Insight,
  type InsightAlgorithm,
  type InsightCategory,
  type InsightSeverity,
  insightsApi,
  usersApi,
} from "../../../lib/api"

const SEVERITY_STYLES: Record<InsightSeverity, { bg: string; border: string; icon: string; text: string }> = {
  positive: { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", icon: "✓", text: "text-emerald-700 dark:text-emerald-400" },
  info: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", icon: "ℹ", text: "text-blue-700 dark:text-blue-400" },
  warning: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", icon: "⚠", text: "text-amber-700 dark:text-amber-400" },
  critical: { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", icon: "✕", text: "text-red-700 dark:text-red-400" },
}

const CATEGORY_CONFIG: Record<InsightCategory, { label: string; icon: string; color: string }> = {
  cardio: { label: "Cardio", icon: "♥", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" },
  sleep: { label: "Sleep", icon: "🌙", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400" },
  activity: { label: "Activity", icon: "🏃", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  body: { label: "Body", icon: "⚖", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400" },
  recovery: { label: "Recovery", icon: "🔋", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400" },
  respiratory: { label: "Respiratory", icon: "🫁", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400" },
  metabolic: { label: "Metabolic", icon: "🧬", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" },
  workout: { label: "Workout", icon: "💪", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" },
  trend: { label: "Trend", icon: "📈", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400" },
  anomaly: { label: "Anomaly", icon: "🔍", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400" },
}

const ALL_CATEGORIES: InsightCategory[] = ["cardio", "sleep", "activity", "body", "recovery", "respiratory", "metabolic", "workout", "trend", "anomaly"]
const ALL_SEVERITIES: InsightSeverity[] = ["critical", "warning", "info", "positive"]

export default function InsightsPage() {
  const [selectedUserId, setSelectedUserId] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<InsightCategory | "">("")
  const [severityFilter, setSeverityFilter] = useState<InsightSeverity | "">("")
  const [dateRange, setDateRange] = useState<"7d" | "14d" | "30d" | "90d">("30d")
  const [showAlgorithms, setShowAlgorithms] = useState(false)

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })

  const users = usersResult?.data ?? []

  const rangeDays = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[dateRange]
  const to = new Date()
  const from = new Date(to.getTime() - rangeDays * 24 * 60 * 60 * 1000)

  const { data: insightsResult, isLoading, isError } = useQuery({
    queryKey: ["insights", selectedUserId, dateRange],
    queryFn: () =>
      insightsApi.generate(selectedUserId, {
        from: from.toISOString(),
        to: to.toISOString(),
      }),
    enabled: !!selectedUserId,
  })

  const { data: algorithmsResult } = useQuery({
    queryKey: ["insight-algorithms"],
    queryFn: () => insightsApi.algorithms(),
  })

  const allInsights = insightsResult?.data ?? []
  const algorithms = algorithmsResult?.data ?? []

  const filtered = allInsights.filter((i) => {
    if (categoryFilter && i.category !== categoryFilter) return false
    if (severityFilter && i.severity !== severityFilter) return false
    return true
  })

  // Sort: critical first, then warning, info, positive
  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 }
  const sorted = [...filtered].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  // Summary counts
  const counts = { positive: 0, info: 0, warning: 0, critical: 0 }
  for (const i of allInsights) counts[i.severity]++

  // Category breakdown
  const catCounts = new Map<InsightCategory, number>()
  for (const i of allInsights) catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Health Insights</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          State-of-the-art algorithms analyzing your health data to generate actionable insights.
          {algorithms.length > 0 && ` ${algorithms.length} algorithms available.`}
        </p>
      </div>

      {/* Controls */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* User select */}
          <div>
            <label htmlFor="insight-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              User
            </label>
            <select
              id="insight-user"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.externalId} {u.email ? `(${u.email})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label htmlFor="insight-range" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date Range
            </label>
            <select
              id="insight-range"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
            >
              <option value="7d">Last 7 days</option>
              <option value="14d">Last 14 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>

          {/* Category filter */}
          <div>
            <label htmlFor="insight-cat" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select
              id="insight-cat"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as InsightCategory | "")}
            >
              <option value="">All Categories</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_CONFIG[c].icon} {CATEGORY_CONFIG[c].label}
                  {catCounts.has(c) ? ` (${catCounts.get(c)})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Severity filter */}
          <div>
            <label htmlFor="insight-sev" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Severity
            </label>
            <select
              id="insight-sev"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as InsightSeverity | "")}
            >
              <option value="">All Severities</option>
              {ALL_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_STYLES[s].icon} {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s]})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {selectedUserId && allInsights.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["critical", "warning", "info", "positive"] as const).map((sev) => {
            const style = SEVERITY_STYLES[sev]
            return (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(severityFilter === sev ? "" : sev)}
                className={`rounded-xl border p-4 text-left transition-all ${style.bg} ${style.border} ${severityFilter === sev ? "ring-2 ring-indigo-500 ring-offset-1" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${style.text}`}>{style.icon}</span>
                  <span className={`text-2xl font-bold ${style.text}`}>{counts[sev]}</span>
                </div>
                <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-400 capitalize">{sev}</p>
              </button>
            )
          })}
        </div>
      )}

      {/* Category pills */}
      {selectedUserId && allInsights.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {ALL_CATEGORIES.filter((c) => catCounts.has(c)).map((c) => {
            const cfg = CATEGORY_CONFIG[c]
            const active = categoryFilter === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(active ? "" : c)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${cfg.color} ${active ? "ring-2 ring-indigo-500 ring-offset-1" : "opacity-80 hover:opacity-100"}`}
              >
                <span>{cfg.icon}</span> {cfg.label}
                <span className="ml-1 rounded-full bg-white/50 dark:bg-black/20 px-1.5 text-[10px]">{catCounts.get(c)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 py-20">
          <span className="text-5xl mb-4">🧠</span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Select a User</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md text-center">
            Choose a user above to run {algorithms.length} state-of-the-art health algorithms
            and generate personalized insights from their synced data.
          </p>
          <button
            type="button"
            onClick={() => setShowAlgorithms(!showAlgorithms)}
            className="mt-4 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {showAlgorithms ? "Hide" : "View"} all {algorithms.length} algorithms →
          </button>
        </div>
      )}

      {/* Loading */}
      {selectedUserId && isLoading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Running {algorithms.length} algorithms…</p>
        </div>
      )}

      {/* Error */}
      {selectedUserId && isError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-6 text-center">
          <p className="text-sm text-red-700 dark:text-red-400">Failed to generate insights. Ensure the user has synced health data.</p>
        </div>
      )}

      {/* No insights */}
      {selectedUserId && !isLoading && !isError && allInsights.length === 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-10 text-center">
          <span className="text-4xl mb-3 block">📊</span>
          <p className="text-sm text-gray-500 dark:text-gray-400">No insights generated. This user may not have enough health data in the selected range.</p>
        </div>
      )}

      {/* Insights list */}
      {sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}

      {/* Algorithms catalog */}
      {showAlgorithms && algorithms.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
            Algorithm Catalog ({algorithms.length})
          </h2>
          <AlgorithmGrid algorithms={algorithms} />
        </div>
      )}

      {/* Always-visible algorithms toggle at bottom */}
      {selectedUserId && allInsights.length > 0 && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setShowAlgorithms(!showAlgorithms)}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {showAlgorithms ? "Hide" : "View"} full algorithm catalog ({algorithms.length} algorithms)
          </button>
        </div>
      )}
    </div>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const [expanded, setExpanded] = useState(false)
  const style = SEVERITY_STYLES[insight.severity]
  const catCfg = CATEGORY_CONFIG[insight.category]

  return (
    <div className={`rounded-xl border p-4 transition-all ${style.bg} ${style.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${catCfg.color}`}>
              {catCfg.icon} {catCfg.label}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.text} bg-white/60 dark:bg-black/20`}>
              {style.icon} {insight.severity}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{insight.title}</h3>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{insight.description}</p>
        </div>
        {insight.value != null && (
          <div className="flex-shrink-0 text-right">
            <span className={`text-2xl font-bold ${style.text}`}>{insight.value}</span>
            {insight.unit && (
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{insight.unit}</span>
            )}
          </div>
        )}
      </div>

      {/* Reference range bar */}
      {insight.referenceRange && insight.value != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
            <span>{insight.referenceRange.low}</span>
            <span>Reference Range</span>
            <span>{insight.referenceRange.high}</span>
          </div>
          <div className="relative h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className="absolute inset-y-0 rounded-full bg-emerald-300 dark:bg-emerald-700" style={{
              left: `${Math.max(0, Math.min(100, ((insight.referenceRange.low - (insight.referenceRange.low * 0.5)) / ((insight.referenceRange.high * 1.5) - (insight.referenceRange.low * 0.5))) * 100))}%`,
              right: `${Math.max(0, 100 - Math.min(100, ((insight.referenceRange.high - (insight.referenceRange.low * 0.5)) / ((insight.referenceRange.high * 1.5) - (insight.referenceRange.low * 0.5))) * 100))}%`,
            }} />
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 shadow ${
                insight.value >= insight.referenceRange.low && insight.value <= insight.referenceRange.high
                  ? "bg-emerald-500"
                  : "bg-amber-500"
              }`}
              style={{
                left: `${Math.max(0, Math.min(100, ((insight.value - (insight.referenceRange.low * 0.5)) / ((insight.referenceRange.high * 1.5) - (insight.referenceRange.low * 0.5))) * 100))}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
        </div>
      )}

      {/* Expandable metadata */}
      {Object.keys(insight.metadata).length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          {expanded ? "▾ Hide details" : "▸ Show details"}
        </button>
      )}
      {expanded && (
        <div className="mt-2 rounded-lg bg-white/50 dark:bg-black/20 p-3 text-xs font-mono text-gray-600 dark:text-gray-400 space-y-0.5">
          {Object.entries(insight.metadata).map(([k, v]) => (
            <div key={k}>
              <span className="text-gray-900 dark:text-gray-200">{k}</span>: {JSON.stringify(v)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AlgorithmGrid({ algorithms }: { algorithms: InsightAlgorithm[] }) {
  // Group by category
  const grouped = new Map<InsightCategory, InsightAlgorithm[]>()
  for (const alg of algorithms) {
    const arr = grouped.get(alg.category) ?? []
    arr.push(alg)
    grouped.set(alg.category, arr)
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([category, algs]) => {
        const cfg = CATEGORY_CONFIG[category]
        return (
          <div key={category}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
                {cfg.icon} {cfg.label}
              </span>
              <span className="text-gray-400 dark:text-gray-500 font-normal">({algs.length} algorithms)</span>
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {algs.map((alg) => (
                <div
                  key={alg.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3"
                >
                  <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100">{alg.name}</h4>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{alg.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {alg.requiredMetrics.map((m) => (
                      <span
                        key={m}
                        className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-gray-400"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
