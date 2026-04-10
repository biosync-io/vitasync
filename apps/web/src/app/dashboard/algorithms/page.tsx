"use client"

import { useState, useMemo } from "react"
import { Search, ChevronDown, ChevronUp } from "lucide-react"
import { type Algorithm, ALGORITHMS, CATEGORIES, CATEGORY_COLORS } from "./data"
import { PageHeader, Card, CardContent, Badge, EmptyState, Input } from "../../../lib/components/ui"

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
    <div className="space-y-8">
      <PageHeader
        title="Algorithms"
        subtitle={`${ALGORITHMS.length} algorithms powering health analytics, scoring, and insights.`}
      />

      {/* Search & Filters */}
      <Card>
        <CardContent>
          <Input
            icon={Search}
            placeholder="Search algorithms by name, description, category, or module…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
        </CardContent>
      </Card>

      {/* Results count + Algorithm cards */}
      <div>
        {(search || selectedCategory) && (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""} found
          </p>
        )}

        <div className="space-y-3">
          {filtered.length === 0 && (
            <Card>
              <EmptyState title="No algorithms match your search" />
            </Card>
          )}
          {filtered.map((algo) => {
            const id = `${algo.module}::${algo.name}`
            const isExpanded = expandedId === id
            return (
              <Card hover key={id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                  className="w-full text-left"
                >
                  <CardContent>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{algo.name}</h3>
                          <Badge size="sm" className={CATEGORY_COLORS[algo.category] ?? ""}>
                            {algo.category}
                          </Badge>
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
                  </CardContent>
                </button>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
