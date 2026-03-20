"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type WaterDailySummary, type WaterWeeklyStats, type WaterIntakeData, waterApi, usersApi } from "../../../lib/api"

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

function WeeklyChart({ days }: { days: Array<{ date: string; totalMl: number; goalMl: number }> }) {
  const maxMl = Math.max(...days.map((d) => Math.max(d.totalMl, d.goalMl)), 1)
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  return (
    <div className="flex items-end justify-between gap-2 h-32 px-2">
      {days.map((day) => {
        const pct = (day.totalMl / maxMl) * 100
        const goalPct = (day.goalMl / maxMl) * 100
        const metGoal = day.totalMl >= day.goalMl
        const dayOfWeek = new Date(day.date).getDay()
        return (
          <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${day.date}: ${day.totalMl}ml / ${day.goalMl}ml`}>
            {/* Goal line marker */}
            <div className="relative w-full flex-1">
              <div className="absolute bottom-0 w-full flex flex-col items-center">
                <div
                  className={`w-full rounded-t-lg transition-all duration-500 ${
                    metGoal
                      ? "bg-gradient-to-t from-emerald-500 to-emerald-400 shadow-md shadow-emerald-500/20"
                      : "bg-gradient-to-t from-blue-500 to-blue-400 shadow-md shadow-blue-500/20"
                  } group-hover:opacity-90`}
                  style={{ height: `${Math.max(4, pct)}%` }}
                />
              </div>
              {/* Goal marker */}
              <div className="absolute w-full border-t-2 border-dashed border-gray-300 dark:border-gray-600 opacity-50"
                style={{ bottom: `${goalPct}%` }} />
            </div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{dayNames[dayOfWeek]}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function WaterPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [customMl, setCustomMl] = useState("250")
  const [beverage, setBeverage] = useState("water")
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

  const { data: weeklyData } = useQuery({
    queryKey: ["water-weekly", selectedUserId],
    queryFn: () => waterApi.weekly(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: logsResult, isLoading } = useQuery({
    queryKey: ["water-logs", selectedUserId],
    queryFn: () => waterApi.list(selectedUserId, { limit: 30 }),
    enabled: !!selectedUserId,
  })
  const logs = logsResult?.data ?? []

  const addMut = useMutation({
    mutationFn: (amountMl: number) =>
      waterApi.create(selectedUserId, { amountMl, beverageType: beverage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["water-today", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["water-weekly", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["water-logs", selectedUserId] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (logId: string) => waterApi.delete(selectedUserId, logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["water-today", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["water-weekly", selectedUserId] })
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

      {/* Weekly stats */}
      {selectedUserId && weeklyData && (
        <div className="grid gap-4 sm:grid-cols-3 stagger-grid">
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card text-center">
            <span className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">{weeklyData.avgDailyMl}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">ml</span>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mt-1">Avg Daily (7d)</p>
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card text-center">
            <span className="text-3xl font-bold tracking-tight text-emerald-500">{weeklyData.goalMetDays}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">/7 days</span>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mt-1">Goals Met</p>
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">7-Day Trend</p>
            <WeeklyChart days={weeklyData.days} />
          </div>
        </div>
      )}

      {/* Recent logs */}
      {selectedUserId && !isLoading && logs.length > 0 && (
        <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Recent Logs</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {logs.map((log) => (
              <div key={log.id} className="group flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${BEVERAGE_COLORS[log.beverageType] ?? BEVERAGE_COLORS.other} flex items-center justify-center text-white text-sm shadow-md shrink-0`}>
                  {BEVERAGE_EMOJI[log.beverageType] ?? "🥤"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{log.amountMl}ml <span className="text-gray-400 font-normal">· {log.beverageType}</span></p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(log.loggedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                {log.note && <span className="text-xs text-gray-400 truncate max-w-[120px]">{log.note}</span>}
                <button type="button" onClick={() => deleteMut.mutate(log.id)}
                  className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all" title="Delete">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
