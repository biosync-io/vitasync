"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type GoalData, goalsApi} from "../../../lib/api"
import { PageHeader, Badge, Card, CardHeader, CardContent, CardFooter, StatCard, Button, EmptyState, CardSkeleton, StatSkeleton, MetricBar, Select, Input } from "../../../lib/components/ui"

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400" },
  completed: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400" },
  failed: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-400" },
  paused: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400" },
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  active: "info",
  completed: "success",
  failed: "danger",
  paused: "default",
}

export default function GoalsPage() {
  const { selectedUserId } = useSelectedUser()
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: "", metric: "steps", targetValue: "", unit: "steps", goalType: "daily" })
  const queryClient = useQueryClient()


  const { data: goalsResult, isLoading } = useQuery({
    queryKey: ["goals", selectedUserId, statusFilter],
    queryFn: () => goalsApi.list(selectedUserId, statusFilter ? { status: statusFilter } : {}),
    enabled: !!selectedUserId,
  })
  const goals = goalsResult?.data ?? []

  const createMut = useMutation({
    mutationFn: () =>
      goalsApi.create(selectedUserId, {
        title: form.name,
        category: form.metric,
        metricType: form.metric,
        targetValue: Number(form.targetValue),
        targetUnit: form.unit,
        cadence: form.goalType,
        startDate: new Date().toISOString(),
      }),
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
    <div className="space-y-8">
      <PageHeader
        title="Goals"
        subtitle="Set targets, track progress, and build streaks."
        actions={selectedUserId ? <Button onClick={() => setShowCreate(!showCreate)}>{showCreate ? "Cancel" : "New Goal"}</Button> : undefined}
      />

      {/* Stat cards */}
      {selectedUserId && !isLoading && goals.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active" value={goals.filter(g => g.status === 'active').length} color="brand" />
          <StatCard label="Completed" value={goals.filter(g => g.status === 'completed').length} color="vitality" />
          <StatCard label="Total" value={goals.length} />
        </div>
      )}

      {/* Filter */}
      {selectedUserId && (
        <Card>
          <CardContent>
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "", label: "All" },
                { value: "active", label: "Active" },
                { value: "completed", label: "Completed" },
                { value: "failed", label: "Failed" },
                { value: "paused", label: "Paused" },
              ]}
            />
          </CardContent>
        </Card>
      )}

      {/* Create form */}
      {showCreate && (
        <Card>
          <CardHeader title="Create Goal" />
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Input
                placeholder="Goal name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                placeholder="Metric (e.g. steps)"
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value })}
              />
              <Input
                placeholder="Target value"
                type="number"
                value={form.targetValue}
                onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
              />
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !form.name || !form.targetValue}
                loading={createMut.isPending}
              >
                {createMut.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {selectedUserId && isLoading && (
        <div className="space-y-8">
          <StatSkeleton count={3} />
          <CardSkeleton count={6} />
        </div>
      )}

      {/* Goals grid */}
      {selectedUserId && !isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.length === 0 && (
            <div className="col-span-full">
              <EmptyState title="No goals found" description="Create a goal to start tracking." />
            </div>
          )}
          {goals.map((g) => {
            const pct = g.targetValue > 0 ? Math.min(100, Math.round(((g.currentValue ?? 0) / g.targetValue) * 100)) : 0
            const st = STATUS_STYLES[g.status] ?? { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400" }
            return (
              <Card key={g.id}>
                <CardContent>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{g.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{g.metric} · {g.goalType}</p>
                    </div>
                    <Badge variant={STATUS_BADGE_VARIANT[g.status] ?? "default"}>{g.status}</Badge>
                  </div>
                  <MetricBar
                    value={g.currentValue ?? 0}
                    max={g.targetValue}
                    label={`${g.metric} · ${g.goalType}`}
                    color={pct >= 100 ? "vitality" : "brand"}
                    showValue
                  />
                  {g.streak > 0 && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">🔥 {g.streak} day streak</p>}
                  {g.status === "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      onClick={() => evaluateMut.mutate(g.id)}
                    >
                      Evaluate Progress →
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
