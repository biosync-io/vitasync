"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { type GoalData, goalsApi, usersApi } from "../../../lib/api"

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400" },
  completed: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400" },
  failed: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-400" },
  paused: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400" },
}

export default function GoalsPage() {
  const [selectedUserId, setSelectedUserId] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: "", metric: "steps", targetValue: "", unit: "steps", goalType: "daily" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: goalsResult, isLoading } = useQuery({
    queryKey: ["goals", selectedUserId, statusFilter],
    queryFn: () => goalsApi.list(selectedUserId, { status: statusFilter || undefined }),
    enabled: !!selectedUserId,
  })
  const goals = goalsResult?.data ?? []

  const createMut = useMutation({
    mutationFn: () =>
      goalsApi.create(selectedUserId, { ...form, targetValue: Number(form.targetValue) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", selectedUserId] })
      setShowCreate(false)
      setForm({ name: "", metric: "steps", targetValue: "", unit: "steps", goalType: "daily" })
    },
  })

  const evaluateMut = useMutation({
    mutationFn: (goalId: string) => goalsApi.evaluate(selectedUserId, goalId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals", selectedUserId] }),
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Goals</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Set targets, track progress, and build streaks.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showCreate ? "Cancel" : "New Goal"}
          </button>
        )}
      </div>

      {/* User & filter */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="g-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
            <select id="g-user" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="g-status" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select id="g-status" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="paused">Paused</option>
            </select>
          </div>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Create Goal</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input placeholder="Goal name" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Metric (e.g. steps)" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} />
            <input placeholder="Target value" type="number" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} />
            <select className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.goalType} onChange={(e) => setForm({ ...form, goalType: e.target.value })}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="cumulative">Cumulative</option>
            </select>
            <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name || !form.targetValue} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {createMut.isPending ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view their goals.</p>}
      {selectedUserId && isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>}

      {selectedUserId && !isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.length === 0 && <p className="col-span-full text-center text-sm text-gray-500 dark:text-gray-400 py-8">No goals found.</p>}
          {goals.map((g) => {
            const pct = g.targetValue > 0 ? Math.min(100, Math.round(((g.currentValue ?? 0) / g.targetValue) * 100)) : 0
            const st = STATUS_STYLES[g.status] ?? STATUS_STYLES.active
            return (
              <div key={g.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{g.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{g.metric} · {g.goalType}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg} ${st.text}`}>{g.status}</span>
                </div>
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <span>{g.currentValue ?? 0} / {g.targetValue} {g.unit}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <div className={`h-2 rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {g.streak > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">🔥 {g.streak} day streak</p>}
                {g.status === "active" && (
                  <button type="button" onClick={() => evaluateMut.mutate(g.id)} className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                    Evaluate Progress →
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
