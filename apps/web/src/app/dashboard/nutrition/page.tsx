"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type NutritionLogData, type NutritionSummary, type NutritionWeeklyAvg, nutritionApi, usersApi } from "../../../lib/api"

const TICK_STYLE = { fill: "#9ca3af", fontSize: 11 }
const GRID_PROPS = { strokeDasharray: "3 3", stroke: "#6b7280", strokeOpacity: 0.18 }
const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px", color: "#f3f4f6" },
  itemStyle: { color: "#e5e7eb" },
  labelStyle: { color: "#9ca3af", marginBottom: "4px" },
}

const MEAL_ICONS: Record<string, string> = { breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍿", other: "🍽️" }

function MacroBar({ label, value, unit, color }: { label: string; value: number | null; unit: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <div className="h-2 w-16 rounded-full bg-gray-200 dark:bg-gray-700">
          <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min((value ?? 0) / 3, 100)}%` }} />
        </div>
        <span className="text-xs font-medium text-gray-900 dark:text-gray-100 w-14 text-right">{value ?? 0}{unit}</span>
      </div>
    </div>
  )
}

export default function NutritionPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ mealType: "lunch", name: "", calories: "", proteinG: "", carbsG: "", fatG: "", waterMl: "" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: logsResult, isLoading } = useQuery({
    queryKey: ["nutrition-logs", selectedUserId],
    queryFn: () => nutritionApi.list(selectedUserId, { limit: 50 }),
    enabled: !!selectedUserId,
  })
  const logs = logsResult?.data ?? []

  const dailyChartData = useMemo(() => {
    if (!logs.length) return []
    const byDate = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>()
    for (const l of logs) {
      const date = new Date(l.loggedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      const entry = byDate.get(date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
      entry.calories += l.calories ?? 0
      entry.protein += l.proteinG ?? 0
      entry.carbs += l.carbsG ?? 0
      entry.fat += l.fatG ?? 0
      byDate.set(date, entry)
    }
    return Array.from(byDate, ([date, vals]) => ({ date, ...vals })).reverse()
  }, [logs])

  const { data: daily } = useQuery({
    queryKey: ["nutrition-daily", selectedUserId],
    queryFn: () => nutritionApi.dailySummary(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: weekly } = useQuery({
    queryKey: ["nutrition-weekly", selectedUserId],
    queryFn: () => nutritionApi.weeklyAvg(selectedUserId),
    enabled: !!selectedUserId,
  })

  const createMut = useMutation({
    mutationFn: () =>
      nutritionApi.create(selectedUserId, {
        mealType: form.mealType,
        description: form.name,
        calories: form.calories ? Number(form.calories) : undefined,
        proteinG: form.proteinG ? Number(form.proteinG) : undefined,
        carbsG: form.carbsG ? Number(form.carbsG) : undefined,
        fatG: form.fatG ? Number(form.fatG) : undefined,
        waterMl: form.waterMl ? Number(form.waterMl) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nutrition-logs", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["nutrition-daily", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["nutrition-weekly", selectedUserId] })
      setShowCreate(false)
      setForm({ mealType: "lunch", name: "", calories: "", proteinG: "", carbsG: "", fatG: "", waterMl: "" })
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Nutrition</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Track meals, macros, and hydration to optimise your diet.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showCreate ? "Cancel" : "Log Meal"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="nut-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="nut-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view nutrition data.</p>}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Log a Meal</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Meal Type</label>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.mealType} onChange={(e) => setForm({ ...form, mealType: e.target.value })}>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Name</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Grilled Chicken Salad" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Calories</label>
              <input type="number" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Protein (g)</label>
              <input type="number" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.proteinG} onChange={(e) => setForm({ ...form, proteinG: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Carbs (g)</label>
              <input type="number" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.carbsG} onChange={(e) => setForm({ ...form, carbsG: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fat (g)</label>
              <input type="number" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.fatG} onChange={(e) => setForm({ ...form, fatG: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Water (ml)</label>
              <input type="number" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.waterMl} onChange={(e) => setForm({ ...form, waterMl: e.target.value })} />
            </div>
          </div>
          <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {createMut.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {/* Summary cards */}
      {selectedUserId && (daily || weekly) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {daily && (
            <>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">Today&apos;s Calories</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{daily.totalCalories.toLocaleString()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{daily.mealCount} meals logged</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">Macros Today</p>
                <div className="mt-2 space-y-2">
                  <MacroBar label="Protein" value={daily.totalProtein} unit="g" color="bg-blue-500" />
                  <MacroBar label="Carbs" value={daily.totalCarbs} unit="g" color="bg-amber-500" />
                  <MacroBar label="Fat" value={daily.totalFat} unit="g" color="bg-rose-500" />
                </div>
              </div>
            </>
          )}
          {weekly && (
            <>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">Weekly Avg Calories</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{Math.round(weekly.avgCalories).toLocaleString()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{weekly.days} day average</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">Hydration Avg</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{Math.round(weekly.avgWater)} ml</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Calorie & macro charts */}
      {selectedUserId && dailyChartData.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Daily Calories</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Total calorie intake per day</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dailyChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" tick={TICK_STYLE} />
                <YAxis tick={TICK_STYLE} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="calories" fill="#f97316" radius={[4, 4, 0, 0]} name="Calories" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Macro Breakdown</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Protein, carbs, and fat per day</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dailyChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" tick={TICK_STYLE} />
                <YAxis tick={TICK_STYLE} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="protein" stackId="macros" fill="#22c55e" name="Protein (g)" />
                <Bar dataKey="carbs" stackId="macros" fill="#3b82f6" name="Carbs (g)" />
                <Bar dataKey="fat" stackId="macros" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Fat (g)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Meal log table */}
      {selectedUserId && isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>}
      {selectedUserId && !isLoading && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Meal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Name</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Calories</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Protein</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Carbs</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Fat</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {logs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No meals logged yet.</td></tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">{MEAL_ICONS[l.mealType] ?? "🍽️"} {l.mealType}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{l.name}</td>
                  <td className="px-4 py-3 text-right">{l.calories ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{l.proteinG ? `${l.proteinG}g` : "—"}</td>
                  <td className="px-4 py-3 text-right">{l.carbsG ? `${l.carbsG}g` : "—"}</td>
                  <td className="px-4 py-3 text-right">{l.fatG ? `${l.fatG}g` : "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{new Date(l.loggedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
