"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type HabitData, type HabitsSummary, habitsApi, usersApi } from "../../../lib/api"

const COLORS: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  yellow: "bg-yellow-500",
  cyan: "bg-cyan-500",
}

const HABIT_PRESETS = [
  { name: "Meditate", icon: "🧘" },
  { name: "Exercise", icon: "🏃" },
  { name: "Read", icon: "📚" },
  { name: "Sleep 8h", icon: "😴" },
  { name: "No sugar", icon: "🚫" },
  { name: "Walk 10k steps", icon: "👣" },
  { name: "Journal", icon: "📝" },
  { name: "Stretch", icon: "🤸" },
]

export default function HabitsPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: "", icon: "✅", color: "blue" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: summary, isLoading } = useQuery({
    queryKey: ["habits-summary", selectedUserId],
    queryFn: () => habitsApi.summary(selectedUserId),
    enabled: !!selectedUserId,
    refetchInterval: 5000,
  })

  const { data: allHabitsResult } = useQuery({
    queryKey: ["habits-list", selectedUserId],
    queryFn: () => habitsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })

  const createMut = useMutation({
    mutationFn: () => habitsApi.create(selectedUserId, { name: form.name, icon: form.icon, color: form.color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits-summary", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["habits-list", selectedUserId] })
      setShowCreate(false)
      setForm({ name: "", icon: "✅", color: "blue" })
    },
  })

  const completeMut = useMutation({
    mutationFn: (habitId: string) => habitsApi.complete(selectedUserId, habitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits-summary", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["habits-list", selectedUserId] })
    },
  })

  const uncompleteMut = useMutation({
    mutationFn: (habitId: string) => habitsApi.uncomplete(selectedUserId, habitId, new Date().toISOString().slice(0, 10)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits-summary", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["habits-list", selectedUserId] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (habitId: string) => habitsApi.delete(selectedUserId, habitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits-summary", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["habits-list", selectedUserId] })
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🎯 Daily Habits</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Build healthy routines and track your streaks.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showCreate ? "Cancel" : "+ New Habit"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="habits-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="habits-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to manage habits.</p>}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Create New Habit</h3>

          {/* Quick presets */}
          <div className="mb-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick start:</p>
            <div className="flex flex-wrap gap-2">
              {HABIT_PRESETS.map((preset) => (
                <button key={preset.name} type="button" onClick={() => setForm({ ...form, name: preset.name, icon: preset.icon })} className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-700">
                  {preset.icon} {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Habit Name</label>
              <input placeholder="e.g., Meditate" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Icon</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Color</label>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
                {Object.keys(COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name.trim()} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {createMut.isPending ? "Creating…" : "Create Habit"}
          </button>
        </div>
      )}

      {/* Daily summary */}
      {selectedUserId && summary && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{summary.completedToday}/{summary.totalHabits}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Completed Today</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
              <div className="relative mx-auto h-16 w-16">
                <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="text-emerald-500" strokeWidth="3" strokeDasharray={`${summary.completionRate} ${100 - summary.completionRate}`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900 dark:text-gray-100">{summary.completionRate}%</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Completion Rate</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
              <p className="text-3xl">🔥</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {Math.max(...(summary.habits.map((h) => h.currentStreak) || [0]))} days
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Best Active Streak</p>
            </div>
          </div>

          {/* Habits checklist */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Today&apos;s Habits</h2>
            </div>
            {summary.habits.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No habits yet. Create your first habit above!</p>
            )}
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {summary.habits.map((habit) => (
                <div key={habit.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <button
                    type="button"
                    onClick={() => habit.completed ? uncompleteMut.mutate(habit.id) : completeMut.mutate(habit.id)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border-2 text-lg transition-all ${
                      habit.completed
                        ? "border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25"
                        : "border-gray-300 dark:border-gray-600 hover:border-emerald-400 text-gray-300 hover:text-emerald-400"
                    }`}
                  >
                    {habit.completed ? "✓" : ""}
                  </button>
                  <span className="text-xl">{habit.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${habit.completed ? "text-gray-400 line-through" : "text-gray-900 dark:text-gray-100"}`}>{habit.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {habit.currentStreak > 0 && (
                        <span className="text-xs text-orange-500 font-medium">🔥 {habit.currentStreak}d streak</span>
                      )}
                      {habit.longestStreak > 0 && (
                        <span className="text-xs text-gray-400">Best: {habit.longestStreak}d</span>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={() => deleteMut.mutate(habit.id)} className="text-gray-400 hover:text-red-500 text-xs shrink-0" title="Delete habit">✕</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {selectedUserId && isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>}
    </div>
  )
}
