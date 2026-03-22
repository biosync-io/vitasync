"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type HealthMetric, type TimeseriesPoint, healthApi, usersApi } from "../../../lib/api"

// ── Constants ──────────────────────────────────────────────────────────────

const BODY_METRICS = ["weight", "body_fat", "blood_pressure", "blood_oxygen", "temperature", "respiratory_rate"] as const

const METRIC_LABELS: Record<string, string> = {
  weight: "Weight",
  body_fat: "Body Fat",
  blood_pressure: "Blood Pressure",
  blood_oxygen: "SpO₂",
  temperature: "Temperature",
  respiratory_rate: "Respiratory Rate",
}

const METRIC_UNITS: Record<string, string> = {
  weight: "kg",
  body_fat: "%",
  blood_oxygen: "%",
  temperature: "°C",
  respiratory_rate: "brpm",
}

const METRIC_ICONS: Record<string, string> = {
  weight: "⚖️",
  body_fat: "📊",
  blood_pressure: "🩸",
  blood_oxygen: "🫁",
  temperature: "🌡️",
  respiratory_rate: "💨",
}

const RANGE_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "6 months", days: 180 },
  { label: "1 year", days: 365 },
]

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

// ── Helpers ────────────────────────────────────────────────────────────────

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function dateRange(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

function trend(points: TimeseriesPoint[]): { direction: "up" | "down" | "flat"; pct: number } {
  const valid = points.filter((p) => p.avg != null)
  if (valid.length < 2) return { direction: "flat", pct: 0 }
  const first = valid[0]!.avg!
  const last = valid[valid.length - 1]!.avg!
  if (first === 0) return { direction: "flat", pct: 0 }
  const pct = Math.round(((last - first) / Math.abs(first)) * 100)
  return { direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat", pct: Math.abs(pct) }
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function BodyMetricsPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [rangeDays, setRangeDays] = useState(30)

  const { from, to } = useMemo(() => dateRange(rangeDays), [rangeDays])

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  // Fetch timeseries for weight and body fat
  const { data: weightTs } = useQuery({
    queryKey: ["body-ts-weight", selectedUserId, from, to],
    queryFn: () => healthApi.timeseries(selectedUserId, { metricType: "weight", from, to, bucket: "day" }),
    enabled: !!selectedUserId,
  })

  const { data: bodyFatTs } = useQuery({
    queryKey: ["body-ts-bodyfat", selectedUserId, from, to],
    queryFn: () => healthApi.timeseries(selectedUserId, { metricType: "body_fat", from, to, bucket: "day" }),
    enabled: !!selectedUserId,
  })

  const { data: bpData } = useQuery({
    queryKey: ["body-bp", selectedUserId, from, to],
    queryFn: () => healthApi.query(selectedUserId, { metricType: "blood_pressure", from, to, limit: 500 }),
    enabled: !!selectedUserId,
  })

  const { data: spo2Ts } = useQuery({
    queryKey: ["body-ts-spo2", selectedUserId, from, to],
    queryFn: () => healthApi.timeseries(selectedUserId, { metricType: "blood_oxygen", from, to, bucket: "day" }),
    enabled: !!selectedUserId,
  })

  const { data: tempTs } = useQuery({
    queryKey: ["body-ts-temp", selectedUserId, from, to],
    queryFn: () => healthApi.timeseries(selectedUserId, { metricType: "temperature", from, to, bucket: "day" }),
    enabled: !!selectedUserId,
  })

  const { data: rrTs } = useQuery({
    queryKey: ["body-ts-rr", selectedUserId, from, to],
    queryFn: () => healthApi.timeseries(selectedUserId, { metricType: "respiratory_rate", from, to, bucket: "day" }),
    enabled: !!selectedUserId,
  })

  // Fetch summary counts
  const { data: summary = [] } = useQuery({
    queryKey: ["body-summary", selectedUserId],
    queryFn: () => healthApi.summary(selectedUserId),
    enabled: !!selectedUserId,
  })

  const bodySummary = summary.filter((s) => BODY_METRICS.includes(s.metricType as (typeof BODY_METRICS)[number]))

  // Process timeseries for charts
  const weightPoints = weightTs?.data ?? []
  const bodyFatPoints = bodyFatTs?.data ?? []
  const spo2Points = spo2Ts?.data ?? []
  const tempPoints = tempTs?.data ?? []
  const rrPoints = rrTs?.data ?? []

  // Merge weight + body fat for combined chart
  const weightChartData = useMemo(() => {
    const fatMap = new Map(bodyFatPoints.map((p) => [p.bucket.slice(0, 10), p.avg]))
    return weightPoints.map((p) => ({
      date: shortDate(p.bucket),
      weight: p.avg != null ? Math.round(p.avg * 10) / 10 : null,
      bodyFat: fatMap.get(p.bucket.slice(0, 10)) ?? null,
    }))
  }, [weightPoints, bodyFatPoints])

  // BP chart data
  const bpChartData = useMemo(() => {
    const metrics = bpData?.data ?? []
    const byDate = new Map<string, { systolic: number[]; diastolic: number[] }>()
    for (const m of metrics) {
      const d = m.recordedAt.slice(0, 10)
      if (!byDate.has(d)) byDate.set(d, { systolic: [], diastolic: [] })
      const entry = byDate.get(d)!
      const sys = (m.data as { systolic?: number })?.systolic ?? m.value
      const dia = (m.data as { diastolic?: number })?.diastolic
      if (sys) entry.systolic.push(sys)
      if (dia) entry.diastolic.push(dia)
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, v]) => ({
        date: shortDate(`${d}T12:00:00`),
        systolic: v.systolic.length ? Math.round(v.systolic.reduce((s, x) => s + x, 0) / v.systolic.length) : null,
        diastolic: v.diastolic.length ? Math.round(v.diastolic.reduce((s, x) => s + x, 0) / v.diastolic.length) : null,
      }))
  }, [bpData])

  // Latest values for summary cards
  const latestWeight = weightPoints.length ? weightPoints[weightPoints.length - 1] : null
  const latestFat = bodyFatPoints.length ? bodyFatPoints[bodyFatPoints.length - 1] : null
  const latestSpo2 = spo2Points.length ? spo2Points[spo2Points.length - 1] : null
  const latestTemp = tempPoints.length ? tempPoints[tempPoints.length - 1] : null
  const latestRR = rrPoints.length ? rrPoints[rrPoints.length - 1] : null
  const latestBP = bpChartData.length ? bpChartData[bpChartData.length - 1] : null

  const weightTrend = trend(weightPoints)
  const fatTrend = trend(bodyFatPoints)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 animate-fade-in-down">Body Metrics</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Weight, body composition, blood pressure, and vital signs from your connected devices.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 min-w-0">
            <label htmlFor="body-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
            <select
              id="body-user"
              className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName ?? u.email ?? u.externalId}</option>)}
            </select>
          </div>
          <div className="flex gap-1.5">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setRangeDays(r.days)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  rangeDays === r.days
                    ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!selectedUserId ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 py-20 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a user to view body metrics.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger-grid">
            <SummaryCard
              icon="⚖️" label="Weight" value={latestWeight?.avg} unit="kg" decimals={1}
              trend={weightTrend}
              color="from-blue-500 to-indigo-600"
            />
            <SummaryCard
              icon="📊" label="Body Fat" value={latestFat?.avg} unit="%" decimals={1}
              trend={fatTrend}
              color="from-purple-500 to-pink-500"
            />
            <SummaryCard
              icon="🩸" label="Blood Pressure"
              customValue={latestBP ? `${latestBP.systolic}/${latestBP.diastolic}` : null}
              unit="mmHg"
              color="from-red-500 to-rose-600"
              status={latestBP ? bpStatus(latestBP.systolic!, latestBP.diastolic!) : undefined}
            />
            <SummaryCard
              icon="🫁" label="SpO₂" value={latestSpo2?.avg} unit="%" decimals={0}
              color="from-cyan-500 to-teal-500"
              status={latestSpo2?.avg ? (latestSpo2.avg >= 95 ? "normal" : latestSpo2.avg >= 90 ? "warning" : "critical") : undefined}
            />
            <SummaryCard
              icon="🌡️" label="Temperature" value={latestTemp?.avg} unit="°C" decimals={1}
              color="from-amber-500 to-orange-500"
              status={latestTemp?.avg ? (latestTemp.avg >= 36 && latestTemp.avg <= 37.5 ? "normal" : latestTemp.avg > 38 ? "critical" : "warning") : undefined}
            />
            <SummaryCard
              icon="💨" label="Resp. Rate" value={latestRR?.avg} unit="brpm" decimals={0}
              color="from-emerald-500 to-green-600"
              status={latestRR?.avg ? (latestRR.avg >= 12 && latestRR.avg <= 20 ? "normal" : "warning") : undefined}
            />
          </div>

          {/* Weight & Body Fat Chart */}
          {weightChartData.length > 0 && (
            <ChartCard title="Weight & Body Composition" subtitle="Daily averages over selected period">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={weightChartData}>
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="date" tick={TICK_STYLE} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="weight" tick={TICK_STYLE} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <YAxis yAxisId="fat" orientation="right" tick={TICK_STYLE} tickLine={false} axisLine={false} domain={[0, 50]} hide={!weightChartData.some((d) => d.bodyFat != null)} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Area yAxisId="weight" type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2} fill="url(#weightGrad)" name="Weight (kg)" connectNulls />
                  <Area yAxisId="fat" type="monotone" dataKey="bodyFat" stroke="#ec4899" strokeWidth={2} fill="url(#fatGrad)" name="Body Fat (%)" connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Blood Pressure Chart */}
          {bpChartData.length > 0 && (
            <ChartCard title="Blood Pressure" subtitle="Systolic / Diastolic (mmHg)">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={bpChartData}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="date" tick={TICK_STYLE} tickLine={false} axisLine={false} />
                  <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} domain={[40, 180]} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <ReferenceLine y={120} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Normal Sys", position: "right", fill: "#22c55e", fontSize: 10 }} />
                  <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Normal Dia", position: "right", fill: "#22c55e", fontSize: 10 }} />
                  <ReferenceLine y={140} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.4} />
                  <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.4} />
                  <Line type="monotone" dataKey="systolic" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Systolic" connectNulls />
                  <Line type="monotone" dataKey="diastolic" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Diastolic" connectNulls />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-gray-500 dark:text-gray-400 px-2">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-green-500/40" /> Normal (&lt;120/80)</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-red-500/40" /> High (&gt;140/90)</span>
              </div>
            </ChartCard>
          )}

          {/* Vitals Mini-Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {spo2Points.length > 0 && (
              <MiniChart title="SpO₂" unit="%" data={spo2Points} color="#06b6d4" refLine={95} refLabel="Normal ≥95%" />
            )}
            {tempPoints.length > 0 && (
              <MiniChart title="Temperature" unit="°C" data={tempPoints} color="#f59e0b" refLine={37} refLabel="Normal ≤37°C" />
            )}
            {rrPoints.length > 0 && (
              <MiniChart title="Respiratory Rate" unit="brpm" data={rrPoints} color="#10b981" refLine={20} refLabel="Normal 12-20" />
            )}
          </div>

          {/* Data counts */}
          {bodySummary.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Data Points Synced</h3>
              <div className="flex flex-wrap gap-3">
                {bodySummary.map((s) => (
                  <div key={s.metricType} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5">
                    <span className="mr-2">{METRIC_ICONS[s.metricType] ?? "📍"}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{s.count}</span>
                    <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">{METRIC_LABELS[s.metricType] ?? s.metricType}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No data state */}
          {bodySummary.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 py-16 text-center">
              <p className="text-3xl mb-3">🩺</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No body metrics yet</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Connect a Withings device or similar provider to start syncing weight, body composition, and vitals.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Components ─────────────────────────────────────────────────────────────

function bpStatus(sys: number, dia: number): "normal" | "warning" | "critical" {
  if (sys < 120 && dia < 80) return "normal"
  if (sys >= 140 || dia >= 90) return "critical"
  return "warning"
}

const STATUS_COLORS = {
  normal: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
  warning: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
  critical: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
}

const STATUS_LABELS = { normal: "Normal", warning: "Elevated", critical: "High" }

function SummaryCard({ icon, label, value, customValue, unit, decimals = 1, trend: t, color, status }: {
  icon: string
  label: string
  value?: number | null | undefined
  customValue?: string | null | undefined
  unit: string
  decimals?: number
  trend?: { direction: "up" | "down" | "flat"; pct: number }
  color: string
  status?: "normal" | "warning" | "critical" | undefined
}){
  const displayValue = customValue ?? (value != null ? value.toFixed(decimals) : "—")
  const hasData = customValue != null || value != null

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white text-sm shadow-md`}>
          {icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{displayValue}</span>
        {hasData && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {t && t.direction !== "flat" && (
          <span className={`text-[10px] font-medium ${t.direction === "down" ? "text-emerald-600" : "text-amber-600"}`}>
            {t.direction === "up" ? "▲" : "▼"} {t.pct}%
          </span>
        )}
        {status && (
          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${STATUS_COLORS[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        )}
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <p className="text-[10px] text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function MiniChart({ title, unit, data, color, refLine, refLabel }: {
  title: string
  unit: string
  data: TimeseriesPoint[]
  color: string
  refLine?: number
  refLabel?: string
}) {
  const chartData = data.map((p) => ({
    date: shortDate(p.bucket),
    value: p.avg != null ? Math.round(p.avg * 10) / 10 : null,
  }))

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        {data.length > 0 && (() => {
          const last = data[data.length - 1]!
          return (
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">
              {last.avg != null ? (Math.round(last.avg * 10) / 10) : "—"} {unit}
            </span>
          )
        })()}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={TICK_STYLE} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip {...TOOLTIP_STYLE} />
          {refLine && <ReferenceLine y={refLine} stroke={color} strokeDasharray="3 3" strokeOpacity={0.4} />}
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#grad-${title})`} name={`${title} (${unit})`} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
      {refLabel && <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 text-center">{refLabel}</p>}
    </div>
  )
}
