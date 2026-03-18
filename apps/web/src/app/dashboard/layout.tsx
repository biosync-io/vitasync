"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import {
  type DarkModePreference,
  applyDarkMode,
  getStoredDarkMode,
} from "../../lib/ThemeProvider"
import { CommandPalette } from "../../lib/CommandPalette"

const navItems: Array<{ href: string; label: string; icon: string }> = [
  { href: "/dashboard", label: "Overview", icon: "⬡" },
  { href: "/dashboard/providers", label: "Providers", icon: "⚡" },
  { href: "/dashboard/users", label: "Users", icon: "👤" },
  { href: "/dashboard/health", label: "Health Data", icon: "♥" },
  { href: "/dashboard/insights", label: "Insights", icon: "🧠" },
  { href: "/dashboard/activity", label: "Activity", icon: "🏃" },
  { href: "/dashboard/sync-jobs", label: "Sync Jobs", icon: "⟳" },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: "🔔" },
  { href: "/dashboard/api-keys", label: "API Keys", icon: "🔑" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
]

const DARK_ICONS: Record<DarkModePreference, string> = {
  light: "☀️",
  dark: "🌙",
  system: "💻",
}

const DARK_LABELS: Record<DarkModePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
}

const PREF_CYCLE: DarkModePreference[] = ["system", "light", "dark"]

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)")
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return isMobile
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const [darkMode, setDarkMode] = useState<DarkModePreference>("system")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setDarkMode(getStoredDarkMode())
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Close mobile menu on escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMenuOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const cycleDarkMode = useCallback(() => {
    const next = PREF_CYCLE[(PREF_CYCLE.indexOf(darkMode) + 1) % PREF_CYCLE.length] ?? "system"
    applyDarkMode(next)
    setDarkMode(next)
  }, [darkMode])

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl font-bold text-indigo-600 truncate">
            {!isMobile && !sidebarOpen ? "V" : "VitaSync"}
          </span>
          {(isMobile || sidebarOpen) && (
            <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              API
            </span>
          )}
        </div>
        {/* Desktop collapse toggle */}
        {!isMobile && (
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <svg
              className={`h-4 w-4 transition-transform ${sidebarOpen ? "" : "rotate-180"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}
        {/* Mobile close */}
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href)
            const collapsed = !isMobile && !sidebarOpen
            return (
              <li key={item.href}>
                <Link
                  href={item.href as Parameters<typeof Link>[0]["href"]}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    collapsed ? "justify-center" : "gap-3"
                  } ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  }`}
                >
                  <span className="text-base shrink-0">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom bar */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-3 space-y-0.5">
        {/* Quick search trigger */}
        <button
          type="button"
          onClick={() => {
            // Trigger Cmd+K
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }))
          }}
          className={`flex w-full items-center rounded-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors ${
            !isMobile && !sidebarOpen ? "justify-center" : "gap-2"
          }`}
        >
          <span>🔍</span>
          {(isMobile || sidebarOpen) && (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="hidden sm:inline-flex rounded border border-gray-200 dark:border-gray-700 px-1 py-0.5 text-[10px] font-mono text-gray-400">⌘K</kbd>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={cycleDarkMode}
          title={`Theme: ${DARK_LABELS[darkMode]} — click to cycle`}
          className={`flex w-full items-center rounded-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors ${
            !isMobile && !sidebarOpen ? "justify-center" : "gap-2"
          }`}
        >
          <span>{DARK_ICONS[darkMode]}</span>
          {(isMobile || sidebarOpen) && <span>{DARK_LABELS[darkMode]} mode</span>}
        </button>

        <a
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center px-3 py-2 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 ${
            !isMobile && !sidebarOpen ? "justify-center" : "gap-2"
          }`}
        >
          <span>📖</span>
          {(isMobile || sidebarOpen) && <span>API Reference</span>}
        </a>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Command palette */}
      <CommandPalette />

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label="Open menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-indigo-600">VitaSync</span>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            API
          </span>
        </div>
        <button
          type="button"
          onClick={cycleDarkMode}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label="Toggle theme"
        >
          <span className="text-base">{DARK_ICONS[darkMode]}</span>
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {isMobile && mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            onKeyDown={(e) => e.key === "Enter" && setMobileMenuOpen(false)}
            role="button"
            tabIndex={0}
            aria-label="Close menu"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white dark:bg-gray-900 shadow-2xl animate-slide-in-left">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 transition-all duration-200 ${
          sidebarOpen ? "w-60" : "w-16"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 dark:bg-gray-950">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}

