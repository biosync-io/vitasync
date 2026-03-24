"use client"

import { useState, useMemo } from "react"
import { Search, ChevronDown, ChevronUp } from "lucide-react"
import { type Algorithm, ALGORITHMS, CATEGORIES, CATEGORY_COLORS } from "./data"

export default function AlgorithmsPage() {
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return ALGORITHMS.filter((a) => {
      if (selectedCategory && a.category !== selectedCategory) return false
      if (!q) return true
      return (
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.module.toLowerCase().includes(q) ||
        a.details.toLowerCase().includes(q)
      )
    })
  }, [search, selectedCategory])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of ALGORITHMS) {
      counts[a.category] = (counts[a.category] ?? 0) + 1
    }
    return counts
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Algorithms</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {ALGORITHMS.length} algorithms powering health analytics, scoring, and insights.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search algorithms by name, description, category, or module…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !selectedCategory
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            All ({ALGORITHMS.length})
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {cat} ({categoryCounts[cat]})
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {(search || selectedCategory) && (
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""} found
        </p>
      )}

      {/* Algorithm cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400">No algorithms match your search.</p>
          </div>
        )}
        {filtered.map((algo) => {
          const id = `${algo.module}::${algo.name}`
          const isExpanded = expandedId === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : id)}
              className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{algo.name}</h3>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[algo.category] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {algo.category}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{algo.description}</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 font-mono">{algo.module}</p>
                  </div>
                  <div className="flex-shrink-0 mt-0.5">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4 border border-gray-100 dark:border-gray-700/50">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{algo.details}</p>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
