"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { reportsApi, usersApi, type ReportData } from "../../../lib/api"

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  generating: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
}

export default function ReportsPage() {
  const [selectedUserId, setSelectedUserId] = useState("")
  const [showGenerate, setShowGenerate] = useState(false)
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [form, setForm] = useState({ reportType: "weekly", periodStart: "", periodEnd: "" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: reportsResult, isLoading } = useQuery({
    queryKey: ["reports", selectedUserId],
    queryFn: () => reportsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })
  const reports = reportsResult?.data ?? []

  const generateMut = useMutation({
    mutationFn: () =>
      reportsApi.generate(selectedUserId, {
        reportType: form.reportType,
        ...(form.periodStart ? { periodStart: form.periodStart } : {}),
        ...(form.periodEnd ? { periodEnd: form.periodEnd } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", selectedUserId] })
      setShowGenerate(false)
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Health Reports</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Generate comprehensive health reports with highlights and recommendations.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowGenerate(!showGenerate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showGenerate ? "Cancel" : "Generate Report"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="report-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="report-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view reports.</p>}

      {/* Generate form */}
      {showGenerate && selectedUserId && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Generate New Report</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Report Type</label>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.reportType} onChange={(e) => setForm({ ...form, reportType: e.target.value })}>
                <option value="weekly">Weekly Summary</option>
                <option value="monthly">Monthly Summary</option>
                <option value="quarterly">Quarterly Review</option>
                <option value="annual">Annual Review</option>
                <option value="custom">Custom Period</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Period Start</label>
              <input type="date" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Period End</label>
              <input type="date" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
            </div>
          </div>
          <button type="button" onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {generateMut.isPending ? "Generating…" : "Generate Report"}
          </button>
        </div>
      )}

      {/* Reports list */}
      {selectedUserId && (
        <div className="space-y-4">
          {isLoading && (
            <div className="p-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
          )}
          {!isLoading && reports.length === 0 && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">No reports yet. Generate one to get started.</p>
          )}
          {reports.map((report) => (
            <div key={report.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
              <button
                type="button"
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors text-left"
                onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">📄</span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate capitalize">{report.reportType.replace(/_/g, " ")} Report</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(report.periodStart).toLocaleDateString()} — {new Date(report.periodEnd).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[report.status] ?? "bg-gray-100 text-gray-700"}`}>{report.status}</span>
                  <svg className={`h-4 w-4 text-gray-400 transition-transform ${expandedReport === report.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {expandedReport === report.id && (
                <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4 space-y-4">
                  {/* Highlights */}
                  {report.highlights.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Highlights</h5>
                      <ul className="space-y-1">
                        {report.highlights.map((h, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-emerald-500 mt-0.5">✓</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {/* Recommendations */}
                  {report.recommendations.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Recommendations</h5>
                      <ul className="space-y-1">
                        {report.recommendations.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-indigo-500 mt-0.5">→</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-gray-400">Generated on {new Date(report.createdAt).toLocaleString()}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
