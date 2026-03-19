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

const SEV: Record<
  InsightSeverity,
  { bg: string; border: string; icon: string; text: string; barColor: string; gradient: string; neon: string; hex: string; glowRGB: string }
> = {
  positive: {
    bg: "bg-emerald-500/[0.06] dark:bg-emerald-400/[0.06]",
    border: "border-emerald-400/20 dark:border-emerald-400/10",
    icon: "✓", text: "text-emerald-500 dark:text-emerald-400",
    barColor: "bg-emerald-500", gradient: "from-emerald-400 to-emerald-600",
    neon: "shadow-emerald-500/20 dark:shadow-emerald-400/15",
    hex: "#10b981", glowRGB: "16,185,129",
  },
  info: {
    bg: "bg-blue-500/[0.06] dark:bg-blue-400/[0.06]",
    border: "border-blue-400/20 dark:border-blue-400/10",
    icon: "ℹ", text: "text-blue-500 dark:text-blue-400",
    barColor: "bg-blue-500", gradient: "from-blue-400 to-blue-600",
    neon: "shadow-blue-500/20 dark:shadow-blue-400/15",
    hex: "#3b82f6", glowRGB: "59,130,246",
  },
  warning: {
    bg: "bg-amber-500/[0.06] dark:bg-amber-400/[0.06]",
    border: "border-amber-400/20 dark:border-amber-400/10",
    icon: "⚠", text: "text-amber-500 dark:text-amber-400",
    barColor: "bg-amber-500", gradient: "from-amber-400 to-amber-600",
    neon: "shadow-amber-500/20 dark:shadow-amber-400/15",
    hex: "#f59e0b", glowRGB: "245,158,11",
  },
  critical: {
    bg: "bg-red-500/[0.06] dark:bg-red-400/[0.06]",
    border: "border-red-400/20 dark:border-red-400/10",
    icon: "✕", text: "text-red-500 dark:text-red-400",
    barColor: "bg-red-500", gradient: "from-red-400 to-red-600",
    neon: "shadow-red-500/20 dark:shadow-red-400/15",
    hex: "#ef4444", glowRGB: "239,68,68",
  },
}

const CAT: Record<InsightCategory, { label: string; icon: string; color: string; dotColor: string }> = {
  cardio:        { label: "Cardio",         icon: "♥",  color: "bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20",             dotColor: "bg-rose-500" },
  sleep:         { label: "Sleep",          icon: "🌙", color: "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/20",     dotColor: "bg-indigo-500" },
  activity:      { label: "Activity",       icon: "🏃", color: "bg-green-500/10 text-green-500 dark:text-green-400 border-green-500/20",         dotColor: "bg-green-500" },
  body:          { label: "Body",           icon: "⚖",  color: "bg-purple-500/10 text-purple-500 dark:text-purple-400 border-purple-500/20",     dotColor: "bg-purple-500" },
  recovery:      { label: "Recovery",       icon: "🔋", color: "bg-teal-500/10 text-teal-500 dark:text-teal-400 border-teal-500/20",             dotColor: "bg-teal-500" },
  respiratory:   { label: "Respiratory",    icon: "🫁", color: "bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 border-cyan-500/20",             dotColor: "bg-cyan-500" },
  metabolic:     { label: "Metabolic",      icon: "🧬", color: "bg-orange-500/10 text-orange-500 dark:text-orange-400 border-orange-500/20",     dotColor: "bg-orange-500" },
  workout:       { label: "Workout",        icon: "💪", color: "bg-yellow-500/10 text-yellow-500 dark:text-yellow-400 border-yellow-500/20",     dotColor: "bg-yellow-500" },
  trend:         { label: "Trend",          icon: "📈", color: "bg-sky-500/10 text-sky-500 dark:text-sky-400 border-sky-500/20",                 dotColor: "bg-sky-500" },
  anomaly:       { label: "Anomaly",        icon: "🔍", color: "bg-pink-500/10 text-pink-500 dark:text-pink-400 border-pink-500/20",             dotColor: "bg-pink-500" },
  longevity:     { label: "Longevity",      icon: "🧬", color: "bg-violet-500/10 text-violet-500 dark:text-violet-400 border-violet-500/20",     dotColor: "bg-violet-500" },
  immune:        { label: "Immune",         icon: "🛡️", color: "bg-lime-500/10 text-lime-500 dark:text-lime-400 border-lime-500/20",             dotColor: "bg-lime-500" },
  cognitive:     { label: "Cognitive",      icon: "🧠", color: "bg-fuchsia-500/10 text-fuchsia-500 dark:text-fuchsia-400 border-fuchsia-500/20", dotColor: "bg-fuchsia-500" },
  hormonal:      { label: "Hormonal",       icon: "⚗️", color: "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20",         dotColor: "bg-amber-500" },
  womens_health: { label: "Women's Health", icon: "♀️", color: "bg-pink-500/10 text-pink-500 dark:text-pink-400 border-pink-500/20",             dotColor: "bg-pink-500" },
  performance:   { label: "Performance",    icon: "🏅", color: "bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20",                 dotColor: "bg-red-500" },
}

