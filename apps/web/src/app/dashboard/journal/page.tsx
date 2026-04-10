"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type JournalEntry, type JournalStats, journalApi} from "../../../lib/api"
import { Card, CardHeader, CardContent, CardFooter, PageHeader, Badge, StatCard, Button, EmptyState, CardSkeleton, StatSkeleton, MetricBar, MetricRing, Toggle, Input, Select } from "../../../lib/components/ui"
import { BookOpen, Search, X } from "lucide-react"

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
  const { selectedUserId } = useSelectedUser()
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
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Journal"
        subtitle="Reflect, grow, and discover patterns in your wellness journey."
        actions={
          selectedUserId ? (
            <Button
              variant={showCreate ? "secondary" : "primary"}
              onClick={() => setShowCreate(!showCreate)}
            >
              {showCreate ? "Cancel" : "✍️ New Entry"}
            </Button>
          ) : undefined
        }
      />

      {/* Create form */}
      {showCreate && selectedUserId && (
        <Card glow="brand">
          <CardHeader title="New Journal Entry" icon={<span>📝</span>} />
          <CardContent>
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
                <Button variant="primary" onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!form.body.trim()}>
                  Save Entry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats cards */}
      {selectedUserId && stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Entries (30d)" value={stats.totalEntries} color="brand" />
          <Card>
            <CardContent className="flex items-center justify-center">
              <MoodRing score={stats.avgMoodScore} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-center">
              <StreakFlame count={stats.streak} />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              {Object.keys(stats.moodDistribution).length > 0
                ? <MoodDistChart data={stats.moodDistribution} />
                : (
                  <div className="text-center">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-2">Top Tags</p>
                    <div className="flex flex-wrap justify-center gap-1">
                      {stats.topTags.length > 0
                        ? stats.topTags.map((tag) => (
                            <Badge key={tag} variant="info">{tag}</Badge>
                          ))
                        : <span className="text-xs text-gray-400">No tags yet</span>}
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search bar */}
      {selectedUserId && (
        <Input
          icon={Search}
          placeholder="Search journal entries…"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className="max-w-lg"
        />
      )}

      {/* Loading */}
      {selectedUserId && isLoading && (
        <div className="space-y-8">
          <StatSkeleton count={4} />
          <CardSkeleton count={3} />
        </div>
      )}

      {/* Entries list */}
      {selectedUserId && !isLoading && (
        <div className="space-y-3">
          {entries.length === 0 && (
            <EmptyState icon={BookOpen} title="No journal entries yet" description="Start writing to track your wellness journey!" />
          )}
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id
            const mScore = entry.moodScore ?? 3
            return (
              <Card key={entry.id} hover>
                <div className="flex items-start gap-4 p-5">
                  {/* Mood indicator */}
                  <div className={`shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br ${MOOD_COLORS[mScore]} flex items-center justify-center text-lg text-white shadow-md ${MOOD_GLOW[mScore]} transition-transform duration-200 group-hover:scale-110`}>
                    {MOOD_EMOJI[mScore]}
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" role="button" tabIndex={0} aria-label={entry.title ? `Expand entry: ${entry.title}` : "Expand journal entry"} onClick={() => setExpandedId(isExpanded ? null : entry.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId(isExpanded ? null : entry.id) } }}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {new Date(entry.entryDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      {entry.moodLabel && (
                        <Badge variant="purple" size="sm">
                          {LABEL_EMOJI[entry.moodLabel]} {entry.moodLabel}
                        </Badge>
                      )}
                    </div>
                    {entry.title && <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug">{entry.title}</h3>}
                    <p className={`text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>{entry.body}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(entry.id)} className="shrink-0 opacity-0 group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </Button>
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
                            <Badge key={tag} variant="info">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
