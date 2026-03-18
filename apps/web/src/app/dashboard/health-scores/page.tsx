"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type HealthScoreData, healthScoresApi, usersApi } from "../../../lib/api"

const GRADE_STYLES: Record<string, string> = {
  "A+": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400",
  A: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400",
  "A-": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  "B+": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  B: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-400",
  "B-": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400",
  "C+": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400",
  C: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400",
  "C-": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400",
  "D+": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400",
  D: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
  F: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0
  const color = v >= 80 ? "bg-emerald-500" : v >= 60 ? "bg-yellow-500" : v >= 40 ? "bg-orange-500" : "bg-red-500"
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span>{label}</span>
        <span>{v}/100</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${v}%` }} />
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 animate-fade-in-down">Health Score</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Composite daily health score computed from sleep, activity, cardio, recovery, and body metrics.
          </p>
        </div>
        {selectedUserId && (
          <button
            type="button"
            onClick={() => computeMut.mutate()}
            disabled={computeMut.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {computeMut.isPending ? "Computing…" : "Compute Score"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="hs-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select
          id="hs-user"
          className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
        >
          <option value="">Select a user…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>
          ))}
        </select>
      </div>

      {!selectedUserId && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view their health score.</p>
      )}

      {selectedUserId && isLoading && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>
      )}

      {selectedUserId && !isLoading && latest && (
        <div className="grid gap-6 lg:grid-cols-3 stagger-grid">
          {/* Main score card */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm text-center">
            <div className="text-6xl font-bold text-gray-900 dark:text-gray-100">{latest.overallScore}</div>
            <span className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-semibold ${GRADE_STYLES[latest.grade] ?? "bg-gray-100 text-gray-800"}`}>
              Grade {latest.grade}
            </span>
            {latest.weeklyAvg != null && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">7-day avg: {latest.weeklyAvg.toFixed(1)}</p>
            )}
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{new Date(latest.date).toLocaleDateString()}</p>
          </div>

          {/* Sub-scores */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sub-Scores</h3>
            <ScoreBar label="Sleep" value={latest.sleepScore} />
            <ScoreBar label="Activity" value={latest.activityScore} />
            <ScoreBar label="Cardio" value={latest.cardioScore} />
            <ScoreBar label="Recovery" value={latest.recoveryScore} />
            <ScoreBar label="Body" value={latest.bodyScore} />
          </div>

          {/* History chart placeholder */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">30-Day History</h3>
            {history.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">No history yet.</p>
            ) : (
              <div className="space-y-1">
                {history.slice(0, 14).map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{new Date(h.date).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 w-24">
                        <div
                          className={`h-1.5 rounded-full ${h.overallScore >= 80 ? "bg-emerald-500" : h.overallScore >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${h.overallScore}%` }}
                        />
                      </div>
                      <span className="text-gray-700 dark:text-gray-300 w-7 text-right">{h.overallScore}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
