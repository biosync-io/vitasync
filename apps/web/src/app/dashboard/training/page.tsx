"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { trainingPlansApi, usersApi, type TrainingPlanData } from "../../../lib/api"

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

export default function TrainingPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [showGenerate, setShowGenerate] = useState(false)
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)
  const [form, setForm] = useState({ goal: "fitness", fitnessLevel: "intermediate", durationWeeks: "8" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

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
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 animate-fade-in-down">Training Plans</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">AI-generated periodized training plans based on your fitness data and goals.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowGenerate(!showGenerate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showGenerate ? "Cancel" : "Generate Plan"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="train-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="train-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to manage training plans.</p>}

      {/* Generate form */}
      {showGenerate && selectedUserId && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Generate Training Plan</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Goal</label>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
                <option value="fitness">General Fitness</option>
                <option value="weight_loss">Weight Loss</option>
                <option value="muscle_gain">Muscle Gain</option>
                <option value="endurance">Endurance</option>
                <option value="strength">Strength</option>
                <option value="flexibility">Flexibility</option>
                <option value="marathon">Marathon Prep</option>
                <option value="5k">5K Training</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fitness Level</label>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.fitnessLevel} onChange={(e) => setForm({ ...form, fitnessLevel: e.target.value })}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="elite">Elite</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Duration (weeks)</label>
              <input type="number" min="1" max="52" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.durationWeeks} onChange={(e) => setForm({ ...form, durationWeeks: e.target.value })} />
            </div>
          </div>
          <button type="button" onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {generateMut.isPending ? "Generating…" : "Generate Plan"}
          </button>
        </div>
      )}

      {/* Plans list */}
      {selectedUserId && (
        <div className="space-y-4">
          {isLoading && (
            <div className="p-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
          )}
          {!isLoading && plans.length === 0 && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">No training plans yet. Generate one to get started.</p>
          )}
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
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
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[plan.status] ?? ""}`}>{plan.status}</span>
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
