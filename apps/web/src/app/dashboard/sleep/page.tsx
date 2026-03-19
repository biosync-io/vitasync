"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { sleepAnalysisApi, usersApi, type SleepDebtData, type SleepQualityData } from "../../../lib/api"

function ScoreRing({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="text-center">
      <div className="relative inline-flex h-20 w-20 items-center justify-center">
        <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" className={color} strokeWidth="3" strokeDasharray={`${pct} 100`} strokeLinecap="round" />
        </svg>
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  )
}

function formatHours(h: number) {
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return `${hrs}h ${mins}m`
}

export default function SleepPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [debtDays, setDebtDays] = useState(14)
  const [qualityDays, setQualityDays] = useState(30)

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: debt, isLoading: debtLoading } = useQuery({
    queryKey: ["sleep-debt", selectedUserId, debtDays],
    queryFn: () => sleepAnalysisApi.debt(selectedUserId, debtDays),
    enabled: !!selectedUserId,
  })

  const { data: quality, isLoading: qualityLoading } = useQuery({
    queryKey: ["sleep-quality", selectedUserId, qualityDays],
    queryFn: () => sleepAnalysisApi.quality(selectedUserId, qualityDays),
    enabled: !!selectedUserId,
  })

  const isLoading = debtLoading || qualityLoading

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 animate-fade-in-down">Sleep Analysis</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Deep-dive into sleep debt, quality scores, and consistency patterns.</p>
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="sleep-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="sleep-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view sleep analysis.</p>}

      {selectedUserId && isLoading && (
        <div className="p-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
      )}

      {/* Sleep Debt */}
      {selectedUserId && debt && (
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sleep Debt</h3>
            <select className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs" value={debtDays} onChange={(e) => setDebtDays(Number(e.target.value))}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-grid">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Debt</p>
              <p className={`text-2xl font-bold ${debt.totalDebtHours > 5 ? "text-red-600" : debt.totalDebtHours > 2 ? "text-yellow-600" : "text-emerald-600"}`}>
                {formatHours(Math.abs(debt.totalDebtHours))}
              </p>
              <p className="text-xs text-gray-400 mt-1">{debt.totalDebtHours > 0 ? "behind target" : "ahead of target"}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Daily Target</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatHours(debt.dailyTarget)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Avg Actual</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatHours(debt.avgActualHours)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Trend</p>
              <p className={`text-2xl font-bold ${debt.trend === "improving" ? "text-emerald-600" : debt.trend === "worsening" ? "text-red-600" : "text-gray-500"}`}>
                {debt.trend === "improving" ? "↑ Better" : debt.trend === "worsening" ? "↓ Worse" : "→ Stable"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sleep Quality */}
      {selectedUserId && quality && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sleep Quality</h3>
            <select className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs" value={qualityDays} onChange={(e) => setQualityDays(Number(e.target.value))}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>

          <div className="flex flex-wrap justify-center gap-8 mb-6">
            <ScoreRing label="Sleep Score" value={Math.round(quality.avgSleepScore)} max={100} color="stroke-indigo-500" />
            <ScoreRing label="Consistency" value={Math.round(quality.consistencyScore)} max={100} color="stroke-emerald-500" />
            <ScoreRing label="Efficiency" value={Math.round(quality.avgEfficiency)} max={100} color="stroke-amber-500" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Deep Sleep</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{quality.avgDeepSleepPercent}%</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">REM Sleep</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{quality.avgRemSleepPercent}%</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Light Sleep</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{quality.avgLightSleepPercent}%</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Weekday Avg</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatHours(quality.weekdayVsWeekend.weekday)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Weekend Avg</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatHours(quality.weekdayVsWeekend.weekend)}</p>
            </div>
          </div>

          {quality.recommendations.length > 0 && (
            <div className="mt-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 p-3">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Recommendations</p>
              <ul className="space-y-1">
                {quality.recommendations.map((r, i) => (
                  <li key={i} className="text-xs text-indigo-600 dark:text-indigo-400">• {r}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center mt-3">Trend: {quality.trend}</p>
        </div>
      )}
    </div>
  )
}
