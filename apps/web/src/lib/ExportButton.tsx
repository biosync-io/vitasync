"use client"

import { useState } from "react"

interface ExportButtonProps {
  data: Record<string, unknown>[]
  filename: string
  label?: string
  className?: string
}

export function ExportButton({ data, filename, label = "Export CSV", className = "" }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)

  function exportCSV() {
    if (data.length === 0) return
    setExporting(true)

    try {
      const first = data[0]
      if (!first) return
      const headers = Object.keys(first)
      const csvRows = [
        headers.join(","),
        ...data.map((row) =>
          headers
            .map((h) => {
              const val = row[h]
              const str = val == null ? "" : String(val)
              // Escape values containing commas, quotes, or newlines
              return str.includes(",") || str.includes('"') || str.includes("\n")
                ? `"${str.replace(/"/g, '""')}"`
                : str
            })
            .join(","),
        ),
      ]

      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={exportCSV}
      disabled={data.length === 0 || exporting}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors ${className}`}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {exporting ? "Exporting…" : label}
    </button>
  )
}
