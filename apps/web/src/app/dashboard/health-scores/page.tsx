"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type HealthScoreData, healthScoresApi, usersApi } from "../../../lib/api"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { PageHeader, Badge, Card, CardHeader, CardContent, StatCard, StatSkeleton, CardSkeleton, MetricRing, MetricBar, EmptyState } from "../../../lib/components/ui"
import { Activity, TrendingUp, TrendingDown, Minus, BarChart3, Trophy, AlertTriangle, Flame, Zap } from "lucide-react"

// ── Range options ──────────────────────────────────────────────
const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
  { label: "1y", days: 365 },
  { label: "All time", days: 0 },
]

function dateRange(days: number): { from?: string; to?: string; limit?: number } {
  if (days === 0) return { limit: 9999 }
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

// ── Constants ──────────────────────────────────────────────────
const ROWS_PER_PAGE = 20

const GRADE_STYLES: Record<string, { bg: string; text: string; glow: string }> = {
  "A+": { bg: "from-emerald-400 to-teal-500", text: "text-emerald-500", glow: "shadow-emerald-500/30" },
  A:    { bg: "from-emerald-400 to-green-500", text: "text-emerald-500", glow: "shadow-emerald-500/25" },
  "A-": { bg: "from-green-400 to-emerald-500", text: "text-green-500", glow: "shadow-green-500/25" },
  "B+": { bg: "from-green-400 to-lime-500", text: "text-green-500", glow: "shadow-green-500/20" },
  B:    { bg: "from-lime-400 to-yellow-500", text: "text-lime-500", glow: "shadow-lime-500/20" },
  "B-": { bg: "from-yellow-400 to-amber-500", text: "text-yellow-500", glow: "shadow-yellow-500/20" },
  "C+": { bg: "from-yellow-400 to-orange-500", text: "text-yellow-500", glow: "shadow-yellow-500/20" },
  C:    { bg: "from-amber-400 to-orange-500", text: "text-amber-500", glow: "shadow-amber-500/20" },
  "C-": { bg: "from-orange-400 to-red-500", text: "text-orange-500", glow: "shadow-orange-500/20" },
  "D+": { bg: "from-orange-400 to-red-500", text: "text-orange-500", glow: "shadow-orange-500/20" },
  D:    { bg: "from-red-400 to-red-600", text: "text-red-500", glow: "shadow-red-500/20" },
  F:    { bg: "from-red-500 to-red-700", text: "text-red-500", glow: "shadow-red-500/25" },
}

const SUB_SCORE_META = [
  { key: "sleepScore", label: "Sleep", icon: "🌙", color: "from-indigo-400 to-purple-500", stroke: "#818cf8" },
  { key: "activityScore", label: "Activity", icon: "🏃", color: "from-orange-400 to-amber-500", stroke: "#fb923c" },
  { key: "cardioScore", label: "Cardio", icon: "❤️", color: "from-red-400 to-rose-500", stroke: "#f87171" },
  { key: "recoveryScore", label: "Recovery", icon: "🔋", color: "from-emerald-400 to-teal-500", stroke: "#34d399" },
  { key: "bodyScore", label: "Body", icon: "⚖️", color: "from-blue-400 to-cyan-500", stroke: "#60a5fa" },
]

const TICK_STYLE = { fill: "#9ca3af", fontSize: 11 }
const GRID_PROPS = { strokeDasharray: "3 3", stroke: "#6b7280", strokeOpacity: 0.18 }
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    border: "1px solid rgba(55, 65, 81, 0.8)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#f3f4f6",
  },
  itemStyle: { color: "#e5e7eb" },
  labelStyle: { color: "#9ca3af", marginBottom: "4px" },
}

