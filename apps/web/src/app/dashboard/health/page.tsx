"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { type HealthMetric, type HealthSummary, healthApi, usersApi } from "../../../lib/api"
import { Pagination } from "../../../lib/Pagination"

const METRIC_LABELS: Record<string, string> = {
  steps: "Steps",
  distance_meters: "Distance (m)",
  calories: "Calories",
  heart_rate_bpm: "Heart Rate (bpm)",
  sleep_duration_minutes: "Sleep (min)",
  active_minutes: "Active Minutes",
  blood_pressure_systolic: "BP Systolic",
  blood_pressure_diastolic: "BP Diastolic",
  weight_kg: "Weight (kg)",
  spo2_percent: "SpO2 (%)",
}

const PAGE_SIZE = 100

export default function HealthDataPage() {
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [metricType, setMetricType] = useState<string>("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)

  function resetPage() {
    setPage(1)
  }

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })

  const usersForSelect = usersResult?.data ?? []

  const { data: summary = [] } = useQuery<HealthSummary[]>({
    queryKey: ["health-summary", selectedUserId],
    queryFn: () => healthApi.summary(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: metricsResult, isLoading: loadingMetrics } = useQuery({
    queryKey: ["health-data", selectedUserId, metricType, from, to, page],
    queryFn: () => {
      const fromIso = from ? new Date(from).toISOString() : undefined
      const toIso = to ? new Date(to).toISOString() : undefined
      return healthApi.query(selectedUserId, {
        ...(metricType ? { metricType } : {}),
        ...(fromIso !== undefined ? { from: fromIso } : {}),
        ...(toIso !== undefined ? { to: toIso } : {}),
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
    },
    enabled: !!selectedUserId,
  })

  const metrics = metricsResult?.data ?? []
  const totalMetrics = metricsResult?.count ?? 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Health Data</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse, filter, and explore synced health metrics for any user.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Filters</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="health-user" className="block text-xs font-medium text-gray-700">
              User
            </label>
            <select
              id="health-user"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white"
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value)
                setMetricType("")
                resetPage()
              }}
            >
              <option value="">Select a user…</option>
              {usersForSelect.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName ?? u.email ?? u.externalId}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="health-metric-type" className="block text-xs font-medium text-gray-700">
              Metric Type
            </label>
            <select
              id="health-metric-type"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white"
              value={metricType}
              onChange={(e) => { setMetricType(e.target.value); resetPage() }}
              disabled={!selectedUserId}
            >
              <option value="">All metrics</option>
              {summary.map((s) => (
                <option key={s.metricType} value={s.metricType}>
                  {METRIC_LABELS[s.metricType] ?? s.metricType} ({s.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="health-from" className="block text-xs font-medium text-gray-700">
              From
            </label>
            <input
              id="health-from"
              type="date"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white"
              value={from}
              onChange={(e) => { setFrom(e.target.value); resetPage() }}
            />
          </div>
          <div>
            <label htmlFor="health-to" className="block text-xs font-medium text-gray-700">
              To
            </label>
            <input
              id="health-to"
              type="date"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white"
              value={to}
              onChange={(e) => { setTo(e.target.value); resetPage() }}
            />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {selectedUserId && summary.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {summary.map((s) => (
            <button
              type="button"
              key={s.metricType}
              onClick={() => { setMetricType(s.metricType === metricType ? "" : s.metricType); resetPage() }}
              className={`rounded-xl border p-4 text-left transition-colors ${
                metricType === s.metricType
                  ? "border-indigo-300 bg-indigo-50"
                  : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/50"
              }`}
            >
              <p className="text-xs font-medium text-gray-500 truncate">
                {METRIC_LABELS[s.metricType] ?? s.metricType}
              </p>
              <p className="mt-1 text-xl font-bold text-gray-900">{s.count.toLocaleString()}</p>
              <p className="mt-1 text-xs text-gray-400">data points</p>
            </button>
          ))}
        </div>
      )}

      {/* Data table */}
      {!selectedUserId ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <p className="text-sm text-gray-500">Select a user to browse their health data.</p>
        </div>
      ) : loadingMetrics ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton loader — items have no stable identity
            <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : metrics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <p className="text-sm text-gray-500">
            No health data found for this user with the current filters.
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Trigger a sync via the Users page or{" "}
            <code className="rounded bg-gray-100 px-1">
              POST /v1/users/:id/connections/:cid/sync
            </code>
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              {totalMetrics.toLocaleString()} records
              {metricType && (
                <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                  {METRIC_LABELS[metricType] ?? metricType}
                </span>
              )}
            </p>
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Metric", "Value", "Unit", "Recorded At", "Source"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {metrics.map((m) => (
                <MetricRow key={m.id} metric={m} />
              ))}
            </tbody>
          </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={totalMetrics} onChange={setPage} />
        </>
      )}
    </div>
  )
}

function MetricRow({ metric }: { metric: HealthMetric }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 font-medium text-gray-900">
        {METRIC_LABELS[metric.metricType] ?? metric.metricType}
      </td>
      <td className="px-4 py-3 text-gray-700 tabular-nums">
        {typeof metric.value === "number"
          ? metric.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : metric.value}
      </td>
      <td className="px-4 py-3 text-gray-700">{metric.unit ?? "—"}</td>
      <td className="px-4 py-3 text-gray-700">{new Date(metric.recordedAt).toLocaleString()}</td>
      <td className="px-4 py-3 text-gray-500 text-xs">—</td>
    </tr>
  )
}
