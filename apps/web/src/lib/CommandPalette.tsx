"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

interface CommandItem {
  id: string
  label: string
  icon: string
  href?: string
  section: string
  keywords?: string[]
}

const COMMANDS: CommandItem[] = [
  { id: "overview", label: "Overview", icon: "⬡", href: "/dashboard", section: "Navigation" },
  { id: "providers", label: "Providers", icon: "⚡", href: "/dashboard/providers", section: "Navigation" },
  { id: "users", label: "Users", icon: "👤", href: "/dashboard/users", section: "Navigation", keywords: ["people", "accounts"] },
  { id: "health", label: "Health Data", icon: "♥", href: "/dashboard/health", section: "Navigation", keywords: ["metrics", "vitals"] },
  { id: "insights", label: "Insights", icon: "🧠", href: "/dashboard/insights", section: "Navigation", keywords: ["analytics", "analysis"] },
  { id: "activity", label: "Activity", icon: "🏃", href: "/dashboard/activity", section: "Navigation", keywords: ["workouts", "sleep", "events"] },
  { id: "sync-jobs", label: "Sync Jobs", icon: "⟳", href: "/dashboard/sync-jobs", section: "Navigation", keywords: ["queue", "tasks", "jobs"] },
  { id: "webhooks", label: "Webhooks", icon: "🔔", href: "/dashboard/webhooks", section: "Navigation", keywords: ["notifications", "events"] },
  { id: "api-keys", label: "API Keys", icon: "🔑", href: "/dashboard/api-keys", section: "Navigation", keywords: ["credentials", "tokens", "auth"] },
  { id: "settings", label: "Settings", icon: "⚙️", href: "/dashboard/settings", section: "Navigation", keywords: ["config", "preferences"] },
  { id: "docs", label: "API Documentation", icon: "📖", href: "/docs", section: "Resources", keywords: ["reference", "help"] },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Open on Cmd/Ctrl + K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const results = useMemo(() => {
    if (!query.trim()) return COMMANDS
    const q = query.toLowerCase()
    return COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.section.toLowerCase().includes(q) ||
        cmd.keywords?.some((kw) => kw.includes(q)),
    )
  }, [query])

  const execute = useCallback(
    (item: CommandItem) => {
      setOpen(false)
      if (item.href) {
        router.push(item.href as Parameters<typeof router.push>[0])
      }
    },
    [router],
  )

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault()
      execute(results[activeIndex])
    }
  }

  if (!open) return null

  // Group by section
  const sections = new Map<string, CommandItem[]>()
  for (const item of results) {
    if (!sections.has(item.section)) sections.set(item.section, [])
    sections.get(item.section)!.push(item)
  }

  let flatIndex = 0

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(false)}
        role="button"
        tabIndex={0}
        aria-label="Close command palette"
      />
      <div className="fixed inset-x-4 top-[15vh] z-[61] mx-auto max-w-lg rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-4">
          <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages, features…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
            className="flex-1 border-0 bg-transparent py-3 pl-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No results found.</p>
          ) : (
            Array.from(sections.entries()).map(([section, items]) => (
              <div key={section}>
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {section}
                </p>
                {items.map((item) => {
                  const idx = flatIndex++
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => execute(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        idx === activeIndex
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <span className="text-base shrink-0">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-4 text-[10px] text-gray-400">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>ESC Close</span>
        </div>
      </div>
    </>
  )
}
