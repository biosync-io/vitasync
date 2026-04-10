"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { RefreshCw, Zap } from "lucide-react"
import { type SyncJobRecord, userSyncJobsApi } from "../../../lib/api"
import { useSelectedUser } from "../../../lib/user-selection-context"
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  Badge,
  type BadgeVariant,
  EmptyState,
  TableSkeleton,
} from "../../../lib/components/ui"

const PAGE_SIZE = 25

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant; icon: string }> = {
  completed: { label: "Completed", variant: "success", icon: "✓" },
  failed: { label: "Failed", variant: "danger", icon: "✗" },
  running: { label: "Active", variant: "info", icon: "⟳" },
  pending: { label: "Pending", variant: "warning", icon: "⏳" },
}

const PROVIDER_EMOJI: Record<string, string> = {
  garmin: "⌚",
  fitbit: "📱",
  oura: "💍",
  whoop: "🏋️",
  apple_health: "🍎",
  google_fit: "🏃",
  withings: "⚖️",
  polar: "❄️",
  strava: "🚴",
  cronometer: "🥗",
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—"
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  if (diffMs < 0) return "just now"
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

export default function UserSyncJobsPage() {
  const { selectedUserId } = useSelectedUser()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ["user-sync-jobs", selectedUserId, page],
    queryFn: () =>
      userSyncJobsApi.list(selectedUserId, {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    enabled: !!selectedUserId,
    refetchInterval: 15_000,
  })

  const jobs = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const counts = useMemo(() => {
    const c = { completed: 0, failed: 0, running: 0, pending: 0 }
    for (const j of jobs) {
      if (j.status in c) c[j.status as keyof typeof c]++
    }
    return c
  }, [jobs])

  if (!selectedUserId) {
    return (
      <div>
        <PageHeader title="Sync History" subtitle="View sync activity for your connected devices" />
        <Card className="mt-6">
          <EmptyState
            icon={RefreshCw}
            title="No user selected"
            description="Please sign in to view your sync history."
          />
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Sync History" subtitle="View sync activity for your connected devices" />

      {/* Status summary */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["completed", "failed", "running", "pending"] as const).map((status) => {
          const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]!!
          return (
            <Badge key={status} variant={cfg.variant as "success" | "danger" | "info" | "warning"} dot>
              {cfg.icon} {cfg.label} {counts[status]}
            </Badge>
          )
        })}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 self-center">
          {total} total
        </span>
      </div>

      {/* Job list */}
      <Card className="mt-4">
        <CardHeader title="Recent Syncs" subtitle={`Showing page ${page} of ${totalPages}`} />
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={5} cols={6} />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={RefreshCw}
              title="No sync jobs yet"
              description="Sync jobs will appear here once your connected devices start syncing data."
              action={{ label: "Connect a Device", href: "/dashboard/providers", icon: Zap }}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      {["Status", "Provider", "Started", "Duration", "Metrics", "Events", "Error"].map((h) => (
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
                    {jobs.map((job) => (
                      <SyncJobRow key={job.id} job={job} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
                {jobs.map((job) => (
                  <SyncJobMobileCard key={job.id} job={job} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SyncJobRow({ job }: { job: SyncJobRecord }) {
  const cfg = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG]! ?? STATUS_CONFIG.pending
  const emoji = PROVIDER_EMOJI[job.providerId ?? ""] ?? "🔗"

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-3">
        <Badge variant={cfg.variant as any} size="sm" dot>
          {cfg.label}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
        {emoji} <span className="capitalize">{job.providerId ?? "Unknown"}</span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {formatRelativeTime(job.startedAt ?? job.createdAt)}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
        {formatDuration(job.durationMs)}
      </td>
      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 tabular-nums font-medium">
        {job.metricsSynced > 0 ? job.metricsSynced.toLocaleString() : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 tabular-nums">
        {job.eventsSynced > 0 ? job.eventsSynced : "—"}
      </td>
      <td className="px-4 py-3 text-xs max-w-[250px]">
        {job.error ? (
          <span
            className="text-red-600 dark:text-red-400 truncate block"
            title={job.error}
          >
            {job.error.length > 80 ? `${job.error.slice(0, 80)}…` : job.error}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
    </tr>
  )
}

function SyncJobMobileCard({ job }: { job: SyncJobRecord }) {
  const cfg = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG]! ?? STATUS_CONFIG.pending
  const emoji = PROVIDER_EMOJI[job.providerId ?? ""] ?? "🔗"

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {emoji} <span className="capitalize">{job.providerId ?? "Unknown"}</span>
        </span>
        <Badge variant={cfg.variant as any} size="sm" dot>
          {cfg.label}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{formatRelativeTime(job.startedAt ?? job.createdAt)}</span>
        <span>{formatDuration(job.durationMs)}</span>
        {job.metricsSynced > 0 && <span>{job.metricsSynced} metrics</span>}
        {job.eventsSynced > 0 && <span>{job.eventsSynced} events</span>}
      </div>
      {job.error && (
        <p className="text-xs text-red-600 dark:text-red-400 truncate" title={job.error}>
          {job.error.length > 100 ? `${job.error.slice(0, 100)}…` : job.error}
        </p>
      )}
    </div>
  )
}
