"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { type HealthMetric, type WorkoutEvent, eventsApi, healthApi, usersApi } from "../../../lib/api"

// ── helpers ────────────────────────────────────────────────────────────────

const EVENT_BADGE: Record<string, string> = {
  workout: "bg-orange-100 text-orange-700",
  sleep: "bg-blue-100 text-blue-700",
  activity: "bg-green-100 text-green-700",
}

const CHART_COLOR: Record<string, string> = {
  workout: "#f97316",
  sleep: "#3b82f6",
  activity: "#22c55e",
  calories: "#ef4444",
  heartRate: "#ec4899",
  steps: "#8b5cf6",
}

const TICK_STYLE = { fill: "#9ca3af", fontSize: 11 }
const GRID_PROPS = { strokeDasharray: "3 3", stroke: "#6b7280", strokeOpacity: 0.18 }
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#f3f4f6",
  },
  itemStyle: { color: "#e5e7eb" },
  labelStyle: { color: "#9ca3af", marginBottom: "4px" },
}

function fmtDuration(s: number | null): string {
  if (s == null) return "—"
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDistance(m: number | null): string {
  if (m == null) return "—"
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function groupByDate<T>(
  items: T[],
  getDate: (item: T) => string,
  getValue: (item: T) => number | null,
  mode: "avg" | "sum" = "sum",
): Array<{ date: string; value: number; count: number }> {
  const map: Record<string, number[]> = {}
  for (const item of items) {
    const d = getDate(item).slice(0, 10)
    const v = getValue(item)
    if (v != null) {
      if (!map[d]) map[d] = []
      map[d].push(v)
    }
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, vals]) => {
      const total = vals.reduce((s, v) => s + v, 0)
      return {
        date: shortDate(`${d}T12:00:00`),
        value: Math.round(mode === "avg" ? total / vals.length : total),
        count: vals.length,
      }
    })
}

