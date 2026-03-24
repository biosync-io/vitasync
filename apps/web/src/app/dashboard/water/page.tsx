"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type WaterDailySummary, type WaterIntakeData, waterApi, usersApi } from "../../../lib/api"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell } from "recharts"

const BEVERAGE_EMOJI: Record<string, string> = {
  water: "💧",
  tea: "🍵",
  coffee: "☕",
  juice: "🧃",
  other: "🥤",
}

const BEVERAGE_COLORS: Record<string, string> = {
  water: "from-cyan-400 to-blue-500",
  tea: "from-emerald-400 to-teal-500",
  coffee: "from-amber-600 to-orange-700",
  juice: "from-orange-400 to-yellow-500",
  other: "from-purple-400 to-pink-500",
}

const QUICK_AMOUNTS = [
  { label: "Small glass", ml: 200, icon: "🥛" },
  { label: "Glass", ml: 250, icon: "🥤" },
  { label: "Large glass", ml: 350, icon: "🍶" },
  { label: "Bottle", ml: 500, icon: "🧴" },
  { label: "Large bottle", ml: 750, icon: "💧" },
]

const BEVERAGE_HEX: Record<string, string> = {
  water: "#06b6d4",
  tea: "#10b981",
  coffee: "#d97706",
  juice: "#f97316",
  other: "#a855f7",
}

const DATE_RANGES = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const

const DAILY_TARGET_ML = 2500
const PAGE_SIZE = 10

function formatDateRange(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days + 1)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

function aggregateDailyTotals(logs: WaterIntakeData[], rangeDays: number): Array<{ date: string; totalMl: number; label: string }> {
  const map = new Map<string, number>()
  const today = new Date()
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    map.set(d.toISOString().slice(0, 10), 0)
  }
  for (const log of logs) {
    const date = log.loggedAt.slice(0, 10)
    if (map.has(date)) map.set(date, (map.get(date) ?? 0) + log.amountMl)
  }
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalMl]) => {
      const d = new Date(date + "T00:00:00")
      const label = rangeDays <= 14 ? (dayNames[d.getDay()] ?? "") : `${monthNames[d.getMonth()] ?? ""} ${d.getDate()}`
      return { date, totalMl, label }
    })
}

function aggregateBeverageBreakdown(logs: WaterIntakeData[]): Array<{ name: string; value: number }> {
  const map = new Map<string, number>()
  for (const log of logs) {
    const type = log.beverageType || "other"
    map.set(type, (map.get(type) ?? 0) + log.amountMl)
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

function computeStats(dailyTotals: Array<{ date: string; totalMl: number }>, targetMl: number) {
  if (dailyTotals.length === 0) return { avgDaily: 0, bestDay: { date: "", ml: 0 }, daysMetTarget: 0, streak: 0 }
  const daysWithIntake = dailyTotals.filter(d => d.totalMl > 0)
  const avgDaily = daysWithIntake.length > 0 ? Math.round(daysWithIntake.reduce((s, d) => s + d.totalMl, 0) / daysWithIntake.length) : 0
  const best = dailyTotals.reduce((b, d) => d.totalMl > b.totalMl ? d : b, dailyTotals[0]!)
  const daysMetTarget = dailyTotals.filter(d => d.totalMl >= targetMl).length
  let streak = 0
  for (let i = dailyTotals.length - 1; i >= 0; i--) {
    if (dailyTotals[i]!.totalMl >= targetMl) streak++
    else break
  }
  return { avgDaily, bestDay: { date: best.date, ml: best.totalMl }, daysMetTarget, streak }
}

function WaterGauge({ pct, totalMl, goalMl }: { pct: number; totalMl: number; goalMl: number }) {
  const r = 68
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(pct, 100) / 100) * c
  const color = pct >= 100 ? "#10b981" : pct >= 60 ? "#3b82f6" : pct >= 30 ? "#eab308" : "#ef4444"
  const bgWave = pct >= 100 ? "from-emerald-500/10 to-teal-500/10" : "from-blue-500/10 to-cyan-500/10"

  return (
    <div className="relative flex items-center justify-center">
      <div className={`absolute inset-0 rounded-full bg-gradient-to-t ${bgWave} animate-pulse-slow`} />
      <svg width="160" height="160" className="drop-shadow-lg">
        <defs>
          <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pct >= 100 ? "#10b981" : "#3b82f6"} />
            <stop offset="100%" stopColor={pct >= 100 ? "#059669" : "#1d4ed8"} />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" className="text-gray-100 dark:text-gray-800" strokeWidth="8" />
        <circle cx="80" cy="80" r={r} fill="none" stroke="url(#waterGrad)" strokeWidth="8"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out -rotate-90 origin-center" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight" style={{ color }}>{pct}%</span>
        <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">{totalMl}/{goalMl}ml</span>
        {pct >= 100 && <span className="text-xs mt-0.5 text-emerald-500 font-semibold">🎉 Goal Met!</span>}
      </div>
    </div>
  )
}

