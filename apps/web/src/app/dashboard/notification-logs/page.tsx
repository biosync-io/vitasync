"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import {
  type ChannelType,
  type NotificationLog,
  notificationsApi,
  usersApi,
} from "../../../lib/api"
import { Pagination } from "../../../lib/Pagination"

// ── Constants ──────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<ChannelType, string> = {
  discord: "💬",
  slack: "📱",
  teams: "👥",
  email: "✉️",
  push: "🔔",
  ntfy: "📡",
  webhook: "🌐",
}

const STATUS_STYLES: Record<string, { bg: string; dot: string; label: string }> = {
  delivered: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    dot: "bg-emerald-500",
    label: "Delivered",
  },
  pending: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    dot: "bg-amber-500",
    label: "Pending",
  },
  failed: {
    bg: "bg-red-50 dark:bg-red-950/30",
    dot: "bg-red-500",
    label: "Failed",
  },
}

const DEFAULT_STATUS: { bg: string; dot: string; label: string } = {
  bg: "bg-gray-50 dark:bg-gray-950/30",
  dot: "bg-gray-500",
  label: "Unknown",
}

const PAGE_SIZE = 20

// ── Main Page ──────────────────────────────────────────────────────

export default function NotificationLogsPage() {
  const [selectedUserId, setSelectedUserId] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [channelFilter, setChannelFilter] = useState<string>("")
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: logsResult, isLoading } = useQuery({
    queryKey: ["notification-logs", selectedUserId],
    queryFn: () => notificationsApi.listLogs(selectedUserId, { limit: 200 }),
    enabled: !!selectedUserId,
    refetchInterval: 10_000, // Auto-refresh every 10s
  })
  const allLogs = logsResult?.data ?? []

  // Client-side filtering
  const filteredLogs = allLogs.filter((log) => {
    if (statusFilter && log.status !== statusFilter) return false
    if (channelFilter && log.channelType !== channelFilter) return false
    return true
  })

  const pagedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Stats
  const stats = {
    total: allLogs.length,
    delivered: allLogs.filter((l) => l.status === "delivered").length,
    pending: allLogs.filter((l) => l.status === "pending").length,
    failed: allLogs.filter((l) => l.status === "failed").length,
  }

  const channelTypes = [...new Set(allLogs.map((l) => l.channelType))]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notification Logs</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Complete delivery history for all notification channels. Auto-refreshes every 10 seconds.
        </p>
      </div>

      {/* User selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="log-user" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          User
        </label>
        <select
          id="log-user"
          value={selectedUserId}
          onChange={(e) => { setSelectedUserId(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Select user…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName || u.email || u.externalId}
            </option>
          ))}
        </select>
      </div>

      {!selectedUserId ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-16 text-center">
          <p className="text-gray-400 dark:text-gray-500 text-sm">Select a user to view their notification activity.</p>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total" value={stats.total} color="text-gray-900 dark:text-gray-100" />
            <StatCard label="Delivered" value={stats.delivered} color="text-emerald-600 dark:text-emerald-400" />
            <StatCard label="Pending" value={stats.pending} color="text-amber-600 dark:text-amber-400" />
            <StatCard label="Failed" value={stats.failed} color="text-red-600 dark:text-red-400" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="delivered">Delivered</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={channelFilter}
              onChange={(e) => { setChannelFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              aria-label="Filter by channel type"
            >
              <option value="">All channels</option>
              {channelTypes.map((ct) => (
                <option key={ct} value={ct}>
                  {ct.charAt(0).toUpperCase() + ct.slice(1)}
                </option>
              ))}
            </select>
            <span className="flex items-center text-xs text-gray-400 dark:text-gray-500">
              {filteredLogs.length} result{filteredLogs.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Log list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-indigo-600" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-12 text-center">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {allLogs.length === 0 ? "No notification activity yet." : "No logs match the current filters."}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Channel</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Attempts</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {pagedLogs.map((log) => {
                          const st = STATUS_STYLES[log.status] ?? DEFAULT_STATUS
                      const isExpanded = expandedId === log.id
                      return (
                        <>
                          <tr
                            key={log.id}
                            className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          >
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                                {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm">
                                {CHANNEL_ICONS[log.channelType] ?? "📣"}{" "}
                                <span className="text-gray-700 dark:text-gray-300">{log.channelType}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-900 dark:text-gray-100 truncate max-w-xs block">{log.title}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-500 dark:text-gray-400">{log.attempts}</span>
                            </td>
                            <td className="px-4 py-3">
                              <TimeAgo date={log.deliveredAt ?? log.createdAt} />
                            </td>
                            <td className="px-4 py-3 text-gray-400">
                              <span className={`transform transition-transform inline-block ${isExpanded ? "rotate-90" : ""}`}>›</span>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${log.id}-detail`} className="bg-gray-50 dark:bg-gray-800/30">
                              <td colSpan={6} className="px-4 py-4">
                                <LogDetail log={log} />
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {pagedLogs.map((log) => {
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
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                              {st.label}
                            </span>
                            <span className="text-sm">
                              {CHANNEL_ICONS[log.channelType]} {log.channelType}
                            </span>
                          </div>
                          <TimeAgo date={log.deliveredAt ?? log.createdAt} />
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-2 truncate">
                          {log.title}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {log.attempts} attempt{log.attempts !== 1 ? "s" : ""}
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

              <Pagination page={page} pageSize={PAGE_SIZE} total={filteredLogs.length} onChange={setPage} />
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Log Detail Expanded Panel ─────────────────────────────────────

function LogDetail({ log }: { log: NotificationLog }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-medium text-gray-500 dark:text-gray-400">Log ID</p>
          <p className="font-mono text-gray-700 dark:text-gray-300 break-all">{log.id}</p>
        </div>
        <div>
          <p className="font-medium text-gray-500 dark:text-gray-400">Channel ID</p>
          <p className="font-mono text-gray-700 dark:text-gray-300 break-all">{log.channelId}</p>
        </div>
        <div>
          <p className="font-medium text-gray-500 dark:text-gray-400">Created</p>
          <p className="text-gray-700 dark:text-gray-300">{new Date(log.createdAt).toLocaleString()}</p>
        </div>
        <div>
          <p className="font-medium text-gray-500 dark:text-gray-400">Delivered</p>
          <p className="text-gray-700 dark:text-gray-300">
            {log.deliveredAt ? new Date(log.deliveredAt).toLocaleString() : "—"}
          </p>
        </div>
      </div>

      {log.error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">Error</p>
          <p className="text-xs text-red-600 dark:text-red-300 mt-0.5 font-mono break-all">{log.error}</p>
        </div>
      )}

      {log.payload && Object.keys(log.payload).length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Payload</p>
          <pre className="rounded-lg bg-gray-100 dark:bg-gray-800 p-3 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto max-h-40">
            {JSON.stringify(log.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
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