// ── main page ──────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const autoSelectDone = useRef(false)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [eventType, setEventType] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [cursor, setCursor] = useState<string | undefined>()
  const [accumulated, setAccumulated] = useState<WorkoutEvent[]>([])
  const [view, setView] = useState<"table" | "charts">("table")

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list({ limit: 100 }),
  })

  useEffect(() => {
    const first = users[0]
    if (first && !autoSelectDone.current) {
      autoSelectDone.current = true
      setSelectedUserId(first.id)
    }
  }, [users])

  const { data: tableResult, isLoading } = useQuery({
    queryKey: ["activity-table", selectedUserId, eventType, from, to, cursor],
    queryFn: async () => {
      const p: Parameters<typeof eventsApi.list>[1] = { limit: 50 }
      if (eventType) p.eventType = eventType
      if (from) p.from = new Date(from).toISOString()
      if (to) p.to = new Date(to).toISOString()
      if (cursor) p.cursor = cursor
      const result = await eventsApi.list(selectedUserId, p)
      setAccumulated((prev) => (cursor ? [...prev, ...result.data] : result.data))
      return result
    },
    enabled: !!selectedUserId,
  })

  const { data: chartResult } = useQuery({
    queryKey: ["activity-chart", selectedUserId, eventType, from, to],
    queryFn: () => {
      const p: Parameters<typeof eventsApi.list>[1] = { limit: 200 }
      if (eventType) p.eventType = eventType
      if (from) p.from = new Date(from).toISOString()
      if (to) p.to = new Date(to).toISOString()
      return eventsApi.list(selectedUserId, p)
    },
    enabled: !!selectedUserId && view === "charts",
  })

  const { data: healthResult } = useQuery({
    queryKey: ["activity-health", selectedUserId, from, to],
    queryFn: () =>
      healthApi.query(selectedUserId, {
        ...(from ? { from: new Date(from).toISOString() } : {}),
        ...(to ? { to: new Date(to).toISOString() } : {}),
        limit: 500,
      }),
    enabled: !!selectedUserId && view === "charts",
  })

  const tableEvents = cursor ? accumulated : (tableResult?.data ?? [])
  const chartEvents = chartResult?.data ?? []
  const healthMetrics: HealthMetric[] = healthResult?.data ?? []

  function resetFilters() {
    setCursor(undefined)
    setAccumulated([])
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Activity</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Browse workouts, sleep sessions, and passive activities synced from wearables.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Filters</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="User">
            <select
              id="activity-user"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value)
                resetFilters()
              }}
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName ?? u.email ?? u.externalId}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Event Type">
            <select
              id="activity-event-type"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value)
                resetFilters()
              }}
              disabled={!selectedUserId}
            >
              <option value="">All types</option>
              <option value="workout">Workout</option>
              <option value="sleep">Sleep</option>
              <option value="activity">Activity</option>
            </select>
          </FilterField>

          <FilterField label="From">
            <input
              id="activity-from"
              type="date"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                resetFilters()
              }}
            />
          </FilterField>

          <FilterField label="To">
            <input
              id="activity-to"
              type="date"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                resetFilters()
              }}
            />
          </FilterField>
        </div>
      </div>

      {!selectedUserId ? (
        <EmptyCard message="Select a user to browse their activity." />
      ) : (
        <>
          <div className="mb-5 flex items-center gap-1 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1 w-fit shadow-sm">
            {(["table", "charts"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-lg px-5 py-1.5 text-sm font-medium transition-all ${
                  view === v
                    ? "bg-indigo-600 text-white shadow"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                }`}
              >
                {v === "table" ? "📋 Table" : "📊 Charts"}
              </button>
            ))}
          </div>

          {view === "table" ? (
            <TableView
              events={tableEvents}
              result={tableResult}
              isLoading={isLoading}
              cursor={cursor}
              setCursor={setCursor}
              eventType={eventType}
            />
          ) : (
            <ChartsView chartEvents={chartEvents} healthMetrics={healthMetrics} />
          )}
        </>
      )}
    </div>
  )
}

// ── shared ─────────────────────────────────────────────────────────────────

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {children}
    </div>
  )
}

function EmptyCard({ message, hint }: { message: string; hint?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 py-20 text-center">
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
      {hint && <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">{hint}</div>}
    </div>
  )
}

// ── table view ─────────────────────────────────────────────────────────────

interface TableViewProps {
  events: WorkoutEvent[]
  result: { data: WorkoutEvent[]; nextCursor?: string; hasMore: boolean } | undefined
  isLoading: boolean
  cursor: string | undefined
  setCursor: (c: string | undefined) => void
  eventType: string
}

function TableView({ events, result, isLoading, cursor, setCursor, eventType }: TableViewProps) {
  if (isLoading && !cursor) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton loader
          <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <EmptyCard
        message="No events found for the current filters."
        hint={
          <>
            Trigger a sync on the{" "}
            <a href="/dashboard/users" className="text-indigo-600 hover:underline">
              Users
            </a>{" "}
            page to pull data, or switch to{" "}
            <span className="font-medium text-indigo-600">Charts</span> to explore health metrics.
          </>
        }
      />
    )
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{events.length} events</p>
          {eventType && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_BADGE[eventType] ?? "bg-gray-100 text-gray-600"}`}>
              {eventType}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr>
                {["Type", "Activity", "Title", "Duration", "Distance", "Calories", "Avg HR", "Provider", "Date"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {events.map((ev) => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {result?.hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setCursor(result.nextCursor)}
            disabled={isLoading}
            className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {isLoading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </>
  )
}

function EventRow({ event: ev }: { event: WorkoutEvent }) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_BADGE[ev.eventType] ?? "bg-gray-100 text-gray-600"}`}>
          {ev.eventType}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize whitespace-nowrap">
        {ev.activityType?.replace(/_/g, " ") ?? "—"}
      </td>
      <td className="px-4 py-3 text-gray-900 dark:text-gray-100 max-w-[180px] truncate">{ev.title ?? "—"}</td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
        {fmtDuration(ev.durationSeconds)}
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
        {fmtDistance(ev.distanceMeters)}
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
        {ev.caloriesKcal != null ? `${Math.round(ev.caloriesKcal)} kcal` : "—"}
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
        {ev.avgHeartRate != null ? `${ev.avgHeartRate} bpm` : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 capitalize">{ev.providerId}</td>
      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
        {new Date(ev.startedAt).toLocaleString()}
      </td>
    </tr>
  )
}

// ── charts view ─────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {children}
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  )
}

interface ChartsViewProps {
  chartEvents: WorkoutEvent[]
  healthMetrics: HealthMetric[]
}

function ChartsView({ chartEvents, healthMetrics }: ChartsViewProps) {
  const workouts = chartEvents.filter((e) => e.eventType === "workout")
  const sleeps = chartEvents.filter((e) => e.eventType === "sleep")
  const totalCalories = Math.round(workouts.reduce((s, e) => s + (e.caloriesKcal ?? 0), 0))
  const hrSamples = workouts.filter((e) => e.avgHeartRate != null)
  const meanHR =
    hrSamples.length > 0
      ? Math.round(hrSamples.reduce((s, e) => s + (e.avgHeartRate ?? 0), 0) / hrSamples.length)
      : null

  const typeDistribution = (() => {
    const counts: Record<string, number> = {}
    for (const ev of chartEvents) counts[ev.eventType] = (counts[ev.eventType] ?? 0) + 1
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  })()

  const durationData = groupByDate(workouts, (e) => e.startedAt, (e) =>
    e.durationSeconds != null ? e.durationSeconds / 60 : null,
  )
  const caloriesData = groupByDate(chartEvents, (e) => e.startedAt, (e) => e.caloriesKcal)
  const hrData = groupByDate(
    chartEvents.filter((e) => e.avgHeartRate != null),
    (e) => e.startedAt,
    (e) => e.avgHeartRate,
    "avg",
  )
  const stepsData = groupByDate(
    healthMetrics.filter((m) => m.metricType === "steps"),
    (m) => m.recordedAt,
    (m) => m.value,
  )
  const restingHRData = groupByDate(
    healthMetrics.filter((m) => m.metricType === "resting_heart_rate"),
    (m) => m.recordedAt,
    (m) => m.value,
    "avg",
  )
  const sleepScoreData = groupByDate(
    healthMetrics.filter((m) => m.metricType === "sleep_score"),
    (m) => m.recordedAt,
    (m) => m.value,
    "avg",
  )

  if (chartEvents.length === 0 && healthMetrics.length === 0) {
    return (
      <EmptyCard
        message="No data available for charts."
        hint={
          <>
            Trigger a sync on the{" "}
            <a href="/dashboard/users" className="text-indigo-600 hover:underline">Users</a>{" "}
            page to pull data from connected providers.
          </>
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Workouts" value={workouts.length} sub="total events" color="text-orange-500" />
        <StatCard label="Sleep Sessions" value={sleeps.length} sub="total events" color="text-blue-500" />
        <StatCard
          label="Total Calories"
          value={totalCalories > 0 ? `${totalCalories.toLocaleString()} kcal` : "—"}
          sub="across all events"
          color="text-red-500"
        />
        <StatCard
          label="Avg Heart Rate"
          value={meanHR != null ? `${meanHR} bpm` : "—"}
          sub="during workouts"
          color="text-pink-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {typeDistribution.length > 0 && (
          <ChartCard title="Activity Distribution">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={typeDistribution} barCategoryGap="40%">
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="value" name="Events" radius={[6, 6, 0, 0]}>
                  {typeDistribution.map((entry) => (
                    <Cell key={entry.name} fill={CHART_COLOR[entry.name] ?? "#6b7280"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {durationData.length > 0 && (
          <ChartCard title="Workout Duration (min / day)">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={durationData}>
                <defs>
                  <linearGradient id="durGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLOR.workout} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART_COLOR.workout} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v} min`, "Duration"]} />
                <Area type="monotone" dataKey="value" name="Duration" stroke={CHART_COLOR.workout} strokeWidth={2} fill="url(#durGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {caloriesData.length > 0 && (
          <ChartCard title="Calories Burned">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={caloriesData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v} kcal`, "Calories"]} />
                <Bar dataKey="value" name="Calories" fill={CHART_COLOR.calories} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {hrData.length > 0 && (
          <ChartCard title="Avg Heart Rate (bpm)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={hrData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v} bpm`, "Avg HR"]} />
                <Line type="monotone" dataKey="value" name="Avg HR" stroke={CHART_COLOR.heartRate} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {stepsData.length > 0 && (
        <ChartCard title="Daily Steps">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stepsData}>
              <defs>
                <linearGradient id="stepsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLOR.steps} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={CHART_COLOR.steps} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="date" tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis
                tick={TICK_STYLE}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v.toLocaleString(), "Steps"]} />
              <Area type="monotone" dataKey="value" name="Steps" stroke={CHART_COLOR.steps} strokeWidth={2} fill="url(#stepsGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {restingHRData.length > 0 && (
          <ChartCard title="Resting Heart Rate (bpm)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={restingHRData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v} bpm`, "Resting HR"]} />
                <Line type="monotone" dataKey="value" name="Resting HR" stroke={CHART_COLOR.heartRate} strokeWidth={2} dot={{ fill: CHART_COLOR.heartRate, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {sleepScoreData.length > 0 && (
          <ChartCard title="Sleep Score">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sleepScoreData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}`, "Sleep Score"]} />
                <Bar dataKey="value" name="Sleep Score" fill={CHART_COLOR.sleep} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  )
}
