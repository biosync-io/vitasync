"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { History, ListFilter, RefreshCw, Search, Zap } from "lucide-react"
import { useMemo, useState } from "react"
import { type SyncJob, type SyncJobRecord, syncJobsApi } from "../../../../lib/api"
import {
  Badge,
  type BadgeVariant,
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  TableSkeleton,
} from "../../../../lib/components/ui"
import { ExportButton } from "../../../../lib/ExportButton"
import { Pagination } from "../../../../lib/Pagination"

const PAGE_SIZE = 25

const STATES = ["active", "waiting", "delayed", "completed", "failed"] as const

type Tab = "queue" | "history"

const STATE_STYLES: Record<SyncJob["state"], string> = {
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  waiting: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  delayed: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

const STATE_ICONS: Record<SyncJob["state"], string> = {
  active: "⟳",
  waiting: "⏳",
  delayed: "⏱",
  completed: "✓",
  failed: "✗",
}

const STATE_BADGE_VARIANTS: Record<SyncJob["state"], BadgeVariant> = {
  active: "info",
  waiting: "warning",
  delayed: "purple",
  completed: "success",
  failed: "danger",
}

function formatTs(ts: number | null): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString()
}

function formatDuration(job: SyncJob): string {
  if (!job.processedOn || !job.finishedOn) return "—"
  const ms = job.finishedOn - job.processedOn
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function SyncJobsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>("queue")
  const [page, setPage] = useState(1)
  const [stateFilter, setStateFilter] = useState<SyncJob["state"] | "">("")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "duration">("newest")

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["sync-jobs"],
    queryFn: syncJobsApi.list,
    refetchInterval: 5_000,
  })

  const sweepMutation = useMutation({
    mutationFn: syncJobsApi.sweep,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sync-jobs"] }),
  })

  const allJobs = data?.jobs ?? []

  const counts = allJobs.reduce(
    (acc, j) => {
      acc[j.state] = (acc[j.state] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  // Filtered + sorted jobs
  const filteredJobs = useMemo(() => {
    let result = allJobs

    // State filter
    if (stateFilter) {
      result = result.filter((j) => j.state === stateFilter)
    }

    // Text search (job ID, connection ID, user ID, provider, type)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (j) =>
          j.id?.toLowerCase().includes(q) ||
          j.data.connectionId?.toLowerCase().includes(q) ||
          j.data.userId?.toLowerCase().includes(q) ||
          j.data.providerId?.toLowerCase().includes(q) ||
          j.data.type?.toLowerCase().includes(q) ||
          j.name?.toLowerCase().includes(q),
      )
    }

    // Sort
    if (sortBy === "oldest") {
      result = [...result].sort((a, b) => a.timestamp - b.timestamp)
    } else if (sortBy === "duration") {
      result = [...result].sort((a, b) => {
        const durA = a.processedOn && a.finishedOn ? a.finishedOn - a.processedOn : 0
        const durB = b.processedOn && b.finishedOn ? b.finishedOn - b.processedOn : 0
        return durB - durA
      })
    } else {
      result = [...result].sort((a, b) => b.timestamp - a.timestamp)
    }

    return result
  }, [allJobs, stateFilter, search, sortBy])

  const jobs = filteredJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function clearFilters() {
    setStateFilter("")
    setSearch("")
    setSortBy("newest")
    setPage(1)
  }

  const hasActiveFilters = stateFilter !== "" || search.trim() !== "" || sortBy !== "newest"

  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Sync Jobs"
        subtitle="Live view of the BullMQ sync queue. Refreshes every 5 seconds."
        actions={
          <>
            {sweepMutation.isSuccess && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                {sweepMutation.data.message}
              </span>
            )}
            {sweepMutation.isError && (
              <span className="text-xs text-red-600 dark:text-red-400">
                Sweep failed
              </span>
            )}
            {dataUpdatedAt > 0 && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon={Zap}
              loading={sweepMutation.isPending}
              onClick={() => sweepMutation.mutate()}
            >
              Trigger Sync Sweep
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => qc.invalidateQueries({ queryKey: ["sync-jobs"] })}
            >
              Refresh
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <div className="mb-5 mt-6 flex gap-1 border-b border-gray-200 dark:border-gray-800">
        <button type="button" onClick={() => { setTab("queue"); setPage(1) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "queue" ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}>
          ⚡ Live Queue
        </button>
        <button type="button" onClick={() => { setTab("history"); setPage(1) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "history" ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}>
          📊 Sync History
        </button>
      </div>

      {tab === "history" ? (
        <SyncHistoryTab />
      ) : (
      <>
      {/* Failed jobs alert banner */}
      {(() => {
        const failedJobs = allJobs.filter((j) => j.state === "failed")
        if (failedJobs.length === 0) return null
        return (
          <Card className="mb-4 border-red-200 dark:border-red-800/40 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/20">
            <CardContent>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">⚠️</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">{failedJobs.length} sync job{failedJobs.length > 1 ? "s" : ""} failed</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    {failedJobs.slice(0, 3).map((j) => {
                      const provider = j.data.providerId ? `[${j.data.providerId}] ` : ""
                      return `${provider}${j.failedReason?.slice(0, 80) ?? "Unknown error"}`
                    }).join(" · ")}
                    {failedJobs.length > 3 && ` and ${failedJobs.length - 3} more…`}
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => { setStateFilter("failed"); setPage(1) }}>
                  View Failed
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Summary badges — clickable to filter by state */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATES.map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => {
              setStateFilter((prev) => (prev === state ? "" : state))
              setPage(1)
            }}
            className={`transition-all ${
              stateFilter === state
                ? "ring-2 ring-offset-1 ring-current scale-105"
                : stateFilter && stateFilter !== state
                  ? "opacity-50"
                  : ""
            }`}
          >
            <Badge variant={STATE_BADGE_VARIANTS[state]}>
              {STATE_ICONS[state]} <span className="capitalize">{state}</span>{" "}
              <span className="ml-0.5 font-bold">{counts[state] ?? 0}</span>
            </Badge>
          </button>
        ))}
      </div>

      {/* Filters bar */}
      <Card className="mb-4">
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by job ID, connection, user, type…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="duration">Longest duration</option>
              </select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
              <ExportButton
                data={filteredJobs.map((j) => ({
                  id: j.id ?? "",
                  state: j.state,
                  provider: j.data.providerId ?? "",
                  connectionId: j.data.connectionId ?? "",
                  userId: j.data.userId ?? "",
                  type: j.data.type ?? "",
                  started: j.processedOn ? new Date(j.processedOn).toISOString() : "",
                  finished: j.finishedOn ? new Date(j.finishedOn).toISOString() : "",
                  duration: j.processedOn && j.finishedOn ? `${j.finishedOn - j.processedOn}ms` : "",
                  attempts: j.attemptsMade,
                  error: j.failedReason ?? "",
                }))}
                filename="sync-jobs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      {hasActiveFilters && !isLoading && (
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          Showing {filteredJobs.length} of {allJobs.length} jobs
        </p>
      )}

      {isLoading ? (
        <TableSkeleton rows={5} cols={9} />
      ) : jobs.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={ListFilter}
            title="No jobs match the current filters."
            action={{ label: "Clear all filters", onClick: clearFilters }}
          />
        ) : (
          <EmptyState
            icon={ListFilter}
            title="No sync jobs in the queue."
            description="Jobs appear here when providers are synced manually or by the scheduler."
          />
        )
      ) : (
        <>
          {/* Desktop table view */}
          <Card className="hidden sm:block">
            <CardContent className="px-0 py-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      {["Status", "Provider", "Job ID", "Connection", "User", "Started", "Duration", "Attempts", "Error"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {jobs.map((job) => (
                      <tr key={`${job.id}-${job.timestamp}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3">
                          <Badge variant={STATE_BADGE_VARIANTS[job.state]} size="sm">
                            {STATE_ICONS[job.state]} <span className="capitalize">{job.state}</span>
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 capitalize whitespace-nowrap">
                          {job.data.providerId ?? job.data.type ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400 max-w-[120px] truncate">
                          {job.id ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 max-w-[140px] truncate">
                          {job.data.connectionId ? (
                            <span title={job.data.connectionId}>
                              {job.data.connectionId.slice(0, 8)}…
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">{job.data.type ?? "—"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                          {job.data.userId ? (
                            <span title={job.data.userId}>{job.data.userId.slice(0, 8)}…</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {job.processedOn ? formatTs(job.processedOn) : formatTs(job.timestamp)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                          {formatDuration(job)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                          {job.attemptsMade}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[300px]">
                          {job.failedReason ? (
                            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-2.5 py-1.5">
                              <p className="text-red-700 dark:text-red-400 font-medium break-words whitespace-pre-wrap">{job.failedReason}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile card view */}
          <div className="sm:hidden space-y-3">
            {jobs.map((job) => (
              <Card key={`m-${job.id}-${job.timestamp}`}>
                <CardContent>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={STATE_BADGE_VARIANTS[job.state]} size="sm">
                        {STATE_ICONS[job.state]} <span className="capitalize">{job.state}</span>
                      </Badge>
                      {job.data.providerId && (
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{job.data.providerId}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                      {job.attemptsMade} attempt{job.attemptsMade !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">Job ID</span>
                      <p className="font-mono text-gray-700 dark:text-gray-300 truncate">{job.id ?? "—"}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">Duration</span>
                      <p className="font-mono text-gray-700 dark:text-gray-300 tabular-nums">{formatDuration(job)}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">Connection</span>
                      <p className="font-mono text-gray-700 dark:text-gray-300 truncate">
                        {job.data.connectionId ? job.data.connectionId.slice(0, 12) + "…" : job.data.type ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">User</span>
                      <p className="font-mono text-gray-700 dark:text-gray-300 truncate">
                        {job.data.userId ? job.data.userId.slice(0, 12) + "…" : "—"}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400 dark:text-gray-500">Started</span>
                      <p className="text-gray-700 dark:text-gray-300">
                        {job.processedOn ? formatTs(job.processedOn) : formatTs(job.timestamp)}
                      </p>
                    </div>
                    {job.failedReason && (
                      <div className="col-span-2">
                        <span className="text-red-400">Error</span>
                        <p className="text-red-600 dark:text-red-400 break-words">{job.failedReason}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={filteredJobs.length} onChange={setPage} />
        </>
      )}
      </>
      )}
    </div>
  )
}

// ── Sync History Tab (PostgreSQL-backed) ────────────────────────────────

const HISTORY_PAGE_SIZE = 25
const DB_STATUSES = ["completed", "failed", "running", "pending"] as const

const DB_STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
}

const DB_STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  completed: "success",
  failed: "danger",
  running: "info",
  pending: "warning",
}

function formatDurationMs(ms: number | null): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

function SyncHistoryTab() {
  const [histPage, setHistPage] = useState(1)
  const [providerFilter, setProviderFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["sync-history", providerFilter, statusFilter, histPage],
    queryFn: () =>
      syncJobsApi.history({
        providerId: providerFilter || undefined,
        status: statusFilter || undefined,
        limit: HISTORY_PAGE_SIZE,
        offset: (histPage - 1) * HISTORY_PAGE_SIZE,
      }),
    refetchInterval: 15_000,
  })

  const records = data?.data ?? []
  const total = data?.total ?? 0

  // Collect unique providers from results for filter dropdown
  const providers = useMemo(() => {
    const set = new Set<string>()
    for (const r of records) {
      if (r.providerId) set.add(r.providerId)
    }
    return [...set].sort()
  }, [records])

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Persistent sync job records from the database with provider API call stats.
      </p>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setHistPage(1) }}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="">All statuses</option>
          {DB_STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        {providers.length > 0 && (
          <select
            value={providerFilter}
            onChange={(e) => { setProviderFilter(e.target.value); setHistPage(1) }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="">All providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500">{total} records</span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={10} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={History}
          title="No sync history records yet."
        />
      ) : (
        <>
          <Card>
            <CardContent className="px-0 py-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      {["Status", "Provider", "Metrics", "Events", "API Calls", "Errors", "Duration", "Endpoints", "Started", "Error"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {records.map((r) => {
                      const stats = r.providerCallStats
                      return (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-3">
                            <Badge variant={DB_STATUS_BADGE_VARIANTS[r.status] ?? "default"} size="sm">
                              {r.status}
                            </Badge>
                          </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 capitalize whitespace-nowrap">
                          {r.providerId ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 tabular-nums font-medium">
                          {r.metricsSynced > 0 ? r.metricsSynced.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 tabular-nums">
                          {r.eventsSynced > 0 ? r.eventsSynced : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums">
                          {stats ? (
                            <span className="font-medium text-indigo-600 dark:text-indigo-400">{stats.totalCalls}</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums">
                          {stats && stats.totalErrors > 0 ? (
                            <span className="font-medium text-red-600 dark:text-red-400">{stats.totalErrors}</span>
                          ) : stats ? (
                            <span className="text-green-600 dark:text-green-400">0</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
                          {formatDurationMs(r.durationMs)}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[350px]">
                          {stats && stats.endpoints.length > 0 ? (
                            <div className="space-y-1">
                              {stats.endpoints.map((ep) => (
                                <div key={ep.endpoint} className="flex items-center gap-2 rounded bg-gray-50 dark:bg-gray-800/60 px-2 py-1">
                                  <span className="font-mono text-[10px] text-gray-600 dark:text-gray-400 truncate flex-1" title={ep.endpoint}>
                                    {ep.endpoint}
                                  </span>
                                  <span className="shrink-0 text-[10px] tabular-nums font-medium text-gray-700 dark:text-gray-300">
                                    ×{ep.calls}
                                  </span>
                                  <span className="shrink-0 text-[10px] tabular-nums text-green-600 dark:text-green-400">
                                    ✓{ep.success}
                                  </span>
                                  {ep.errors > 0 && (
                                    <span className="shrink-0 text-[10px] tabular-nums text-red-600 dark:text-red-400">
                                      ✗{ep.errors}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(r.startedAt)}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[200px]">
                          {r.error ? (
                            <span className="text-red-600 dark:text-red-400 break-words line-clamp-2" title={r.error}>{r.error}</span>
                          ) : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>

          <Pagination page={histPage} pageSize={HISTORY_PAGE_SIZE} total={total} onChange={setHistPage} />
        </>
      )}
    </div>
  )
}
