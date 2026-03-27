"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import {
  type PointsTransactionData,
  type LeaderboardEntryData,
  pointsApi,
  usersApi,
} from "../../../lib/api"

const REASON_STYLES: Record<string, { bg: string; text: string; emoji: string }> = {
  goal_completed: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", emoji: "🎯" },
  achievement_unlocked: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-400", emoji: "🏆" },
  challenge_won: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-400", emoji: "⚔️" },
  streak_milestone: { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-400", emoji: "🔥" },
  daily_check_in: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400", emoji: "✅" },
  challenge_participated: { bg: "bg-violet-100 dark:bg-violet-900/40", text: "text-violet-700 dark:text-violet-400", emoji: "🤝" },
}

const RANK_STYLES = ["", "text-amber-500", "text-gray-400", "text-amber-700"]
const RANK_LABELS = ["", "🥇", "🥈", "🥉"]

export default function PointsPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "leaderboard">("overview")
  const [period, setPeriod] = useState<"week" | "month" | "all">("all")

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: balanceResult } = useQuery({
    queryKey: ["points-balance", selectedUserId],
    queryFn: () => pointsApi.balance(selectedUserId),
    enabled: !!selectedUserId,
  })
  const balance = balanceResult?.data?.totalPoints ?? 0

  const { data: historyResult, isLoading: historyLoading } = useQuery({
    queryKey: ["points-history", selectedUserId],
    queryFn: () => pointsApi.history(selectedUserId, { limit: 100 }),
    enabled: !!selectedUserId && (activeTab === "overview" || activeTab === "history"),
  })
  const history = historyResult?.data ?? []

  const { data: leaderboardResult, isLoading: leaderboardLoading } = useQuery({
    queryKey: ["leaderboard", period],
    queryFn: () => pointsApi.leaderboard({ period, limit: 50 }),
    enabled: activeTab === "leaderboard",
  })
  const leaderboard = leaderboardResult?.data ?? []

  // Compute stats from history
  const thisWeek = history.filter((t) => new Date(t.createdAt) > new Date(Date.now() - 7 * 86400000))
  const weeklyPoints = thisWeek.reduce((sum, t) => sum + t.points, 0)
  const reasonCounts: Record<string, number> = {}
  for (const t of history) {
    reasonCounts[t.reason] = (reasonCounts[t.reason] ?? 0) + 1
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Points & Leaderboard</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Earn points by completing goals, unlocking achievements, and maintaining streaks.
        </p>
      </div>

      {/* User selector & tabs */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
            <select id="p-user" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            {(["overview", "history", "leaderboard"] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === tab ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                {tab === "overview" ? "⭐ Overview" : tab === "history" ? "📜 History" : "🏆 Leaderboard"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <div>
          {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view their points.</p>}
          {selectedUserId && (
            <>
              {/* Points summary cards */}
              <div className="grid gap-4 sm:grid-cols-3 mb-6">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 p-6 shadow-sm text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Points</p>
                  <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{balance.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-6 shadow-sm text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">This Week</p>
                  <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">+{weeklyPoints.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-6 shadow-sm text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Transactions</p>
                  <p className="text-4xl font-bold text-amber-600 dark:text-amber-400 mt-1">{history.length}</p>
                </div>
              </div>

              {/* Points breakdown */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm mb-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Points Breakdown</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(reasonCounts).map(([reason, count]) => {
                    const style = REASON_STYLES[reason] ?? { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-400", emoji: "📌" }
                    const pts = history.filter((t) => t.reason === reason).reduce((sum, t) => sum + t.points, 0)
                    return (
                      <div key={reason} className={`rounded-lg ${style.bg} p-3`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-medium ${style.text}`}>
                            {style.emoji} {reason.replace(/_/g, " ")}
                          </span>
                          <span className={`text-sm font-bold ${style.text}`}>+{pts}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{count} time(s)</p>
                      </div>
                    )
                  })}
                  {Object.keys(reasonCounts).length === 0 && (
                    <p className="col-span-full text-sm text-gray-500 dark:text-gray-400">No points earned yet. Complete goals and unlock achievements to start earning!</p>
                  )}
                </div>
              </div>

              {/* Recent activity */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Recent Activity</h3>
                <div className="space-y-2">
                  {history.slice(0, 10).map((t) => {
                    const style = REASON_STYLES[t.reason] ?? { bg: "bg-gray-100", text: "text-gray-700", emoji: "📌" }
                    return (
                      <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{style.emoji}</span>
                          <div>
                            <p className="text-sm text-gray-900 dark:text-gray-100">{t.description}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(t.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">+{t.points}</span>
                      </div>
                    )
                  })}
                  {history.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No activity yet.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <div>
          {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view point history.</p>}
          {selectedUserId && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Reason</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {historyLoading && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>}
                  {!historyLoading && history.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No transactions yet.</td></tr>}
                  {history.map((t) => {
                    const style = REASON_STYLES[t.reason] ?? { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-400", emoji: "📌" }
                    return (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{t.description}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>{style.emoji} {t.reason.replace(/_/g, " ")}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-emerald-600 dark:text-emerald-400">+{t.points}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard tab */}
      {activeTab === "leaderboard" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">🏆 Leaderboard</h2>
            <div className="flex gap-2">
              {(["week", "month", "all"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPeriod(p)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${period === p ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                  {p === "week" ? "This Week" : p === "month" ? "This Month" : "All Time"}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-16">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">User</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {leaderboardLoading && <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>}
                {!leaderboardLoading && leaderboard.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No entries yet.</td></tr>}
                {leaderboard.map((entry) => {
                  const isCurrentUser = entry.userId === selectedUserId
                  return (
                    <tr key={entry.userId} className={`${isCurrentUser ? "bg-indigo-50 dark:bg-indigo-950/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}>
                      <td className={`px-4 py-3 text-sm font-bold ${RANK_STYLES[entry.rank] ?? "text-gray-600 dark:text-gray-400"}`}>
                        {entry.rank <= 3 ? RANK_LABELS[entry.rank] : `#${entry.rank}`}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${isCurrentUser ? "font-bold text-indigo-600 dark:text-indigo-400" : "text-gray-900 dark:text-gray-100"}`}>
                          {entry.displayName ?? "Anonymous"}
                          {isCurrentUser && " (You)"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100">
                        {entry.totalPoints.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* How to earn points */}
          <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">How to Earn Points</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { emoji: "🎯", label: "Complete a Goal", points: 10 },
                { emoji: "🏆", label: "Unlock Achievement (Bronze)", points: 25 },
                { emoji: "🥈", label: "Unlock Achievement (Silver)", points: 50 },
                { emoji: "🥇", label: "Unlock Achievement (Gold)", points: 100 },
                { emoji: "💎", label: "Unlock Achievement (Diamond)", points: 250 },
                { emoji: "⚔️", label: "Win a Challenge", points: 200 },
                { emoji: "🔥", label: "7-Day Streak", points: 15 },
                { emoji: "🔥", label: "30-Day Streak", points: 50 },
                { emoji: "🔥", label: "365-Day Streak", points: 500 },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{item.emoji} {item.label}</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">+{item.points}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
