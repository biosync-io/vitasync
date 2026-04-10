"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { type ChallengeData, type LeaderboardEntry, challengesApi } from "../../../lib/api"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { PageHeader, Badge, Card, CardHeader, CardContent, Button, EmptyState, CardSkeleton, Select, Input } from "../../../lib/components/ui"

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400" },
  upcoming: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400" },
  completed: { bg: "bg-gray-200 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-300" },
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  active: "success",
  upcoming: "info",
  completed: "default",
}

export default function ChallengesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", metric: "steps", targetValue: "", challengeType: "individual", durationDays: "7" })
  const { selectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()

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
        title: form.name,
        description: form.description,
        metricType: form.metric,
        goalValue: Number(form.targetValue),
        startDate: start.toISOString(),
        endDate: end.toISOString(),
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
    <div className="space-y-8">
      <PageHeader
        title="Challenges"
        subtitle="Compete with others and push yourself with timed fitness challenges."
        actions={<Button onClick={() => setShowCreate(!showCreate)}>{showCreate ? "Cancel" : "New Challenge"}</Button>}
      />

      <Card>
        <CardContent>
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "", label: "All" },
              { value: "active", label: "Active" },
              { value: "upcoming", label: "Upcoming" },
              { value: "completed", label: "Completed" },
            ]}
            className="w-full max-w-xs"
          />
        </CardContent>
      </Card>

      {showCreate && (
        <Card>
          <CardHeader title="Create Challenge" />
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input placeholder="Challenge name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input placeholder="Metric (e.g. steps)" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} />
              <Input placeholder="Target value" type="number" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} />
              <Input placeholder="Duration (days)" type="number" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} />
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name || !form.targetValue} loading={createMut.isPending}>
                Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && <CardSkeleton count={3} />}

      {!isLoading && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {challenges.length === 0 && (
              <EmptyState title="No challenges found" description="Create one to get started." />
            )}
            {challenges.map((c) => {
              const daysLeft = Math.max(0, Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000))
              return (
                <Card key={c.id} hover className={selectedChallenge === c.id ? "border-indigo-400 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20" : ""}>
                  <CardContent>
                    <div role="button" tabIndex={0} aria-label={`Select challenge: ${c.name}`} className="cursor-pointer" onClick={() => setSelectedChallenge(c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedChallenge(c.id) } }}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{c.name}</h3>
                          {c.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.description}</p>}
                        </div>
                        <Badge variant={STATUS_BADGE_VARIANT[c.status] ?? "default"}>{c.status}</Badge>
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
                      {c.status === "active" && selectedUserId && (
                        <div className="mt-3">
                          <Button variant="secondary" size="sm" loading={joinMut.isPending} onClick={(e) => { e.stopPropagation(); joinMut.mutate({ challengeId: c.id, userId: selectedUserId }) }}>
                            Join Challenge
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card className="h-fit">
            <CardHeader title="Leaderboard" />
            <CardContent>
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
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
