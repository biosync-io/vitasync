"use client"

import { useQuery } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import {
  type Insight,
  type InsightAlgorithm,
  type InsightCategory,
  type InsightSeverity,
  insightsApi,
  usersApi,
} from "../../../lib/api"

/* ── Constants ─────────────────────────────────────────────────────── */

const SEVERITY_STYLES: Record<
  InsightSeverity,
  { bg: string; border: string; icon: string; text: string; barColor: string; gradient: string; ringColor: string }
> = {
  positive: {
    bg: "bg-emerald-50/80 dark:bg-emerald-950/20",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
    icon: "✓",
    text: "text-emerald-600 dark:text-emerald-400",
    barColor: "bg-emerald-500",
    gradient: "from-emerald-500 to-emerald-600",
    ringColor: "#10b981",
  },
  info: {
    bg: "bg-blue-50/80 dark:bg-blue-950/20",
    border: "border-blue-200/60 dark:border-blue-800/40",
    icon: "ℹ",
    text: "text-blue-600 dark:text-blue-400",
    barColor: "bg-blue-500",
    gradient: "from-blue-500 to-blue-600",
    ringColor: "#3b82f6",
  },
  warning: {
    bg: "bg-amber-50/80 dark:bg-amber-950/20",
    border: "border-amber-200/60 dark:border-amber-800/40",
    icon: "⚠",
    text: "text-amber-600 dark:text-amber-400",
    barColor: "bg-amber-500",
    gradient: "from-amber-500 to-amber-600",
    ringColor: "#f59e0b",
  },
  critical: {
    bg: "bg-red-50/80 dark:bg-red-950/20",
    border: "border-red-200/60 dark:border-red-800/40",
    icon: "✕",
    text: "text-red-600 dark:text-red-400",
    barColor: "bg-red-500",
    gradient: "from-red-500 to-red-600",
    ringColor: "#ef4444",
  },
}