export default function WaterPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [customMl, setCustomMl] = useState("250")
  const [beverage, setBeverage] = useState("water")
  const [dateRange, setDateRange] = useState(30)
  const [historyPage, setHistoryPage] = useState(0)
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: todayData } = useQuery({
    queryKey: ["water-today", selectedUserId],
    queryFn: () => waterApi.today(selectedUserId),
    enabled: !!selectedUserId,
    refetchInterval: 10000,
  })

  const rangeParams = useMemo(() => formatDateRange(dateRange), [dateRange])

  const { data: logsResult, isLoading } = useQuery({
    queryKey: ["water-logs", selectedUserId, dateRange],
    queryFn: () => waterApi.list(selectedUserId, { from: rangeParams.from, to: rangeParams.to, limit: 5000 }),
    enabled: !!selectedUserId,
  })
  const logs = logsResult?.data ?? []

  const goalMl = todayData?.goalMl ?? DAILY_TARGET_ML
  const dailyTotals = useMemo(() => aggregateDailyTotals(logs, dateRange), [logs, dateRange])
  const beverageBreakdown = useMemo(() => aggregateBeverageBreakdown(logs), [logs])
  const stats = useMemo(() => computeStats(dailyTotals, goalMl), [dailyTotals, goalMl])
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE))
  const paginatedLogs = logs.slice(historyPage * PAGE_SIZE, (historyPage + 1) * PAGE_SIZE)

  const addMut = useMutation({
    mutationFn: (amountMl: number) =>
      waterApi.create(selectedUserId, { amountMl, beverageType: beverage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["water-today", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["water-logs", selectedUserId] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (logId: string) => waterApi.delete(selectedUserId, logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["water-today", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["water-logs", selectedUserId] })
    },
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in-down">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Water Intake</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Stay hydrated, stay sharp. Track every sip toward your daily goal.</p>
      </div>

      {/* User select */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
        <label htmlFor="water-user" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">User</label>
        <select id="water-user" className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/40 transition-all" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <span className="text-6xl mb-4 animate-float">💧</span>
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a user to track water intake.</p>
        </div>
      )}

      {selectedUserId && todayData && (
        <>
          {/* Today's progress + Quick add — side by side on desktop */}
          <div className="grid gap-6 lg:grid-cols-2 stagger-grid">
            {/* Today's gauge */}
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Today&apos;s Hydration</h2>
              <div className="flex items-center justify-center mb-4">
                <WaterGauge pct={todayData.progressPct} totalMl={todayData.totalMl} goalMl={todayData.goalMl} />
              </div>
              {/* Beverage breakdown */}
              {Object.keys(todayData.byBeverage).length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {Object.entries(todayData.byBeverage).map(([type, ml]) => (
                    <div key={type} className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${BEVERAGE_COLORS[type] ?? BEVERAGE_COLORS.other} bg-opacity-10 px-3 py-1 text-xs font-medium`}>
                      <span>{BEVERAGE_EMOJI[type] ?? "🥤"}</span>
                      <span className="text-white">{ml}ml</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick add */}
            <div className="rounded-2xl border border-blue-200/60 dark:border-blue-800/40 bg-gradient-to-br from-blue-50/80 to-cyan-50/50 dark:from-blue-950/40 dark:to-cyan-950/20 backdrop-blur-xl p-6 shadow-lg shadow-blue-500/5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Quick Add</h3>

              {/* Beverage selector */}
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(BEVERAGE_EMOJI).map(([type, emoji]) => (
                  <button key={type} type="button" onClick={() => setBeverage(type)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      beverage === type
                        ? `bg-gradient-to-r ${BEVERAGE_COLORS[type]} text-white shadow-md`
                        : "bg-white/60 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-300"
                    }`}>
                    {emoji} {type}
                  </button>
                ))}
              </div>

              {/* Amount buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                {QUICK_AMOUNTS.map((qa) => (
                  <button key={qa.ml} type="button" onClick={() => addMut.mutate(qa.ml)} disabled={addMut.isPending}
                    className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 px-3 py-3 text-center hover:border-blue-400 hover:shadow-md hover:shadow-blue-500/10 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50">
                    <span className="text-lg block mb-0.5 group-hover:scale-110 transition-transform">{qa.icon}</span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{qa.ml}ml</span>
                    <span className="text-[10px] text-gray-400 block">{qa.label}</span>
                  </button>
                ))}
                {/* Custom */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 p-3 flex flex-col items-center justify-center gap-1.5">
                  <input type="number" min="50" max="5000" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-2 py-1.5 text-sm text-center font-mono" value={customMl} onChange={(e) => setCustomMl(e.target.value)} />
                  <button type="button" onClick={() => addMut.mutate(Number(customMl))} disabled={addMut.isPending}
                    className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:from-blue-600 hover:to-cyan-600 shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all">
                    + Custom
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Date range filter + Analytics */}
      {selectedUserId && (
        <>
          {/* Date range pills */}
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Range</span>
            <div className="flex gap-1.5">
              {DATE_RANGES.map((r) => (
                <button key={r.days} type="button" onClick={() => { setDateRange(r.days); setHistoryPage(0) }}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    dateRange === r.days
                      ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-blue-500/20"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary stat cards */}
          {!isLoading && logs.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-grid">
                <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card text-center">
                  <span className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">{stats.avgDaily}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">ml</span>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mt-1">Avg Daily Intake</p>
                </div>
                <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card text-center">
                  <span className="text-3xl font-bold tracking-tight text-amber-500">{stats.bestDay.ml}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">ml</span>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mt-1">
                    Best Day{stats.bestDay.date && ` · ${new Date(stats.bestDay.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card text-center">
                  <span className="text-3xl font-bold tracking-tight text-emerald-500">{stats.daysMetTarget}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">/{dateRange} days</span>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mt-1">Target Met ({goalMl}ml)</p>
                </div>
                <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card text-center">
                  <span className="text-3xl font-bold tracking-tight text-purple-500">{stats.streak}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400"> days</span>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mt-1">Current Streak 🔥</p>
                </div>
              </div>

              {/* Charts */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Hydration trend */}
                <div className="lg:col-span-2 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Hydration Trend</h2>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={dailyTotals} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hydrationGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={dateRange <= 14 ? 0 : "preserveStartEnd"} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ borderRadius: "0.75rem", border: "1px solid #e5e7eb", fontSize: "0.875rem" }}
                        formatter={(value: number) => [`${value}ml`, "Intake"]}
                        labelFormatter={(label: string) => label}
                      />
                      <ReferenceLine y={goalMl} stroke="#10b981" strokeDasharray="6 3" label={{ value: `${goalMl}ml target`, position: "insideTopRight", fontSize: 11, fill: "#10b981" }} />
                      <Area type="monotone" dataKey="totalMl" stroke="#3b82f6" strokeWidth={2.5} fill="url(#hydrationGradient)" dot={dateRange <= 14} activeDot={{ r: 5, strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Beverage breakdown */}
                <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Beverage Breakdown</h2>
                  {beverageBreakdown.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={beverageBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} strokeWidth={0}>
                            {beverageBreakdown.map((entry) => (
                              <Cell key={entry.name} fill={BEVERAGE_HEX[entry.name] ?? BEVERAGE_HEX.other} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: "0.75rem", border: "1px solid #e5e7eb", fontSize: "0.875rem" }} formatter={(value: number) => [`${value}ml`]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {beverageBreakdown.map((entry) => (
                          <div key={entry.name} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BEVERAGE_HEX[entry.name] ?? BEVERAGE_HEX.other }} />
                            {BEVERAGE_EMOJI[entry.name] ?? "🥤"} {entry.name} · {entry.value}ml
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-8">No data</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Enhanced history table */}
          {!isLoading && logs.length > 0 && (
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">History</h2>
                <span className="text-xs text-gray-400">{logs.length} entries</span>
              </div>
              <div>
                {paginatedLogs.map((log, idx) => (
                  <div key={log.id} className={`group flex items-center gap-4 px-5 py-3.5 transition-colors ${
                    idx % 2 === 0 ? "bg-transparent" : "bg-gray-50/40 dark:bg-gray-800/20"
                  } hover:bg-gray-50/80 dark:hover:bg-gray-800/40`}>
                    <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${BEVERAGE_COLORS[log.beverageType] ?? BEVERAGE_COLORS.other} flex items-center justify-center text-white text-sm shadow-md shrink-0`}>
                      {BEVERAGE_EMOJI[log.beverageType] ?? "🥤"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {log.amountMl}ml
                        <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gradient-to-r ${BEVERAGE_COLORS[log.beverageType] ?? BEVERAGE_COLORS.other} text-white`}>
                          {log.beverageType}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(log.loggedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        {" · "}
                        {new Date(log.loggedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {log.note && <span className="text-xs text-gray-400 truncate max-w-[120px]">{log.note}</span>}
                    <button type="button" onClick={() => deleteMut.mutate(log.id)}
                      className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all" title="Delete">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <button type="button" onClick={() => setHistoryPage((p) => Math.max(0, p - 1))} disabled={historyPage === 0}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-all">
                    ← Prev
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Page {historyPage + 1} of {totalPages}</span>
                  <button type="button" onClick={() => setHistoryPage((p) => Math.min(totalPages - 1, p + 1))} disabled={historyPage >= totalPages - 1}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-all">
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
