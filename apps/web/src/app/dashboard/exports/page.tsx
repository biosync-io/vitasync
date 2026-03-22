"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { exportsApi, usersApi, type ExportData } from "../../../lib/api"

const STATUS_STYLES: Record<string, { style: string; icon: string }> = {
  completed: { style: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300", icon: "✓" },
  processing: { style: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300", icon: "⟳" },
  pending: { style: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: "⏳" },
  failed: { style: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: "✗" },
}

const FORMAT_INFO: Record<string, { label: string; icon: string; description: string }> = {
  json: { label: "JSON", icon: "{ }", description: "Machine-readable structured format" },
  csv: { label: "CSV", icon: "📊", description: "Spreadsheet-compatible tabular format" },
  pdf: { label: "PDF", icon: "📄", description: "Formatted report for printing/sharing" },
  fhir: { label: "FHIR", icon: "🏥", description: "HL7 FHIR standard for healthcare interoperability" },
  xml: { label: "XML", icon: "📝", description: "Extensible markup format" },
}

export default function ExportsPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ format: "json", dateRange: "all" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: exportsResult, isLoading } = useQuery({
    queryKey: ["exports", selectedUserId],
    queryFn: () => exportsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })
  const exports = exportsResult?.data ?? []

  const createMut = useMutation({
    mutationFn: () => {
      const formatMap: Record<string, string> = { fhir: "fhir_r4" }
      const apiFormat = formatMap[form.format] ?? form.format

      const now = new Date()
      const ranges: Record<string, { from?: string; to?: string }> = {
        "7d": { from: new Date(now.getTime() - 7 * 86400000).toISOString(), to: now.toISOString() },
        "30d": { from: new Date(now.getTime() - 30 * 86400000).toISOString(), to: now.toISOString() },
        "90d": { from: new Date(now.getTime() - 90 * 86400000).toISOString(), to: now.toISOString() },
        all: {},
      }
      const dateParams = ranges[form.dateRange] ?? {}

      return exportsApi.create(selectedUserId, {
        format: apiFormat,
        ...dateParams,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exports", selectedUserId] })
      setShowCreate(false)
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Data Export</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Export your health data in multiple formats including FHIR for healthcare interoperability.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showCreate ? "Cancel" : "New Export"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="exp-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="exp-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to manage data exports.</p>}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Create New Export</h3>

          {/* Format selection as cards */}
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Format</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
            {Object.entries(FORMAT_INFO).map(([key, info]) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm({ ...form, format: key })}
                className={`rounded-lg border p-3 text-center transition-colors ${
                  form.format === key
                    ? "border-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 ring-1 ring-indigo-500"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <span className="text-lg block">{info.icon}</span>
                <span className="text-xs font-medium text-gray-900 dark:text-gray-100 block mt-1">{info.label}</span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 block">{info.description}</span>
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="mb-4">
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Date Range</label>
            <select className="w-full max-w-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.dateRange} onChange={(e) => setForm({ ...form, dateRange: e.target.value })}>
              <option value="all">All Time</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="1y">Last Year</option>
            </select>
          </div>

          <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {createMut.isPending ? "Requesting…" : "Start Export"}
          </button>
        </div>
      )}

      {/* Exports table */}
      {selectedUserId && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Export History</h3>
          </div>
          {isLoading ? (
            <div className="p-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
          ) : exports.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No exports yet. Create one to download your data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-5 py-3 font-medium">Format</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Requested</th>
                  <th className="px-5 py-3 font-medium">Completed</th>
                  <th className="px-5 py-3 font-medium">Download</th>
                </tr></thead>
                <tbody>
                  {exports.map((exp) => {
                    const fmtInfo = FORMAT_INFO[exp.format] ?? { label: exp.format.toUpperCase(), icon: "📦" }
                    const statusInfo = STATUS_STYLES[exp.status] ?? { style: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: "⏳" }
                    return (
                      <tr key={exp.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span>{fmtInfo.icon}</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">{fmtInfo.label}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.style}`}>
                            <span>{statusInfo.icon}</span> {exp.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(exp.requestedAt).toLocaleString()}</td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{exp.completedAt ? new Date(exp.completedAt).toLocaleString() : "—"}</td>
                        <td className="px-5 py-3">
                          {exp.status === "completed" && exp.fileUrl ? (
                            <a href={exp.fileUrl} className="rounded bg-indigo-100 dark:bg-indigo-900 px-2 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800" download>
                              Download
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
