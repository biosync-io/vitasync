"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { type AchievementData, type AchievementDefData, achievementsApi, usersApi } from "../../../lib/api"

const TIER_STYLES: Record<string, string> = {
  bronze: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400",
  silver: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  gold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400",
  platinum: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-400",
  diamond: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400",
}

export default function AchievementsPage() {
  const [selectedUserId, setSelectedUserId] = useState("")
  const [tab, setTab] = useState<"unlocked" | "catalog">("unlocked")
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: achievementsResult, isLoading } = useQuery({
    queryKey: ["achievements", selectedUserId],
    queryFn: () => achievementsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })
  const achievements = achievementsResult?.data ?? []

  const { data: defsResult } = useQuery({
    queryKey: ["achievement-definitions"],
    queryFn: () => achievementsApi.definitions(),
  })
  const definitions = defsResult?.data ?? []

  const checkMut = useMutation({
    mutationFn: () => achievementsApi.check(selectedUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["achievements", selectedUserId] }),
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Achievements</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Unlock badges and milestones as you hit health targets.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => checkMut.mutate()} disabled={checkMut.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {checkMut.isPending ? "Checking…" : "Check Achievements"}
          </button>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label htmlFor="ach-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
            <select id="ach-user" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
            </select>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => setTab("unlocked")} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === "unlocked" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>Unlocked</button>
            <button type="button" onClick={() => setTab("catalog")} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === "catalog" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>Catalog</button>
          </div>
        </div>
      </div>

      {tab === "unlocked" && !selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view their achievements.</p>}
      {tab === "unlocked" && selectedUserId && isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>}

      {tab === "unlocked" && selectedUserId && !isLoading && (
        <div>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{achievements.length} achievement{achievements.length !== 1 ? "s" : ""} unlocked</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.length === 0 && <p className="col-span-full text-center text-sm text-gray-500 dark:text-gray-400 py-8">No achievements unlocked yet.</p>}
            {achievements.map((a) => (
              <div key={a.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
                <div className="text-4xl mb-2">{a.icon || "🏆"}</div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{a.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{a.description}</p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLES[a.tier] ?? "bg-gray-100 text-gray-600"}`}>{a.tier}</span>
                  <span className="text-xs text-gray-400">{a.category}</span>
                </div>
                <p className="mt-2 text-xs text-gray-400">{new Date(a.unlockedAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "catalog" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {definitions.length === 0 && <p className="col-span-full text-center text-sm text-gray-500 dark:text-gray-400 py-8">No achievement definitions found.</p>}
          {definitions.map((d) => {
            const unlocked = achievements.find((a) => a.achievementId === d.id)
            return (
              <div key={d.id} className={`rounded-xl border p-5 shadow-sm text-center ${unlocked ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20" : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 opacity-60"}`}>
                <div className="text-4xl mb-2">{unlocked ? d.icon : "🔒"}</div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{d.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{d.description}</p>
                <span className={`mt-3 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLES[d.tier] ?? "bg-gray-100 text-gray-600"}`}>{d.tier}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
