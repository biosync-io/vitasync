"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { type SyncJob, syncJobsApi } from "../../../lib/api"

const STATE_STYLES: Record<SyncJob["state"], string> = {
  active: "bg-blue-100 text-blue-700",
  waiting: "bg-yellow-100 text-yellow-700",
  delayed: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
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

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["sync-jobs"],
    queryFn: syncJobsApi.list,
    refetchInterval: 5_000,
  })

  const jobs = data?.jobs ?? []

  const counts = jobs.reduce(
    (acc, j) => {
      acc[j.state] = (acc[j.state] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sync Jobs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Live view of the BullMQ sync queue. Refreshes every 5 seconds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-gray-400">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ["sync-jobs"] })}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Summary badges */}
      <div className="mb-6 flex flex-wrap gap-3">
        {(["active", "waiting", "delayed", "completed", "failed"] as const).map((state) => (
          <div
            key={state}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${STATE_STYLES[state]}`}
          >
            <span>{STATE_ICONS[state]}</span>
            <span className="capitalize">{state}</span>
            <span className="ml-0.5 font-bold">{counts[state] ?? 0}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
            <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <p className="text-sm text-gray-500">No sync jobs in the queue.</p>
          <p className="mt-1 text-xs text-gray-400">
            Jobs appear here when providers are synced manually or by the scheduler.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Status", "Job ID", "Connection", "User", "Started", "Duration", "Attempts", "Error"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((job) => (
                <tr key={`${job.id}-${job.timestamp}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLES[job.state]}`}
                    >
                      {STATE_ICONS[job.state]}{" "}
                      <span className="capitalize">{job.state}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 max-w-[120px] truncate">
                    {job.id ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[140px] truncate">
                    {job.data.connectionId ? (
                      <span title={job.data.connectionId}>
                        {job.data.connectionId.slice(0, 8)}…
                      </span>
                    ) : (
                      <span className="text-gray-400">{job.data.type ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[120px] truncate">
                    {job.data.userId ? (
                      <span title={job.data.userId}>{job.data.userId.slice(0, 8)}…</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {job.processedOn ? formatTs(job.processedOn) : formatTs(job.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">
                    {formatDuration(job)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">
                    {job.attemptsMade}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600 max-w-[200px] truncate">
                    {job.failedReason ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
