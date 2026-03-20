"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type JournalEntry, type JournalStats, journalApi, usersApi } from "../../../lib/api"

const MOOD_EMOJI: Record<number, string> = { 1: "😢", 2: "😟", 3: "😐", 4: "🙂", 5: "😄" }
const MOOD_COLORS: Record<number, string> = {
  1: "from-red-500 to-red-600",
  2: "from-orange-400 to-orange-500",
  3: "from-yellow-400 to-yellow-500",
  4: "from-emerald-400 to-emerald-500",
  5: "from-emerald-500 to-teal-500",
}
const MOOD_GLOW: Record<number, string> = {
  1: "shadow-red-500/20",
  2: "shadow-orange-400/20",
  3: "shadow-yellow-400/20",
  4: "shadow-emerald-400/20",
  5: "shadow-emerald-500/20",
}
const MOOD_LABELS = ["happy", "calm", "anxious", "sad", "energized", "tired", "grateful", "reflective"]
const LABEL_EMOJI: Record<string, string> = {
  happy: "😊", calm: "😌", anxious: "😰", sad: "😔",
  energized: "⚡", tired: "😴", grateful: "🙏", reflective: "🪞",
}

function MoodRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const pct = (score / 5) * 100
  const offset = c - (pct / 100) * c
  const color = score >= 4 ? "#10b981" : score >= 3 ? "#eab308" : "#ef4444"
  return (
    <svg width={size} height={size} className="drop-shadow-lg">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-800" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round" className="transition-all duration-1000 ease-out -rotate-90 origin-center" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-gray-900 dark:fill-gray-100 text-lg font-bold">
        {MOOD_EMOJI[Math.round(score)]}
      </text>
    </svg>
  )
}

function StreakFlame({ count }: { count: number }) {
  return (
    <div className="relative flex items-center gap-1.5">
      <span className="text-2xl animate-float">🔥</span>
      <div>
        <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">{count}</span>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">day streak</p>
      </div>
    </div>
  )
}

function MoodDistChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const max = Math.max(...entries.map(([, v]) => v), 1)
  const colors = ["bg-purple-500", "bg-indigo-500", "bg-blue-500", "bg-teal-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-pink-500"]
  return (
    <div className="space-y-2">
      {entries.map(([label, count], i) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-sm w-6">{LABEL_EMOJI[label] ?? "😶"}</span>
          <span className="text-xs text-gray-600 dark:text-gray-400 w-16 truncate capitalize">{label}</span>
          <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`}
              style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 w-6 text-right">{count}</span>
        </div>
      ))}
    </div>
  )
}

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

  const moodVal = Number(form.moodScore)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-down">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Daily Journal</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Reflect, grow, and discover patterns in your wellness journey.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)}
            className={`group relative overflow-hidden rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 ${
              showCreate
                ? "bg-gray-500 hover:bg-gray-600"
                : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
            }`}>
            {showCreate ? "Cancel" : "✍️ New Entry"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
        <label htmlFor="journal-user" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">User</label>
        <select id="journal-user" className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <span className="text-6xl mb-4 animate-float">📔</span>
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a user to view journal entries.</p>
        </div>
      )}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50/80 to-purple-50/50 dark:from-indigo-950/40 dark:to-purple-950/20 backdrop-blur-xl p-6 shadow-lg shadow-indigo-500/5 animate-fade-in-up">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm shadow-lg shadow-indigo-500/30">📝</span>
            New Journal Entry
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Title (optional)</label>
              <input placeholder="Today's reflection..." className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/40 transition-all" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Journal Entry *</label>
              <textarea rows={5} placeholder="Write about your day, thoughts, experiences…" className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm leading-relaxed focus:ring-2 focus:ring-indigo-500/40 transition-all resize-none" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 p-4 text-center">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Mood</label>
                <input type="range" min="1" max="5" className="w-full accent-indigo-500" value={form.moodScore} onChange={(e) => setForm({ ...form, moodScore: e.target.value })} />
                <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${MOOD_COLORS[moodVal]} px-3 py-1 text-white shadow-md ${MOOD_GLOW[moodVal]}`}>
                  <span className="text-lg">{MOOD_EMOJI[moodVal]}</span>
                  <span className="text-xs font-semibold">{moodVal}/5</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Feeling</label>
                <select className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" value={form.moodLabel} onChange={(e) => setForm({ ...form, moodLabel: e.target.value })}>
                  {MOOD_LABELS.map((m) => <option key={m} value={m}>{LABEL_EMOJI[m]} {m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Tags</label>
                <input placeholder="health, work, travel" className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">🙏 Gratitude</label>
                <textarea rows={2} placeholder={"Good sleep\nFamily time"} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm resize-none" value={form.gratitude} onChange={(e) => setForm({ ...form, gratitude: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.body.trim()}
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5">
                {createMut.isPending ? "Saving…" : "Save Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      {selectedUserId && stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-grid">
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 text-center">
            <p className="text-4xl font-bold tracking-tight bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">{stats.totalEntries}</p>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mt-1">Entries (30d)</p>
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 flex items-center justify-center">
            <MoodRing score={stats.avgMoodScore} />
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 flex items-center justify-center">
            <StreakFlame count={stats.streak} />
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300">
            {Object.keys(stats.moodDistribution).length > 0
              ? <MoodDistChart data={stats.moodDistribution} />
              : (
                <div className="text-center">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-2">Top Tags</p>
                  <div className="flex flex-wrap justify-center gap-1">
                    {stats.topTags.length > 0
                      ? stats.topTags.map((tag) => (
                          <span key={tag} className="rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-400">{tag}</span>
                        ))
                      : <span className="text-xs text-gray-400">No tags yet</span>}
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {/* Search bar */}
      {selectedUserId && (
        <div className="relative animate-fade-in">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <input placeholder="Search journal entries…" className="w-full max-w-lg rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl pl-11 pr-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all shadow-card" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {/* Entries list */}
      {selectedUserId && isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      )}
      {selectedUserId && !isLoading && (
        <div className="space-y-3 stagger-list">
          {entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
              <span className="text-5xl mb-3 animate-float">✨</span>
              <p className="text-sm text-gray-500 dark:text-gray-400">No journal entries yet. Start writing!</p>
            </div>
          )}
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id
            const mScore = entry.moodScore ?? 3
            return (
              <div key={entry.id}
                className={`group rounded-2xl border bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-card hover:shadow-card-hover transition-all duration-300 overflow-hidden ${
                  isExpanded ? "border-indigo-300 dark:border-indigo-700" : "border-gray-200/60 dark:border-gray-800/60"
                }`}>
                <div className="flex items-start gap-4 p-5">
                  {/* Mood indicator */}
                  <div className={`shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br ${MOOD_COLORS[mScore]} flex items-center justify-center text-lg text-white shadow-md ${MOOD_GLOW[mScore]} transition-transform duration-200 group-hover:scale-110`}>
                    {MOOD_EMOJI[mScore]}
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {new Date(entry.entryDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      {entry.moodLabel && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-purple-100/80 dark:bg-purple-900/30 px-2 py-0.5 text-purple-600 dark:text-purple-400">
                          {LABEL_EMOJI[entry.moodLabel]} {entry.moodLabel}
                        </span>
                      )}
                    </div>
                    {entry.title && <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug">{entry.title}</h3>}
                    <p className={`text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>{entry.body}</p>
                  </div>
                  <button type="button" onClick={() => deleteMut.mutate(entry.id)}
                    className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all" title="Delete">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-0 border-t border-gray-100 dark:border-gray-800 mt-0 animate-fade-in">
                    <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {entry.gratitude && (entry.gratitude as string[]).length > 0 && (
                        <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/50 dark:border-amber-800/30 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">🙏 Gratitude</p>
                          <ul className="space-y-1">
                            {(entry.gratitude as string[]).map((g, i) => (
                              <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                                <span className="text-amber-400 mt-0.5">•</span> {g}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {entry.tags && (entry.tags as string[]).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 content-start">
                          {(entry.tags as string[]).map((tag) => (
                            <span key={tag} className="rounded-full bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 border border-blue-200/50 dark:border-blue-700/30 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-400">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
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