const ALL_CATEGORIES: InsightCategory[] = [
  "cardio", "sleep", "activity", "body", "recovery", "respiratory",
  "metabolic", "workout", "longevity", "immune", "cognitive", "hormonal",
  "womens_health", "performance", "trend", "anomaly",
]
const ALL_SEV: InsightSeverity[] = ["critical", "warning", "info", "positive"]
const RANGES = [
  { value: "7d",  label: "7 D" },
  { value: "14d", label: "14 D" },
  { value: "30d", label: "30 D" },
  { value: "90d", label: "90 D" },
] as const

/* ── Cyber Radar ─── */
function CyberRadar({ data, size = 280 }: { data: { label: string; value: number; max: number }[]; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 40, n = data.length
  if (n < 3) return null
  const step = (2 * Math.PI) / n
  const pt = (i: number, ratio: number) => ({
    x: cx + r * ratio * Math.cos(step * i - Math.PI / 2),
    y: cy + r * ratio * Math.sin(step * i - Math.PI / 2),
  })
  const points = data.map((d, i) => pt(i, Math.min(1, d.value / (d.max || 1))))
  const poly = points.map((p) => `${p.x},${p.y}`).join(" ")

  return (
    <svg width={size} height={size} className="mx-auto drop-shadow-[0_0_24px_rgba(var(--ai-500),0.12)]" aria-label="Health radar">
      <defs>
        <radialGradient id="rdr-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent-500)" stopOpacity="0.06" />
          <stop offset="100%" stopColor="var(--accent-500)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rdr-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--accent-400)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--accent-600)" stopOpacity="0.08" />
        </linearGradient>
        <filter id="rdr-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx={cx} cy={cy} r={r + 10} fill="url(#rdr-bg)" />
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={Array.from({ length: n }, (_, i) => pt(i, ring)).map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke="currentColor" className="text-gray-300/30 dark:text-gray-600/30" strokeWidth={0.5} strokeDasharray={ring < 1 ? "2 4" : "0"}
        />
      ))}
      {data.map((_, i) => {
        const p = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="currentColor" className="text-gray-300/20 dark:text-gray-600/20" strokeWidth={0.5} />
      })}
      <polygon points={poly} fill="url(#rdr-fill)" stroke="var(--accent-500)" strokeWidth={2} filter="url(#rdr-glow)" className="svg-draw" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={6} fill="var(--accent-500)" fillOpacity={0.15} />
          <circle cx={p.x} cy={p.y} r={3.5} fill="var(--accent-500)" stroke="white" strokeWidth={1.5} className="dark:stroke-gray-900" />
        </g>
      ))}
      {data.map((d, i) => {
        const lp = pt(i, 1.25)
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" className="fill-gray-400 dark:fill-gray-500 text-[9px] font-semibold uppercase tracking-wider">
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}

/* ── Cyber Donut ─── */
function CyberDonut({ segments, size = 200 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  if (total === 0) return null
  const r = (size - 24) / 2, cx = size / 2, cy = size / 2, thickness = 20, innerR = r - thickness
  let cumAngle = -Math.PI / 2
  const gap = 0.03
  const arcs = segments.filter((s) => s.value > 0).map((s) => {
    const angle = Math.max(0, (s.value / total) * 2 * Math.PI - gap)
    const start = cumAngle + gap / 2
    cumAngle += (s.value / total) * 2 * Math.PI
    const end = start + angle
    const lg = angle > Math.PI ? 1 : 0
    const d = [
      `M ${cx + r * Math.cos(start)} ${cy + r * Math.sin(start)}`,
      `A ${r} ${r} 0 ${lg} 1 ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)}`,
      `L ${cx + innerR * Math.cos(end)} ${cy + innerR * Math.sin(end)}`,
      `A ${innerR} ${innerR} 0 ${lg} 0 ${cx + innerR * Math.cos(start)} ${cy + innerR * Math.sin(start)} Z`,
    ].join(" ")
    return { ...s, d }
  })

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="drop-shadow-[0_0_20px_rgba(var(--ai-500),0.08)]" aria-label="Severity donut">
        <defs>
          <filter id="donut-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} filter="url(#donut-glow)" className="transition-all duration-300 hover:opacity-80" style={{ filter: `drop-shadow(0 0 6px ${a.color}40)` }} />
        ))}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-black text-gray-900 dark:text-gray-100 number-pop tabular-nums">{total}</span>
        <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] font-semibold">Total</span>
      </div>
    </div>
  )
}

