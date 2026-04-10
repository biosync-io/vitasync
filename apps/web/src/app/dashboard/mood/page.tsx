"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type MoodLogData, type MoodStats, moodApi} from "../../../lib/api"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts"
import { PageHeader, Badge, Card, CardHeader, CardContent, StatCard, StatSkeleton, CardSkeleton, MetricRing, EmptyState, Button } from "../../../lib/components/ui"
import { Smile, Zap, AlertTriangle, TrendingUp, Plus } from "lucide-react"

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
  const { selectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [rangeDays, setRangeDays] = useState(30)
  const [form, setForm] = useState({ mood: "3", energy: "3", stress: "3", notes: "", tags: "" })
  const queryClient = useQueryClient()


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
    <div className="space-y-8">
      <PageHeader
        title="Mood"
        subtitle="Track daily mood, energy, and stress levels to spot patterns."
        actions={selectedUserId ? <Button icon={Plus} onClick={() => setShowCreate(!showCreate)}>{showCreate ? "Cancel" : "Log Mood"}</Button> : undefined}
      />

      {/* Date range filter */}
      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Period</label>
              <div className="flex gap-1">
                {RANGE_OPTIONS.map((r) => (
                  <button key={r.label} type="button" onClick={() => setRangeDays(r.days)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      rangeDays === r.days
                        ? "bg-brand-600 text-white shadow-md shadow-brand-500/25"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create form */}
      {showCreate && selectedUserId && (
        <Card glow="brand">
          <CardHeader title="Log Mood Entry" />
          <CardContent>
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
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} loading={createMut.isPending}>
                {createMut.isPending ? "Saving…" : "Save Entry"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {selectedUserId && isLoading && (
        <div className="space-y-8">
          <StatSkeleton count={4} />
          <CardSkeleton count={2} />
        </div>
      )}

      {selectedUserId && !isLoading && logs.length === 0 && (
        <EmptyState
          icon={Smile}
          title="No mood entries yet"
          description="Start tracking your mood to see patterns over time."
          action={{ label: "Log Mood", onClick: () => setShowCreate(true), icon: Plus }}
        />
      )}

      {selectedUserId && !isLoading && logs.length > 0 && (
        <>
          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Avg Mood" value={stats.avgScore.toFixed(1)} icon={<span className="text-2xl">{MOOD_EMOJI[Math.round(stats.avgScore)] ?? "😐"}</span>} color="brand" />
              <StatCard label="Avg Energy" value={stats.avgEnergy.toFixed(1)} icon={<span className="text-2xl">⚡</span>} color="vitality" />
              <StatCard label="Avg Stress" value={stats.avgStress.toFixed(1)} icon={<span className="text-2xl">😰</span>} color="accent" />
              <StatCard label="Trend" value={stats.trend === "improving" ? "↑ Improving" : stats.trend === "declining" ? "↓ Declining" : "→ Stable"} icon={<span className="text-2xl">{stats.trend === "improving" ? "📈" : stats.trend === "declining" ? "📉" : "➡️"}</span>} />
            </div>
          )}

          {/* Charts row */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Mood · Energy · Stress Over Time" />
              <CardContent>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Mood Distribution" />
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={distributionData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                    <XAxis dataKey="level" tick={{ fontSize: 11 }} stroke="currentColor" className="text-gray-400 dark:text-gray-500" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-gray-400 dark:text-gray-500" />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Entries" fill={CHART_COLORS.mood} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Logs table */}
          <Card>
            <CardHeader title="Mood Entries" subtitle={logs.length + " entries"} />
            <CardContent className="p-0">
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
                  {logs.map((l, i) => (
                    <tr key={l.id} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-brand-50/40 dark:hover:bg-brand-900/10 transition-colors ${i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/20" : ""}`}>
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
                            <Badge key={tag} variant="info" size="sm">{tag}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-xs truncate">{l.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
