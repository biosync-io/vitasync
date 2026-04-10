"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSelectedUser } from "../../../lib/user-selection-context"
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  CartesianGrid, ResponsiveContainer, Tooltip, Legend,
  XAxis, YAxis, ReferenceLine,
} from "recharts"
import {
  readinessApi, analyticsApi, usersApi,
  type ReadinessData, type TrainingLoadData, type TrainingLoadHistoryEntry, type RecoveryPrediction,
} from "../../../lib/api"
import { PageHeader, Badge, Card, CardHeader, CardContent, StatCard as DSStatCard, StatSkeleton, CardSkeleton, MetricRing, MetricBar, EmptyState } from "../../../lib/components/ui"
import { Activity, Shield, Zap, Heart, Brain } from "lucide-react"

// ── Constants ──────────────────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
] as const

const REC_STYLES: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  train_hard:      { bg: "from-emerald-500 to-teal-600", text: "text-white", label: "Train Hard", icon: "🏋️" },
  train_light:     { bg: "from-lime-500 to-green-600", text: "text-white", label: "Train Light", icon: "🚶" },
  active_recovery: { bg: "from-yellow-500 to-amber-600", text: "text-white", label: "Active Recovery", icon: "🧘" },
  rest:            { bg: "from-red-500 to-rose-600", text: "text-white", label: "Rest", icon: "😴" },
}

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  peaked:      { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", label: "Peaked", icon: "🏔️" },
  fresh:       { color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", label: "Fresh", icon: "✨" },
  neutral:     { color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-800", label: "Neutral", icon: "⚖️" },
  fatigued:    { color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30", label: "Fatigued", icon: "😓" },
  overreached: { color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", label: "Overreached", icon: "🚨" },
}

const PAGE_SIZE = 15

// ── Helpers ────────────────────────────────────────────────────────────────────

function arcColor(score: number) {
  if (score >= 80) return "#10b981"
  if (score >= 60) return "#eab308"
  if (score >= 40) return "#f97316"
  return "#ef4444"
}

function shortDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreGauge({ score, size = 180 }: { score: number; size?: number }) {
  const r = (size - 16) / 2
  const c = size / 2
  const circumference = Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const color = arcColor(score)
  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size / 2 + 24} viewBox={`0 0 ${size} ${size / 2 + 24}`} className="drop-shadow-lg">
        <path d={`M ${c - r} ${c} A ${r} ${r} 0 0 1 ${c + r} ${c}`}
          fill="none" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={12} strokeLinecap="round" />
        <path d={`M ${c - r} ${c} A ${r} ${r} 0 0 1 ${c + r} ${c}`}
          fill="none" stroke={color} strokeWidth={12} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out" />
        <text x={c} y={c - 10} textAnchor="middle" className="fill-gray-900 dark:fill-gray-50 text-4xl font-bold">{score}</text>
        <text x={c} y={c + 10} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">/ 100</text>
      </svg>
    </div>
  )
}

function SignalBar({ label, icon, value, weight }: { label: string; icon: string; value: number | null; weight?: number | undefined }) {
  const v = value ?? 0
  const barColor = v >= 70 ? "vitality" : v >= 50 ? "amber" : "accent"
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-1.5">
          <span>{icon}</span>
          <span className="text-gray-600 dark:text-gray-400 font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {weight != null && <span className="text-[10px] text-gray-400 dark:text-gray-500">{(weight * 100).toFixed(0)}%w</span>}
          <span className="font-bold text-gray-900 dark:text-gray-50 min-w-[28px] text-right">{v.toFixed(0)}</span>
        </div>
      </div>
      <MetricBar value={v} max={100} color={barColor} showValue={false} />
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-600 dark:text-gray-400">{p.name}:</span>
          <span className="font-bold text-gray-900 dark:text-gray-50">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ReadinessPage() {
  const { selectedUserId } = useSelectedUser()
  const [rangeDays, setRangeDays] = useState(30)
  const [tablePage, setTablePage] = useState(0)

  // Queries

  const { data: readiness, isLoading: loadingReadiness } = useQuery({
    queryKey: ["readiness", selectedUserId],
    queryFn: () => readinessApi.get(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: trainingLoad, isLoading: loadingLoad } = useQuery({
    queryKey: ["training-load", selectedUserId],
    queryFn: () => readinessApi.trainingLoad(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: historyResult } = useQuery({
    queryKey: ["training-load-history", selectedUserId, rangeDays],
    queryFn: () => readinessApi.trainingLoadHistory(selectedUserId, rangeDays),
    enabled: !!selectedUserId,
  })

  const { data: recovery } = useQuery({
    queryKey: ["recovery", selectedUserId],
    queryFn: async () => {
      try { return (await analyticsApi.recovery(selectedUserId)).data } catch { return null }
    },
    enabled: !!selectedUserId,
  })

  const isLoading = loadingReadiness || loadingLoad

  // Derived
  const history = useMemo(() => {
    const raw = historyResult?.data ?? []
    return [...raw].sort((a, b) => a.date.localeCompare(b.date)).map((h) => ({
      ...h,
      shortDate: shortDate(h.date),
    }))
  }, [historyResult])

  const sortedHistory = useMemo(() => [...history].reverse(), [history])
  const totalPages = Math.ceil(sortedHistory.length / PAGE_SIZE)
  const pagedHistory = sortedHistory.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE)

  // Stats from history
  const historyStats = useMemo(() => {
    if (history.length === 0) return null
    const avgTSB = history.reduce((s, h) => s + h.tsb, 0) / history.length
    const avgStrain = history.reduce((s, h) => s + h.dailyStrain, 0) / history.length
    const peakFitness = Math.max(...history.map((h) => h.ctl))
    const daysInZone = history.filter((h) => h.tsb >= -10 && h.tsb <= 25).length
    return { avgTSB: avgTSB.toFixed(1), avgStrain: avgStrain.toFixed(1), peakFitness, daysInZone }
  }, [history])

  const recStyle = readiness ? (REC_STYLES[readiness.recommendation] ?? REC_STYLES.rest!) : REC_STYLES.rest!
  const statusStyle = trainingLoad ? (STATUS_STYLES[trainingLoad.status] ?? STATUS_STYLES.neutral!) : STATUS_STYLES.neutral!

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Readiness & Training Load"
        subtitle="Proprietary readiness score, recovery prediction, and Training Stress Balance (TSB)."
        badge={readiness ? <Badge variant={readiness.score >= 80 ? "success" : readiness.score >= 60 ? "warning" : "danger"} dot pulse>{recStyle.label}</Badge> : undefined}
      />

      {/* Range filter */}
      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">History Period</label>
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
        </CardContent>
      </Card>

      {selectedUserId && isLoading && (
        <div className="space-y-8">
          <StatSkeleton count={4} />
          <CardSkeleton count={3} />
        </div>
      )}

      {selectedUserId && !isLoading && readiness && (
        <div className="space-y-8">

          {/* Top row: Readiness + Signal Breakdown + Training Load */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Readiness Score */}
            <Card glow="brand">
              <CardHeader title="Readiness Score" />
              <CardContent className="flex flex-col items-center">
                <ScoreGauge score={readiness.score} />
                <div className={`mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${recStyle.bg} px-4 py-2 ${recStyle.text} text-sm font-bold shadow-lg`}>
                  <span>{recStyle.icon}</span>
                  <span>{recStyle.label}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center max-w-xs leading-relaxed">
                  {readiness.recommendationText}
                </p>
                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  Confidence: {(readiness.confidence * 100).toFixed(0)}% · {new Date(readiness.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </CardContent>
            </Card>

            {/* Signal Breakdown */}
            <Card>
              <CardHeader title="Signal Breakdown" />
              <CardContent>
                <div className="space-y-3">
                  <SignalBar label="HRV" icon="💓" value={readiness.signals.hrv?.score ?? null} weight={readiness.signals.hrv?.weight} />
                  <SignalBar label="Sleep" icon="🌙" value={readiness.signals.sleep?.score ?? null} weight={readiness.signals.sleep?.weight} />
                  <SignalBar label="Resting HR" icon="❤️" value={readiness.signals.restingHr?.score ?? null} weight={readiness.signals.restingHr?.weight} />
                  <SignalBar label="Strain Recovery" icon="🔋" value={readiness.signals.strain?.score ?? null} weight={readiness.signals.strain?.weight} />
                  <SignalBar label="Physiological" icon="🧬" value={readiness.signals.physiological?.score ?? null} weight={readiness.signals.physiological?.weight} />
                </div>
              </CardContent>
            </Card>

            {/* Training Load + Recovery */}
            <Card>
              <CardHeader title="Training Load" />
              <CardContent>
                {trainingLoad && (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="text-center rounded-xl bg-blue-50 dark:bg-blue-900/20 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">Fitness</p>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{trainingLoad.ctl}</p>
                        <p className="text-[10px] text-gray-400">CTL</p>
                      </div>
                      <div className="text-center rounded-xl bg-orange-50 dark:bg-orange-900/20 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-orange-600 dark:text-orange-400 font-semibold">Fatigue</p>
                        <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{trainingLoad.atl}</p>
                        <p className="text-[10px] text-gray-400">ATL</p>
                      </div>
                      <div className="text-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">Form</p>
                        <p className={`text-2xl font-bold ${trainingLoad.tsb >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {trainingLoad.tsb > 0 ? "+" : ""}{trainingLoad.tsb}
                        </p>
                        <p className="text-[10px] text-gray-400">TSB</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-2 rounded-xl ${statusStyle.bg} px-3 py-2 mb-4`}>
                      <span>{statusStyle.icon}</span>
                      <span className={`text-sm font-semibold ${statusStyle.color}`}>{statusStyle.label}</span>
                    </div>
                  </>
                )}
                {recovery && (
                  <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Recovery Prediction</h3>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">State</span>
                        <span className={`font-semibold ${recovery.state === "recovered" ? "text-emerald-600 dark:text-emerald-400" : recovery.state === "recovering" ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                          {recovery.state.charAt(0).toUpperCase() + recovery.state.slice(1)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Est. Recovery</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-50">{recovery.predictedRecoveryHours.toFixed(1)}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Next Training</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-50">{shortDate(recovery.nextTrainingWindow)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Confidence</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-50">{(recovery.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    {recovery.factors.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {recovery.factors.slice(0, 4).map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[10px]">
                            <span className={f.impact === "positive" ? "text-emerald-500" : f.impact === "negative" ? "text-red-500" : "text-gray-400"}>
                              {f.impact === "positive" ? "↑" : f.impact === "negative" ? "↓" : "→"}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Summary Stats */}
          {historyStats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <DSStatCard icon={<span className="text-xl">📊</span>} label="Avg TSB" value={historyStats.avgTSB} />
              <DSStatCard icon={<span className="text-xl">⚡</span>} label="Avg Strain" value={historyStats.avgStrain} />
              <DSStatCard icon={<span className="text-xl">🏆</span>} label="Peak Fitness" value={String(historyStats.peakFitness)} />
              <DSStatCard icon={<span className="text-xl">🎯</span>} label="Days in Zone" value={`${historyStats.daysInZone}/${history.length}`} />
            </div>
          )}

          {/* Daily Strain Chart */}
          {trainingLoad && trainingLoad.dailyStrain.length > 0 && (
            <Card>
              <CardHeader title="Recent Daily Strain" />
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trainingLoad.dailyStrain.map((d) => ({ ...d, shortDate: shortDate(d.date) }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#6b7280" strokeOpacity={0.15} />
                    <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="strain" name="Strain" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Training Load Trend Chart */}
          {history.length > 0 && (
            <Card>
              <CardHeader title="Training Load Trend" />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#6b7280" strokeOpacity={0.15} />
                    <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                    <ReferenceLine y={0} stroke="#9ca3af" strokeOpacity={0.5} />
                    <Line type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="atl" name="Fatigue (ATL)" stroke="#f97316" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="tsb" name="Form (TSB)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* TSB Zone Chart (area) */}
          {history.length > 0 && (
            <Card>
              <CardHeader title="Form (TSB) & Daily Strain" />
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="tsbGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="strainGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#6b7280" strokeOpacity={0.15} />
                    <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#9ca3af" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                    <ReferenceLine y={0} stroke="#9ca3af" strokeOpacity={0.5} />
                    <ReferenceLine y={25} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.4} />
                    <ReferenceLine y={-10} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.4} />
                    <Area type="monotone" dataKey="tsb" name="Form (TSB)" stroke="#10b981" fill="url(#tsbGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="dailyStrain" name="Daily Strain" stroke="#8b5cf6" fill="url(#strainGrad)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Historical Data Table */}
          <Card>
            <CardHeader
              title={`Training History (${sortedHistory.length} days)`}
              action={totalPages > 1 ? (
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
              ) : undefined}
            />
            <CardContent>
              {sortedHistory.length === 0 ? (
                <EmptyState icon={Activity} title="No training history yet" description="Data will appear once enough workouts are synced." />
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800">
                        {["Date", "Strain", "Fitness (CTL)", "Fatigue (ATL)", "Form (TSB)", "Status"].map((h) => (
                          <th key={h} className="py-2.5 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedHistory.map((h, i) => {
                        const st = STATUS_STYLES[h.status] ?? STATUS_STYLES.neutral!
                        return (
                          <tr key={h.date} className={`border-b border-gray-100 dark:border-gray-800/50 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30 ${i % 2 === 1 ? "bg-gray-50/30 dark:bg-gray-800/10" : ""}`}>
                            <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                              {new Date(h.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-purple-600 dark:text-purple-400">{h.dailyStrain.toFixed(1)}</td>
                            <td className="py-2.5 px-3 text-blue-600 dark:text-blue-400 font-medium">{h.ctl}</td>
                            <td className="py-2.5 px-3 text-orange-600 dark:text-orange-400 font-medium">{h.atl}</td>
                            <td className={`py-2.5 px-3 font-bold ${h.tsb >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {h.tsb > 0 ? "+" : ""}{h.tsb}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center gap-1 rounded-full ${st.bg} px-2 py-0.5 text-xs font-semibold ${st.color}`}>
                                {st.icon} {st.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
