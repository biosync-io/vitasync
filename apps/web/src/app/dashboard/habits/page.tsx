"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type HabitData, type HabitsSummary, habitsApi} from "../../../lib/api"
import { Card, CardHeader, CardContent, CardFooter, PageHeader, Badge, StatCard, Button, EmptyState, CardSkeleton, StatSkeleton, MetricBar, MetricRing, Toggle, Input, Select } from "../../../lib/components/ui"
import { Target, X } from "lucide-react"

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

export default function HabitsPage() {
  const { selectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: "", icon: "✅", color: "blue" })
  const queryClient = useQueryClient()


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
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Daily Habits"
        subtitle="Build consistency, track streaks, level up your routine."
        actions={
          selectedUserId ? (
            <Button
              variant={showCreate ? "secondary" : "primary"}
              onClick={() => setShowCreate(!showCreate)}
            >
              {showCreate ? "Cancel" : "+ New Habit"}
            </Button>
          ) : undefined
        }
      />

      {/* User select */}
      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <span className="text-6xl mb-4 animate-float">🎯</span>
        </div>
      )}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <Card glow="vitality">
          <CardHeader title="New Habit" />
          <CardContent>
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
              <Button variant="primary" onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.name.trim()}>
                Create Habit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      {selectedUserId && summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Completed Today" value={summary.completedToday + "/" + summary.totalHabits} color="vitality" />
            <Card>
              <CardContent className="flex items-center justify-center">
                <MetricRing value={summary.completionRate} label="Completion Rate" color="brand" />
              </CardContent>
            </Card>
            <StatCard label="Best Active Streak" value={bestStreak + " days"} icon={<span className="text-xl">🔥</span>} />
          </div>

          {/* Habits checklist */}
          <Card>
            <CardHeader title="Today's Habits" action={<span className="text-xs text-gray-400">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>} />
            {summary.habits.length === 0 && (
              <EmptyState icon={Target} title="No habits yet" description="Plant your first seed above!" />
            )}
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
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
                            <Badge variant="warning" size="sm">🔥 {habit.currentStreak}d streak</Badge>
                          )}
                          {habit.longestStreak > 0 && habit.longestStreak > habit.currentStreak && (
                            <Badge variant="default" size="sm">🏆 Best: {habit.longestStreak}d</Badge>
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
                      <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(habit.id)} className="shrink-0 opacity-0 group-hover:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {selectedUserId && isLoading && (
        <StatSkeleton count={3} />
      )}
    </div>
  )
}
