"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { correlationsApi, usersApi, type CorrelationData } from "../../../lib/api"

function strengthColor(strength: string) {
  switch (strength) {
    case "strong": return "text-emerald-600"
    case "moderate": return "text-yellow-600"
    case "weak": return "text-gray-500"
    default: return "text-gray-500"
  }
}

function directionIcon(dir: string) {
  return dir === "positive" ? "↑↑" : dir === "negative" ? "↑↓" : "—"
}

function CorrelationBar({ coeff }: { coeff: number }) {
  const val = coeff ?? 0
  const abs = Math.abs(val)
  const pct = Math.round(abs * 100)
  const color = val >= 0 ? "bg-emerald-500" : "bg-red-500"
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{val.toFixed(3)}</span>
    </div>
  )
}

export default function CorrelationsPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: correlationsResult, isLoading } = useQuery({
    queryKey: ["correlations", selectedUserId],
    queryFn: () => correlationsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })
  const correlations = correlationsResult?.data ?? []

  const computeMut = useMutation({
    mutationFn: () => correlationsApi.compute(selectedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["correlations", selectedUserId] })
    },
  })

  const strongCorrelations = correlations.filter((c) => c.strength === "strong")
  const avgCoeff = correlations.length > 0 ? correlations.reduce((acc, c) => acc + Math.abs(c.coefficient ?? 0), 0) / correlations.length : 0

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Metric Correlations</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Discover relationships between your health metrics using statistical analysis.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => computeMut.mutate()} disabled={computeMut.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {computeMut.isPending ? "Computing…" : "Compute Correlations"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="corr-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="corr-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view correlations.</p>}

      {/* Summary */}
      {selectedUserId && correlations.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Pairs</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{correlations.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Strong Correlations</p>
            <p className="text-2xl font-bold text-emerald-600">{strongCorrelations.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg |Coefficient|</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{avgCoeff.toFixed(3)}</p>
          </div>
        </div>
      )}

      {/* Strong correlations highlight */}
      {selectedUserId && strongCorrelations.length > 0 && (
        <div className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Key Findings</h3>
          <div className="space-y-2">
            {strongCorrelations.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{c.metricA}</span>
                  <span className="mx-2 text-gray-400">{directionIcon(c.direction)}</span>
                  <span className="font-medium">{c.metricB}</span>
                </span>
                <span className={`font-mono font-medium ${(c.coefficient ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {(c.coefficient ?? 0) > 0 ? "+" : ""}{(c.coefficient ?? 0).toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full table */}
      {selectedUserId && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">All Correlations</h3>
          </div>
          {isLoading ? (
            <div className="p-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
          ) : correlations.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No correlations computed yet. Click &quot;Compute Correlations&quot; to analyze.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-5 py-3 font-medium">Metric A</th>
                  <th className="px-5 py-3 font-medium">Metric B</th>
                  <th className="px-5 py-3 font-medium">Coefficient</th>
                  <th className="px-5 py-3 font-medium">Strength</th>
                  <th className="px-5 py-3 font-medium">Direction</th>
                  <th className="px-5 py-3 font-medium">Samples</th>
                  <th className="px-5 py-3 font-medium">Computed</th>
                </tr></thead>
                <tbody>
                  {correlations.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{c.metricA}</td>
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{c.metricB}</td>
                      <td className="px-5 py-3"><CorrelationBar coeff={c.coefficient} /></td>
                      <td className="px-5 py-3"><span className={`font-medium ${strengthColor(c.strength)}`}>{c.strength}</span></td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{c.direction}</td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{c.sampleSize}</td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(c.computedAt).toLocaleDateString()}</td>
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
