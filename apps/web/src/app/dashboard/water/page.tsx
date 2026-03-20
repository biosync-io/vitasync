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

const QUICK_AMOUNTS = [
  { label: "Small glass", ml: 200 },
  { label: "Glass", ml: 250 },
  { label: "Large glass", ml: 350 },
  { label: "Bottle", ml: 500 },
  { label: "Large bottle", ml: 750 },
]

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

  const progressColor = (pct: number) =>
    pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-yellow-500" : "bg-red-500"

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">💧 Water Intake</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Track your daily hydration and stay on top of your water goals.</p>
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="water-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="water-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to track water intake.</p>}

      {selectedUserId && todayData && (
        <>
          {/* Today's progress */}
          <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Today&apos;s Progress</h2>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${todayData.progressPct >= 100 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"}`}>
                {todayData.progressPct >= 100 ? "🎉 Goal Met!" : `${todayData.progressPct}%`}
              </span>
            </div>
            <div className="h-6 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className={`h-6 rounded-full ${progressColor(todayData.progressPct)} transition-all duration-500`} style={{ width: `${Math.min(100, todayData.progressPct)}%` }} />
            </div>
            <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mt-2">
              <span>{todayData.totalMl} ml consumed</span>
              <span>Goal: {todayData.goalMl} ml</span>
            </div>

            {/* Beverage breakdown */}
            {Object.keys(todayData.byBeverage).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {Object.entries(todayData.byBeverage).map(([type, ml]) => (
                  <div key={type} className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                    <span>{BEVERAGE_EMOJI[type] ?? "🥤"}</span>
                    <span>{type}: {ml}ml</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick add */}
          <div className="mb-6 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Quick Add</h3>
            <div className="flex items-center gap-3 mb-3">
              <select className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={beverage} onChange={(e) => setBeverage(e.target.value)}>
                {Object.entries(BEVERAGE_EMOJI).map(([type, emoji]) => (
                  <option key={type} value={type}>{emoji} {type}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((qa) => (
                <button key={qa.ml} type="button" onClick={() => addMut.mutate(qa.ml)} disabled={addMut.isPending} className="rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50">
                  {qa.label} ({qa.ml}ml)
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input type="number" min="50" max="5000" className="w-20 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-2 text-sm" value={customMl} onChange={(e) => setCustomMl(e.target.value)} />
                <button type="button" onClick={() => addMut.mutate(Number(customMl))} disabled={addMut.isPending} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  +ml
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Weekly stats */}
      {selectedUserId && weeklyData && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{weeklyData.avgDailyMl}ml</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg Daily (7d)</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
            <p className="text-2xl font-bold text-emerald-600">{weeklyData.goalMetDays}/7</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Goals Met</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">7-Day Trend</p>
            <div className="flex items-end gap-1 h-12">
              {weeklyData.days.map((day) => {
                const pct = day.goalMl > 0 ? Math.min(100, (day.totalMl / day.goalMl) * 100) : 0
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${day.date}: ${day.totalMl}ml`}>
                    <div className={`w-full rounded-sm ${progressColor(pct)}`} style={{ height: `${Math.max(4, pct * 0.48)}px` }} />
                    <span className="text-[9px] text-gray-400">{day.date.slice(8)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Recent logs */}
      {selectedUserId && !isLoading && logs.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Time</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Type</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Amount</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Note</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{new Date(log.loggedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-3">{BEVERAGE_EMOJI[log.beverageType] ?? "🥤"} {log.beverageType}</td>
                  <td className="px-4 py-3 font-medium text-blue-600 dark:text-blue-400">{log.amountMl}ml</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-xs truncate">{log.note ?? ""}</td>
                  <td className="px-4 py-3"><button type="button" onClick={() => deleteMut.mutate(log.id)} className="text-gray-400 hover:text-red-500 text-xs">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
