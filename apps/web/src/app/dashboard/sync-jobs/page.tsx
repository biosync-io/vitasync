"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { type SyncJob, syncJobsApi } from "../../../lib/api"
import { Pagination } from "../../../lib/Pagination"
import { ExportButton } from "../../../lib/ExportButton"

const PAGE_SIZE = 25

const STATES = ["active", "waiting", "delayed", "completed", "failed"] as const

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
  const [page, setPage] = useState(1)
  const [stateFilter, setStateFilter] = useState<SyncJob["state"] | "">("")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "duration">("newest")

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["sync-jobs"],
    queryFn: syncJobsApi.list,
    refetchInterval: 5_000,
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

    // Text search (job ID, connection ID, user ID, type)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (j) =>
          j.id?.toLowerCase().includes(q) ||
          j.data.connectionId?.toLowerCase().includes(q) ||
          j.data.userId?.toLowerCase().includes(q) ||
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
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sync Jobs</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Live view of the BullMQ sync queue. Refreshes every 5 seconds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ["sync-jobs"] })}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Failed jobs alert banner */}
      {(() => {
        const failedJobs = allJobs.filter((j) => j.state === "failed")
        if (failedJobs.length === 0) return null
        return (
          <div className="mb-4 rounded-2xl border border-red-200 dark:border-red-800/40 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/20 px-5 py-4 flex items-start gap-3">
            <span className="text-xl shrink-0 mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">{failedJobs.length} sync job{failedJobs.length > 1 ? "s" : ""} failed</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                {failedJobs.slice(0, 3).map((j) => j.failedReason?.slice(0, 80) ?? "Unknown error").join(" · ")}
                {failedJobs.length > 3 && ` and ${failedJobs.length - 3} more…`}
              </p>
            </div>
            <button type="button" onClick={() => { setStateFilter("failed"); setPage(1) }} className="shrink-0 rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">
              View Failed
            </button>
          </div>
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
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-all ${STATE_STYLES[state]} ${
              stateFilter === state
                ? "ring-2 ring-offset-1 ring-current scale-105"
                : stateFilter && stateFilter !== state
                  ? "opacity-50"
                  : ""
            }`}
          >
            <span>{STATE_ICONS[state]}</span>
            <span className="capitalize">{state}</span>
            <span className="ml-0.5 font-bold">{counts[state] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Filters bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
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
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Clear filters
            </button>
          )}
          <ExportButton
            data={filteredJobs.map((j) => ({
              id: j.id ?? "",
              state: j.state,
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

      {/* Results count */}
      {hasActiveFilters && !isLoading && (
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          Showing {filteredJobs.length} of {allJobs.length} jobs
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
            <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 py-20 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {hasActiveFilters ? "No jobs match the current filters." : "No sync jobs in the queue."}
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {hasActiveFilters ? (
              <button type="button" onClick={clearFilters} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                Clear all filters
              </button>
            ) : (
              "Jobs appear here when providers are synced manually or by the scheduler."
            )}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          <div className="hidden sm:block rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800/60">
                  <tr>
                    {["Status", "Job ID", "Connection", "User", "Started", "Duration", "Attempts", "Error"].map(
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
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLES[job.state]}`}
                        >
                          {STATE_ICONS[job.state]}{" "}
                          <span className="capitalize">{job.state}</span>
                        </span>
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
          </div>

          {/* Mobile card view */}
          <div className="sm:hidden space-y-3">
            {jobs.map((job) => (
              <div
                key={`m-${job.id}-${job.timestamp}`}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLES[job.state]}`}
                  >
                    {STATE_ICONS[job.state]} <span className="capitalize">{job.state}</span>
                  </span>
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
              </div>
            ))}
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={filteredJobs.length} onChange={setPage} />
        </>
      )}
    </div>
  )
}
