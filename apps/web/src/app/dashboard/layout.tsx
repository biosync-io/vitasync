"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import {
  type DarkModePreference,
  applyDarkMode,
  getStoredDarkMode,
} from "../../lib/ThemeProvider"

const navItems: Array<{ href: Route<string>; label: string; icon: string }> = [
  { href: "/dashboard", label: "Overview", icon: "⬡" },
  { href: "/dashboard/providers", label: "Providers", icon: "⚡" },
  { href: "/dashboard/users", label: "Users", icon: "👤" },
  { href: "/dashboard/health", label: "Health Data", icon: "♥" },
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [darkMode, setDarkMode] = useState<DarkModePreference>("system")

  useEffect(() => {
    setDarkMode(getStoredDarkMode())
  }, [])

  const cycleDarkMode = useCallback(() => {
    const next = PREF_CYCLE[(PREF_CYCLE.indexOf(darkMode) + 1) % PREF_CYCLE.length]
    applyDarkMode(next)
    setDarkMode(next)
  }, [darkMode])

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-gray-200 dark:border-gray-800 px-6">
          <span className="text-xl font-bold text-indigo-600">VitaSync</span>
          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            API
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Bottom bar */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-1">
          {/* Dark mode toggle */}
          <button
            type="button"
            onClick={cycleDarkMode}
            title={`Theme: ${DARK_LABELS[darkMode]} — click to cycle`}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <span>{DARK_ICONS[darkMode]}</span>
            <span>{DARK_LABELS[darkMode]} mode</span>
          </button>

          {/* Docs link */}
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <span>📖</span> API Reference
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-8 dark:bg-gray-950">{children}</main>
    </div>
  )
}