const CATEGORY_CONFIG: Record<InsightCategory, { label: string; icon: string; color: string; dotColor: string }> = {
  cardio:        { label: "Cardio",         icon: "♥",  color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",       dotColor: "bg-rose-500" },
  sleep:         { label: "Sleep",          icon: "🌙", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400", dotColor: "bg-indigo-500" },
  activity:      { label: "Activity",       icon: "🏃", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",   dotColor: "bg-green-500" },
  body:          { label: "Body",           icon: "⚖",  color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400", dotColor: "bg-purple-500" },
  recovery:      { label: "Recovery",       icon: "🔋", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400",       dotColor: "bg-teal-500" },
  respiratory:   { label: "Respiratory",    icon: "🫁", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400",       dotColor: "bg-cyan-500" },
  metabolic:     { label: "Metabolic",      icon: "🧬", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400", dotColor: "bg-orange-500" },
  workout:       { label: "Workout",        icon: "💪", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400", dotColor: "bg-yellow-500" },
  trend:         { label: "Trend",          icon: "📈", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",           dotColor: "bg-sky-500" },
  anomaly:       { label: "Anomaly",        icon: "🔍", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400",       dotColor: "bg-pink-500" },
  longevity:     { label: "Longevity",      icon: "🧬", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400", dotColor: "bg-violet-500" },
  immune:        { label: "Immune",         icon: "🛡️", color: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-400",       dotColor: "bg-lime-500" },
  cognitive:     { label: "Cognitive",      icon: "🧠", color: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-400", dotColor: "bg-fuchsia-500" },
  hormonal:      { label: "Hormonal",       icon: "⚗️", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",   dotColor: "bg-amber-500" },
  womens_health: { label: "Women's Health", icon: "♀️", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400",       dotColor: "bg-pink-500" },
  performance:   { label: "Performance",    icon: "🏅", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",           dotColor: "bg-red-500" },
}

const ALL_CATEGORIES: InsightCategory[] = [
  "cardio", "sleep", "activity", "body", "recovery", "respiratory",
  "metabolic", "workout", "longevity", "immune", "cognitive", "hormonal",
  "womens_health", "performance", "trend", "anomaly",
]
const ALL_SEVERITIES: InsightSeverity[] = ["critical", "warning", "info", "positive"]
const DATE_RANGES = [
  { value: "7d",  label: "7 D" },
  { value: "14d", label: "14 D" },
  { value: "30d", label: "30 D" },
  { value: "90d", label: "90 D" },
] as const

/* ── SVG Radar Chart ─── */
function RadarChart({ data, size = 280 }: { data: { label: string; value: number; max: number }[]; size?: number }) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 40
  const n = data.length
  if (n < 3) return null
  const angleStep = (2 * Math.PI) / n

  const getPoint = (i: number, ratio: number) => ({
    x: cx + r * ratio * Math.cos(angleStep * i - Math.PI / 2),
    y: cy + r * ratio * Math.sin(angleStep * i - Math.PI / 2),
  })

  const rings = [0.25, 0.5, 0.75, 1]
  const points = data.map((d, i) => getPoint(i, Math.min(1, d.value / (d.max || 1))))
  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ")

  return (
    <svg width={size} height={size} className="mx-auto" aria-label="Health dimensions radar chart">
      <defs>
        <linearGradient id="radar-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--accent-500)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--accent-600)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={Array.from({ length: n }, (_, i) => getPoint(i, ring)).map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          className="text-gray-200 dark:text-gray-700/50"
          strokeWidth={0.5}
        />
      ))}
      {data.map((_, i) => {
        const p = getPoint(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="currentColor" className="text-gray-200 dark:text-gray-700/50" strokeWidth={0.5} />
      })}
      <polygon points={polygon} fill="url(#radar-fill)" stroke="var(--accent-500)" strokeWidth={2} className="svg-draw" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill="var(--accent-500)" stroke="white" strokeWidth={2} className="dark:stroke-gray-900" />
      ))}
      {data.map((d, i) => {
        const lp = getPoint(i, 1.22)
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" className="fill-gray-500 dark:fill-gray-400 text-[10px] font-medium">
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}

/* ── Donut Chart ─── */
function DonutChart({ segments, size = 180 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  if (total === 0) return null
  const r = (size - 20) / 2
  const cx = size / 2
  const cy = size / 2
  const thickness = 22
  const innerR = r - thickness

  let cumAngle = -Math.PI / 2
  const arcs = segments.filter((s) => s.value > 0).map((s) => {
    const angle = (s.value / total) * 2 * Math.PI
    const startAngle = cumAngle
    cumAngle += angle
    const endAngle = cumAngle
    const largeArc = angle > Math.PI ? 1 : 0
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const ix1 = cx + innerR * Math.cos(startAngle)
    const iy1 = cy + innerR * Math.sin(startAngle)
    const ix2 = cx + innerR * Math.cos(endAngle)
    const iy2 = cy + innerR * Math.sin(endAngle)
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`
    return { ...s, d }
  })

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} aria-label="Severity distribution donut chart">
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} className="transition-all duration-300 hover:opacity-80" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }} />
        ))}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-gray-900 dark:text-gray-100 number-pop">{total}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Total</span>
      </div>
    </div>
  )
}

/* ── Health Score Ring ─── */
function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const strokeWidth = 6
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score))
  const offset = circumference - (pct / 100) * circumference
  const color = pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444"

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700/50" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className="absolute text-sm font-bold text-gray-900 dark:text-gray-100">{Math.round(pct)}</span>
    </div>
  )
}

/* ── Category Bar ─── */
function CategoryBar({ label, icon, value, max, dotColor }: { label: string; icon: string; value: number; max: number; dotColor: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="group flex items-center gap-3">
      <span className="text-sm">{icon}</span>
      <span className="text-xs w-20 text-gray-600 dark:text-gray-400 truncate font-medium">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${dotColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums text-gray-700 dark:text-gray-300 w-6 text-right">{value}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════════════════════ */

export default function InsightsPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [categoryFilter, setCategoryFilter] = useState<InsightCategory | "">("")
  const [severityFilter, setSeverityFilter] = useState<InsightSeverity | "">("")
  const [dateRange, setDateRange] = useState<"7d" | "14d" | "30d" | "90d">("30d")
  const [showAlgorithms, setShowAlgorithms] = useState(false)
  const [algSearch, setAlgSearch] = useState("")

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const selectedUser = users.find((u) => u.id === selectedUserId)
  const GENDER_GATED_CATEGORIES: InsightCategory[] = ["womens_health"]
  const visibleCategories = selectedUser?.gender === "male"
    ? ALL_CATEGORIES.filter((c) => !GENDER_GATED_CATEGORIES.includes(c))
    : ALL_CATEGORIES

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

  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 }
  const sorted = [...filtered].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  const counts = { positive: 0, info: 0, warning: 0, critical: 0 }
  for (const i of allInsights) counts[i.severity]++

  const catCounts = new Map<InsightCategory, number>()
  for (const i of allInsights) catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1)

  const radarData = useMemo(() => {
    const cats = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
    return cats.map(([cat]) => {
      const catInsights = allInsights.filter((i) => i.category === cat)
      const positiveRatio = catInsights.filter((i) => i.severity === "positive").length / Math.max(1, catInsights.length)
      return { label: cat.replace("_", " ").slice(0, 10), value: Math.round(positiveRatio * 100), max: 100 }
    })
  }, [allInsights, catCounts])

  const donutSegments = useMemo(() => [
    { label: "Positive", value: counts.positive, color: "#10b981" },
    { label: "Info",     value: counts.info,     color: "#3b82f6" },
    { label: "Warning",  value: counts.warning,  color: "#f59e0b" },
    { label: "Critical", value: counts.critical, color: "#ef4444" },
  ], [counts.positive, counts.info, counts.warning, counts.critical])

  // Health score = weighted positive ratio
  const healthScore = useMemo(() => {
    if (allInsights.length === 0) return 0
    const positiveWeight = 1
    const infoWeight = 0.7
    const warnWeight = 0.3
    const critWeight = 0
    const weighted =
      counts.positive * positiveWeight +
      counts.info * infoWeight +
      counts.warning * warnWeight +
      counts.critical * critWeight
    return Math.round((weighted / allInsights.length) * 100)
  }, [allInsights.length, counts])

  const hasInsights = selectedUserId && allInsights.length > 0

  return (
    <div className="space-y-6">
      {/* ── Hero header ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 p-6 sm:p-8 text-white shadow-xl shadow-accent-500/20">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMC44IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDgpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] opacity-60" />
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  <span className="text-xl">🧠</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Insights Engine</h1>
              </div>
              <p className="text-white/80 text-sm max-w-xl">
                {algorithms.length > 0
                  ? <><span className="font-semibold text-white">{algorithms.length}</span> proprietary algorithms across {visibleCategories.length} health dimensions — generating actionable intelligence from your data.</>
                  : "State-of-the-art algorithms analyzing your health data to generate actionable insights."}
              </p>
            </div>
            {hasInsights && (
              <div className="flex items-center gap-4">
                <ScoreRing score={healthScore} />
                <div className="text-right">
                  <p className="text-xs text-white/60 uppercase tracking-wider font-medium">Health Score</p>
                  <p className="text-sm text-white/80 mt-0.5">
                    {healthScore >= 70 ? "Excellent" : healthScore >= 40 ? "Moderate" : "Needs attention"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Controls bar ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          {/* User */}
          <div className="flex-1 min-w-0">
            <label htmlFor="insight-user" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
              User
            </label>
            <select
              id="insight-user"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-colors"
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

          {/* Date range tabs */}
          <div>
            <p className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
              Range
            </p>
            <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
              {DATE_RANGES.map((dr) => (
                <button
                  key={dr.value}
                  type="button"
                  onClick={() => setDateRange(dr.value)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    dateRange === dr.value
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {dr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="min-w-[160px]">
            <label htmlFor="insight-cat" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
              Category
            </label>
            <select
              id="insight-cat"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-colors"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as InsightCategory | "")}
            >
              <option value="">All Categories</option>
              {visibleCategories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_CONFIG[c].icon} {CATEGORY_CONFIG[c].label}
                  {catCounts.has(c) ? ` (${catCounts.get(c)})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div className="min-w-[140px]">
            <label htmlFor="insight-sev" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
              Severity
            </label>
            <select
              id="insight-sev"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-colors"
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

      {/* ── Severity summary cards ────────────────────────────────── */}
      {hasInsights && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 stagger-grid">
          {(["critical", "warning", "info", "positive"] as const).map((sev) => {
            const style = SEVERITY_STYLES[sev]
            const isActive = severityFilter === sev
            const pct = allInsights.length > 0 ? Math.round((counts[sev] / allInsights.length) * 100) : 0
            return (
              <button
                key={sev}
                type="button"
                title={`Filter by ${sev}`}
                onClick={() => setSeverityFilter(isActive ? "" : sev)}
                className={`group relative rounded-2xl border p-4 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${style.bg} ${style.border} ${isActive ? "ring-2 ring-accent-500 ring-offset-2 dark:ring-offset-gray-950" : ""}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${style.gradient} text-white text-sm font-bold shadow-sm`}>
                    {style.icon}
                  </span>
                  <span className={`text-3xl font-bold tabular-nums ${style.text} number-pop`}>
                    {counts[sev]}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 capitalize">{sev}</p>
                  <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">{pct}%</span>
                </div>
                {/* Mini bar */}
                <div className="mt-2 h-1 rounded-full bg-gray-200/60 dark:bg-gray-700/40 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${style.barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Category pills ─────────────────────────────────────── */}
      {hasInsights && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter("")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all border ${
              categoryFilter === ""
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-transparent shadow-sm"
                : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            All
            <span className="rounded-full bg-white/20 dark:bg-black/20 px-1.5 text-[10px]">{allInsights.length}</span>
          </button>
          {visibleCategories.filter((c) => catCounts.has(c)).map((c) => {
            const cfg = CATEGORY_CONFIG[c]
            const active = categoryFilter === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(active ? "" : c)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border ${
                  active
                    ? `${cfg.color} ring-2 ring-accent-500 ring-offset-1 dark:ring-offset-gray-950 border-transparent`
                    : `${cfg.color} border-transparent opacity-75 hover:opacity-100`
                }`}
              >
                <span>{cfg.icon}</span> {cfg.label}
                <span className="rounded-full bg-white/50 dark:bg-black/20 px-1.5 text-[10px]">{catCounts.get(c)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Visualization row ─────────────────────────────────── */}
      {hasInsights && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 stagger-grid">
          {/* Radar */}
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">Health Dimensions</h3>
            <RadarChart data={radarData} size={260} />
          </div>

          {/* Donut */}
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">Severity Distribution</h3>
            <div className="flex items-center justify-center py-2">
              <DonutChart segments={donutSegments} size={200} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {donutSegments.map((s) => (
                <div key={s.label} className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-gray-500 dark:text-gray-400">{s.label}</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100 ml-auto tabular-nums">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Category bars */}
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">Category Breakdown</h3>
            <div className="space-y-3">
              {Array.from(catCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => {
                  const cfg = CATEGORY_CONFIG[cat]
                  return (
                    <CategoryBar
                      key={cat}
                      label={cfg.label}
                      icon={cfg.icon}
                      value={count}
                      max={Math.max(1, ...Array.from(catCounts.values()))}
                      dotColor={cfg.dotColor}
                    />
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 py-20 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-50 dark:bg-accent-900/20 mb-5">
            <span className="text-4xl">🧠</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Select a User</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
            Choose a user to run <span className="font-semibold text-accent-600 dark:text-accent-400">{algorithms.length}</span> health algorithms
            and generate personalized insights.
          </p>
          <button
            type="button"
            onClick={() => setShowAlgorithms(!showAlgorithms)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent-500 text-white px-4 py-2.5 text-sm font-semibold shadow-lg shadow-accent-500/25 hover:bg-accent-600 transition-colors"
          >
            {showAlgorithms ? "Hide algorithms" : `Browse ${algorithms.length} algorithms`}
            <span className="text-white/60">→</span>
          </button>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────── */}
      {selectedUserId && isLoading && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200/60 dark:border-gray-800/40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm py-20">
          <div className="relative">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-accent-200 dark:border-accent-800 border-t-accent-500" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg">🧠</span>
            </div>
          </div>
          <p className="mt-5 text-sm font-medium text-gray-600 dark:text-gray-400">
            Running <span className="text-accent-600 dark:text-accent-400">{algorithms.length}</span> algorithms…
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Analyzing health data from the last {rangeDays} days</p>
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────── */}
      {selectedUserId && isError && (
        <div className="rounded-2xl border border-red-200/60 dark:border-red-800/40 bg-red-50/80 dark:bg-red-950/20 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Failed to Generate Insights</h3>
          <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/60">Ensure the user has synced health data for the selected date range.</p>
        </div>
      )}

      {/* ── No insights ───────────────────────────────────────── */}
      {selectedUserId && !isLoading && !isError && allInsights.length === 0 && (
        <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/40 bg-white/80 dark:bg-gray-900/80 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 mx-auto mb-4">
            <span className="text-2xl">📊</span>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">No Insights Found</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This user may not have enough health data in the selected {rangeDays}-day range.</p>
        </div>
      )}

      {/* ── Insights list ─────────────────────────────────────── */}
      {sorted.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {filtered.length === allInsights.length
                ? `All Insights (${allInsights.length})`
                : `Filtered (${filtered.length} of ${allInsights.length})`}
            </h2>
            {(categoryFilter || severityFilter) && (
              <button
                type="button"
                onClick={() => { setCategoryFilter(""); setSeverityFilter("") }}
                className="text-xs text-accent-600 dark:text-accent-400 hover:underline font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="space-y-3 stagger-list">
            {sorted.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {/* ── Algorithms catalog ───────────────────────────────── */}
      {hasInsights && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setShowAlgorithms(!showAlgorithms)}
            className="inline-flex items-center gap-2 text-sm font-medium text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors"
          >
            <span className="h-px w-8 bg-accent-500/30" />
            {showAlgorithms ? "Hide" : "View"} Algorithm Catalog ({algorithms.length})
            <span className="h-px w-8 bg-accent-500/30" />
          </button>
        </div>
      )}

      {showAlgorithms && algorithms.length > 0 && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Algorithm Catalog</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{algorithms.length} proprietary health algorithms</p>
            </div>
            <input
              type="text"
              placeholder="Search algorithms…"
              value={algSearch}
              onChange={(e) => setAlgSearch(e.target.value)}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3.5 py-2 text-sm text-gray-900 dark:text-gray-100 w-full sm:w-64 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-colors"
            />
          </div>
          <AlgorithmGrid algorithms={algorithms} search={algSearch} />
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Insight Card
   ══════════════════════════════════════════════════════════════════════ */

function InsightCard({ insight }: { insight: Insight }) {
  const [expanded, setExpanded] = useState(false)
  const style = SEVERITY_STYLES[insight.severity]
  const catCfg = CATEGORY_CONFIG[insight.category]

  return (
    <div className={`group relative rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${style.bg} ${style.border}`}>
      {/* Left accent stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${style.gradient}`} />

      <div className="p-4 pl-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold ${catCfg.color}`}>
                {catCfg.icon} {catCfg.label}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold ${style.text} bg-white/60 dark:bg-black/20`}>
                {style.icon} {insight.severity}
              </span>
            </div>
            {/* Title & description */}
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{insight.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">{insight.description}</p>
          </div>

          {/* Value badge */}
          {insight.value != null && (
            <div className="flex-shrink-0 text-right">
              <span className={`text-2xl font-bold tabular-nums ${style.text}`}>{insight.value}</span>
              {insight.unit && (
                <span className="ml-1 text-[11px] text-gray-400 dark:text-gray-500 font-medium">{insight.unit}</span>
              )}
            </div>
          )}
        </div>

        {/* Reference range */}
        {insight.referenceRange && insight.value != null && (
          <ReferenceRangeBar
            low={insight.referenceRange.low}
            high={insight.referenceRange.high}
            value={insight.value}
          />
        )}

        {/* Expandable metadata */}
        {Object.keys(insight.metadata).length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <span className="transition-transform duration-200" style={{ display: "inline-block", transform: expanded ? "rotate(90deg)" : "none" }}>▸</span>
            {expanded ? "Hide details" : "Show details"}
          </button>
        )}
        {expanded && (
          <div className="mt-2 rounded-xl bg-white/50 dark:bg-black/20 border border-gray-200/40 dark:border-gray-700/30 p-3 text-xs font-mono text-gray-600 dark:text-gray-400 space-y-0.5">
            {Object.entries(insight.metadata).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="font-semibold text-gray-800 dark:text-gray-300 shrink-0">{k}:</span>
                <span className="truncate">{JSON.stringify(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Reference Range Bar ─── */
function ReferenceRangeBar({ low, high, value }: { low: number; high: number; value: number }) {
  const rangeMin = low * 0.5
  const rangeMax = high * 1.5
  const span = rangeMax - rangeMin

  const refLeftPct = Math.max(0, Math.min(100, ((low - rangeMin) / span) * 100))
  const refRightPct = Math.max(0, 100 - Math.min(100, ((high - rangeMin) / span) * 100))
  const valuePct = Math.max(0, Math.min(100, ((value - rangeMin) / span) * 100))
  const inRange = value >= low && value <= high

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 mb-1.5 font-medium">
        <span>{low}</span>
        <span className="uppercase tracking-wider">Reference Range</span>
        <span>{high}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-gray-200/60 dark:bg-gray-700/40 overflow-visible">
        {/* Reference zone */}
        <div
          className="absolute inset-y-0 rounded-full bg-emerald-200/60 dark:bg-emerald-800/30"
          style={{ left: `${refLeftPct}%`, right: `${refRightPct}%` }}
        />
        {/* Value dot */}
        <div
          className={`absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 shadow-md transition-all duration-500 ${
            inRange ? "bg-emerald-500" : "bg-amber-500"
          }`}
          style={{ left: `${valuePct}%`, transform: "translate(-50%, -50%)" }}
        />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Algorithm Grid
   ══════════════════════════════════════════════════════════════════════ */

function AlgorithmGrid({ algorithms, search }: { algorithms: InsightAlgorithm[]; search: string }) {
  const filtered = search.trim()
    ? algorithms.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase()) ||
        a.category.toLowerCase().includes(search.toLowerCase())
      )
    : algorithms

  const grouped = new Map<InsightCategory, InsightAlgorithm[]>()
  for (const alg of filtered) {
    const arr = grouped.get(alg.category) ?? []
    arr.push(alg)
    grouped.set(alg.category, arr)
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/40 bg-white/80 dark:bg-gray-900/80 p-10 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">No algorithms match &ldquo;{search}&rdquo;</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([category, algs]) => {
        const cfg = CATEGORY_CONFIG[category]
        return (
          <div key={category}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${cfg.color}`}>
                {cfg.icon} {cfg.label}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{algs.length} algorithm{algs.length > 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {algs.map((alg) => (
                <div
                  key={alg.id}
                  className="rounded-xl border border-gray-200/60 dark:border-gray-800/40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-4 hover:shadow-sm transition-shadow"
                >
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{alg.name}</h4>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">{alg.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {alg.requiredMetrics.map((m) => (
                      <span
                        key={m}
                        className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400"
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
