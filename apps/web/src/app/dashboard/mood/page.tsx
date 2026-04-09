"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type MoodLogData, type MoodStats, moodApi, usersApi } from "../../../lib/api"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts"

// ── Constants ──────────────────────────────────────────────────────────────────

const MOOD_EMOJI: Record<number, string> = { 1: "😢", 2: "😟", 3: "😐", 4: "🙂", 5: "😄" }

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
] as const

const MOOD_LEVELS = [1, 2, 3, 4, 5] as const

const MOOD_LEVEL_LABELS: Record<number, string> = {
  1: "Very Low", 2: "Low", 3: "Neutral", 4: "Good", 5: "Great",
}

const CHART_COLORS = { mood: "#6366f1", energy: "#f59e0b", stress: "#ef4444" }

// ── Helpers ────────────────────────────────────────────────────────────────────

function isoDate(daysAgo: number) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function formatWeekdayDate(iso: string) {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" })
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return `${weekday}, ${date}`
}

function trendIndicator(current: number, target: number): { icon: string; label: string; color: string } {
  const diff = current - target
  if (diff > 0.3) return { icon: "↑", label: "Above target", color: "text-emerald-600 dark:text-emerald-400" }
  if (diff < -0.3) return { icon: "↓", label: "Below target", color: "text-red-600 dark:text-red-400" }
  return { icon: "→", label: "On target", color: "text-gray-500 dark:text-gray-400" }
}