/* ── Score Ring ─── */
function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const sw = 5, r = (size - sw) / 2, circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score))
  const offset = circ - (pct / 100) * circ
  const color = pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444"
  const glow = pct >= 70 ? "16,185,129" : pct >= 40 ? "245,158,11" : "239,68,68"
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ filter: `drop-shadow(0 0 8px rgba(${glow},0.3))` }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-200/40 dark:text-gray-700/30" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-1000 ease-out" />
      </svg>
      <span className="absolute text-base font-black text-gray-900 dark:text-gray-100">{Math.round(pct)}</span>
    </div>
  )
}

/* ── Cyber Category Bar ─── */
function CyberBar({ label, icon, value, max, dotColor }: { label: string; icon: string; value: number; max: number; dotColor: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="group flex items-center gap-2.5">
      <span className="text-sm shrink-0">{icon}</span>
      <span className="text-[11px] w-20 text-gray-500 dark:text-gray-400 truncate font-medium">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-200/30 dark:bg-gray-700/20 overflow-hidden relative">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${dotColor}`} style={{ width: `${pct}%`, boxShadow: `0 0 8px ${dotColor.includes("rose") ? "rgba(244,63,94,0.3)" : "rgba(var(--ai-500),0.2)"}` }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums text-gray-600 dark:text-gray-300 w-6 text-right">{value}</span>
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

  const { data: usersResult } = useQuery({ queryKey: ["users", 0], queryFn: () => usersApi.list({ limit: 200, offset: 0 }) })
  const users = usersResult?.data ?? []
  const selectedUser = users.find((u) => u.id === selectedUserId)
  const GENDER_GATED: InsightCategory[] = ["womens_health"]
  const visibleCategories = selectedUser?.gender === "male" ? ALL_CATEGORIES.filter((c) => !GENDER_GATED.includes(c)) : ALL_CATEGORIES

  const rangeDays = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[dateRange]
  const to = new Date()
  const from = new Date(to.getTime() - rangeDays * 86400000)

  const { data: insightsResult, isLoading, isError } = useQuery({
    queryKey: ["insights", selectedUserId, dateRange],
    queryFn: () => insightsApi.generate(selectedUserId, { from: from.toISOString(), to: to.toISOString() }),
    enabled: !!selectedUserId,
  })
  const { data: algorithmsResult } = useQuery({ queryKey: ["insight-algorithms"], queryFn: () => insightsApi.algorithms() })

  const allInsights = insightsResult?.data ?? []
  const algorithms = algorithmsResult?.data ?? []

  const filtered = allInsights.filter((i) => {
    if (categoryFilter && i.category !== categoryFilter) return false
    if (severityFilter && i.severity !== severityFilter) return false
    return true
  })
  const sevOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 }
  const sorted = [...filtered].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])

  const counts = { positive: 0, info: 0, warning: 0, critical: 0 }
  for (const i of allInsights) counts[i.severity]++
  const catCounts = new Map<InsightCategory, number>()
  for (const i of allInsights) catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1)

  const radarData = useMemo(() => {
    const cats = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
    return cats.map(([cat]) => {
      const ci = allInsights.filter((i) => i.category === cat)
      const ratio = ci.filter((i) => i.severity === "positive").length / Math.max(1, ci.length)
      return { label: cat.replace("_", " ").slice(0, 10), value: Math.round(ratio * 100), max: 100 }
    })
  }, [allInsights, catCounts])

  const donutSegs = useMemo(() => [
    { label: "Positive", value: counts.positive, color: "#10b981" },
    { label: "Info",     value: counts.info,     color: "#3b82f6" },
    { label: "Warning",  value: counts.warning,  color: "#f59e0b" },
    { label: "Critical", value: counts.critical, color: "#ef4444" },
  ], [counts.positive, counts.info, counts.warning, counts.critical])

  const healthScore = useMemo(() => {
    if (!allInsights.length) return 0
    const w = counts.positive * 1 + counts.info * 0.7 + counts.warning * 0.3 + counts.critical * 0
    return Math.round((w / allInsights.length) * 100)
  }, [allInsights.length, counts])

  const has = selectedUserId && allInsights.length > 0

  return (
    <div className="space-y-6">
      {/* ═══ HERO ═══ */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 dark:border-white/[0.06] bg-gray-950 dark:bg-black p-6 sm:p-8 shadow-2xl">
        {/* Animated gradient mesh bg */}
        <div className="cyber-mesh absolute inset-0 pointer-events-none" />
        {/* Holographic sweep */}
        <div className="holo-shimmer absolute inset-0 pointer-events-none" />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.04] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTSAwIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41Ii8+PC9zdmc+')] pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500/20 border border-accent-400/20 backdrop-blur-sm">
                <span className="text-xl">🧠</span>
                <div className="absolute -inset-0.5 rounded-xl bg-accent-500/10 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  Insights Engine
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-400/80">Live analysis</span>
                </div>
              </div>
            </div>
            <p className="text-white/50 text-sm max-w-lg leading-relaxed">
              {algorithms.length > 0
                ? <><span className="font-bold text-accent-400">{algorithms.length}</span> proprietary algorithms across <span className="font-bold text-accent-400">{visibleCategories.length}</span> health dimensions — generating intelligence from your biometric data.</>
                : "Next-gen algorithms analyzing your health data in real-time."}
            </p>
          </div>
          {has && (
            <div className="flex items-center gap-5 shrink-0">
              <ScoreRing score={healthScore} size={80} />
              <div className="text-right">
                <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">Health Score</p>
                <p className="text-lg font-black text-white mt-0.5 tabular-nums">{healthScore}<span className="text-xs text-white/40 font-medium">/100</span></p>
                <p className="text-[10px] mt-0.5" style={{ color: healthScore >= 70 ? "#10b981" : healthScore >= 40 ? "#f59e0b" : "#ef4444" }}>
                  {healthScore >= 70 ? "■ Excellent" : healthScore >= 40 ? "■ Moderate" : "■ Needs attention"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ CONTROL BAR ═══ */}
      <div className="rounded-2xl border border-gray-200/50 dark:border-gray-800/30 bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1 min-w-0">
            <label htmlFor="insight-user" className="block text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 mb-1.5">User</label>
            <select id="insight-user" className="w-full rounded-xl border border-gray-200/60 dark:border-gray-700/40 bg-gray-50/80 dark:bg-gray-800/50 backdrop-blur-sm px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-all" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId} {u.email ? `(${u.email})` : ""}</option>)}
            </select>
          </div>
          <div>
            <p className="block text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 mb-1.5">Range</p>
            <div className="inline-flex rounded-xl bg-gray-100/80 dark:bg-gray-800/40 p-0.5 border border-gray-200/40 dark:border-gray-700/20">
              {RANGES.map((dr) => (
                <button key={dr.value} type="button" onClick={() => setDateRange(dr.value)}
                  className={`rounded-lg px-3.5 py-1.5 text-[11px] font-bold tracking-wide transition-all ${dateRange === dr.value ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"}`}
                >{dr.label}</button>
              ))}
            </div>
          </div>
          <div className="min-w-[160px]">
            <label htmlFor="insight-cat" className="block text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 mb-1.5">Category</label>
            <select id="insight-cat" className="w-full rounded-xl border border-gray-200/60 dark:border-gray-700/40 bg-gray-50/80 dark:bg-gray-800/50 backdrop-blur-sm px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-all" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as InsightCategory | "")}>
              <option value="">All Categories</option>
              {visibleCategories.map((c) => <option key={c} value={c}>{CAT[c].icon} {CAT[c].label}{catCounts.has(c) ? ` (${catCounts.get(c)})` : ""}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="insight-sev" className="block text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 mb-1.5">Severity</label>
            <select id="insight-sev" className="w-full rounded-xl border border-gray-200/60 dark:border-gray-700/40 bg-gray-50/80 dark:bg-gray-800/50 backdrop-blur-sm px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-all" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as InsightSeverity | "")}>
              <option value="">All Severities</option>
              {ALL_SEV.map((s) => <option key={s} value={s}>{SEV[s].icon} {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s]})</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ═══ SEVERITY ORBS ═══ */}
      {has && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 stagger-grid">
          {(["critical", "warning", "info", "positive"] as const).map((sev) => {
            const s = SEV[sev], isActive = severityFilter === sev
            const pct = allInsights.length > 0 ? Math.round((counts[sev] / allInsights.length) * 100) : 0
            return (
              <button key={sev} type="button" title={`Filter by ${sev}`}
                onClick={() => setSeverityFilter(isActive ? "" : sev)}
                className={`group relative rounded-2xl border p-4 text-left transition-all duration-300 backdrop-blur-sm overflow-hidden ${s.bg} ${s.border} ${isActive ? "ring-2 ring-accent-500/60 ring-offset-2 dark:ring-offset-gray-950" : "hover:shadow-lg"}`}
                style={isActive ? {} : { boxShadow: `0 0 0 0 rgba(${s.glowRGB},0)` }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget.style.boxShadow = `0 4px 24px -4px rgba(${s.glowRGB},0.25)`) }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget.style.boxShadow = `0 0 0 0 rgba(${s.glowRGB},0)`) }}
              >
                {/* Ambient glow blob */}
                <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-[0.07] group-hover:opacity-[0.12] transition-opacity" style={{ background: `radial-gradient(circle, ${s.hex}, transparent 70%)` }} />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${s.gradient} text-white text-sm font-black shadow-lg`} style={{ boxShadow: `0 4px 12px -2px rgba(${s.glowRGB},0.4)` }}>
                      {s.icon}
                    </span>
                    <span className={`text-3xl font-black tabular-nums ${s.text} number-pop`}>{counts[sev]}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 capitalize tracking-wide">{sev}</p>
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 tabular-nums">{pct}%</span>
                  </div>
                  <div className="mt-2.5 h-1 rounded-full bg-gray-200/40 dark:bg-gray-700/20 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${s.barColor}`} style={{ width: `${pct}%`, boxShadow: `0 0 6px rgba(${s.glowRGB},0.4)` }} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ═══ CATEGORY PILLS ═══ */}
      {has && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCategoryFilter("")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-all border ${categoryFilter === "" ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent shadow-lg shadow-gray-900/20 dark:shadow-white/10" : "bg-white/60 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400 border-gray-200/40 dark:border-gray-700/20 hover:border-gray-300 dark:hover:border-gray-600 backdrop-blur-sm"}`}>
            All <span className="rounded-full bg-white/20 dark:bg-black/20 px-1.5 text-[9px]">{allInsights.length}</span>
          </button>
          {visibleCategories.filter((c) => catCounts.has(c)).map((c) => {
            const cfg = CAT[c], active = categoryFilter === c
            return (
              <button key={c} type="button" onClick={() => setCategoryFilter(active ? "" : c)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all border backdrop-blur-sm ${active ? `${cfg.color} ring-2 ring-accent-500/50 ring-offset-1 dark:ring-offset-gray-950` : `${cfg.color} opacity-70 hover:opacity-100`}`}>
                <span>{cfg.icon}</span> {cfg.label}
                <span className="rounded-full bg-white/30 dark:bg-black/20 px-1.5 text-[9px]">{catCounts.get(c)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ═══ VISUALIZATION ROW ═══ */}
      {has && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 stagger-grid">
          <div className="rounded-2xl border border-gray-200/40 dark:border-gray-800/20 bg-white/50 dark:bg-gray-900/30 backdrop-blur-xl p-5 shadow-sm">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 mb-4">Health Dimensions</h3>
            <CyberRadar data={radarData} size={260} />
          </div>
          <div className="rounded-2xl border border-gray-200/40 dark:border-gray-800/20 bg-white/50 dark:bg-gray-900/30 backdrop-blur-xl p-5 shadow-sm">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 mb-4">Severity Distribution</h3>
            <div className="flex items-center justify-center py-2"><CyberDonut segments={donutSegs} size={200} /></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {donutSegs.map((seg) => (
                <div key={seg.label} className="flex items-center gap-2 text-[11px]">
                  <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: seg.color, boxShadow: `0 0 6px ${seg.color}60` }} />
                  <span className="text-gray-400 dark:text-gray-500">{seg.label}</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300 ml-auto tabular-nums">{seg.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200/40 dark:border-gray-800/20 bg-white/50 dark:bg-gray-900/30 backdrop-blur-xl p-5 shadow-sm">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 mb-4">Category Breakdown</h3>
            <div className="space-y-2.5">
              {Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <CyberBar key={cat} label={CAT[cat].label} icon={CAT[cat].icon} value={count} max={Math.max(1, ...Array.from(catCounts.values()))} dotColor={CAT[cat].dotColor} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ EMPTY STATE ═══ */}
      {!selectedUserId && (
        <div className="relative flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300/40 dark:border-gray-700/30 bg-gray-50/30 dark:bg-gray-900/20 backdrop-blur-sm py-20 px-6 text-center overflow-hidden">
          <div className="absolute inset-0 cyber-mesh pointer-events-none" />
          <div className="relative z-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-500/10 border border-accent-400/20 mx-auto mb-5 float-gentle">
              <span className="text-4xl">🧠</span>
            </div>
            <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">Select a User</h3>
            <p className="mt-2 text-sm text-gray-400 dark:text-gray-500 max-w-sm">
              Choose a user to run <span className="font-bold text-accent-500">{algorithms.length}</span> algorithms and generate personalized insights.
            </p>
            <button type="button" onClick={() => setShowAlgorithms(!showAlgorithms)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent-500 text-white px-5 py-2.5 text-sm font-bold shadow-lg shadow-accent-500/25 hover:bg-accent-600 hover:shadow-accent-500/30 transition-all hover:-translate-y-0.5">
              {showAlgorithms ? "Hide algorithms" : `Browse ${algorithms.length} algorithms`}
              <span className="text-white/50">→</span>
            </button>
          </div>
        </div>
      )}

      {/* ═══ LOADING ═══ */}
      {selectedUserId && isLoading && (
        <div className="relative flex flex-col items-center justify-center rounded-2xl border border-gray-200/30 dark:border-gray-800/20 bg-white/40 dark:bg-gray-900/20 backdrop-blur-xl py-24 overflow-hidden">
          <div className="absolute inset-0 cyber-mesh pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="relative">
              <div className="h-14 w-14 animate-spin rounded-full border-[3px] border-accent-500/20 border-t-accent-500" style={{ filter: "drop-shadow(0 0 8px rgba(var(--ai-500),0.3))" }} />
              <div className="absolute inset-0 flex items-center justify-center"><span className="text-xl">🧠</span></div>
            </div>
            <div className="data-stream flex gap-1 mt-4">
              <span className="h-1 w-1 rounded-full bg-accent-500" />
              <span className="h-1 w-1 rounded-full bg-accent-500" />
              <span className="h-1 w-1 rounded-full bg-accent-500" />
            </div>
            <p className="mt-4 text-sm font-semibold text-gray-500 dark:text-gray-400">Running <span className="text-accent-500 font-bold">{algorithms.length}</span> algorithms…</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Analyzing {rangeDays} days of biometric data</p>
          </div>
        </div>
      )}

      {/* ═══ ERROR ═══ */}
      {selectedUserId && isError && (
        <div className="rounded-2xl border border-red-400/20 dark:border-red-400/10 bg-red-500/[0.04] backdrop-blur-sm p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 border border-red-400/20 mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h3 className="text-sm font-bold text-red-500 dark:text-red-400">Analysis Failed</h3>
          <p className="mt-1 text-xs text-red-400/60 dark:text-red-400/40">Ensure the user has synced health data for the selected range.</p>
        </div>
      )}

      {/* ═══ NO DATA ═══ */}
      {selectedUserId && !isLoading && !isError && allInsights.length === 0 && (
        <div className="rounded-2xl border border-gray-200/30 dark:border-gray-800/20 bg-white/40 dark:bg-gray-900/20 backdrop-blur-sm p-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-500/10 border border-gray-400/20 mx-auto mb-4"><span className="text-2xl">📊</span></div>
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">No Insights Found</h3>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Insufficient health data in the selected {rangeDays}-day window.</p>
        </div>
      )}

      {/* ═══ INSIGHTS LIST ═══ */}
      {sorted.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 tracking-wide">
              {filtered.length === allInsights.length ? `All Insights (${allInsights.length})` : `Filtered (${filtered.length} of ${allInsights.length})`}
            </h2>
            {(categoryFilter || severityFilter) && (
              <button type="button" onClick={() => { setCategoryFilter(""); setSeverityFilter("") }}
                className="text-[11px] text-accent-500 hover:text-accent-600 font-bold tracking-wide">Clear filters</button>
            )}
          </div>
          <div className="space-y-3">
            {sorted.map((insight) => <InsightCard key={insight.id} insight={insight} />)}
          </div>
        </div>
      )}

      {/* ═══ ALGORITHM CATALOG TOGGLE ═══ */}
      {has && (
        <div className="pt-2 text-center">
          <button type="button" onClick={() => setShowAlgorithms(!showAlgorithms)}
            className="inline-flex items-center gap-3 text-sm font-bold text-accent-500 hover:text-accent-400 transition-colors">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-accent-500/30" />
            {showAlgorithms ? "Hide" : "View"} Algorithm Catalog ({algorithms.length})
            <span className="h-px w-10 bg-gradient-to-l from-transparent to-accent-500/30" />
          </button>
        </div>
      )}

      {showAlgorithms && algorithms.length > 0 && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Algorithm Catalog</h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 tracking-wide">{algorithms.length} proprietary health algorithms</p>
            </div>
            <input type="text" placeholder="Search algorithms…" value={algSearch} onChange={(e) => setAlgSearch(e.target.value)}
              className="rounded-xl border border-gray-200/50 dark:border-gray-700/30 bg-gray-50/60 dark:bg-gray-800/30 backdrop-blur-sm px-3.5 py-2 text-sm text-gray-900 dark:text-gray-100 w-full sm:w-64 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-all" />
          </div>
          <AlgorithmGrid algorithms={algorithms} search={algSearch} />
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Futuristic Insight Card
   ══════════════════════════════════════════════════════════════════════ */

function InsightCard({ insight }: { insight: Insight }) {
  const [expanded, setExpanded] = useState(false)
  const s = SEV[insight.severity]
  const cat = CAT[insight.category]

  return (
    /* Animated gradient border wrapper */
    <div
      className="insight-card-border"
      style={{ "--card-glow": s.hex } as React.CSSProperties}
    >
      <div
        className={`group relative rounded-[15px] overflow-hidden transition-all duration-300 bg-white/70 dark:bg-gray-950/80 backdrop-blur-xl card-grid-bg`}
        style={{ boxShadow: `0 0 0 0 rgba(${s.glowRGB},0)`, transition: "all 0.3s ease, box-shadow 0.5s ease" }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 12px 40px -12px rgba(${s.glowRGB},0.25), 0 0 0 1px rgba(${s.glowRGB},0.08)` }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `0 0 0 0 rgba(${s.glowRGB},0)` }}
      >
        {/* HUD targeting bracket corners */}
        <div className="hud-corners absolute inset-3 pointer-events-none z-20" style={{ "--accent-500": s.hex } as React.CSSProperties} />

        {/* Neon left accent — thicker with animated glow */}
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b ${s.gradient}`} style={{ boxShadow: `3px 0 16px rgba(${s.glowRGB},0.35), 1px 0 4px rgba(${s.glowRGB},0.5)` }} />

        {/* Ambient corner glow */}
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-[0.04] group-hover:opacity-[0.1] transition-opacity duration-500 pointer-events-none" style={{ background: `radial-gradient(circle, ${s.hex}, transparent 70%)` }} />
        <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500 pointer-events-none" style={{ background: `radial-gradient(circle, ${s.hex}, transparent 70%)` }} />

        {/* Scan line sweep on hover */}
        <div className="scan-line absolute inset-0 pointer-events-none" />

        <div className="relative z-10 p-5 pl-7">
          {/* Top row: badges + value */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Badge row */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {/* Severity orb */}
                <div
                  className="sev-orb inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black text-white shrink-0"
                  style={{ background: `linear-gradient(135deg, ${s.hex}, ${s.hex}cc)`, "--sev-glow": `${s.hex}80` } as React.CSSProperties}
                >
                  {s.icon}
                </div>
                {/* Category badge */}
                <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-bold border backdrop-blur-sm ${cat.color}`}>
                  {cat.icon} {cat.label}
                </span>
                {/* Severity text badge */}
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${s.text}`}
                  style={{ background: `rgba(${s.glowRGB},0.08)`, border: `1px solid rgba(${s.glowRGB},0.15)` }}
                >
                  {insight.severity}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-snug tracking-tight group-hover:text-gray-800 dark:group-hover:text-white transition-colors">
                {insight.title}
              </h3>

              {/* Expanding accent line under title on hover */}
              <div className="hover-line h-[1.5px] w-24 mt-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${s.hex}, transparent)` }} />

              {/* Description */}
              <p className="mt-2.5 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">{insight.description}</p>
            </div>

            {/* Value display — neon style */}
            {insight.value != null && (
              <div className="flex-shrink-0 text-right pt-8">
                <div className="inline-flex items-baseline gap-1">
                  <span
                    className={`val-neon text-3xl font-black tabular-nums ${s.text}`}
                    style={{ "--val-glow": `${s.hex}60`, letterSpacing: "-0.02em" } as React.CSSProperties}
                  >
                    {insight.value}
                  </span>
                  {insight.unit && (
                    <span className="text-[11px] text-gray-400/80 dark:text-gray-500/80 font-semibold uppercase tracking-wider">{insight.unit}</span>
                  )}
                </div>
                {/* Mini severity bar under value */}
                <div className="mt-1.5 ml-auto w-12 h-[2px] rounded-full overflow-hidden" style={{ background: `rgba(${s.glowRGB},0.1)` }}>
                  <div className="h-full rounded-full" style={{ width: "100%", background: `linear-gradient(90deg, transparent, ${s.hex})`, boxShadow: `0 0 6px ${s.hex}40` }} />
                </div>
              </div>
            )}
          </div>

          {/* Reference range */}
          {insight.referenceRange && insight.value != null && (
            <HoloRangeBar low={insight.referenceRange.low} high={insight.referenceRange.high} value={insight.value} hex={s.hex} glowRGB={s.glowRGB} />
          )}

          {/* Metadata toggle */}
          {Object.keys(insight.metadata).length > 0 && (
            <>
              <button type="button" onClick={() => setExpanded(!expanded)}
                className="mt-4 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 hover:text-accent-500 dark:hover:text-accent-400 transition-colors group/btn">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-current/20 text-[8px] transition-transform duration-200" style={{ transform: expanded ? "rotate(90deg)" : "none" }}>▸</span>
                <span>{expanded ? "Hide" : "Show"} diagnostics</span>
                <span className="h-px flex-1 min-w-[20px] bg-current opacity-20" />
              </button>
              {expanded && (
                <div className="mt-2.5 rounded-lg bg-gray-950/[0.03] dark:bg-white/[0.02] border border-gray-200/20 dark:border-gray-700/15 p-3.5 font-mono text-[11px] space-y-1.5 overflow-hidden"
                  style={{ background: `linear-gradient(135deg, rgba(${s.glowRGB},0.02), transparent)` }}>
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200/10 dark:border-gray-700/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">System Diagnostics</span>
                  </div>
                  {Object.entries(insight.metadata).map(([k, v]) => (
                    <div key={k} className="flex items-start gap-2 group/row hover:bg-white/[0.03] rounded px-1 -mx-1 py-0.5 transition-colors">
                      <span className="text-accent-500/60 shrink-0 select-none">›</span>
                      <span className="font-bold text-gray-600 dark:text-gray-300 shrink-0">{k}</span>
                      <span className="text-gray-400 dark:text-gray-500 truncate">{JSON.stringify(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Holographic Reference Range Bar ─── */
function HoloRangeBar({ low, high, value, hex, glowRGB }: { low: number; high: number; value: number; hex: string; glowRGB: string }) {
  const rMin = low * 0.5, rMax = high * 1.5, span = rMax - rMin
  const refL = Math.max(0, Math.min(100, ((low - rMin) / span) * 100))
  const refR = Math.max(0, 100 - Math.min(100, ((high - rMin) / span) * 100))
  const valPct = Math.max(0, Math.min(100, ((value - rMin) / span) * 100))
  const inRange = value >= low && value <= high
  const dotColor = inRange ? "#10b981" : "#f59e0b"
  const dotGlow = inRange ? "16,185,129" : "245,158,11"

  return (
    <div className="mt-5">
      {/* Labels */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold tabular-nums text-gray-400 dark:text-gray-500">{low}</span>
        <div className="flex items-center gap-2">
          <span className="h-px w-4 bg-gray-300/30 dark:bg-gray-700/30" />
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400/60 dark:text-gray-500/60">Reference Range</span>
          <span className="h-px w-4 bg-gray-300/30 dark:bg-gray-700/30" />
        </div>
        <span className="text-[10px] font-bold tabular-nums text-gray-400 dark:text-gray-500">{high}</span>
      </div>

      {/* Track */}
      <div className="relative h-3 rounded-full overflow-visible range-ticks" style={{ background: "linear-gradient(90deg, rgba(239,68,68,0.08), rgba(16,185,129,0.12) 33%, rgba(16,185,129,0.12) 66%, rgba(245,158,11,0.08) 100%)" }}>
        {/* Neon shimmer sweep */}
        <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)", backgroundSize: "200% 100%", animation: "trackShine 4s linear infinite" }} />
        </div>

        {/* Reference zone highlight */}
        <div className="absolute inset-y-0 rounded-full border border-emerald-500/20" style={{ left: `${refL}%`, right: `${refR}%`, background: "linear-gradient(180deg, rgba(16,185,129,0.2), rgba(16,185,129,0.08))", boxShadow: "inset 0 0 12px rgba(16,185,129,0.08)" }}>
          {/* Edge glow lines */}
          <div className="absolute left-0 top-0 bottom-0 w-px bg-emerald-500/30" />
          <div className="absolute right-0 top-0 bottom-0 w-px bg-emerald-500/30" />
        </div>

        {/* Value indicator cluster */}
        <div className="absolute top-1/2 transition-all duration-700 ease-out z-10" style={{ left: `${valPct}%`, transform: "translate(-50%, -50%)" }}>
          {/* Outer pulse ring */}
          <div className="absolute -inset-3 rounded-full animate-ping opacity-20" style={{ background: dotColor }} />
          {/* Glow aura */}
          <div className="absolute -inset-2 rounded-full" style={{ background: `radial-gradient(circle, rgba(${dotGlow},0.3), transparent 70%)` }} />
          {/* Dot */}
          <div
            className="relative w-4 h-4 rounded-full border-2 border-white dark:border-gray-950"
            style={{ background: dotColor, boxShadow: `0 0 12px rgba(${dotGlow},0.6), 0 0 4px rgba(${dotGlow},0.8)` }}
          >
            {/* Inner highlight */}
            <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-white/40" />
          </div>
        </div>
      </div>

      {/* Status indicator below */}
      <div className="flex items-center justify-center mt-2 gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor, boxShadow: `0 0 6px rgba(${dotGlow},0.5)` }} />
        <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: dotColor }}>{inRange ? "Within range" : "Outside range"}</span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Algorithm Grid
   ══════════════════════════════════════════════════════════════════════ */

function AlgorithmGrid({ algorithms, search }: { algorithms: InsightAlgorithm[]; search: string }) {
  const filtered = search.trim()
    ? algorithms.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase()) || a.category.toLowerCase().includes(search.toLowerCase()))
    : algorithms

  const grouped = new Map<InsightCategory, InsightAlgorithm[]>()
  for (const alg of filtered) { const arr = grouped.get(alg.category) ?? []; arr.push(alg); grouped.set(alg.category, arr) }

  if (filtered.length === 0) {
    return <div className="rounded-2xl border border-gray-200/30 dark:border-gray-800/20 bg-white/40 dark:bg-gray-900/20 backdrop-blur-sm p-10 text-center"><p className="text-sm text-gray-400 dark:text-gray-500">No algorithms match &ldquo;{search}&rdquo;</p></div>
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([category, algs]) => {
        const cfg = CAT[category]
        return (
          <div key={category}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold border backdrop-blur-sm ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">{algs.length} algorithm{algs.length > 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger-grid">
              {algs.map((alg) => (
                <div key={alg.id} className="group rounded-xl border border-gray-200/30 dark:border-gray-800/20 bg-white/40 dark:bg-gray-900/20 backdrop-blur-sm p-4 hover:border-accent-400/30 hover:shadow-lg hover:shadow-accent-500/5 transition-all duration-300">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug">{alg.name}</h4>
                  <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">{alg.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {alg.requiredMetrics.map((m) => (
                      <span key={m} className="rounded-md bg-gray-500/[0.06] dark:bg-white/[0.04] border border-gray-200/30 dark:border-gray-700/20 px-2 py-0.5 text-[9px] font-semibold text-gray-400 dark:text-gray-500">{m}</span>
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
