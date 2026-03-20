"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type JournalEntry, type JournalStats, journalApi, usersApi } from "../../../lib/api"

const MOOD_EMOJI: Record<number, string> = { 1: "😢", 2: "😟", 3: "😐", 4: "🙂", 5: "😄" }
const MOOD_LABELS = ["happy", "calm", "anxious", "sad", "energized", "tired", "grateful", "reflective"]

export default function JournalPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: "",
    body: "",
    moodScore: "3",
    moodLabel: "calm",
    gratitude: "",
    tags: "",
  })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: entriesResult, isLoading } = useQuery({
    queryKey: ["journal-entries", selectedUserId, search],
    queryFn: () => journalApi.list(selectedUserId, { limit: 50, ...(search ? { search } : {}) }),
    enabled: !!selectedUserId,
  })
  const entries = entriesResult?.data ?? []

  const { data: stats } = useQuery({
    queryKey: ["journal-stats", selectedUserId],
    queryFn: () => journalApi.stats(selectedUserId),
    enabled: !!selectedUserId,
  })

  const createMut = useMutation({
    mutationFn: () =>
      journalApi.create(selectedUserId, {
        title: form.title || undefined,
        body: form.body,
        moodScore: Number(form.moodScore),
        moodLabel: form.moodLabel,
        gratitude: form.gratitude ? form.gratitude.split("\n").map((g) => g.trim()).filter(Boolean) : [],
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["journal-stats", selectedUserId] })
      setShowCreate(false)
      setForm({ title: "", body: "", moodScore: "3", moodLabel: "calm", gratitude: "", tags: "" })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (entryId: string) => journalApi.delete(selectedUserId, entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["journal-stats", selectedUserId] })
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Daily Journal</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Reflect on your day, track gratitude, and spot patterns in your wellness journey.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showCreate ? "Cancel" : "✍️ New Entry"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="journal-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="journal-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view journal entries.</p>}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">📝 New Journal Entry</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Title (optional)</label>
              <input placeholder="Today's reflection..." className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Journal Entry *</label>
              <textarea rows={5} placeholder="Write about your day, thoughts, experiences..." className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Mood (1-5)</label>
                <input type="range" min="1" max="5" className="w-full" value={form.moodScore} onChange={(e) => setForm({ ...form, moodScore: e.target.value })} />
                <div className="text-center text-lg">{MOOD_EMOJI[Number(form.moodScore)]}</div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Mood Label</label>
                <select className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.moodLabel} onChange={(e) => setForm({ ...form, moodLabel: e.target.value })}>
                  {MOOD_LABELS.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Tags (comma-sep)</label>
                <input placeholder="health, work, travel" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Gratitude (one per line)</label>
                <textarea rows={2} placeholder={"Good sleep\nFamily time"} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.gratitude} onChange={(e) => setForm({ ...form, gratitude: e.target.value })} />
              </div>
            </div>
            <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.body.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {createMut.isPending ? "Saving…" : "Save Entry"}
            </button>
          </div>
        </div>
      )}

      {/* Stats cards */}
      {selectedUserId && stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats.totalEntries}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Entries (30d)</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
            <p className="text-3xl">{MOOD_EMOJI[Math.round(stats.avgMoodScore)] ?? "😐"}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.avgMoodScore.toFixed(1)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg Mood</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm text-center">
            <p className="text-3xl">🔥</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.streak} days</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Writing Streak</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Top Tags</p>
            <div className="flex flex-wrap gap-1">
              {stats.topTags.length > 0
                ? stats.topTags.map((tag) => (
                    <span key={tag} className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-xs text-indigo-700 dark:text-indigo-400">{tag}</span>
                  ))
                : <span className="text-xs text-gray-400">No tags yet</span>}
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      {selectedUserId && (
        <div className="mb-4">
          <input placeholder="🔍 Search journal entries..." className="w-full max-w-md rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm text-gray-900 dark:text-gray-100" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {/* Entries list */}
      {selectedUserId && isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>}
      {selectedUserId && !isLoading && (
        <div className="space-y-4">
          {entries.length === 0 && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">No journal entries yet. Start writing!</p>
          )}
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id
            return (
              <div key={entry.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm text-gray-500 dark:text-gray-400">{new Date(entry.entryDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                      {entry.moodScore && <span className="text-lg">{MOOD_EMOJI[entry.moodScore]}</span>}
                      {entry.moodLabel && <span className="text-xs rounded-full bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 text-purple-700 dark:text-purple-400">{entry.moodLabel}</span>}
                    </div>
                    {entry.title && <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{entry.title}</h3>}
                    <p className={`text-sm text-gray-600 dark:text-gray-400 mt-1 ${isExpanded ? "" : "line-clamp-2"}`}>{entry.body}</p>
                  </div>
                  <button type="button" onClick={() => deleteMut.mutate(entry.id)} className="ml-3 text-gray-400 hover:text-red-500 text-sm shrink-0" title="Delete">✕</button>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    {entry.gratitude && (entry.gratitude as string[]).length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">🙏 Gratitude</p>
                        <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
                          {(entry.gratitude as string[]).map((g, i) => <li key={i}>{g}</li>)}
                        </ul>
                      </div>
                    )}
                    {entry.tags && (entry.tags as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(entry.tags as string[]).map((tag) => (
                          <span key={tag} className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-400">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
