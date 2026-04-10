"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { trainingPlansApi, type TrainingPlanData } from "../../../lib/api"
import { PageHeader, Badge, Card, CardHeader, CardContent, CardFooter, StatCard, Button, EmptyState, CardSkeleton, StatSkeleton, MetricBar, Select, Input } from "../../../lib/components/ui"

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: "🌱 Beginner",
  intermediate: "💪 Intermediate",
  advanced: "🔥 Advanced",
  elite: "⚡ Elite",
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  active: "success",
  draft: "default",
  completed: "info",
  paused: "warning",
}

export default function TrainingPage() {
  const { selectedUserId } = useSelectedUser()
  const [showGenerate, setShowGenerate] = useState(false)
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)
  const [form, setForm] = useState({ goal: "fitness", fitnessLevel: "intermediate", durationWeeks: "8" })
  const queryClient = useQueryClient()


  const { data: plansResult, isLoading } = useQuery({
    queryKey: ["training-plans", selectedUserId],
    queryFn: () => trainingPlansApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })
  const plans = plansResult?.data ?? []

  const generateMut = useMutation({
    mutationFn: () =>
      trainingPlansApi.generate(selectedUserId, {
        goal: form.goal,
        fitnessLevel: form.fitnessLevel,
        durationWeeks: Number(form.durationWeeks),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-plans", selectedUserId] })
      setShowGenerate(false)
    },
  })

  return (
    <div className="space-y-8">
      <PageHeader
        title="Training Plans"
        subtitle="AI-generated periodized training plans based on your fitness data and goals."
        actions={selectedUserId ? <Button onClick={() => setShowGenerate(!showGenerate)}>{showGenerate ? "Cancel" : "Generate Plan"}</Button> : undefined}
      />

      {/* Generate form */}
      {showGenerate && selectedUserId && (
        <Card>
          <CardHeader title="Generate Training Plan" />
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label="Goal"
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                options={[
                  { value: "fitness", label: "General Fitness" },
                  { value: "weight_loss", label: "Weight Loss" },
                  { value: "muscle_gain", label: "Muscle Gain" },
                  { value: "endurance", label: "Endurance" },
                  { value: "strength", label: "Strength" },
                  { value: "flexibility", label: "Flexibility" },
                  { value: "marathon", label: "Marathon Prep" },
                  { value: "5k", label: "5K Training" },
                ]}
              />
              <Select
                label="Fitness Level"
                value={form.fitnessLevel}
                onChange={(e) => setForm({ ...form, fitnessLevel: e.target.value })}
                options={[
                  { value: "beginner", label: "Beginner" },
                  { value: "intermediate", label: "Intermediate" },
                  { value: "advanced", label: "Advanced" },
                  { value: "elite", label: "Elite" },
                ]}
              />
              <Input
                label="Duration (weeks)"
                type="number"
                min={1}
                max={52}
                value={form.durationWeeks}
                onChange={(e) => setForm({ ...form, durationWeeks: e.target.value })}
              />
            </div>
            <Button
              className="mt-3"
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
              loading={generateMut.isPending}
            >
              {generateMut.isPending ? "Generating…" : "Generate Plan"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Plans list */}
      {selectedUserId && (
        <div className="space-y-4">
          {isLoading && <CardSkeleton count={3} />}
          {!isLoading && plans.length === 0 && (
            <EmptyState title="No training plans yet" description="Generate one to get started." />
          )}
          {plans.map((plan) => (
            <Card key={plan.id} hover>
              <button
                type="button"
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors text-left"
                onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">{plan.fitnessLevel ? LEVEL_LABELS[plan.fitnessLevel]?.slice(0, 2) ?? "📋" : "📋"}</span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{plan.name}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {plan.goal} · {plan.durationWeeks} weeks · {LEVEL_LABELS[plan.fitnessLevel] ?? plan.fitnessLevel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={STATUS_BADGE_VARIANT[plan.status] ?? "default"}>{plan.status}</Badge>
                  <svg className={`h-4 w-4 text-gray-400 transition-transform ${expandedPlan === plan.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {expandedPlan === plan.id && (
                <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-3">
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Goal</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{plan.goal.replace(/_/g, " ")}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Duration</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{plan.durationWeeks} weeks</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Fitness Level</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{LEVEL_LABELS[plan.fitnessLevel] ?? plan.fitnessLevel}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Created</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{new Date(plan.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {plan.weeklySchedule && Object.keys(plan.weeklySchedule).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Weekly Schedule</p>
                      <pre className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                        {JSON.stringify(plan.weeklySchedule, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
