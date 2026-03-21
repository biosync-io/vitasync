"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type HealthScoreData, healthScoresApi, usersApi } from "../../../lib/api"

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
  { key: "sleepScore", label: "Sleep", icon: "🌙", color: "from-indigo-400 to-purple-500" },
  { key: "activityScore", label: "Activity", icon: "🏃", color: "from-orange-400 to-amber-500" },
  { key: "cardioScore", label: "Cardio", icon: "❤️", color: "from-red-400 to-rose-500" },
  { key: "recoveryScore", label: "Recovery", icon: "🔋", color: "from-emerald-400 to-teal-500" },
  { key: "bodyScore", label: "Body", icon: "⚖️", color: "from-blue-400 to-cyan-500" },
]

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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-100 dark:text-gray-800" strokeWidth="12" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#scoreGrad)" strokeWidth="12"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{score}</span>
        <span className="text-xs text-gray-400 mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

function SubScoreCard({ label, icon, value, gradient }: { label: string; icon: string; value: number | null; gradient: string }) {
  const v = value ?? 0
  const pct = Math.min(100, v)
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card hover:shadow-card-hover transition-all duration-300 group">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg group-hover:scale-110 transition-transform">{icon}</span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</span>
        </div>
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{v}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function HealthScoresPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []
  const selectedUser = users.find((u) => u.id === selectedUserId)

  const { data: latest, isLoading } = useQuery({
    queryKey: ["health-score-latest", selectedUserId],
    queryFn: () => healthScoresApi.latest(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: historyResult } = useQuery({
    queryKey: ["health-score-history", selectedUserId],
    queryFn: () => healthScoresApi.history(selectedUserId, { limit: 30 }),
    enabled: !!selectedUserId,
  })
  const history = historyResult?.data ?? []

  const computeMut = useMutation({
    mutationFn: () => healthScoresApi.compute(selectedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-score-latest", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["health-score-history", selectedUserId] })
    },
  })

  const gradeStyle = latest ? (GRADE_STYLES[latest.grade] ?? GRADE_STYLES.C) : GRADE_STYLES.C

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-down">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Health Score</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Composite daily score from sleep, activity, cardio, recovery, and body metrics.
            {selectedUser?.gender && <span className="ml-1 text-xs">({selectedUser.gender === "female" ? "♀️ Female" : selectedUser.gender === "male" ? "♂️ Male" : "⚧️ Other"} baselines)</span>}
          </p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => computeMut.mutate()} disabled={computeMut.isPending}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50">
            {computeMut.isPending ? "Computing…" : "⚡ Compute Score"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
        <label htmlFor="hs-user" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">User</label>
        <select id="hs-user" className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/40 transition-all" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}{u.gender ? ` (${u.gender})` : ""}</option>)}
        </select>
      </div>

      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <span className="text-6xl mb-4 animate-float">💯</span>
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a user to view their health score.</p>
        </div>
      )}

      {selectedUserId && isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      )}

      {selectedUserId && !isLoading && latest && (
        <div className="space-y-6 stagger-grid">
          {/* Main score + grade */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-8 shadow-card hover:shadow-card-hover transition-all duration-300 flex flex-col items-center">
              <ScoreRing score={latest.overallScore} />
              <div className={`mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${gradeStyle!.bg} px-4 py-1.5 text-white text-sm font-bold shadow-lg ${gradeStyle!.glow}`}>
                Grade {latest.grade}
              </div>
              {latest.deltaFromPrevious != null && (
                <p className={`mt-2 text-sm font-medium ${latest.deltaFromPrevious > 0 ? "text-emerald-500" : latest.deltaFromPrevious < 0 ? "text-red-500" : "text-gray-400"}`}>
                  {latest.deltaFromPrevious > 0 ? "↑" : latest.deltaFromPrevious < 0 ? "↓" : "→"} {Math.abs(latest.deltaFromPrevious).toFixed(1)} from previous
                </p>
              )}
              {latest.weeklyAvg != null && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">7-day avg: <span className="font-semibold">{latest.weeklyAvg.toFixed(1)}</span></p>
              )}
              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{new Date(latest.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
            </div>

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
              <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/40 dark:to-gray-900/40 p-4">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Score Weights</p>
                <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between"><span>🌙 Sleep</span><span className="font-mono">25%</span></div>
                  <div className="flex justify-between"><span>🏃 Activity</span><span className="font-mono">25%</span></div>
                  <div className="flex justify-between"><span>❤️ Cardio</span><span className="font-mono">20%</span></div>
                  <div className="flex justify-between"><span>🔋 Recovery</span><span className="font-mono">15%</span></div>
                  <div className="flex justify-between"><span>⚖️ Body</span><span className="font-mono">15%</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* 30-Day History */}
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">30-Day History</h3>
            {history.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 py-8 text-center">No history yet. Compute your first score above.</p>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {history.slice(0, 30).reverse().map((h) => {
                  const color = h.overallScore >= 80 ? "from-emerald-400 to-emerald-500" : h.overallScore >= 60 ? "from-yellow-400 to-amber-500" : h.overallScore >= 40 ? "from-orange-400 to-orange-500" : "from-red-400 to-red-500"
                  return (
                    <div key={h.id} className="flex-1 flex flex-col items-center gap-0.5 group" title={`${new Date(h.date).toLocaleDateString()}: ${h.overallScore}`}>
                      <div className={`w-full rounded-t-sm bg-gradient-to-t ${color} transition-all duration-500 group-hover:opacity-80`}
                        style={{ height: `${Math.max(4, h.overallScore * 1.2)}%` }} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
