"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import {
  type SmartReminderData,
  type GoalData,
  type ReminderSuggestion,
  remindersApi,
  goalsApi,
  usersApi,
  notificationsApi,
} from "../../../lib/api"

const FREQ_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
}

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  goal: { label: "Goal", emoji: "🎯" },
  habit: { label: "Habit", emoji: "✅" },
  custom: { label: "Custom", emoji: "⏰" },
  suggestion: { label: "Suggestion", emoji: "💡" },
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const SNOOZE_OPTIONS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "3 hours", value: 180 },
  { label: "Tomorrow", value: 1440 },
]

export default function RemindersPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [activeTab, setActiveTab] = useState<"reminders" | "suggestions" | "logs">("reminders")
  const [form, setForm] = useState({
    name: "",
    description: "",
    reminderType: "custom",
    frequency: "daily",
    timeOfDay: "09:00",
    dayOfWeek: 1,
    dayOfMonth: 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    goalId: "",
    channelIds: [] as string[],
  })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: remindersResult, isLoading } = useQuery({
    queryKey: ["reminders", selectedUserId],
    queryFn: () => remindersApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })
  const reminders = remindersResult?.data ?? []

  const { data: goalsResult } = useQuery({
    queryKey: ["goals", selectedUserId],
    queryFn: () => goalsApi.list(selectedUserId, { status: "active" }),
    enabled: !!selectedUserId,
  })
  const availableGoals = goalsResult?.data ?? []

  const { data: channelsResult } = useQuery({
    queryKey: ["notification-channels", selectedUserId],
    queryFn: () => notificationsApi.listChannels(selectedUserId),
    enabled: !!selectedUserId,
  })
  const channels = channelsResult?.data ?? []

  const { data: suggestionsResult } = useQuery({
    queryKey: ["reminder-suggestions", selectedUserId],
    queryFn: () => remindersApi.suggestions(selectedUserId),
    enabled: !!selectedUserId && activeTab === "suggestions",
  })
  const suggestions = suggestionsResult?.data ?? []

  const { data: logsResult } = useQuery({
    queryKey: ["reminder-logs", selectedUserId],
    queryFn: () => remindersApi.logs(selectedUserId, { limit: 50 }),
    enabled: !!selectedUserId && activeTab === "logs",
  })
  const logs = logsResult?.data ?? []

  const createMut = useMutation({
    mutationFn: () =>
      remindersApi.create(selectedUserId, {
        name: form.name,
        description: form.description || undefined,
        reminderType: form.reminderType,
        frequency: form.frequency,
        timeOfDay: form.timeOfDay,
        ...(form.frequency === "weekly" ? { dayOfWeek: form.dayOfWeek } : {}),
        ...(form.frequency === "monthly" ? { dayOfMonth: form.dayOfMonth } : {}),
        timezone: form.timezone,
        goalId: form.goalId || undefined,
        channelIds: form.channelIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders", selectedUserId] })
      setShowCreate(false)
      setForm({ name: "", description: "", reminderType: "custom", frequency: "daily", timeOfDay: "09:00", dayOfWeek: 1, dayOfMonth: 1, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, goalId: "", channelIds: [] })
    },
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      remindersApi.update(selectedUserId, id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders", selectedUserId] }),
  })

  const snoozeMut = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      remindersApi.snooze(selectedUserId, id, minutes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders", selectedUserId] }),
  })

  const dismissMut = useMutation({
    mutationFn: (id: string) => remindersApi.dismiss(selectedUserId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders", selectedUserId] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => remindersApi.delete(selectedUserId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders", selectedUserId] }),
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Smart Reminders</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure smart reminders to stay on track with your health goals.
          </p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showCreate ? "Cancel" : "New Reminder"}
          </button>
        )}
      </div>

      {/* User selector */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="r-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
            <select id="r-user" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            {(["reminders", "suggestions", "logs"] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === tab ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                {tab === "reminders" ? "⏰ Reminders" : tab === "suggestions" ? "💡 Suggestions" : "📋 Logs"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Create Reminder</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input placeholder="Reminder name" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Description (optional)" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <select className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={form.reminderType} onChange={(e) => setForm({ ...form, reminderType: e.target.value })}>
              <option value="custom">Custom</option>
              <option value="goal">Goal</option>
              <option value="habit">Habit</option>
            </select>
            <select className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <input type="time" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} />
            {form.frequency === "weekly" && (
              <select className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            )}
            {form.frequency === "monthly" && (
              <input type="number" min={1} max={28} placeholder="Day of month" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: Number(e.target.value) })} />
            )}
            {form.reminderType === "goal" && (
              <select className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={form.goalId} onChange={(e) => setForm({ ...form, goalId: e.target.value })}>
                <option value="">Link to a goal…</option>
                {availableGoals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            {channels.length > 0 && (
              <div className="col-span-full">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Channels (in-app is always on)</label>
                <div className="flex flex-wrap gap-2">
                  {channels.map((ch) => (
                    <label key={ch.id} className="inline-flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300">
                      <input type="checkbox" checked={form.channelIds.includes(ch.id)} onChange={(e) => {
                        setForm({
                          ...form,
                          channelIds: e.target.checked
                            ? [...form.channelIds, ch.id]
                            : form.channelIds.filter((id) => id !== ch.id),
                        })
                      }} />
                      {ch.label} ({ch.channelType})
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {createMut.isPending ? "Creating…" : "Create Reminder"}
          </button>
        </div>
      )}

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to manage their reminders.</p>}
      {selectedUserId && isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>}

      {/* Reminders tab */}
      {selectedUserId && !isLoading && activeTab === "reminders" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reminders.length === 0 && <p className="col-span-full text-center text-sm text-gray-500 dark:text-gray-400 py-8">No reminders configured. Create one to get started!</p>}
          {reminders.map((r) => {
            const typeInfo = TYPE_LABELS[r.reminderType] ?? { label: "Custom", emoji: "⏰" }
            const isSnoozed = r.snoozedUntil && new Date(r.snoozedUntil) > new Date()
            return (
              <div key={r.id} className={`rounded-xl border ${r.isActive ? "border-gray-200 dark:border-gray-800" : "border-gray-300 dark:border-gray-700 opacity-60"} bg-white dark:bg-gray-900 p-5 shadow-sm`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {typeInfo.emoji} {r.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {FREQ_LABELS[r.frequency] ?? r.frequency} at {r.timeOfDay}
                      {r.frequency === "weekly" && r.dayOfWeek != null && ` · ${DAYS[r.dayOfWeek]}`}
                      {r.frequency === "monthly" && r.dayOfMonth != null && ` · Day ${r.dayOfMonth}`}
                    </p>
                    {r.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{r.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {isSnoozed && <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Snoozed</span>}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.isActive ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}>
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                {r.nextTriggerAt && r.isActive && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Next: {new Date(r.nextTriggerAt).toLocaleString()}
                  </p>
                )}
                {r.lastTriggeredAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Last sent: {new Date(r.lastTriggeredAt).toLocaleString()}
                  </p>
                )}
                {r.channelIds.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    📢 {r.channelIds.length} external channel(s) + in-app
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => toggleMut.mutate({ id: r.id, isActive: !r.isActive })} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                    {r.isActive ? "Pause" : "Resume"}
                  </button>
                  {r.isActive && (
                    <div className="relative group">
                      <button type="button" className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Snooze ▾</button>
                      <div className="hidden group-hover:block absolute left-0 top-full mt-1 z-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 min-w-[120px]">
                        {SNOOZE_OPTIONS.map((opt) => (
                          <button key={opt.value} type="button" onClick={() => snoozeMut.mutate({ id: r.id, minutes: opt.value })} className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => dismissMut.mutate(r.id)} className="text-xs text-orange-600 dark:text-orange-400 hover:underline">Dismiss</button>
                  <button type="button" onClick={() => { if (confirm("Delete this reminder?")) deleteMut.mutate(r.id) }} className="text-xs text-red-600 dark:text-red-400 hover:underline">Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Suggestions tab */}
      {selectedUserId && activeTab === "suggestions" && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">💡 Suggested Reminders</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Goals you may have forgotten about or need to prioritize.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.length === 0 && <p className="col-span-full text-center text-sm text-gray-500 dark:text-gray-400 py-8">No suggestions right now — you're on top of things! 🎉</p>}
            {suggestions.map((s) => (
              <div key={s.goalId} className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">🎯 {s.goalName}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Progress: {s.percentComplete}%
                  {s.lastActivity && ` · Last activity: ${new Date(s.lastActivity).toLocaleDateString()}`}
                </p>
                <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 mt-2">
                  <div className="h-2 rounded-full bg-amber-500" style={{ width: `${s.percentComplete}%` }} />
                </div>
                <button type="button" onClick={() => {
                  setForm({ ...form, name: `${s.goalName} Reminder`, reminderType: "goal", goalId: s.goalId })
                  setShowCreate(true)
                  setActiveTab("reminders")
                }} className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                  Create Reminder →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs tab */}
      {selectedUserId && activeTab === "logs" && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">📋 Reminder History</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Log of sent, snoozed, and dismissed reminders.</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {logs.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No reminder activity yet.</td></tr>
                )}
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        l.action === "sent" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400" :
                        l.action === "snoozed" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400" :
                        l.action === "dismissed" ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400" :
                        "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                      }`}>{l.action}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {l.snoozeDuration && `Snoozed for ${l.snoozeDuration} min`}
                      {l.progressSnapshot && ` · ${(l.progressSnapshot as any).goalName ?? ""} (${(l.progressSnapshot as any).percentComplete ?? 0}%)`}
                      {l.feedback && ` · ${l.feedback}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
