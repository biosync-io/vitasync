"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type HabitData, type HabitsSummary, habitsApi, usersApi } from "../../../lib/api"

const COLORS: Record<string, { bg: string; ring: string; glow: string }> = {
  blue:   { bg: "from-blue-500 to-blue-600",     ring: "ring-blue-500/30",    glow: "shadow-blue-500/20" },
  green:  { bg: "from-emerald-500 to-emerald-600", ring: "ring-emerald-500/30", glow: "shadow-emerald-500/20" },
  red:    { bg: "from-red-500 to-red-600",       ring: "ring-red-500/30",     glow: "shadow-red-500/20" },
  purple: { bg: "from-purple-500 to-purple-600", ring: "ring-purple-500/30",  glow: "shadow-purple-500/20" },
  orange: { bg: "from-orange-500 to-orange-600", ring: "ring-orange-500/30",  glow: "shadow-orange-500/20" },
  pink:   { bg: "from-pink-500 to-pink-600",     ring: "ring-pink-500/30",    glow: "shadow-pink-500/20" },
  yellow: { bg: "from-yellow-400 to-yellow-500",  ring: "ring-yellow-400/30",  glow: "shadow-yellow-400/20" },
  cyan:   { bg: "from-cyan-400 to-cyan-500",      ring: "ring-cyan-400/30",    glow: "shadow-cyan-400/20" },
}

const HABIT_PRESETS = [
  { name: "Meditate", icon: "🧘", color: "purple" },
  { name: "Exercise", icon: "🏃", color: "green" },
  { name: "Read", icon: "📚", color: "blue" },
  { name: "Sleep 8h", icon: "😴", color: "purple" },
  { name: "No sugar", icon: "🚫", color: "red" },
  { name: "Walk 10k steps", icon: "👣", color: "orange" },
  { name: "Journal", icon: "📝", color: "cyan" },
  { name: "Stretch", icon: "🤸", color: "pink" },
  { name: "Drink 2L water", icon: "💧", color: "blue" },
  { name: "No phone before bed", icon: "📵", color: "yellow" },
]

