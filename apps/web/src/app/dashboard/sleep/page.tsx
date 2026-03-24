"use client"

import { useQuery } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import {
  sleepAnalysisApi, healthApi, analyticsApi, usersApi,
  type SleepDebtData, type SleepQualityData, type CircadianAnalysis, type HealthMetric,
} from "../../../lib/api"
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts"

// ── Constants ──────────────────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
  { label: "1y", days: 365 },
] as const

const STAGE_COLORS = {
  deep: "#6366f1",
  rem: "#a855f7",
  light: "#38bdf8",
  awake: "#f87171",
}

const PIE_COLORS = ["#6366f1", "#a855f7", "#38bdf8", "#f87171"]

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatHours(h: number) {
  if (!h && h !== 0) return "—"
  const hrs = Math.floor(Math.abs(h))
  const mins = Math.round((Math.abs(h) - hrs) * 60)
  return `${h < 0 ? "-" : ""}${hrs}h ${mins}m`
}

function formatMinsToTime(mins: number) {
  const h = Math.floor(mins / 60) % 24
  const m = Math.round(mins % 60)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

function isoDate(daysAgo: number) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function aggregateSleepByDay(metrics: HealthMetric[]) {
  const byDay = new Map<string, { date: string; totalHours: number; deep: number; rem: number; light: number; awake: number; efficiency: number; count: number }>()
  for (const m of metrics) {
    const day = m.recordedAt?.slice(0, 10) ?? ""
    if (!day) continue
    const existing = byDay.get(day) ?? { date: day, totalHours: 0, deep: 0, rem: 0, light: 0, awake: 0, efficiency: 0, count: 0 }
    const data = m.data as Record<string, unknown> | null
    const val = Number(m.value) || 0

    if (m.metricType === "sleep" || m.metricType === "sleep_duration") {
      // value is typically in hours or minutes
      existing.totalHours += val > 24 ? val / 60 : val
    }
    if (data) {
      if (typeof data.deep_sleep_hours === "number") existing.deep += data.deep_sleep_hours
      else if (typeof data.deep_sleep_duration_seconds === "number") existing.deep += data.deep_sleep_duration_seconds / 3600
      if (typeof data.rem_sleep_hours === "number") existing.rem += data.rem_sleep_hours
      else if (typeof data.rem_sleep_duration_seconds === "number") existing.rem += data.rem_sleep_duration_seconds / 3600
      if (typeof data.light_sleep_hours === "number") existing.light += data.light_sleep_hours
      else if (typeof data.light_sleep_duration_seconds === "number") existing.light += data.light_sleep_duration_seconds / 3600
      if (typeof data.awake_hours === "number") existing.awake += data.awake_hours
      else if (typeof data.awake_duration_seconds === "number") existing.awake += data.awake_duration_seconds / 3600
      if (typeof data.efficiency === "number") { existing.efficiency += data.efficiency; existing.count++ }
      if (typeof data.sleep_efficiency === "number") { existing.efficiency += data.sleep_efficiency; existing.count++ }
      // Whoop-style: total sleep duration in seconds
      if (typeof data.total_sleep_duration_seconds === "number" && existing.totalHours === 0) {
        existing.totalHours = data.total_sleep_duration_seconds / 3600
      }
    }
    byDay.set(day, existing)
  }
  return [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      efficiency: d.count > 0 ? Math.round(d.efficiency / d.count) : 0,
      shortDate: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    }))
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreRing({ label, value, max, color, size = 96 }: { label: string; value: number; max: number; color: string; size?: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="text-center">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" className={color} strokeWidth="3" strokeDasharray={`${pct} 100`} strokeLinecap="round" />
        </svg>
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</span>
      </div>
      <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  )
}

function StatCard({ icon, label, value, sub, accent }: { icon: string; label: string; value: string; sub?: string | undefined; accent?: string | undefined }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card hover:shadow-card-hover transition-all duration-300">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${accent ?? "text-gray-900 dark:text-gray-50"}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function SleepTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-600 dark:text-gray-400">{p.name}:</span>
          <span className="font-bold text-gray-900 dark:text-gray-50">
            {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
            {p.name.includes("%") || p.name === "Efficiency" ? "%" : p.name.includes("Debt") ? "h" : "h"}
          </span>
        </div>
      ))}
    </div>
  )
}

function DebtTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-600 dark:text-gray-400">{p.name}:</span>
          <span className="font-bold text-gray-900 dark:text-gray-50">{formatHours(p.value)}</span>
        </div>
      ))}
    </div>
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function SleepPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [rangeDays, setRangeDays] = useState(30)
  const [tablePage, setTablePage] = useState(0)
  const PAGE_SIZE = 15

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: debt, isLoading: debtLoading } = useQuery({
    queryKey: ["sleep-debt", selectedUserId, rangeDays],
    queryFn: () => sleepAnalysisApi.debt(selectedUserId, rangeDays),
    enabled: !!selectedUserId,
  })

  const { data: quality, isLoading: qualityLoading } = useQuery({
    queryKey: ["sleep-quality", selectedUserId, rangeDays],
    queryFn: () => sleepAnalysisApi.quality(selectedUserId, rangeDays),
    enabled: !!selectedUserId,
  })

  const { data: circadian } = useQuery({
    queryKey: ["circadian", selectedUserId],
    queryFn: async () => {
      try { return (await analyticsApi.circadian(selectedUserId)).data } catch { return null }
    },
    enabled: !!selectedUserId,
  })

  // Raw sleep data for charts
  const fromDate = isoDate(rangeDays)
  const toDate = isoDate(0)
  const { data: rawSleep } = useQuery({
    queryKey: ["sleep-raw", selectedUserId, rangeDays],
    queryFn: async () => {
      const [sleepRes, durationRes] = await Promise.all([
        healthApi.query(selectedUserId, { metricType: "sleep", from: fromDate, to: toDate, limit: 500 }),
        healthApi.query(selectedUserId, { metricType: "sleep_duration", from: fromDate, to: toDate, limit: 500 }),
      ])
      return [...(sleepRes.data ?? []), ...(durationRes.data ?? [])]
    },
    enabled: !!selectedUserId,
  })

  const isLoading = debtLoading || qualityLoading

  // Derived chart data
  const dailySleep = useMemo(() => aggregateSleepByDay(rawSleep ?? []), [rawSleep])

  const debtChartData = useMemo(() => {
    if (!debt?.dailyDebt) return []
    return [...debt.dailyDebt]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        shortDate: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      }))
  }, [debt])

  const stagesPieData = useMemo(() => {
    if (!quality) return []
    return [
      { name: "Deep", value: quality.avgDeepSleepPct },
      { name: "REM", value: quality.avgRemSleepPct },
      { name: "Light", value: quality.avgLightSleepPct },
      { name: "Awake", value: quality.avgAwakePct },
    ].filter((s) => s.value > 0)
  }, [quality])

  // Sorted daily data for table
  const sortedDaily = useMemo(() => [...dailySleep].sort((a, b) => b.date.localeCompare(a.date)), [dailySleep])
  const totalPages = Math.ceil(sortedDaily.length / PAGE_SIZE)
  const pagedDaily = sortedDaily.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in-down">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Sleep Analysis</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Deep-dive into sleep debt, quality scores, stages, circadian rhythm, and consistency patterns.
        </p>
      </div>

      {/* User select + Range filter */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <label htmlFor="sleep-user" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">User</label>
            <select id="sleep-user" className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/40 transition-all" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Period</label>
            <div className="flex gap-1">
              {RANGE_OPTIONS.map((r) => (
                <button key={r.label} type="button" onClick={() => { setRangeDays(r.days); setTablePage(0) }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    rangeDays === r.days
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <span className="text-6xl mb-4 animate-float">🌙</span>
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a user to view sleep analysis.</p>
        </div>
      )}

      {selectedUserId && isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      )}

      {selectedUserId && !isLoading && (
        <div className="space-y-6 stagger-grid">

          {/* Quality Score Rings + Circadian */}
          {quality && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Score rings */}
              <div className="lg:col-span-1 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card flex flex-col items-center gap-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Quality Overview</h3>
                <div className="flex flex-wrap justify-center gap-6">
                  <ScoreRing label="Sleep Score" value={Math.round(quality.avgSleepScore)} max={100} color="stroke-indigo-500" />
                  <ScoreRing label="Consistency" value={Math.round(quality.consistencyScore)} max={100} color="stroke-emerald-500" />
                  <ScoreRing label="Efficiency" value={Math.round(quality.avgEfficiency)} max={100} color="stroke-amber-500" />
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Trend:</span>
                  <span className={`text-xs font-semibold ${quality.trend === "improving" ? "text-emerald-600 dark:text-emerald-400" : quality.trend === "declining" ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-400"}`}>
                    {quality.trend === "improving" ? "📈 Improving" : quality.trend === "declining" ? "📉 Declining" : "➡️ Stable"}
                  </span>
                </div>
              </div>

              {/* Sleep stages pie + breakdown */}
              <div className="lg:col-span-1 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Average Sleep Stages</h3>
                {stagesPieData.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width={140} height={140}>
                      <PieChart>
                        <Pie data={stagesPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60}
                          paddingAngle={3} dataKey="value" stroke="none">
                          {stagesPieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 flex-1">
                      {[
                        { label: "Deep", pct: quality.avgDeepSleepPct, color: "bg-indigo-500", ideal: "15–25%" },
                        { label: "REM", pct: quality.avgRemSleepPct, color: "bg-purple-500", ideal: "20–25%" },
                        { label: "Light", pct: quality.avgLightSleepPct, color: "bg-sky-400", ideal: "45–55%" },
                        { label: "Awake", pct: quality.avgAwakePct, color: "bg-red-400", ideal: "< 10%" },
                      ].map((s) => (
                        <div key={s.label} className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                          <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{s.label}</span>
                          <span className="text-xs font-bold text-gray-900 dark:text-gray-50">{s.pct}%</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{s.ideal}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">No stage data available.</p>
                )}
              </div>

              {/* Circadian + Weekday/Weekend */}
              <div className="lg:col-span-1 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Circadian & Patterns</h3>
                <div className="space-y-3">
                  {circadian && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Chronotype</span>
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
                          {circadian.chronotype === "early_bird" ? "🐦 Early Bird" : circadian.chronotype === "night_owl" ? "🦉 Night Owl" : "⚖️ Intermediate"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Optimal Bedtime</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">{circadian.optimalWindow?.bedtime ?? "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Optimal Wake</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">{circadian.optimalWindow?.wakeTime ?? "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Avg Sleep Onset</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">{formatMinsToTime(circadian.avgSleepOnsetMinutes)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Social Jet Lag</span>
                        <span className={`text-sm font-semibold ${circadian.socialJetLagMinutes > 60 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {Math.round(circadian.socialJetLagMinutes)}m
                        </span>
                      </div>
                    </>
                  )}
                  <div className="border-t border-gray-200 dark:border-gray-800 pt-3 mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Weekday Avg</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-50">{quality ? formatHours(quality.weekdayVsWeekend.weekday) : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Weekend Avg</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-50">{quality ? formatHours(quality.weekdayVsWeekend.weekend) : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Avg Duration</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-50">{quality ? formatHours(quality.avgDurationHours) : "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Stats Row */}
          {debt && (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              <StatCard icon="🎯" label="Daily Target" value={formatHours(debt.idealSleepHours)} />
              <StatCard icon="😴" label="Avg Actual" value={formatHours(debt.avgSleepHours)}
                sub={debt.avgSleepHours >= debt.idealSleepHours ? "meeting target" : "below target"} />
              <StatCard icon="📊" label="Total Debt" value={formatHours(Math.abs(debt.totalDebtHours))}
                sub={debt.totalDebtHours > 0 ? "behind target" : "ahead of target"}
                accent={debt.totalDebtHours > 5 ? "text-red-600 dark:text-red-400" : debt.totalDebtHours > 2 ? "text-yellow-600 dark:text-yellow-400" : "text-emerald-600 dark:text-emerald-400"} />
              <StatCard icon="💡" label="Recommendation" value={debt.recommendation.length > 30 ? `${debt.recommendation.slice(0, 28)}…` : debt.recommendation}
                sub={debt.recommendation.length > 30 ? debt.recommendation : undefined} />
            </div>
          )}

          {/* Sleep Duration Trend Chart */}
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Sleep Duration Trend</h3>
            {dailySleep.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 py-8 text-center">No sleep data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailySleep} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="sleepDurGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#6b7280" strokeOpacity={0.15} />
                  <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" unit="h" />
                  <Tooltip content={<SleepTooltip />} />
                  <ReferenceLine y={8} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "8h target", position: "right", fontSize: 10, fill: "#10b981" }} />
                  <ReferenceLine y={7} stroke="#eab308" strokeDasharray="4 4" strokeOpacity={0.4} />
                  <Area type="monotone" dataKey="totalHours" name="Total Sleep" stroke="#6366f1" fill="url(#sleepDurGrad)"
                    strokeWidth={2.5} dot={{ r: 3, fill: "#6366f1" }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Sleep Stages Stacked Bar Chart */}
          {dailySleep.some((d) => d.deep > 0 || d.rem > 0 || d.light > 0) && (
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Sleep Stages Breakdown</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailySleep} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#6b7280" strokeOpacity={0.15} />
                  <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" unit="h" />
                  <Tooltip content={<SleepTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="deep" name="Deep" stackId="stages" fill={STAGE_COLORS.deep} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="rem" name="REM" stackId="stages" fill={STAGE_COLORS.rem} />
                  <Bar dataKey="light" name="Light" stackId="stages" fill={STAGE_COLORS.light} />
                  <Bar dataKey="awake" name="Awake" stackId="stages" fill={STAGE_COLORS.awake} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sleep Debt Accumulation Chart */}
          {debtChartData.length > 0 && (
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Daily Sleep Debt</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={debtChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#6b7280" strokeOpacity={0.15} />
                  <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" />
                  <Tooltip content={<DebtTooltip />} />
                  <ReferenceLine y={0} stroke="#9ca3af" />
                  <Bar dataKey="hoursSlept" name="Hours Slept" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="debt" name="Debt" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Recommendations */}
          {quality && quality.recommendations.length > 0 && (
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 backdrop-blur-xl p-6 shadow-card">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-3">💡 Personalized Recommendations</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {quality.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl bg-white/60 dark:bg-gray-900/40 p-3">
                    <span className="text-indigo-500 mt-0.5">•</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historical Data Table */}
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Sleep History ({sortedDaily.length} nights)
              </h3>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button type="button" disabled={tablePage === 0} onClick={() => setTablePage((p) => p - 1)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-all">
                    ← Prev
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{tablePage + 1} / {totalPages}</span>
                  <button type="button" disabled={tablePage >= totalPages - 1} onClick={() => setTablePage((p) => p + 1)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-all">
                    Next →
                  </button>
                </div>
              )}
            </div>

            {sortedDaily.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 py-8 text-center">No sleep data recorded for this period.</p>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      {["Date", "Total", "Deep", "REM", "Light", "Awake", "Efficiency"].map((h) => (
                        <th key={h} className="py-2.5 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDaily.map((d, i) => {
                      const totalColor = d.totalHours >= 8 ? "text-emerald-600 dark:text-emerald-400" : d.totalHours >= 7 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"
                      return (
                        <tr key={d.date} className={`border-b border-gray-100 dark:border-gray-800/50 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30 ${i % 2 === 1 ? "bg-gray-50/30 dark:bg-gray-800/10" : ""}`}>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                            {new Date(d.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                          </td>
                          <td className={`py-2.5 px-3 font-bold ${totalColor}`}>{formatHours(d.totalHours)}</td>
                          <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400">{d.deep > 0 ? formatHours(d.deep) : "—"}</td>
                          <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400">{d.rem > 0 ? formatHours(d.rem) : "—"}</td>
                          <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400">{d.light > 0 ? formatHours(d.light) : "—"}</td>
                          <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400">{d.awake > 0 ? formatHours(d.awake) : "—"}</td>
                          <td className="py-2.5 px-3">
                            {d.efficiency > 0 ? (
                              <span className={`font-semibold ${d.efficiency >= 90 ? "text-emerald-600 dark:text-emerald-400" : d.efficiency >= 80 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                                {d.efficiency}%
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
