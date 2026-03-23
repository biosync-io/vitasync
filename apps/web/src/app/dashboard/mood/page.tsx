"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type MoodLogData, type MoodStats, moodApi, usersApi } from "../../../lib/api"

const TICK_STYLE = { fill: "#9ca3af", fontSize: 11 }
const GRID_PROPS = { strokeDasharray: "3 3", stroke: "#6b7280", strokeOpacity: 0.18 }
const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px", color: "#f3f4f6" },
  itemStyle: { color: "#e5e7eb" },
  labelStyle: { color: "#9ca3af", marginBottom: "4px" },
}

const MOOD_EMOJI: Record<number, string> = { 1: "😢", 2: "😟", 3: "😐", 4: "🙂", 5: "😄" }

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

export default function MoodPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ mood: "3", energy: "3", stress: "3", notes: "", tags: "" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: logsResult, isLoading } = useQuery({
    queryKey: ["mood-logs", selectedUserId],
    queryFn: () => moodApi.list(selectedUserId, { limit: 50 }),
    enabled: !!selectedUserId,
  })
  const logs = logsResult?.data ?? []

  const chartData = useMemo(() => {
    if (!logs.length) return []
    return [...logs].reverse().map((l) => ({
      date: new Date(l.loggedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      mood: l.mood,
      energy: l.energy ?? null,
      stress: l.stress ?? null,
    }))
  }, [logs])

  const { data: stats } = useQuery({
    queryKey: ["mood-stats", selectedUserId],
    queryFn: () => moodApi.stats(selectedUserId),
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

  return (
    <div>
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

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="mood-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="mood-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view mood data.</p>}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
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

      {/* Stats cards */}
      {selectedUserId && stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
            <div className="text-3xl">{MOOD_EMOJI[Math.round(stats.avgScore)] ?? "😐"}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.avgScore.toFixed(1)}</div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg Mood</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <MoodBar label="Energy" value={stats.avgEnergy} max={5} />
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <MoodBar label="Stress" value={stats.avgStress} max={5} />
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Trend</p>
            <p className={`text-lg font-semibold ${stats.trend === "improving" ? "text-emerald-600" : stats.trend === "declining" ? "text-red-600" : "text-gray-600"}`}>
              {stats.trend === "improving" ? "📈 Improving" : stats.trend === "declining" ? "📉 Declining" : "➡️ Stable"}
            </p>
            {stats.topFactors.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-400">Top factor</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{stats.topFactors[0]}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mood trend chart */}
      {selectedUserId && chartData.length > 1 && (
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Mood Trend</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Mood, energy, and stress over time</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="date" tick={TICK_STYLE} />
              <YAxis domain={[0, 5]} tick={TICK_STYLE} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line type="monotone" dataKey="mood" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Mood" />
              <Line type="monotone" dataKey="energy" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Energy" />
              <Line type="monotone" dataKey="stress" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Stress" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Logs list */}
      {selectedUserId && isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>}
      {selectedUserId && !isLoading && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Date</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Mood</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Energy</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Stress</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Tags</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {logs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No mood entries yet.</td></tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{new Date(l.loggedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-lg">{MOOD_EMOJI[l.mood] ?? l.mood}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{l.energy ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{l.stress ?? "—"}</td>
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
      )}
    </div>
  )
}
