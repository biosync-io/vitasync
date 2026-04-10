"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type HealthMetric, type HealthSummary, healthApi} from "../../../lib/api"
import { Pagination } from "../../../lib/Pagination"
import { PageHeader, Card, CardHeader, CardContent, StatCard, Badge, Select, Input, TableSkeleton, EmptyState } from "../../../lib/components/ui"
import { Database, Filter } from "lucide-react"

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
  const { selectedUserId } = useSelectedUser()
  const [metricType, setMetricType] = useState<string>("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)

  function resetPage() {
    setPage(1)
  }



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
    <div className="space-y-8">
      <PageHeader
        title="Health Data"
        subtitle="Browse, filter, and explore synced health metrics for any user."
      />

      {/* Filters */}
      <Card>
        <CardHeader title="Filters" icon={<Filter className="h-4 w-4" />} />
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Metric Type"
              options={[
                { value: "", label: "All metrics" },
                ...summary.map((s) => ({
                  value: s.metricType,
                  label: `${METRIC_LABELS[s.metricType] ?? s.metricType} (${s.count})`,
                })),
              ]}
              value={metricType}
              onChange={(e) => { setMetricType(e.target.value); resetPage() }}
              disabled={!selectedUserId}
            />
            <Input label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); resetPage() }} />
            <Input label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); resetPage() }} />
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      {selectedUserId && summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {summary.map((s) => (
            <div
              key={s.metricType}
              onClick={() => { setMetricType(s.metricType === metricType ? "" : s.metricType); resetPage() }}
              className="cursor-pointer"
            >
              <StatCard
                label={METRIC_LABELS[s.metricType] ?? s.metricType}
                value={s.count.toLocaleString()}
                color={metricType === s.metricType ? "brand" : "default"}
              />
            </div>
          ))}
        </div>
      )}

      {/* Data table */}
      {!selectedUserId ? null : loadingMetrics ? (
        <TableSkeleton rows={8} cols={5} />
      ) : metrics.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No health data found"
          description="No data matches the current filters. Trigger a sync via the Users page."
        />
      ) : (
        <>
          <Card>
            <CardHeader
              title={`${totalMetrics.toLocaleString()} records`}
              action={metricType ? <Badge variant="info">{METRIC_LABELS[metricType] ?? metricType}</Badge> : undefined}
            />
            <CardContent className="p-0">
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      {["Metric", "Value", "Unit", "Recorded At", "Source"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {metrics.map((m) => (
                      <MetricRow key={m.id} metric={m} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
                {metrics.map((m) => (
                  <div key={`m-${m.id}`} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {METRIC_LABELS[m.metricType] ?? m.metricType}
                      </span>
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                        {typeof m.value === "number"
                          ? m.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : m.value}
                        {m.unit ? ` ${m.unit}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                      <span>{new Date(m.recordedAt).toLocaleString()}</span>
                      <span>{m.source ?? m.providerId ?? "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Pagination page={page} pageSize={PAGE_SIZE} total={totalMetrics} onChange={setPage} />
        </>
      )}
    </div>
  )
}

function MetricRow({ metric }: { metric: HealthMetric }) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
        {METRIC_LABELS[metric.metricType] ?? metric.metricType}
      </td>
      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 tabular-nums">
        {typeof metric.value === "number"
          ? metric.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : metric.value}
      </td>
      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{metric.unit ?? "—"}</td>
      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{new Date(metric.recordedAt).toLocaleString()}</td>
      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{metric.source ?? metric.providerId ?? "—"}</td>
    </tr>
  )
}