// ── Helpers ────────────────────────────────────────────────────
function linearRegressionTrend(scores: number[]): "rising" | "falling" | "stable" {
  if (scores.length < 2) return "stable"
  const n = scores.length
  const xMean = (n - 1) / 2
  const yMean = scores.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (scores[i]! - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  if (slope > 0.5) return "rising"
  if (slope < -0.5) return "falling"
  return "stable"
}

function computeSummaryStats(history: HealthScoreData[]) {
  if (history.length === 0) return null
  const scores = history.map((h) => h.overallScore)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length

  let bestIdx = 0
  let worstIdx = 0
  for (let i = 1; i < scores.length; i++) {
    if (scores[i]! > scores[bestIdx]!) bestIdx = i
    if (scores[i]! < scores[worstIdx]!) worstIdx = i
  }

  // Streak: consecutive days ≥ 80 from most recent (history sorted newest-first)
  let streak = 0
  for (const h of history) {
    if (h.overallScore >= 80) streak++
    else break
  }

  // Trend from last 7 scores (sorted oldest-first for regression)
  const recent = history.slice(0, 7).reverse()
  const trend = linearRegressionTrend(recent.map((h) => h.overallScore))

  return {
    avg,
    best: { score: scores[bestIdx]!, date: history[bestIdx]!.date },
    worst: { score: scores[worstIdx]!, date: history[worstIdx]!.date },
    streak,
    trend,
  }
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// ── Components ─────────────────────────────────────────────────
function ScoreRing({ score, size = 180 }: { score: number; size?: number }) {
  const r = (size - 16) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#eab308" : score >= 40 ? "#f97316" : "#ef4444"
  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} className="drop-shadow-xl -rotate-90">
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-800" strokeWidth="12" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#scoreGrad)" strokeWidth="12"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="bg-white/80 dark:bg-gray-900/80 rounded-full px-4 py-2 backdrop-blur-sm">
          <span className="text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-50">{score}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 block text-center mt-0.5">/ 100</span>
        </div>
      </div>
    </div>
  )
}

