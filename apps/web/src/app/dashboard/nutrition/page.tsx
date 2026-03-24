"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type NutritionLogData, type NutritionSummary, type NutritionWeeklyAvg, nutritionApi, usersApi } from "../../../lib/api"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts"

const MEAL_ICONS: Record<string, string> = { breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍿", other: "🍽️" }
const DATE_RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const
const MACRO_COLORS = { protein: "#3b82f6", carbs: "#f59e0b", fat: "#ef4444" }
const PIE_COLORS = [MACRO_COLORS.protein, MACRO_COLORS.carbs, MACRO_COLORS.fat]

function formatDateISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

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

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <p className="text-xs text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

/** Aggregate logs into per-day buckets */
function aggregateByDay(logs: NutritionLogData[]) {
  const map = new Map<string, { date: string; calories: number; protein: number; carbs: number; fat: number }>()
  for (const l of logs) {
    const day = formatDateISO(new Date(l.loggedAt))
    const entry = map.get(day) ?? { date: day, calories: 0, protein: 0, carbs: 0, fat: 0 }
    entry.calories += l.calories ?? 0
    entry.protein += l.proteinG ?? 0
    entry.carbs += l.carbsG ?? 0
    entry.fat += l.fatG ?? 0
    map.set(day, entry)
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export default function NutritionPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [rangeDays, setRangeDays] = useState<number>(30)
  const [form, setForm] = useState({ mealType: "lunch", name: "", calories: "", proteinG: "", carbsG: "", fatG: "", waterMl: "" })
  const queryClient = useQueryClient()

  // Compute from/to dates from rangeDays
  const { from, to } = useMemo(() => {
    const now = new Date()
    const toDate = formatDateISO(now)
    const fromDate = formatDateISO(new Date(now.getTime() - rangeDays * 86_400_000))
    return { from: fromDate, to: toDate }
  }, [rangeDays])

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: logsResult, isLoading } = useQuery({
    queryKey: ["nutrition-logs", selectedUserId, from, to],
    queryFn: () => nutritionApi.list(selectedUserId, { from, to, limit: 500 }),
    enabled: !!selectedUserId,
  })
  const logs = logsResult?.data ?? []

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

  // Derived chart data
  const dailyData = useMemo(() => aggregateByDay(logs), [logs])

  const avgStats = useMemo(() => {
    if (dailyData.length === 0) return null
    const n = dailyData.length
    return {
      avgCalories: Math.round(dailyData.reduce((s, d) => s + d.calories, 0) / n),
      avgProtein: Math.round(dailyData.reduce((s, d) => s + d.protein, 0) / n),
      avgCarbs: Math.round(dailyData.reduce((s, d) => s + d.carbs, 0) / n),
      avgFat: Math.round(dailyData.reduce((s, d) => s + d.fat, 0) / n),
    }
  }, [dailyData])

  const pieData = useMemo(() => {
    if (!avgStats) return []
    const total = avgStats.avgProtein + avgStats.avgCarbs + avgStats.avgFat
    if (total === 0) return []
    return [
      { name: "Protein", value: Math.round((avgStats.avgProtein / total) * 100) },
      { name: "Carbs", value: Math.round((avgStats.avgCarbs / total) * 100) },
      { name: "Fat", value: Math.round((avgStats.avgFat / total) * 100) },
    ]
  }, [avgStats])

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

      {/* Date range filter */}
      {selectedUserId && (
        <div className="mb-6 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Range:</span>
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setRangeDays(opt.days)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                rangeDays === opt.days
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Summary cards */}
      {selectedUserId && (daily || weekly) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {daily && (
            <>
              <StatCard title="Today's Calories" value={daily.totalCalories.toLocaleString()} subtitle={`${daily.mealCount} meals logged`} />
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
              <StatCard title="Weekly Avg Calories" value={Math.round(weekly.avgCalories).toLocaleString()} subtitle={`${weekly.days} day average`} />
              <StatCard title="Hydration Avg" value={`${Math.round(weekly.avgWater)} ml`} />
            </>
          )}
        </div>
      )}

      {/* Enhanced avg stats from date-range data */}
      {selectedUserId && avgStats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title={`Avg Daily Calories (${rangeDays}d)`} value={avgStats.avgCalories.toLocaleString()} subtitle={`${dailyData.length} days with data`} />
          <StatCard title="Avg Protein" value={`${avgStats.avgProtein}g`} />
          <StatCard title="Avg Carbs" value={`${avgStats.avgCarbs}g`} />
          <StatCard title="Avg Fat" value={`${avgStats.avgFat}g`} />
        </div>
      )}

      {/* Charts */}
      {selectedUserId && dailyData.length > 0 && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          {/* Calorie trend chart */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Calorie Trend</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="calGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#d1d5db" }} itemStyle={{ color: "#a5b4fc" }} />
                <ReferenceLine y={2000} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "2000 kcal", fill: "#f59e0b", fontSize: 11, position: "insideTopRight" }} />
                <Area type="monotone" dataKey="calories" stroke="#6366f1" fill="url(#calGrad)" strokeWidth={2} dot={false} name="Calories" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Macro breakdown chart */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Macro Breakdown</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" unit="g" />
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#d1d5db" }} />
                <Bar dataKey="protein" stackId="macros" fill={MACRO_COLORS.protein} name="Protein" radius={[0, 0, 0, 0]} />
                <Bar dataKey="carbs" stackId="macros" fill={MACRO_COLORS.carbs} name="Carbs" />
                <Bar dataKey="fat" stackId="macros" fill={MACRO_COLORS.fat} name="Fat" radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Macro pie chart */}
          {pieData.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm lg:col-span-2 flex flex-col items-center">
              <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100 self-start">Average Macro Distribution</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, value }: { name: string; value: number }) => `${name} ${value}%`}>
                    {pieData.map((_entry, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Meal log table */}
      {selectedUserId && isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>}
      {selectedUserId && !isLoading && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Meal Log</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{logs.length} entries in the last {rangeDays} days</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Meal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Name</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Calories</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Macros</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No meals logged yet.</td></tr>
              )}
              {logs.map((l, idx) => (
                <tr key={l.id} className={`${idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/50 dark:bg-gray-800/20"} hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors`}>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {MEAL_ICONS[l.mealType] ?? "🍽️"} {l.mealType}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{l.name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">{l.calories != null ? l.calories.toLocaleString() : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">{l.proteinG ?? 0}g</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">{l.carbsG ?? 0}g</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">{l.fatG ?? 0}g</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(l.loggedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
