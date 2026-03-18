"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { type ChallengeData, type LeaderboardEntry, challengesApi, usersApi } from "../../../lib/api"

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400" },
  upcoming: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400" },
  completed: { bg: "bg-gray-200 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-300" },
}

export default function ChallengesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [joinUserId, setJoinUserId] = useState("")
  const [form, setForm] = useState({ name: "", description: "", metric: "steps", targetValue: "", challengeType: "individual", durationDays: "7" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: challengesResult, isLoading } = useQuery({
    queryKey: ["challenges", statusFilter],
    queryFn: () => challengesApi.list(statusFilter ? { status: statusFilter } : {}),
  })
  const challenges = challengesResult?.data ?? []

  const { data: leaderboardResult } = useQuery({
    queryKey: ["challenge-leaderboard", selectedChallenge],
    queryFn: () => challengesApi.leaderboard(selectedChallenge!),
    enabled: !!selectedChallenge,
  })
  const leaderboard = leaderboardResult?.data ?? []

  const createMut = useMutation({
    mutationFn: () => {
      const start = new Date()
      const end = new Date(start.getTime() + Number(form.durationDays) * 86400000)
      return challengesApi.create({
        name: form.name,
        description: form.description,
        metric: form.metric,
        targetValue: Number(form.targetValue),
        challengeType: form.challengeType,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenges"] })
      setShowCreate(false)
      setForm({ name: "", description: "", metric: "steps", targetValue: "", challengeType: "individual", durationDays: "7" })
    },
  })

  const joinMut = useMutation({
    mutationFn: ({ challengeId, userId }: { challengeId: string; userId: string }) =>
      challengesApi.join(challengeId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenges"] })
      queryClient.invalidateQueries({ queryKey: ["challenge-leaderboard"] })
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Challenges</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Compete with others and push yourself with timed fitness challenges.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          {showCreate ? "Cancel" : "New Challenge"}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="ch-status" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
        <select id="ch-status" className="w-full max-w-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Create */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Create Challenge</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input placeholder="Challenge name" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Description" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input placeholder="Metric (e.g. steps)" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} />
            <input placeholder="Target value" type="number" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} />
            <input placeholder="Duration (days)" type="number" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} />
            <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name || !form.targetValue} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {createMut.isPending ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Challenge list */}
        <div className="lg:col-span-2 space-y-4">
          {challenges.length === 0 && !isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">No challenges found.</p>}
          {challenges.map((c) => {
            const st = STATUS_STYLES[c.status] ?? { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400" }
            const daysLeft = Math.max(0, Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000))
            return (
              <div key={c.id} className={`rounded-xl border p-5 shadow-sm cursor-pointer transition-colors ${selectedChallenge === c.id ? "border-indigo-400 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20" : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"}`} onClick={() => setSelectedChallenge(c.id)}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{c.name}</h3>
                    {c.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.description}</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg} ${st.text}`}>{c.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center mt-3">
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{c.targetValue.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.metric} target</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{c.participantCount}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">participants</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{daysLeft}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">days left</p>
                  </div>
                </div>
                {c.status === "active" && (
                  <div className="mt-3 flex items-center gap-2">
                    <select className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs" value={joinUserId} onChange={(e) => setJoinUserId(e.target.value)} onClick={(e) => e.stopPropagation()}>
                      <option value="">Join as…</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
                    </select>
                    <button type="button" disabled={!joinUserId || joinMut.isPending} onClick={(e) => { e.stopPropagation(); joinMut.mutate({ challengeId: c.id, userId: joinUserId }) }} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                      {joinMut.isPending ? "Joining…" : "Join"}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Leaderboard */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm h-fit">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Leaderboard</h3>
          {!selectedChallenge && <p className="text-xs text-gray-500 dark:text-gray-400">Select a challenge to view leaderboard.</p>}
          {selectedChallenge && leaderboard.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">No participants yet.</p>}
          {leaderboard.map((e) => (
            <div key={e.userId} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${e.rank <= 3 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>{e.rank}</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">{e.userName ?? "User"}</span>
              </div>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{e.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