function SubScoreCard({ label, icon, value, gradient }: { label: string; icon: string; value: number | null; gradient: string }) {
  const v = value ?? 0
  return (
    <Card hover>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</span>
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-50">{v}</span>
        </div>
        <MetricBar value={v} max={100} color={v >= 70 ? "vitality" : v >= 50 ? "amber" : "accent"} showValue={false} />
      </CardContent>
    </Card>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function OverallScoreTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as HealthScoreData & { fullDate: string }
  const gs = GRADE_STYLES[d.grade] ?? GRADE_STYLES.C
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1">{new Date(d.fullDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
      <p className="text-gray-100 font-semibold">Score: {d.overallScore}</p>
      <p className={`font-bold ${gs!.text}`}>Grade: {d.grade}</p>
    </div>
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Page ───────────────────────────────────────────────────────
export default function HealthScoresPage() {
  const { selectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()
  const [rangeDays, setRangeDays] = useState(30)
  const [tablePage, setTablePage] = useState(0)

  // ── Queries ──
  const { data: selectedUser } = useQuery({
    queryKey: ["user", selectedUserId],
    queryFn: () => usersApi.get(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: latest, isLoading } = useQuery({
    queryKey: ["health-score-latest", selectedUserId],
    queryFn: () => healthScoresApi.latest(selectedUserId),
    enabled: !!selectedUserId,
  })

  const rangeOpts = useMemo(() => dateRange(rangeDays), [rangeDays])

  const { data: historyResult } = useQuery({
    queryKey: ["health-score-history", selectedUserId, rangeOpts],
    queryFn: () => healthScoresApi.history(selectedUserId, rangeOpts),
    enabled: !!selectedUserId,
  })
  const history = useMemo(() => historyResult?.data ?? [], [historyResult])

  const computeMut = useMutation({
    mutationFn: () => healthScoresApi.compute(selectedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-score-latest", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["health-score-history", selectedUserId] })
    },
  })

  // ── Derived data ──
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [history],
  )
  const chronological = useMemo(
    () => [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [history],
  )
  const stats = useMemo(() => computeSummaryStats(sortedHistory), [sortedHistory])

  const chartData = useMemo(
    () =>
      chronological.map((h) => ({
        date: formatShortDate(h.date),
        fullDate: h.date,
        overallScore: h.overallScore,
        grade: h.grade,
        sleepScore: h.sleepScore,
        activityScore: h.activityScore,
        cardioScore: h.cardioScore,
        recoveryScore: h.recoveryScore,
        bodyScore: h.bodyScore,
      })),
    [chronological],
  )

  // Table pagination
  const totalPages = Math.max(1, Math.ceil(sortedHistory.length / ROWS_PER_PAGE))
  const pagedHistory = sortedHistory.slice(tablePage * ROWS_PER_PAGE, (tablePage + 1) * ROWS_PER_PAGE)

  const gradeStyle = latest ? (GRADE_STYLES[latest.grade] ?? GRADE_STYLES.C) : GRADE_STYLES.C

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Health Score"
        subtitle={`Composite daily score from sleep, activity, cardio, recovery, and body metrics.${selectedUser?.gender ? ` (${selectedUser.gender === "female" ? "♀️ Female" : selectedUser.gender === "male" ? "♂️ Male" : "⚧️ Other"} baselines)` : ""}`}
        badge={latest ? <Badge variant={latest.overallScore >= 80 ? "success" : latest.overallScore >= 60 ? "warning" : "danger"} dot>{latest.grade}</Badge> : undefined}
        actions={selectedUserId ? (
          <button type="button" onClick={() => computeMut.mutate()} disabled={computeMut.isPending}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50">
            {computeMut.isPending ? "Computing…" : "⚡ Compute Score"}
          </button>
        ) : undefined}
      />

      {/* Date range filter */}
      <Card>
        <CardContent>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Period</label>
            <div className="flex gap-1.5">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  onClick={() => { setRangeDays(r.days); setTablePage(0) }}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    rangeDays === r.days
                      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {selectedUserId && isLoading && (
        <div className="space-y-6">
          <StatSkeleton count={5} />
          <CardSkeleton count={2} />
        </div>
      )}

      {/* Main content */}
      {selectedUserId && !isLoading && latest && (
        <div className="space-y-8">
          {/* Summary statistics row */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard label="Average" value={stats.avg.toFixed(1)} icon={<BarChart3 className="h-5 w-5" />} />
              <StatCard label="Best" value={stats.best.score} icon={<Trophy className="h-5 w-5" />} color="vitality" />
              <StatCard label="Worst" value={stats.worst.score} icon={<AlertTriangle className="h-5 w-5" />} color="accent" />
              <StatCard label="Streak ≥ 80" value={`${stats.streak} days`} icon={<Flame className="h-5 w-5" />} />
              <StatCard
                label="Trend"
                value={stats.trend === "rising" ? "↑ Rising" : stats.trend === "falling" ? "↓ Falling" : "→ Stable"}
                icon={stats.trend === "rising" ? <TrendingUp className="h-5 w-5" /> : stats.trend === "falling" ? <TrendingDown className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
                color={stats.trend === "rising" ? "vitality" : stats.trend === "falling" ? "accent" : "default"}
              />
            </div>
          )}

          {/* Main score + grade */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardContent className="flex flex-col items-center py-8">
                <ScoreRing score={latest.overallScore} />
                <div className={`mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${gradeStyle!.bg} px-4 py-1.5 text-white text-sm font-bold shadow-lg ${gradeStyle!.glow}`}>
                  Grade {latest.grade}
                </div>
                {latest.deltaFromPrevious != null && (
                  <p className={`mt-2 text-sm font-medium ${latest.deltaFromPrevious > 0 ? "text-emerald-700 dark:text-emerald-500" : latest.deltaFromPrevious < 0 ? "text-red-700 dark:text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
                    {latest.deltaFromPrevious > 0 ? "↑" : latest.deltaFromPrevious < 0 ? "↓" : "→"} {Math.abs(latest.deltaFromPrevious).toFixed(1)} from previous
                  </p>
                )}
                {latest.weeklyAvg != null && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">7-day avg: <span className="font-semibold">{latest.weeklyAvg.toFixed(1)}</span></p>
                )}
                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{new Date(latest.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
              </CardContent>
            </Card>

            {/* Sub-scores grid */}
            <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 content-start">
              {SUB_SCORE_META.map((meta) => (
                <SubScoreCard
                  key={meta.key}
                  label={meta.label}
                  icon={meta.icon}
                  value={(latest as unknown as Record<string, unknown>)[meta.key] as number | null}
                  gradient={meta.color}
                />
              ))}
              {/* Weights info card */}
              <Card>
                <CardContent>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Score Weights</p>
                  <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex justify-between"><span>🌙 Sleep</span><span className="font-mono">25%</span></div>
                    <div className="flex justify-between"><span>🏃 Activity</span><span className="font-mono">25%</span></div>
                    <div className="flex justify-between"><span>❤️ Cardio</span><span className="font-mono">20%</span></div>
                    <div className="flex justify-between"><span>🔋 Recovery</span><span className="font-mono">15%</span></div>
                    <div className="flex justify-between"><span>⚖️ Body</span><span className="font-mono">15%</span></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Overall Score Trend Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader title="Overall Score Trend" subtitle="Daily composite health score over time" />
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="overallGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="date" tick={TICK_STYLE} tickLine={false} axisLine={false} />
                    <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip content={<OverallScoreTooltip />} />
                    <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Good (80)", position: "right", fill: "#22c55e", fontSize: 10 }} />
                    <ReferenceLine y={60} stroke="#eab308" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: "Fair (60)", position: "right", fill: "#eab308", fontSize: 10 }} />
                    <Area type="monotone" dataKey="overallScore" stroke="#6366f1" strokeWidth={2} fill="url(#overallGrad)" name="Overall Score" connectNulls dot={{ r: 2, fill: "#6366f1" }} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Sub-score Trend Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader title="Sub-score Trends" subtitle="Individual category scores over time" />
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="date" tick={TICK_STYLE} tickLine={false} axisLine={false} />
                    <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                    {SUB_SCORE_META.map((meta) => (
                      <Line
                        key={meta.key}
                        type="monotone"
                        dataKey={meta.key}
                        stroke={meta.stroke}
                        strokeWidth={2}
                        name={meta.label}
                        connectNulls
                        dot={{ r: 2, fill: meta.stroke }}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Historical Data Table */}
          <Card>
            <CardHeader
              title="History"
              action={totalPages > 1 ? (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    Page {tablePage + 1} of {totalPages} · {sortedHistory.length} records
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                      disabled={tablePage === 0}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setTablePage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={tablePage >= totalPages - 1}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              ) : undefined}
            />
            <CardContent>
              {sortedHistory.length === 0 ? (
                <EmptyState icon={BarChart3} title="No history yet" description="Compute your first score above." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800 text-left">
                        <th className="pb-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Date</th>
                        <th className="pb-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Overall</th>
                        <th className="pb-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Grade</th>
                        <th className="pb-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Sleep</th>
                        <th className="pb-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Activity</th>
                        <th className="pb-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Cardio</th>
                        <th className="pb-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Recovery</th>
                        <th className="pb-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Body</th>
                        <th className="pb-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Δ</th>
                        <th className="pb-2 font-semibold text-gray-500 dark:text-gray-400">7d Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedHistory.map((h, i) => {
                        const gs = GRADE_STYLES[h.grade] ?? GRADE_STYLES.C
                        return (
                          <tr key={h.id} className={`border-b border-gray-100 dark:border-gray-800/50 ${i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/20" : ""}`}>
                            <td className="py-2 pr-4 text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatShortDate(h.date)}</td>
                            <td className="py-2 pr-4 font-bold text-gray-900 dark:text-gray-100 tabular-nums">{h.overallScore}</td>
                            <td className="py-2 pr-4">
                              <span className={`inline-flex rounded-full bg-gradient-to-r ${gs!.bg} px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ${gs!.glow}`}>{h.grade}</span>
                            </td>
                            <td className="py-2 pr-4 tabular-nums text-gray-700 dark:text-gray-300">{h.sleepScore ?? "—"}</td>
                            <td className="py-2 pr-4 tabular-nums text-gray-700 dark:text-gray-300">{h.activityScore ?? "—"}</td>
                            <td className="py-2 pr-4 tabular-nums text-gray-700 dark:text-gray-300">{h.cardioScore ?? "—"}</td>
                            <td className="py-2 pr-4 tabular-nums text-gray-700 dark:text-gray-300">{h.recoveryScore ?? "—"}</td>
                            <td className="py-2 pr-4 tabular-nums text-gray-700 dark:text-gray-300">{h.bodyScore ?? "—"}</td>
                            <td className="py-2 pr-4 tabular-nums whitespace-nowrap">
                              {h.deltaFromPrevious != null ? (
                                <span className={h.deltaFromPrevious > 0 ? "text-emerald-600 dark:text-emerald-400" : h.deltaFromPrevious < 0 ? "text-red-600 dark:text-red-400" : "text-gray-400"}>
                                  {h.deltaFromPrevious > 0 ? "↑" : h.deltaFromPrevious < 0 ? "↓" : "→"} {Math.abs(h.deltaFromPrevious).toFixed(1)}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="py-2 tabular-nums text-gray-700 dark:text-gray-300">{h.weeklyAvg != null ? h.weeklyAvg.toFixed(1) : "—"}</td>
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
