"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import {
  reportsApi,
  usersApi,
  healthScoresApi,
  readinessApi,
  insightsApi,
  type ReportData,
  type InsightCategory,
  type InsightSeverity,
} from "../../../lib/api"

/* ─── Mini Score Ring ─── */
function ScoreRing({ value, max = 100, size = 96, label, color }: { value: number; max?: number; size?: number; label: string; color: string }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, Math.max(0, value / max))
  const offset = circ * (1 - pct)
  return (
    <div className="flex flex-col items-center relative">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-800" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{Math.round(value)}</span>
        <span className="text-[9px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
    </div>
  )
}

/* ─── Horizontal Bar ─── */
function HBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-24 text-gray-600 dark:text-gray-400 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-900 dark:text-gray-100 w-8 text-right">{Math.round(value)}</span>
    </div>
  )
}

/* ─── SVG Spark Line ─── */
function SparkLine({ data, width = 120, height = 32, color = "#6366f1" }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data); const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ")
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─── SVG Radar Chart ─── */
function RadarChart({ data, size = 220 }: { data: { label: string; value: number; max: number }[]; size?: number }) {
  const cx = size / 2; const cy = size / 2; const r = size / 2 - 30; const n = data.length
  if (n < 3) return null
  const step = (2 * Math.PI) / n
  const pt = (i: number, ratio: number) => ({ x: cx + r * ratio * Math.cos(step * i - Math.PI / 2), y: cy + r * ratio * Math.sin(step * i - Math.PI / 2) })
  const points = data.map((d, i) => pt(i, Math.min(1, d.value / (d.max || 1))))
  return (
    <svg width={size} height={size} className="mx-auto">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon key={ring} points={Array.from({ length: n }, (_, i) => pt(i, ring)).map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={0.5} />
      ))}
      {data.map((_, i) => { const p = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={0.5} /> })}
      <polygon points={points.map(p => `${p.x},${p.y}`).join(" ")} fill="rgba(99, 102, 241, 0.15)" stroke="#6366f1" strokeWidth={2} />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="#6366f1" stroke="white" strokeWidth={1.5} />)}
      {data.map((d, i) => { const lp = pt(i, 1.18); return <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" className="fill-gray-500 dark:fill-gray-400 text-[9px]">{d.label}</text> })}
    </svg>
  )
}

const STATUS_STYLES: Record<string, { bg: string; icon: string; text: string }> = {
  ready: { bg: "bg-emerald-100 dark:bg-emerald-900/40", icon: "✓", text: "text-emerald-700 dark:text-emerald-300" },
  generating: { bg: "bg-amber-100 dark:bg-amber-900/40", icon: "⟳", text: "text-amber-700 dark:text-amber-300" },
  failed: { bg: "bg-red-100 dark:bg-red-900/40", icon: "✕", text: "text-red-700 dark:text-red-300" },
}

const REPORT_TYPE_META: Record<string, { icon: string; gradient: string }> = {
  weekly: { icon: "📅", gradient: "from-blue-500 to-indigo-600" },
  monthly: { icon: "🗓️", gradient: "from-indigo-500 to-purple-600" },
  quarterly: { icon: "📊", gradient: "from-purple-500 to-fuchsia-600" },
  annual: { icon: "📈", gradient: "from-fuchsia-500 to-pink-600" },
  custom: { icon: "⚙️", gradient: "from-gray-500 to-gray-600" },
}

const CATEGORY_COLORS: Record<string, string> = {
  cardio: "bg-rose-500", sleep: "bg-indigo-500", activity: "bg-green-500", body: "bg-purple-500",
  recovery: "bg-teal-500", respiratory: "bg-cyan-500", metabolic: "bg-orange-500", workout: "bg-yellow-500",
  longevity: "bg-violet-500", immune: "bg-lime-500", cognitive: "bg-fuchsia-500", hormonal: "bg-amber-500",
  womens_health: "bg-pink-500", performance: "bg-red-500", trend: "bg-sky-500", anomaly: "bg-pink-500",
}

export default function ReportsPage() {
  const [selectedUserId, setSelectedUserId] = useState("")
  const [showGenerate, setShowGenerate] = useState(false)
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [form, setForm] = useState({ reportType: "weekly", periodStart: "", periodEnd: "" })
  const [activeTab, setActiveTab] = useState<"reports" | "live">("live")
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []
  const selectedUser = users.find(u => u.id === selectedUserId)

  // Reports list
  const { data: reportsResult, isLoading } = useQuery({
    queryKey: ["reports", selectedUserId],
    queryFn: () => reportsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })
  const reports = reportsResult?.data ?? []

  // Live health data for the report dashboard
  const { data: healthScore } = useQuery({
    queryKey: ["health-score-latest", selectedUserId],
    queryFn: () => healthScoresApi.latest(selectedUserId),
    enabled: !!selectedUserId && activeTab === "live",
  })
  const { data: readiness } = useQuery({
    queryKey: ["readiness-report", selectedUserId],
    queryFn: () => readinessApi.get(selectedUserId),
    enabled: !!selectedUserId && activeTab === "live",
  })
  const { data: trainingLoad } = useQuery({
    queryKey: ["training-load-report", selectedUserId],
    queryFn: () => readinessApi.trainingLoad(selectedUserId),
    enabled: !!selectedUserId && activeTab === "live",
  })
  const { data: insightsResult } = useQuery({
    queryKey: ["insights-report", selectedUserId],
    queryFn: () => insightsApi.generate(selectedUserId, {
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date().toISOString(),
    }),
    enabled: !!selectedUserId && activeTab === "live",
  })
  const { data: algorithmsResult } = useQuery({
    queryKey: ["insight-algorithms"],
    queryFn: () => insightsApi.algorithms(),
  })
  const { data: scoreHistory } = useQuery({
    queryKey: ["score-history-report", selectedUserId],
    queryFn: () => healthScoresApi.history(selectedUserId, { limit: 14 }),
    enabled: !!selectedUserId && activeTab === "live",
  })

  const insights = insightsResult?.data ?? []
  const algorithms = algorithmsResult?.data ?? []

  // Computed data for the live dashboard
  const sevCounts = useMemo(() => {
    const c = { positive: 0, info: 0, warning: 0, critical: 0 }
    for (const i of insights) c[i.severity]++
    return c
  }, [insights])

  const catBreakdown = useMemo(() => {
    const m = new Map<string, { total: number; positive: number; critical: number }>()
    for (const i of insights) {
      const e = m.get(i.category) ?? { total: 0, positive: 0, critical: 0 }
      e.total++
      if (i.severity === "positive") e.positive++
      if (i.severity === "critical") e.critical++
      m.set(i.category, e)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [insights])

  const radarData = useMemo(() => {
    return catBreakdown.slice(0, 8).map(([cat, stats]) => ({
      label: cat.replace("_", " ").slice(0, 10),
      value: Math.round((stats.positive / Math.max(1, stats.total)) * 100),
      max: 100,
    }))
  }, [catBreakdown])

  const topInsights = useMemo(() => {
    const order: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 }
    return [...insights].sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 8)
  }, [insights])

  const healthScores = scoreHistory?.data ?? []
  const sparkData = healthScores.map(s => s.overallScore).reverse()

  const generateMut = useMutation({
    mutationFn: () =>
      reportsApi.generate(selectedUserId, {
        reportType: form.reportType,
        ...(form.periodStart ? { periodStart: form.periodStart } : {}),
        ...(form.periodEnd ? { periodEnd: form.periodEnd } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", selectedUserId] })
      setShowGenerate(false)
    },
  })

  const sevIcon: Record<InsightSeverity, string> = { critical: "✕", warning: "⚠", info: "ℹ", positive: "✓" }
  const sevColor: Record<InsightSeverity, string> = { critical: "text-red-600 dark:text-red-400", warning: "text-amber-600 dark:text-amber-400", info: "text-blue-600 dark:text-blue-400", positive: "text-emerald-600 dark:text-emerald-400" }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Health Intelligence Reports
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {algorithms.length > 0
              ? <>Comprehensive analytics powered by <span className="font-semibold text-indigo-600 dark:text-indigo-400">{algorithms.length}</span> algorithms across {Object.keys(CATEGORY_COLORS).length} dimensions.</>
              : "Generate and view comprehensive health reports with actionable recommendations."
            }
          </p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowGenerate(!showGenerate)} className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all">
            {showGenerate ? "Cancel" : "✦ Generate Report"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5 shadow-sm">
        <label htmlFor="report-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="report-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId} {u.email ? `(${u.email})` : ""}</option>)}
        </select>
      </div>

      {/* Tab switcher */}
      {selectedUserId && (
        <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 w-fit">
          {(["live", "reports"] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {tab === "live" ? "📊 Live Dashboard" : "📄 Saved Reports"} 
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 py-24">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl text-white mb-4 shadow-lg shadow-indigo-500/30">📄</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Select a User</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md text-center">Choose a user above to view their health intelligence dashboard and generate comprehensive reports.</p>
        </div>
      )}

      {/* Generate form */}
      {showGenerate && selectedUserId && (
        <div className="mb-6 rounded-2xl border border-indigo-200/60 dark:border-indigo-800/60 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 p-6 shadow-sm animate-fade-in">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="h-5 w-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px]">✦</span>
            Generate New Report
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Report Type</label>
              <select title="Report type" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" value={form.reportType} onChange={(e) => setForm({ ...form, reportType: e.target.value })}>
                <option value="weekly">📅 Weekly Summary</option>
                <option value="monthly">🗓️ Monthly Summary</option>
                <option value="quarterly">📊 Quarterly Review</option>
                <option value="annual">📈 Annual Review</option>
                <option value="custom">⚙️ Custom Period</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Period Start</label>
              <input type="date" title="Period start" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Period End</label>
              <input type="date" title="Period end" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {generateMut.isPending ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ LIVE DASHBOARD TAB ═══════════ */}
      {selectedUserId && activeTab === "live" && (
        <div className="space-y-6 animate-fade-in">
          {/* Score rings row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-4 flex flex-col items-center">
              <ScoreRing value={healthScore?.overallScore ?? 0} label="Health" color="#6366f1" />
              {healthScore?.grade && <span className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">{healthScore.grade}</span>}
            </div>
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-4 flex flex-col items-center">
              <ScoreRing value={readiness?.score ?? 0} label="Readiness" color="#10b981" />
              {readiness?.recommendation && <span className="mt-2 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase">{readiness.recommendation.replace("_", " ")}</span>}
            </div>
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-4 flex flex-col items-center">
              <ScoreRing value={healthScore?.sleepScore ?? 0} label="Sleep" color="#8b5cf6" />
            </div>
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-4 flex flex-col items-center">
              <ScoreRing value={healthScore?.cardioScore ?? 0} label="Cardio" color="#ef4444" />
            </div>
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-4 flex flex-col items-center">
              <ScoreRing value={healthScore?.recoveryScore ?? 0} label="Recovery" color="#14b8a6" />
            </div>
          </div>

          {/* Severity overview + trend */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Severity cards */}
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wide">Insight Distribution (30d)</h3>
              <div className="grid grid-cols-4 gap-3">
                {(["positive", "info", "warning", "critical"] as const).map(sev => (
                  <div key={sev} className={`rounded-xl p-3 text-center ${
                    sev === "positive" ? "bg-emerald-50 dark:bg-emerald-950/30" :
                    sev === "info" ? "bg-blue-50 dark:bg-blue-950/30" :
                    sev === "warning" ? "bg-amber-50 dark:bg-amber-950/30" :
                    "bg-red-50 dark:bg-red-950/30"
                  }`}>
                    <p className={`text-2xl font-bold ${sevColor[sev]}`}>{sevCounts[sev]}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase mt-1">{sev}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">Total: {insights.length} insights</span>
                {insights.length > 0 && (
                  <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    {Math.round((sevCounts.positive / insights.length) * 100)}% positive
                  </span>
                )}
              </div>
            </div>

            {/* Health score trend */}
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wide">Health Score Trend</h3>
              {sparkData.length >= 2 ? (
                <div className="flex flex-col items-center gap-3">
                  <SparkLine data={sparkData} width={300} height={60} />
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>Low: <strong className="text-gray-900 dark:text-gray-100">{Math.min(...sparkData)}</strong></span>
                    <span>Avg: <strong className="text-gray-900 dark:text-gray-100">{Math.round(sparkData.reduce((a, b) => a + b, 0) / sparkData.length)}</strong></span>
                    <span>High: <strong className="text-gray-900 dark:text-gray-100">{Math.max(...sparkData)}</strong></span>
                    <span>Latest: <strong className="text-indigo-600 dark:text-indigo-400">{sparkData[sparkData.length - 1]}</strong></span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">Not enough history to display trend</p>
              )}
              {trainingLoad && (
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-200 dark:border-gray-800 pt-4">
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{Math.round(trainingLoad.ctl)}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Fitness</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{Math.round(trainingLoad.atl)}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Fatigue</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${trainingLoad.tsb >= 0 ? "text-emerald-600" : "text-amber-600"}`}>{trainingLoad.tsb > 0 ? "+" : ""}{Math.round(trainingLoad.tsb)}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Form</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Radar + Category breakdown + Top Insights */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Radar */}
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wide">Health Dimensions</h3>
              {radarData.length >= 3 ? (
                <RadarChart data={radarData} size={220} />
              ) : (
                <p className="text-sm text-gray-400 text-center py-10">Need 3+ categories</p>
              )}
            </div>

            {/* Category bars */}
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wide">By Category</h3>
              <div className="space-y-2">
                {catBreakdown.map(([cat, stats]) => (
                  <HBar
                    key={cat}
                    label={cat.replace("_", " ")}
                    value={stats.total}
                    max={Math.max(10, ...catBreakdown.map(([, s]) => s.total))}
                    color={CATEGORY_COLORS[cat] ?? "bg-gray-500"}
                  />
                ))}
                {catBreakdown.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No insights yet</p>}
              </div>
            </div>

            {/* Priority insights */}
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wide">Priority Insights</h3>
              <div className="space-y-2.5">
                {topInsights.map((ins, i) => (
                  <div key={ins.id} className="flex items-start gap-2.5">
                    <span className={`text-sm mt-0.5 ${sevColor[ins.severity]}`}>{sevIcon[ins.severity]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{ins.title}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{ins.description}</p>
                    </div>
                    {ins.value != null && (
                      <span className={`text-xs font-bold shrink-0 ${sevColor[ins.severity]}`}>{ins.value}{ins.unit ? ` ${ins.unit}` : ""}</span>
                    )}
                  </div>
                ))}
                {topInsights.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No insights yet</p>}
              </div>
            </div>
          </div>

          {/* Score detail grid */}
          {healthScore && (
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wide">Score Breakdown</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: "Overall", value: healthScore.overallScore, color: "bg-indigo-500" },
                  { label: "Sleep", value: healthScore.sleepScore, color: "bg-violet-500" },
                  { label: "Activity", value: healthScore.activityScore, color: "bg-green-500" },
                  { label: "Cardio", value: healthScore.cardioScore, color: "bg-rose-500" },
                  { label: "Body", value: healthScore.bodyScore, color: "bg-purple-500" },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <HBar label={label} value={value ?? 0} color={color} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ SAVED REPORTS TAB ═══════════ */}
      {selectedUserId && activeTab === "reports" && (
        <div className="space-y-4 animate-fade-in">
          {isLoading && (
            <div className="py-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
          )}
          {!isLoading && reports.length === 0 && (
            <div className="flex flex-col items-center py-16">
              <span className="text-4xl mb-3">📄</span>
              <p className="text-sm text-gray-500 dark:text-gray-400">No reports yet. Generate one to get started.</p>
            </div>
          )}
          {reports.map((report) => {
            const meta = REPORT_TYPE_META[report.reportType] ?? { icon: "⚙️", gradient: "from-gray-500 to-gray-600" }
            const statusStyle = STATUS_STYLES[report.status] ?? { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300", icon: "⏳" }
            const isExpanded = expandedReport === report.id

            return (
              <div key={report.id} className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shadow-sm overflow-hidden transition-all hover:shadow-md">
                <button
                  type="button"
                  className="w-full px-6 py-5 flex items-center justify-between text-left transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                  onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-br ${meta.gradient} text-white text-lg shadow-sm`}>
                      {meta.icon}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate capitalize">
                        {report.reportType.replace(/_/g, " ")} Report
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(report.periodStart).toLocaleDateString()} — {new Date(report.periodEnd).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                      {statusStyle.icon} {report.status}
                    </span>
                    <svg className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-800 px-6 py-5 space-y-5 animate-fade-in">
                    {/* Highlights */}
                    {report.highlights.length > 0 && (
                      <div>
                        <h5 className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                          <span className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[8px]">✓</span>
                          Highlights
                        </h5>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {report.highlights.map((h, i) => (
                            <div key={i} className="flex items-start gap-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                              <span className="text-emerald-500 mt-0.5 text-sm">✓</span>
                              <span className="text-sm text-gray-700 dark:text-gray-300">{h}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Recommendations */}
                    {report.recommendations.length > 0 && (
                      <div>
                        <h5 className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                          <span className="h-4 w-4 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[8px]">→</span>
                          Recommendations
                        </h5>
                        <div className="space-y-2">
                          {report.recommendations.map((r, i) => (
                            <div key={i} className="flex items-start gap-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 p-3">
                              <span className="text-indigo-500 mt-0.5 text-sm">→</span>
                              <span className="text-sm text-gray-700 dark:text-gray-300">{r}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">Generated on {new Date(report.createdAt).toLocaleString()}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
