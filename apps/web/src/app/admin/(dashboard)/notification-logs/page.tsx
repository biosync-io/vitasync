"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Bell } from "lucide-react"
import {
  type ChannelType,
  type NotificationLog,
  notificationsApi,
} from "../../../../lib/api"
import { Pagination } from "../../../../lib/Pagination"
import {
  PageHeader,
  Card,
  CardContent,
  Badge,
  TableSkeleton,
  EmptyState,
  StatCard,
} from "../../../../lib/components/ui"

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
  const selectedUserId = ""
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [channelFilter, setChannelFilter] = useState<string>("")
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)


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
      <PageHeader
        title="Notification Logs"
        subtitle="Complete delivery history for all notification channels. Auto-refreshes every 10 seconds."
      />

      {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total" value={stats.total} color="default" />
            <StatCard label="Delivered" value={stats.delivered} color="vitality" />
            <StatCard label="Pending" value={stats.pending} color="brand" />
            <StatCard label="Failed" value={stats.failed} color="accent" />
          </div>

          {/* Filters */}
          <Card>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Log list */}
          {isLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={allLogs.length === 0 ? "No notification activity yet" : "No logs match the current filters"}
              description={allLogs.length === 0 ? "Notifications will appear here once channels are configured." : "Try adjusting your filters."}
            />
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden sm:block">
                <CardContent className="p-0">
                  <div className="overflow-hidden">
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
                              <Badge
                                variant={log.status === "delivered" ? "success" : log.status === "pending" ? "warning" : log.status === "failed" ? "danger" : "default"}
                                dot
                                size="sm"
                              >
                                {st.label}
                              </Badge>
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
                </CardContent>
              </Card>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {pagedLogs.map((log) => {
                  const st = STATUS_STYLES[log.status] ?? DEFAULT_STATUS
                  const isExpanded = expandedId === log.id
                  return (
                    <Card key={log.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={log.status === "delivered" ? "success" : log.status === "pending" ? "warning" : log.status === "failed" ? "danger" : "default"}
                              dot
                              size="sm"
                            >
                              {st.label}
                            </Badge>
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
                    </Card>
                  )
                })}
              </div>

              <Pagination page={page} pageSize={PAGE_SIZE} total={filteredLogs.length} onChange={setPage} />
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
