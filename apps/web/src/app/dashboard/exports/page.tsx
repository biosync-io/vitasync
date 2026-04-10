"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { exportsApi, type ExportData } from "../../../lib/api"
import { PageHeader, Card, CardHeader, CardContent, Button, Badge, EmptyState, TableSkeleton, Select } from "../../../lib/components/ui"

const STATUS_STYLES: Record<string, { style: string; icon: string }> = {
  completed: { style: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300", icon: "✓" },
  processing: { style: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300", icon: "⟳" },
  pending: { style: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: "⏳" },
  failed: { style: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: "✗" },
}

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
  completed: "success",
  processing: "warning",
  pending: "default",
  failed: "danger",
}

const FORMAT_INFO: Record<string, { label: string; icon: string; description: string }> = {
  json: { label: "JSON", icon: "{ }", description: "Machine-readable structured format" },
  csv: { label: "CSV", icon: "📊", description: "Spreadsheet-compatible tabular format" },
  pdf: { label: "PDF", icon: "📄", description: "Formatted report for printing/sharing" },
  fhir: { label: "FHIR", icon: "🏥", description: "HL7 FHIR standard for healthcare interoperability" },
  xml: { label: "XML", icon: "📝", description: "Extensible markup format" },
}

export default function ExportsPage() {
  const { selectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ format: "json", dateRange: "all" })
  const queryClient = useQueryClient()


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
    <div className="space-y-8">
      <PageHeader
        title="Data Export"
        subtitle="Export your health data in multiple formats including FHIR for healthcare interoperability."
        actions={selectedUserId ? (
          <Button onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "Cancel" : "New Export"}
          </Button>
        ) : undefined}
      />


      {/* Create form */}
      {showCreate && selectedUserId && (
        <Card>
          <CardHeader title="Create New Export" />
          <CardContent>
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
              <Select
                label="Date Range"
                options={[
                  { value: "all", label: "All Time" },
                  { value: "7d", label: "Last 7 Days" },
                  { value: "30d", label: "Last 30 Days" },
                  { value: "90d", label: "Last 90 Days" },
                  { value: "1y", label: "Last Year" },
                ]}
                value={form.dateRange}
                onChange={(e) => setForm({ ...form, dateRange: e.target.value })}
                className="max-w-xs"
              />
            </div>

            <Button loading={createMut.isPending} onClick={() => createMut.mutate()}>
              Start Export
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Exports table */}
      {selectedUserId && (
        <Card>
          <CardHeader title="Export History" />
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4">
                <TableSkeleton rows={5} cols={5} />
              </div>
            ) : exports.length === 0 ? (
              <EmptyState title="No exports yet" description="Create one to download your data." />
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
                      return (
                        <tr key={exp.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span>{fmtInfo.icon}</span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">{fmtInfo.label}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <Badge variant={STATUS_VARIANT[exp.status] ?? "default"}>
                              {exp.status}
                            </Badge>
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}