function CompletionRing({ rate, size = 88 }: { rate: number; size?: number }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const offset = c - (rate / 100) * c
  const color = rate >= 80 ? "#10b981" : rate >= 50 ? "#3b82f6" : rate >= 25 ? "#eab308" : "#ef4444"
  return (
    <div className="relative">
      <svg width={size} height={size} className="drop-shadow-lg">
        <defs>
          <linearGradient id="habitRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-100 dark:text-gray-800" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#habitRing)" strokeWidth="7"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out -rotate-90 origin-center" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{rate}%</span>
        <span className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">complete</span>
      </div>
    </div>
  )
}

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

  const createMut = useMutation({
    mutationFn: () => habitsApi.create(selectedUserId, { name: form.name, icon: form.icon, color: form.color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits-summary", selectedUserId] })
      setShowCreate(false)
      setForm({ name: "", icon: "✅", color: "blue" })
    },
  })

  const completeMut = useMutation({
    mutationFn: (habitId: string) => habitsApi.complete(selectedUserId, habitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits-summary", selectedUserId] })
    },
  })

  const uncompleteMut = useMutation({
    mutationFn: (habitId: string) => habitsApi.uncomplete(selectedUserId, habitId, new Date().toISOString().slice(0, 10)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits-summary", selectedUserId] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (habitId: string) => habitsApi.delete(selectedUserId, habitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits-summary", selectedUserId] })
    },
  })

  const bestStreak = summary ? Math.max(...(summary.habits.map((h) => h.currentStreak) || [0]), 0) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-down">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Daily Habits</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Build consistency, track streaks, level up your routine.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)}
            className={`group relative overflow-hidden rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 ${
              showCreate
                ? "bg-gray-500 hover:bg-gray-600"
                : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
            }`}>
            {showCreate ? "Cancel" : "+ New Habit"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
        <label htmlFor="habits-user" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">User</label>
        <select id="habits-user" className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500/40 transition-all" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <span className="text-6xl mb-4 animate-float">🎯</span>
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a user to manage habits.</p>
        </div>
      )}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50/80 to-teal-50/50 dark:from-emerald-950/40 dark:to-teal-950/20 backdrop-blur-xl p-6 shadow-lg shadow-emerald-500/5 animate-fade-in-up">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm shadow-lg shadow-emerald-500/30">+</span>
            New Habit
          </h3>

          {/* Quick presets */}
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Popular habits</p>
            <div className="flex flex-wrap gap-2">
              {HABIT_PRESETS.map((preset) => (
                <button key={preset.name} type="button"
                  onClick={() => setForm({ name: preset.name, icon: preset.icon, color: preset.color })}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 ${
                    form.name === preset.name
                      ? `bg-gradient-to-r ${COLORS[preset.color]?.bg ?? "from-blue-500 to-blue-600"} text-white border-transparent shadow-md`
                      : "bg-white/80 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-emerald-300"
                  }`}>
                  {preset.icon} {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Habit Name</label>
              <input placeholder="e.g., Meditate 10min" className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/40 transition-all" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Icon</label>
              <input className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Color</label>
              <div className="flex gap-1.5">
                {Object.keys(COLORS).map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                    className={`h-8 w-8 rounded-lg bg-gradient-to-br ${COLORS[c]!.bg} transition-all ${
                      form.color === c ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 " + COLORS[c]!.ring + " scale-110" : "opacity-60 hover:opacity-100"
                    }`} title={c} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name.trim()}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/25 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5">
              {createMut.isPending ? "Creating…" : "Create Habit"}
            </button>
          </div>
        </div>
      )}

      {/* Summary stats */}
      {selectedUserId && summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-3 stagger-grid">
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 text-center">
              <div className="flex items-center justify-center gap-3">
                <span className="text-4xl font-bold tracking-tight bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">{summary.completedToday}</span>
                <span className="text-lg text-gray-300 dark:text-gray-600">/</span>
                <span className="text-2xl font-bold text-gray-400 dark:text-gray-500">{summary.totalHabits}</span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mt-1">Completed Today</p>
            </div>
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 flex items-center justify-center">
              <CompletionRing rate={summary.completionRate} />
            </div>
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 flex items-center justify-center">
              <div className="text-center">
                <span className="text-3xl animate-float inline-block">🔥</span>
                <p className="text-2xl font-bold tracking-tight bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent mt-1">{bestStreak} days</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">Best Active Streak</p>
              </div>
            </div>
          </div>

          {/* Habits checklist */}
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Today&apos;s Habits</h2>
              <span className="text-xs text-gray-400">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
            </div>
            {summary.habits.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                <span className="text-4xl mb-3">🌱</span>
                <p className="text-sm text-gray-500 dark:text-gray-400">No habits yet. Plant your first seed above!</p>
              </div>
            )}
            <div className="divide-y divide-gray-100 dark:divide-gray-800 stagger-list">
              {summary.habits.map((habit) => {
                return (
                  <div key={habit.id} className="group flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-all duration-200">
                    {/* Completion toggle */}
                    <button
                      type="button"
                      onClick={() => habit.completed ? uncompleteMut.mutate(habit.id) : completeMut.mutate(habit.id)}
                      className={`relative flex h-10 w-10 items-center justify-center rounded-xl border-2 text-lg transition-all duration-300 shrink-0 ${
                        habit.completed
                          ? "border-emerald-500 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-100"
                          : "border-gray-300 dark:border-gray-600 hover:border-emerald-400 hover:shadow-md text-transparent hover:text-emerald-300"
                      }`}
                    >
                      <svg className={`h-5 w-5 transition-all duration-300 ${habit.completed ? "opacity-100 scale-100" : "opacity-0 scale-75"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {habit.completed && (
                        <div className="absolute inset-0 rounded-xl animate-ping bg-emerald-400/20" style={{ animationDuration: "1.5s", animationIterationCount: "1" }} />
                      )}
                    </button>

                    {/* Icon */}
                    <span className={`text-2xl transition-transform duration-200 ${habit.completed ? "scale-90" : "group-hover:scale-110"}`}>{habit.icon}</span>

                    {/* Name + streak */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold transition-all duration-200 ${
                        habit.completed ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-900 dark:text-gray-100"
                      }`}>{habit.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {habit.currentStreak > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-500">
                            <span>🔥</span> {habit.currentStreak}d streak
                          </span>
                        )}
                        {habit.longestStreak > 0 && habit.longestStreak > habit.currentStreak && (
                          <span className="text-[11px] text-gray-400 font-medium">
                            🏆 Best: {habit.longestStreak}d
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Streak bar */}
                    {habit.longestStreak > 0 && (
                      <div className="hidden sm:flex items-center gap-1.5 shrink-0" title={`${habit.currentStreak} of ${habit.longestStreak} best`}>
                        <div className="w-20 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 transition-all duration-500"
                            style={{ width: `${Math.min(100, (habit.currentStreak / Math.max(habit.longestStreak, 1)) * 100)}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Delete */}
                    <button type="button" onClick={() => deleteMut.mutate(habit.id)}
                      className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all" title="Delete">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {selectedUserId && isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  )
}