function stressTrendIndicator(current: number, target: number): { icon: string; label: string; color: string } {
  const diff = current - target
  // For stress, lower is better
  if (diff > 0.3) return { icon: "↑", label: "Above target", color: "text-red-600 dark:text-red-400" }
  if (diff < -0.3) return { icon: "↓", label: "Below target", color: "text-emerald-600 dark:text-emerald-400" }
  return { icon: "→", label: "On target", color: "text-gray-500 dark:text-gray-400" }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MoodBar({ label, value, max }: { label: string; value: number | null; max: number }) {
  const v = value ?? 0
  const pct = max > 0 ? Math.round((v / max) * 100) : 0
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span>{label}</span>
        <span>{v.toFixed(1)}/{max}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
        </p>
      ))}
    </div>
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function MoodPage() {
  const { selectedUserId, setSelectedUserId, isAdmin } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [rangeDays, setRangeDays] = useState(30)
  const [form, setForm] = useState({ mood: "3", energy: "3", stress: "3", notes: "", tags: "" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
    enabled: isAdmin,
  })
  const users = usersResult?.data ?? []

  const fromDate = isoDate(rangeDays)
  const toDate = isoDate(0)

  const { data: logsResult, isLoading } = useQuery({
    queryKey: ["mood-logs", selectedUserId, rangeDays],
    queryFn: () => moodApi.list(selectedUserId, { from: fromDate, to: toDate, limit: 500 }),
    enabled: !!selectedUserId,
  })
  const logs = logsResult?.data ?? []

  const { data: stats } = useQuery({
    queryKey: ["mood-stats", selectedUserId, rangeDays],
    queryFn: () => moodApi.stats(selectedUserId, rangeDays),
    enabled: !!selectedUserId,
  })

  const createMut = useMutation({
    mutationFn: () =>
      moodApi.create(selectedUserId, {
        mood: "neutral",
        score: Number(form.mood),
        energy: Number(form.energy),
        stress: Number(form.stress),
        ...(form.notes ? { notes: form.notes } : {}),
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()) : [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mood-logs", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["mood-stats", selectedUserId] })
      setShowCreate(false)
      setForm({ mood: "3", energy: "3", stress: "3", notes: "", tags: "" })
    },
  })

  // Trend chart data: sorted chronologically
  const trendData = useMemo(() => {
    if (!logs.length) return []
    const sorted = [...logs].sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime())
    return sorted.map((l) => ({
      date: new Date(l.loggedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      mood: l.mood,
      energy: l.energy ?? undefined,
      stress: l.stress ?? undefined,
    }))
  }, [logs])

  // Distribution chart data: count occurrences of each mood level
  const distributionData = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const l of logs) {
      if (l.mood >= 1 && l.mood <= 5) counts[l.mood] = (counts[l.mood] ?? 0) + 1
    }
    return MOOD_LEVELS.map((level) => ({
      level: `${MOOD_EMOJI[level]} ${level}`,
      count: counts[level],
      label: MOOD_LEVEL_LABELS[level],
    }))
  }, [logs])

  const moodTrend = stats ? trendIndicator(stats.avgScore, 3.5) : null
  const energyTrend = stats ? trendIndicator(stats.avgEnergy, 3.5) : null
  const stressTrend = stats ? stressTrendIndicator(stats.avgStress, 2.5) : null

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mood Tracking</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Track daily mood, energy, and stress levels to spot patterns.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showCreate ? "Cancel" : "Log Mood"}
          </button>
        )}
      </div>

      {/* User select + date range filter */}
      <div className="mb-6 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          {isAdmin && (
            <div className="flex-1">
              <label htmlFor="mood-user" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">User</label>
              <select id="mood-user" className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/40 transition-all" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                <option value="">Select a user…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Period</label>
            <div className="flex gap-1">
              {RANGE_OPTIONS.map((r) => (
                <button key={r.label} type="button" onClick={() => setRangeDays(r.days)}
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

      {!selectedUserId && isAdmin && (
        <div className="flex flex-col items-center justify-center py-24">
          <span className="text-6xl mb-4">😶</span>
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a user to view mood data.</p>
        </div>
      )}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="mb-6 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-card">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Log Mood Entry</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Mood (1-5)</label>
              <input type="range" min="1" max="5" className="w-full" value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })} />
              <div className="text-center text-lg">{MOOD_EMOJI[Number(form.mood)]}</div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Energy (1-5)</label>
              <input type="range" min="1" max="5" className="w-full" value={form.energy} onChange={(e) => setForm({ ...form, energy: e.target.value })} />
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">⚡ {form.energy}</div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Stress (1-5)</label>
              <input type="range" min="1" max="5" className="w-full" value={form.stress} onChange={(e) => setForm({ ...form, stress: e.target.value })} />
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">😰 {form.stress}</div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Tags (comma-sep)</label>
              <input placeholder="exercise, meditation" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Notes</label>
              <input placeholder="How are you feeling?" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {createMut.isPending ? "Saving…" : "Save Entry"}
            </button>
          </div>
        </div>
      )}

      {selectedUserId && isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      )}

      {selectedUserId && !isLoading && (
        <>
          {/* Enhanced stats row */}
          {stats && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Avg Mood */}
              <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 text-center">
                <div className="text-3xl mb-1">{MOOD_EMOJI[Math.round(stats.avgScore)] ?? "😐"}</div>
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.avgScore.toFixed(1)}</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Avg Mood</p>
                {moodTrend && (
                  <p className={`text-xs font-medium mt-1 ${moodTrend.color}`}>
                    {moodTrend.icon} {moodTrend.label}
                  </p>
                )}
              </div>
              {/* Avg Energy */}
              <div className="rounded-2xl border border-amber-200/60 dark:border-amber-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 text-center">
                <div className="text-3xl mb-1">⚡</div>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.avgEnergy.toFixed(1)}</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Avg Energy</p>
                {energyTrend && (
                  <p className={`text-xs font-medium mt-1 ${energyTrend.color}`}>
                    {energyTrend.icon} {energyTrend.label}
                  </p>
                )}
              </div>
              {/* Avg Stress */}
              <div className="rounded-2xl border border-red-200/60 dark:border-red-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 text-center">
                <div className="text-3xl mb-1">😰</div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.avgStress.toFixed(1)}</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Avg Stress</p>
                {stressTrend && (
                  <p className={`text-xs font-medium mt-1 ${stressTrend.color}`}>
                    {stressTrend.icon} {stressTrend.label}
                  </p>
                )}
              </div>
              {/* Overall Trend */}
              <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Trend</p>
                <p className={`text-lg font-semibold ${stats.trend === "improving" ? "text-emerald-600 dark:text-emerald-400" : stats.trend === "declining" ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-400"}`}>
                  {stats.trend === "improving" ? "📈 Improving" : stats.trend === "declining" ? "📉 Declining" : "➡️ Stable"}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{stats.totalEntries} entries</p>
                {stats.topFactors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 dark:text-gray-500">Top factor</p>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{stats.topFactors[0]}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Charts row */}
          {logs.length > 0 && (
            <div className="mb-6 grid gap-4 lg:grid-cols-3">
              {/* Mood trend chart */}
              <div className="lg:col-span-2 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Mood · Energy · Stress Over Time</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" className="text-gray-400 dark:text-gray-500" />
                    <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} stroke="currentColor" className="text-gray-400 dark:text-gray-500" />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={3.5} stroke="#6366f1" strokeDasharray="6 4" strokeOpacity={0.4} label={{ value: "Target", position: "right", fontSize: 10, fill: "#6366f1" }} />
                    <ReferenceLine y={2.5} stroke="#ef4444" strokeDasharray="6 4" strokeOpacity={0.3} label={{ value: "Stress target", position: "right", fontSize: 10, fill: "#ef4444" }} />
                    <Line type="monotone" dataKey="mood" name="Mood" stroke={CHART_COLORS.mood} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.mood }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="energy" name="Energy" stroke={CHART_COLORS.energy} strokeWidth={2} dot={{ r: 2.5, fill: CHART_COLORS.energy }} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="stress" name="Stress" stroke={CHART_COLORS.stress} strokeWidth={2} dot={{ r: 2.5, fill: CHART_COLORS.stress }} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Distribution chart */}
              <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Mood Distribution</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={distributionData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                    <XAxis dataKey="level" tick={{ fontSize: 11 }} stroke="currentColor" className="text-gray-400 dark:text-gray-500" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-gray-400 dark:text-gray-500" />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Entries" fill={CHART_COLORS.mood} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Improved logs table */}
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Date</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Mood</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Energy</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Stress</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Tags</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Notes</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No mood entries yet.</td></tr>
                )}
                {logs.map((l, i) => (
                  <tr key={l.id} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10 transition-colors ${i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/20" : ""}`}>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {formatWeekdayDate(l.loggedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-lg">{MOOD_EMOJI[l.mood] ?? l.mood}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{l.mood}/5</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {l.energy != null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-gray-200 dark:bg-gray-700">
                            <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${(l.energy / 5) * 100}%` }} />
                          </div>
                          <span className="text-xs text-gray-600 dark:text-gray-400">{l.energy}</span>
                        </div>
                      ) : <span className="text-gray-400 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {l.stress != null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-gray-200 dark:bg-gray-700">
                            <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${(l.stress / 5) * 100}%` }} />
                          </div>
                          <span className="text-xs text-gray-600 dark:text-gray-400">{l.stress}</span>
                        </div>
                      ) : <span className="text-gray-400 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {l.tags?.map((tag) => (
                          <span key={tag} className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-400">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-xs truncate">{l.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
