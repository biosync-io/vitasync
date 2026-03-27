"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { type ApiLogEntry, type ApiLogStats, apiLogsApi } from "../../../lib/api"
import { Pagination } from "../../../lib/Pagination"
import { ExportButton } from "../../../lib/ExportButton"

const PAGE_SIZE = 25

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  POST: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  PUT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  PATCH: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

function statusStyle(code: number): string {
  if (code < 300) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
  if (code < 400) return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
  if (code < 500) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
}

export default function ApiLogsPage() {
  const [page, setPage] = useState(1)
  const [methodFilter, setMethodFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [endpointFilter, setEndpointFilter] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")

  const queryParams = useMemo(() => ({
    method: methodFilter || undefined,
    status: statusFilter ? Number(statusFilter) : undefined,
    endpoint: endpointFilter || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }), [methodFilter, statusFilter, endpointFilter, fromDate, toDate, page])

  const { data, isLoading } = useQuery({
    queryKey: ["api-logs", queryParams],
    queryFn: () => apiLogsApi.list(queryParams),
    refetchInterval: 10_000,
  })

  const { data: stats } = useQuery<ApiLogStats>({
    queryKey: ["api-logs-stats"],
    queryFn: apiLogsApi.stats,
    refetchInterval: 30_000,
  })

  const logs = data?.data ?? []
  const total = data?.total ?? 0

  const exportData = logs.map((l) => ({
    time: new Date(l.createdAt).toLocaleString(),
    method: l.method,
    endpoint: l.endpoint,
    status: l.statusCode,
    duration: `${l.durationMs}ms`,
    error: l.errorMessage ?? "",
  }))

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">API Logs</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Record of all API calls with request/response details.
        </p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 p-4 shadow-card">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Calls</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalCalls.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 p-4 shadow-card">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Error Rate</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.errorRate}</p>
            {stats.errorCount > 0 && (
              <p className="text-xs text-red-500">↑ {stats.errorCount}</p>
            )}
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 p-4 shadow-card">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Avg Duration</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.avgDurationMs}ms</p>
          </div>
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 p-4 shadow-card">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Last 24h</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.last24h.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">🔍 Filters</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <select
            value={methodFilter}
            onChange={(e) => { setMethodFilter(e.target.value); setPage(1) }}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="">All Methods</option>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="">All Status</option>
            <option value="200">200 OK</option>
            <option value="201">201 Created</option>
            <option value="400">400 Bad Request</option>
            <option value="401">401 Unauthorized</option>
            <option value="403">403 Forbidden</option>
            <option value="404">404 Not Found</option>
            <option value="408">408 Timeout</option>
            <option value="429">429 Rate Limited</option>
            <option value="500">500 Server Error</option>
          </select>
          <input
            type="text"
            value={endpointFilter}
            onChange={(e) => { setEndpointFilter(e.target.value); setPage(1) }}
            placeholder="Filter by endpoint..."
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
          />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Results count + export */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Showing {logs.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}
        </p>
        <ExportButton data={exportData} filename="api-logs" label="Export JSON" />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton loader
            <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 p-12 text-center">
          <p className="text-gray-400">No API logs found matching your filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Endpoint</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${METHOD_STYLES[log.method] ?? "bg-gray-100 text-gray-600"}`}>
                        {log.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 max-w-xs truncate font-mono" title={log.endpoint}>
                      {log.endpoint}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${statusStyle(log.statusCode)}`}>
                        {log.statusCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {log.durationMs}ms
                    </td>
                    <td className="px-4 py-3 text-xs text-red-500 dark:text-red-400 max-w-[200px] truncate" title={log.errorMessage ?? undefined}>
                      {log.errorMessage ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${METHOD_STYLES[log.method] ?? "bg-gray-100 text-gray-600"}`}>
                    {log.method}
                  </span>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${statusStyle(log.statusCode)}`}>
                    {log.statusCode}
                  </span>
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300 font-mono truncate mb-1">{log.endpoint}</p>
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span>{new Date(log.createdAt).toLocaleString()}</span>
                  <span>{log.durationMs}ms</span>
                </div>
                {log.errorMessage && (
                  <p className="mt-2 text-xs text-red-500 truncate">{log.errorMessage}</p>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-4">
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
          </div>
        </>
      )}
    </div>
  )
}
