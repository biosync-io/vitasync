"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { anomaliesApi, usersApi, type AnomalyData } from "../../../lib/api"

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  acknowledged: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
}

export default function AnomaliesPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [severityFilter, setSeverityFilter] = useState("")
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: anomaliesResult, isLoading } = useQuery({
    queryKey: ["anomalies", selectedUserId, severityFilter],
    queryFn: () => anomaliesApi.list(selectedUserId, severityFilter ? { severity: severityFilter } : {}),
    enabled: !!selectedUserId,
  })
  const anomalies = anomaliesResult?.data ?? []

  const detectMut = useMutation({
    mutationFn: () => anomaliesApi.detect(selectedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anomalies", selectedUserId] })
    },
  })

  const ackMut = useMutation({
    mutationFn: (anomalyId: string) => anomaliesApi.acknowledge(selectedUserId, anomalyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anomalies", selectedUserId] })
    },
  })

  const criticalCount = anomalies.filter((a) => a.severity === "critical" || a.severity === "high").length
  const newCount = anomalies.filter((a) => a.status === "new").length

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 animate-fade-in-down">Anomaly Detection</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">AI-powered detection of unusual patterns in your health metrics.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => detectMut.mutate()} disabled={detectMut.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {detectMut.isPending ? "Scanning…" : "Run Detection"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="anom-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
            <select id="anom-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="anom-sev" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Severity</label>
            <select id="anom-sev" className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view anomalies.</p>}

      {/* Summary cards */}
      {selectedUserId && anomalies.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3 stagger-grid">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Anomalies</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{anomalies.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">New (Unacknowledged)</p>
            <p className="text-2xl font-bold text-red-600">{newCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">High/Critical</p>
            <p className="text-2xl font-bold text-orange-600">{criticalCount}</p>
          </div>
        </div>
      )}

      {/* Anomaly table */}
      {selectedUserId && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Detected Anomalies</h3>
          </div>
          {isLoading ? (
            <div className="p-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
          ) : anomalies.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No anomalies detected. Run detection to scan recent data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-5 py-3 font-medium">Metric</th>
                  <th className="px-5 py-3 font-medium">Value</th>
                  <th className="px-5 py-3 font-medium">Expected</th>
                  <th className="px-5 py-3 font-medium">Z-Score</th>
                  <th className="px-5 py-3 font-medium">Severity</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Detected</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr></thead>
                <tbody>
                  {anomalies.map((a) => (
                    <tr key={a.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100 capitalize">{a.metricType?.replace(/_/g, " ")}</td>
                      <td className="px-5 py-3 text-red-600 font-mono">{(a.observedValue ?? 0).toFixed(1)}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400 font-mono">{(a.expectedValue ?? 0).toFixed(1)}</td>
                      <td className="px-5 py-3 font-mono text-gray-600 dark:text-gray-400">{a.zScore.toFixed(2)}σ</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[a.severity] ?? ""}`}>{a.severity}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status] ?? ""}`}>{a.status}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(a.detectedAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3">
                        {a.status === "new" && (
                          <button type="button" onClick={() => ackMut.mutate(a.id)} disabled={ackMut.isPending} className="rounded bg-gray-200 dark:bg-gray-700 px-2 py-1 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50">
                            Acknowledge
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
