"use client"

import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
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
import { type HealthMetric, type WorkoutEvent, eventsApi, healthApi} from "../../../lib/api"
import { PageHeader, Card, CardHeader, CardContent, StatCard as DSStatCard, Badge, Select, Input, StatSkeleton, CardSkeleton, TableSkeleton, EmptyState, Button } from "../../../lib/components/ui"
import { Activity as ActivityIcon, Filter, Dumbbell, Moon, Flame, Heart, BarChart3 } from "lucide-react"

// ── helpers ────────────────────────────────────────────────────────────────

const EVENT_BADGE: Record<string, string> = {
  workout: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  sleep: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  activity: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
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
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    border: "1px solid rgba(55, 65, 81, 0.8)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#f3f4f6",
    backdropFilter: "blur(8px)",
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
  const { selectedUserId } = useSelectedUser()
  const [eventType, setEventType] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [cursor, setCursor] = useState<string | undefined>()
  const [accumulated, setAccumulated] = useState<WorkoutEvent[]>([])
  const [view, setView] = useState<"table" | "charts">("table")



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
    <div className="space-y-8">
      <PageHeader title="Activity" subtitle="Browse workouts, sleep sessions, and passive activities synced from wearables." />

      <Card>
        <CardHeader title="Filters" icon={<Filter className="h-4 w-4" />} />
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="Event Type" options={[
              { value: "", label: "All types" },
              { value: "workout", label: "Workout" },
              { value: "sleep", label: "Sleep" },
              { value: "activity", label: "Activity" },
            ]} value={eventType} onChange={(e) => { setEventType(e.target.value); resetFilters() }} disabled={!selectedUserId} />
            <Input label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); resetFilters() }} />
            <Input label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); resetFilters() }} />
          </div>
        </CardContent>
      </Card>

      {selectedUserId && (
        <>
          <Card className="w-fit">
            <CardContent className="p-1 flex gap-1">
              {(["table", "charts"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  className={`rounded-lg px-5 py-1.5 text-sm font-medium transition-all ${
                    view === v ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  }`}>
                  {v === "table" ? "📋 Table" : "📊 Charts"}
                </button>
              ))}
            </CardContent>
          </Card>

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

function EmptyCard({ message, hint }: { message: string; hint?: React.ReactNode }) {
  return (
    <Card>
      <EmptyState icon={ActivityIcon} title={message} description={typeof hint === 'string' ? hint : "Try adjusting your filters or sync data from providers."} />
    </Card>
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
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading && !cursor) {
    return <TableSkeleton rows={6} cols={4} />
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
      <Card className="overflow-hidden">
        <CardHeader
          title={`${events.length} events`}
          action={eventType ? (
            <Badge variant={eventType === "workout" ? "warning" : eventType === "sleep" ? "info" : "success"} size="sm">
              {eventType}
            </Badge>
          ) : undefined}
        />
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {events.map((ev) => (
            <EventCard
              key={ev.id}
              event={ev}
              expanded={expandedId === ev.id}
              onToggle={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
            />
          ))}
        </div>
      </Card>

      {result?.hasMore && (
        <div className="mt-4 text-center">
          <Button
            variant="outline"
            onClick={() => setCursor(result.nextCursor)}
            disabled={isLoading}
            loading={isLoading}
          >
            Load more
          </Button>
        </div>
      )}
    </>
  )
}

function DetailItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-200 tabular-nums">{value}</p>
    </div>
  )
}

function fmtPercent(v: unknown): string | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? `${Math.round(n)}%` : null
}

