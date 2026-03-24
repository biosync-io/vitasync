"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { type InboundWebhookLog, inboundWebhookLogsApi } from "../../../lib/api"
import { Pagination } from "../../../lib/Pagination"

// ── Constants ──────────────────────────────────────────────────────

const PROVIDERS = ["whoop", "fitbit", "garmin", "strava", "withings"] as const

const PROVIDER_COLORS: Record<string, { bg: string; text: string }> = {
  whoop: { bg: "bg-rose-100 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300" },
  fitbit: { bg: "bg-cyan-100 dark:bg-cyan-950/40", text: "text-cyan-700 dark:text-cyan-300" },
  garmin: { bg: "bg-blue-100 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300" },
  strava: { bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300" },
  withings: { bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300" },
}

const DEFAULT_PROVIDER_COLOR = { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" }

const STATUS_STYLES: Record<string, { bg: string; dot: string; label: string }> = {
  processed: { bg: "bg-emerald-50 dark:bg-emerald-950/30", dot: "bg-emerald-500", label: "Processed" },
  rejected: { bg: "bg-red-50 dark:bg-red-950/30", dot: "bg-red-500", label: "Rejected" },
  error: { bg: "bg-red-50 dark:bg-red-950/30", dot: "bg-red-500", label: "Error" },
  no_connection: { bg: "bg-gray-50 dark:bg-gray-900/30", dot: "bg-gray-400", label: "No Connection" },
}

const DEFAULT_STATUS = { bg: "bg-gray-50 dark:bg-gray-900/30", dot: "bg-gray-400", label: "Unknown" }

const PAGE_SIZE = 25

// ── Main Page ──────────────────────────────────────────────────────

export default function PartnerEventsPage() {
  const [providerFilter, setProviderFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ["inbound-webhook-logs", providerFilter, statusFilter, fromDate, toDate, page],
    queryFn: () => {
      const opts: Parameters<typeof inboundWebhookLogsApi.list>[0] = {
        limit: PAGE_SIZE,
        offset,
      }
      if (providerFilter) opts!.providerId = providerFilter
      if (statusFilter) opts!.status = statusFilter
      if (fromDate) opts!.from = fromDate
      if (toDate) opts!.to = toDate
      return inboundWebhookLogsApi.list(opts)
    },
    refetchInterval: 15_000,
  })

  const logs = data?.data ?? []
  const total = data?.total ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Partner Events</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Track inbound webhook events from health data providers. Auto-refreshes every 15 seconds.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={providerFilter}
          onChange={(e) => { setProviderFilter(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Filter by provider"
        >
          <option value="">All Providers</option>
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="processed">Processed</option>
          <option value="rejected">Rejected</option>
          <option value="error">Error</option>
          <option value="no_connection">No Connection</option>
        </select>

        <input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="From date"
          placeholder="From"
        />

        <input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="To date"
          placeholder="To"
        />

        <span className="flex items-center text-xs text-gray-400 dark:text-gray-500">
          {total} result{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-indigo-600" />
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-16 text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {total === 0 ? "No inbound webhook events recorded yet." : "No events match the current filters."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Provider</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">User ID</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Data Points</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map((log) => {
                  const provColor = PROVIDER_COLORS[log.providerId] ?? DEFAULT_PROVIDER_COLOR
                  const st = STATUS_STYLES[log.status] ?? DEFAULT_STATUS
                  const isExpanded = expandedId === log.id
                  return (
                    <DesktopRow
                      key={log.id}
                      log={log}
                      provColor={provColor}
                      st={st}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedId(isExpanded ? null : log.id)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {logs.map((log) => {
              const provColor = PROVIDER_COLORS[log.providerId] ?? DEFAULT_PROVIDER_COLOR
              const st = STATUS_STYLES[log.status] ?? DEFAULT_STATUS
              const isExpanded = expandedId === log.id
              return (
                <div
                  key={log.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${provColor.bg} ${provColor.text}`}>
                          {log.providerId}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </div>
                      <TimeAgo date={log.createdAt} />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 truncate">
                      {log.providerUserId ?? "—"}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {log.dataPointsIngested} data point{log.dataPointsIngested !== 1 ? "s" : ""} ingested
                    </p>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
                      <LogDetail log={log} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}
    </div>
  )
}

// ── Desktop Table Row ──────────────────────────────────────────────

function DesktopRow({
  log,
  provColor,
  st,
  isExpanded,
  onToggle,
}: {
  log: InboundWebhookLog
  provColor: { bg: string; text: string }
  st: { bg: string; dot: string; label: string }
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${provColor.bg} ${provColor.text}`}>
            {log.providerId}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-xs block">
            {log.providerUserId ?? "—"}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{log.dataPointsIngested}</span>
        </td>
        <td className="px-4 py-3">
          <TimeAgo date={log.createdAt} />
        </td>
        <td className="px-4 py-3 text-gray-400">
          <span className={`transform transition-transform inline-block ${isExpanded ? "rotate-90" : ""}`}>›</span>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-50 dark:bg-gray-800/30">
          <td colSpan={6} className="px-4 py-4">
            <LogDetail log={log} />
          </td>
        </tr>
      )}
    </>
  )
}

// ── Log Detail Expanded Panel ─────────────────────────────────────

function LogDetail({ log }: { log: InboundWebhookLog }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-medium text-gray-500 dark:text-gray-400">Log ID</p>
          <p className="font-mono text-gray-700 dark:text-gray-300 break-all">{log.id}</p>
        </div>
        <div>
          <p className="font-medium text-gray-500 dark:text-gray-400">Event Type</p>
          <p className="text-gray-700 dark:text-gray-300">{log.eventType ?? "—"}</p>
        </div>
        <div>
          <p className="font-medium text-gray-500 dark:text-gray-400">Connection ID</p>
          <p className="font-mono text-gray-700 dark:text-gray-300 break-all">{log.connectionId ?? "—"}</p>
        </div>
        <div>
          <p className="font-medium text-gray-500 dark:text-gray-400">Signature Valid</p>
          <p className="text-gray-700 dark:text-gray-300">
            {log.signatureValid === null ? "—" : log.signatureValid ? "✅ Yes" : "❌ No"}
          </p>
        </div>
        <div>
          <p className="font-medium text-gray-500 dark:text-gray-400">HTTP Status</p>
          <p className="text-gray-700 dark:text-gray-300">{log.httpStatus ?? "—"}</p>
        </div>
        <div>
          <p className="font-medium text-gray-500 dark:text-gray-400">Created</p>
          <p className="text-gray-700 dark:text-gray-300">{new Date(log.createdAt).toLocaleString()}</p>
        </div>
      </div>

      {log.error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">Error</p>
          <p className="text-xs text-red-600 dark:text-red-300 mt-0.5 font-mono break-all">{log.error}</p>
        </div>
      )}

      {log.metadata && Object.keys(log.metadata).length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Metadata</p>
          <pre className="rounded-lg bg-gray-100 dark:bg-gray-800 p-3 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto max-h-40">
            {JSON.stringify(log.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Time Ago Component ────────────────────────────────────────────

function TimeAgo({ date }: { date: string }) {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  let text: string
  if (diffSec < 60) text = "Just now"
  else if (diffSec < 3600) text = `${Math.floor(diffSec / 60)}m ago`
  else if (diffSec < 86400) text = `${Math.floor(diffSec / 3600)}h ago`
  else if (diffSec < 604800) text = `${Math.floor(diffSec / 86400)}d ago`
  else text = new Date(date).toLocaleDateString()

  return (
    <span className="text-xs text-gray-400 dark:text-gray-500" title={new Date(date).toLocaleString()}>
      {text}
    </span>
  )
}
