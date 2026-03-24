"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { symptomsApi, usersApi, type SymptomLogData, type SymptomPatterns } from "../../../lib/api"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const SEVERITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Mild", color: "bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300" },
  2: { label: "Moderate", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/60 dark:text-yellow-300" },
  3: { label: "Severe", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300" },
  4: { label: "Very Severe", color: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300" },
  5: { label: "Extreme", color: "bg-red-200 text-red-800 dark:bg-red-800/80 dark:text-red-200" },
}

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#818cf8", "#4f46e5", "#7c3aed"]

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function dateNDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function SymptomsPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [rangeDays, setRangeDays] = useState<number>(30)
  const [form, setForm] = useState({ symptom: "", severity: "2", bodyLocation: "", triggers: "", notes: "" })
  const queryClient = useQueryClient()

  const fromDate = dateNDaysAgo(rangeDays)
  const toDate = new Date().toISOString().slice(0, 10)

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: logsResult, isLoading } = useQuery({
    queryKey: ["symptoms", selectedUserId, fromDate, toDate],
    queryFn: () => symptomsApi.list(selectedUserId, { from: fromDate, to: toDate, limit: 200 }),
    enabled: !!selectedUserId,
  })
  const logs = logsResult?.data ?? []

  const { data: topResult } = useQuery({
    queryKey: ["symptoms-top", selectedUserId],
    queryFn: () => symptomsApi.top(selectedUserId),
    enabled: !!selectedUserId,
  })
  const topSymptoms = topResult?.data ?? []

  const { data: patterns } = useQuery({
    queryKey: ["symptoms-patterns", selectedUserId],
    queryFn: () => symptomsApi.patterns(selectedUserId),
    enabled: !!selectedUserId,
  })

  // --- Derived analytics ---
  const stats = useMemo(() => {
    if (!logs.length) return null
    const totalEntries = logs.length
    const avgSeverity = logs.reduce((s, l) => s + l.severity, 0) / totalEntries

    const symptomCounts: Record<string, number> = {}
    const triggerCounts: Record<string, number> = {}
    for (const l of logs) {
      symptomCounts[l.symptom] = (symptomCounts[l.symptom] ?? 0) + 1
      if (l.triggers) {
        for (const t of l.triggers) {
          triggerCounts[t] = (triggerCounts[t] ?? 0) + 1
        }
      }
    }
    const mostCommonSymptom = Object.entries(symptomCounts).sort((a, b) => b[1] - a[1])[0]
    const mostCommonTrigger = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1])[0]

    return { totalEntries, avgSeverity, mostCommonSymptom, mostCommonTrigger }
  }, [logs])

  const frequencyChartData = useMemo(() => {
    if (!logs.length) return []
    const counts: Record<string, number> = {}
    for (const l of logs) counts[l.symptom] = (counts[l.symptom] ?? 0) + 1
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([symptom, count]) => ({ symptom, count }))
  }, [logs])

  const severityTrendData = useMemo(() => {
    if (!logs.length) return []
    const byDate: Record<string, { total: number; count: number }> = {}
    for (const l of logs) {
      const d = l.startedAt.slice(0, 10)
      if (!byDate[d]) byDate[d] = { total: 0, count: 0 }
      byDate[d].total += l.severity
      byDate[d].count += 1
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: formatShortDate(date), avg: Math.round((v.total / v.count) * 10) / 10 }))
  }, [logs])

  const locationPieData = useMemo(() => {
    if (!logs.length) return []
    const counts: Record<string, number> = {}
    for (const l of logs) {
      const loc = l.bodyLocation || "Unspecified"
      counts[loc] = (counts[loc] ?? 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([name, value]) => ({ name, value }))
  }, [logs])

  const createMut = useMutation({
    mutationFn: () =>
      symptomsApi.create(selectedUserId, {
        symptom: form.symptom,
        severity: Number(form.severity),
        bodyLocation: form.bodyLocation || undefined,
        triggers: form.triggers ? form.triggers.split(",").map((t) => t.trim()) : [],
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["symptoms", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["symptoms-top", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["symptoms-patterns", selectedUserId] })
      setShowCreate(false)
      setForm({ symptom: "", severity: "2", bodyLocation: "", triggers: "", notes: "" })
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Symptom Tracking</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Log symptoms, identify patterns, and track triggers over time.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showCreate ? "Cancel" : "Log Symptom"}
          </button>
        )}
      </div>

      {/* User select + date range filter */}
      <div className="mb-6 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label htmlFor="sym-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
            <select id="sym-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
            </select>
          </div>
          {selectedUserId && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Period</label>
              <div className="flex gap-1">
                {RANGE_OPTIONS.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => setRangeDays(r.days)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      rangeDays === r.days
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view symptom data.</p>}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="mb-6 rounded-2xl border border-indigo-200/60 dark:border-indigo-800/60 bg-indigo-50/80 dark:bg-indigo-950/30 backdrop-blur-xl p-5 shadow-card">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Log a Symptom</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Symptom *</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.symptom} onChange={(e) => setForm({ ...form, symptom: e.target.value })} placeholder="e.g. Headache" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Severity (1-5)</label>
              <input type="range" min="1" max="5" className="w-full" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} />
              <div className="text-center text-xs mt-1">{SEVERITY_LABELS[Number(form.severity)]?.label ?? form.severity}</div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Body Location</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.bodyLocation} onChange={(e) => setForm({ ...form, bodyLocation: e.target.value })} placeholder="e.g. Head, Neck" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Triggers (comma-sep)</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.triggers} onChange={(e) => setForm({ ...form, triggers: e.target.value })} placeholder="e.g. stress, poor sleep, dehydration" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Notes</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes…" />
            </div>
          </div>
          <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.symptom} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {createMut.isPending ? "Saving…" : "Save Symptom"}
          </button>
        </div>
      )}

      {/* Summary stat cards */}
      {selectedUserId && stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Entries</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.totalEntries}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">last {rangeDays}d</p>
          </div>
          <div className="rounded-2xl border border-amber-200/60 dark:border-amber-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg Severity</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.avgSeverity.toFixed(1)}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{SEVERITY_LABELS[Math.round(stats.avgSeverity)]?.label ?? "—"}</p>
          </div>
          <div className="rounded-2xl border border-violet-200/60 dark:border-violet-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Most Common</p>
            <p className="text-lg font-bold text-violet-600 dark:text-violet-400 truncate">{stats.mostCommonSymptom?.[0] ?? "—"}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{stats.mostCommonSymptom ? `${stats.mostCommonSymptom[1]}×` : ""}</p>
          </div>
          <div className="rounded-2xl border border-rose-200/60 dark:border-rose-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Top Trigger</p>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400 truncate">{stats.mostCommonTrigger?.[0] ?? "—"}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{stats.mostCommonTrigger ? `${stats.mostCommonTrigger[1]}×` : ""}</p>
          </div>
        </div>
      )}

      {/* Patterns overview (kept from original) */}
      {selectedUserId && patterns && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Severity Trend</p>
            <p className={`text-2xl font-bold ${patterns.severityTrend === "improving" ? "text-emerald-600 dark:text-emerald-400" : patterns.severityTrend === "worsening" ? "text-red-600 dark:text-red-400" : "text-gray-500"}`}>
              {patterns.severityTrend === "improving" ? "↓ Better" : patterns.severityTrend === "worsening" ? "↑ Worse" : "→ Stable"}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Stressors</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{patterns.frequentTriggers.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Top Triggers</p>
            {patterns.frequentTriggers.slice(0, 3).map((t) => (
              <div key={t.trigger} className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                <span>{t.trigger}</span><span className="font-medium">{t.count}</span>
              </div>
            ))}
            {patterns.frequentTriggers.length === 0 && <p className="text-xs text-gray-400">None recorded</p>}
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Top Locations</p>
            {patterns.frequentLocations.slice(0, 3).map((l) => (
              <div key={l.location} className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                <span>{l.location}</span><span className="font-medium">{l.count}</span>
              </div>
            ))}
            {patterns.frequentLocations.length === 0 && <p className="text-xs text-gray-400">None recorded</p>}
          </div>
        </div>
      )}

      {/* Charts row: Symptom frequency bar + Severity trend line */}
      {selectedUserId && logs.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {/* Symptom frequency horizontal bar chart */}
          {frequencyChartData.length > 0 && (
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Symptom Frequency</h3>
              <ResponsiveContainer width="100%" height={frequencyChartData.length * 36 + 20}>
                <BarChart data={frequencyChartData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                  <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="symptom" width={100} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "rgba(17,24,39,0.9)", border: "none", borderRadius: 8, color: "#f3f4f6", fontSize: 12 }}
                    cursor={{ fill: "rgba(99,102,241,0.08)" }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Severity trend line chart */}
          {severityTrendData.length > 1 && (
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Severity Over Time</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={severityTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" />
                  <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "rgba(17,24,39,0.9)", border: "none", borderRadius: 8, color: "#f3f4f6", fontSize: 12 }}
                    formatter={(value: number) => [value.toFixed(1), "Avg Severity"]}
                  />
                  <Line type="monotone" dataKey="avg" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Body location pie chart */}
      {selectedUserId && locationPieData.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Body Locations</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={locationPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40} paddingAngle={2}>
                  {locationPieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "rgba(17,24,39,0.9)", border: "none", borderRadius: 8, color: "#f3f4f6", fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
              {locationPieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </div>

          {/* Top symptoms bar (original, upgraded styling) */}
          {topSymptoms.length > 0 && (
            <div className="lg:col-span-2 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Most Frequent Symptoms (All Time)</h3>
              <div className="space-y-2">
                {topSymptoms.map((s) => {
                  const maxCount = topSymptoms[0]?.count ?? 1
                  const pct = Math.round((s.count / maxCount) * 100)
                  return (
                    <div key={s.symptom}>
                      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                        <span>{s.symptom}</span><span>{s.count}×</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                        <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Log table — enhanced */}
      {selectedUserId && (
        <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Symptom Log ({logs.length})</h3>
          </div>
          {isLoading ? (
            <div className="p-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
          ) : logs.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No symptoms logged in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 bg-gray-50/60 dark:bg-gray-800/40">
                    <th className="px-5 py-3 font-medium">Symptom</th>
                    <th className="px-5 py-3 font-medium">Severity</th>
                    <th className="px-5 py-3 font-medium">Location</th>
                    <th className="px-5 py-3 font-medium">Triggers</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, idx) => (
                    <tr
                      key={l.id}
                      className={`border-b border-gray-50 dark:border-gray-800/50 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10 transition-colors ${
                        idx % 2 === 1 ? "bg-gray-50/40 dark:bg-gray-800/20" : ""
                      }`}
                    >
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{l.symptom}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${SEVERITY_LABELS[l.severity]?.color ?? ""}`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                            l.severity <= 1 ? "bg-green-500" : l.severity <= 2 ? "bg-yellow-500" : l.severity <= 3 ? "bg-orange-500" : "bg-red-500"
                          }`} />
                          {SEVERITY_LABELS[l.severity]?.label ?? l.severity}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{l.bodyLocation ?? "—"}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                        {l.triggers?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {l.triggers.map((t) => (
                              <span key={t} className="inline-block rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-600 dark:text-gray-400">{t}</span>
                            ))}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(l.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