function fmtMinutes(v: unknown): string | null {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function WorkoutDetails({ ev }: { ev: WorkoutEvent }) {
  const d = ev.data ?? {}
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
      <DetailItem label="Distance" value={fmtDistance(ev.distanceMeters)} />
      <DetailItem label="Calories" value={ev.caloriesKcal != null ? `${Math.round(ev.caloriesKcal)} kcal` : null} />
      <DetailItem label="Avg Heart Rate" value={ev.avgHeartRate != null ? `${ev.avgHeartRate} bpm` : null} />
      <DetailItem label="Max Heart Rate" value={ev.maxHeartRate != null ? `${ev.maxHeartRate} bpm` : null} />
      <DetailItem label="Elevation Gain" value={ev.elevationGainMeters != null ? `${Math.round(ev.elevationGainMeters)} m` : null} />
      <DetailItem
        label="Avg Speed"
        value={ev.avgSpeedMps != null ? `${(ev.avgSpeedMps * 3.6).toFixed(1)} km/h` : null}
      />
      {Object.entries(d).map(([k, v]) => {
        if (["type", "durationSeconds", "distanceMeters", "avgHeartRate", "maxHeartRate", "altitudeGainMeters", "avgSpeedMps", "caloriesKcal"].includes(k)) return null
        if (v == null || typeof v === "object") return null
        return <DetailItem key={k} label={k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")} value={String(v)} />
      })}
    </div>
  )
}

function SleepDetails({ ev }: { ev: WorkoutEvent }) {
  const d = ev.data ?? {}
  const stages = (typeof d.stages === "object" && d.stages != null ? d.stages : {}) as Record<string, unknown>
  const score = d.score ?? d.sleep_score ?? d.sleepScore
  const startTime = d.startTime ? new Date(String(d.startTime)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null
  const endTime = d.endTime ? new Date(String(d.endTime)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null
  const timeRange = startTime && endTime ? `${startTime} → ${endTime}` : null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
      <DetailItem label="Duration" value={fmtDuration(ev.durationSeconds)} />
      <DetailItem label="Sleep Window" value={timeRange} />
      <DetailItem label="Sleep Score" value={score != null ? String(score) : null} />
      <DetailItem label="Type" value={d.nap ? "Nap" : d.type != null ? String(d.type) : null} />
      <DetailItem label="Light Sleep" value={fmtPercent(stages.light) ?? fmtMinutes(stages.lightMinutes)} />
      <DetailItem label="Deep Sleep" value={fmtPercent(stages.deep) ?? fmtMinutes(stages.deepMinutes)} />
      <DetailItem label="REM" value={fmtPercent(stages.rem) ?? fmtMinutes(stages.remMinutes)} />
      <DetailItem label="Awake" value={fmtPercent(stages.awake) ?? fmtMinutes(stages.awakeMinutes)} />
      {Object.entries(d).map(([k, v]) => {
        if (["stages", "score", "sleep_score", "sleepScore", "startTime", "endTime", "nap", "type", "durationMinutes"].includes(k)) return null
        if (v == null || typeof v === "object") return null
        return <DetailItem key={k} label={k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")} value={String(v)} />
      })}
    </div>
  )
}

function ActivityDetails({ ev }: { ev: WorkoutEvent }) {
  const d = ev.data ?? {}
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
      <DetailItem label="Calories" value={ev.caloriesKcal != null ? `${Math.round(ev.caloriesKcal)} kcal` : null} />
      <DetailItem label="Steps" value={d.steps != null ? String(d.steps) : null} />
      <DetailItem label="Active Minutes" value={d.activeMinutes != null ? `${d.activeMinutes} min` : (d.active_minutes != null ? `${d.active_minutes} min` : null)} />
      <DetailItem label="Distance" value={fmtDistance(ev.distanceMeters)} />
      {Object.entries(d).map(([k, v]) => {
        if (["steps", "activeMinutes", "active_minutes", "caloriesKcal", "distanceMeters"].includes(k)) return null
        if (v == null || typeof v === "object") return null
        return <DetailItem key={k} label={k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")} value={String(v)} />
      })}
    </div>
  )
}

function EventCard({ event: ev, expanded, onToggle }: { event: WorkoutEvent; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={`transition-colors ${expanded ? "bg-gray-50/50 dark:bg-gray-800/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3 sm:gap-4"
      >
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_BADGE[ev.eventType] ?? "bg-gray-100 text-gray-600"}`}>
          {ev.eventType}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-100">
          {ev.title ?? ev.activityType?.replace(/_/g, " ") ?? "—"}
        </span>
        <span className="hidden sm:inline shrink-0 text-sm text-gray-500 dark:text-gray-400 tabular-nums">
          {fmtDuration(ev.durationSeconds)}
        </span>
        <span className="hidden md:inline shrink-0 text-xs text-gray-400 dark:text-gray-500 capitalize">
          {ev.providerId}
        </span>
        <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
          {new Date(ev.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
        <svg
          className={`shrink-0 h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1">
          <Card className="p-4">
            {ev.eventType === "workout" && <WorkoutDetails ev={ev} />}
            {ev.eventType === "sleep" && <SleepDetails ev={ev} />}
            {ev.eventType === "activity" && <ActivityDetails ev={ev} />}
            {ev.notes && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 italic border-t border-gray-100 dark:border-gray-800 pt-3">
                {ev.notes}
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

// ── charts view ─────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardContent>{children}</CardContent>
    </Card>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DSStatCard label="Workouts" value={workouts.length} icon={<Dumbbell className="h-5 w-5" />} />
        <DSStatCard label="Sleep Sessions" value={sleeps.length} icon={<Moon className="h-5 w-5" />} />
        <DSStatCard
          label="Total Calories"
          value={totalCalories > 0 ? `${totalCalories.toLocaleString()} kcal` : "—"}
          icon={<Flame className="h-5 w-5" />}
          color="accent"
        />
        <DSStatCard
          label="Avg Heart Rate"
          value={meanHR != null ? `${meanHR} bpm` : "—"}
          icon={<Heart className="h-5 w-5" />}
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
