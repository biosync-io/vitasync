"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import {
  type AppearanceMode,
  applyAppearance,
  getStoredAppearance,
} from "../../lib/ThemeProvider"
import { ThemeSettingsPanel } from "../../lib/ThemeSettingsPanel"
import { CommandPalette } from "../../lib/CommandPalette"
import {
  LayoutDashboard,
  Activity,
  Heart,
  Moon,
  Brain,
  FileText,
  AlertTriangle,
  Link2,
  Footprints,
  Apple,
  Smile,
  Stethoscope,
  Pill,
  ClipboardList,
  Target,
  Trophy,
  Swords,
  Zap,
  Users,
  RefreshCw,
  Upload,
  Bell,
  Megaphone,
  ScrollText,
  KeyRound,
  Settings,
  Search,
  Sun,
  MoonStar,
  Monitor,
  BookOpen,
  ChevronLeft,
  Menu,
  X,
  BarChart3,
  Battery,
  type LucideIcon,
} from "lucide-react"

const navSections: Array<{
  title: string
  items: Array<{ href: string; label: string; icon: LucideIcon; badge?: string; color: string }>
}> = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "text-blue-500" },
      { href: "/dashboard/health-scores", label: "Health Score", icon: BarChart3, color: "text-rose-500" },
      { href: "/dashboard/readiness", label: "Readiness", icon: Battery, color: "text-emerald-500" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { href: "/dashboard/insights", label: "Insights Engine", icon: Brain, color: "text-purple-500" },
      { href: "/dashboard/reports", label: "Reports", icon: FileText, color: "text-sky-500" },
      { href: "/dashboard/anomalies", label: "Anomalies", icon: AlertTriangle, color: "text-amber-500" },
      { href: "/dashboard/correlations", label: "Correlations", icon: Link2, color: "text-teal-500" },
    ],
  },
  {
    title: "Health Data",
    items: [
      { href: "/dashboard/health", label: "Health Data", icon: Heart, color: "text-red-500" },
      { href: "/dashboard/sleep", label: "Sleep Analysis", icon: Moon, color: "text-indigo-500" },
      { href: "/dashboard/activity", label: "Activity", icon: Footprints, color: "text-orange-500" },
      { href: "/dashboard/nutrition", label: "Nutrition", icon: Apple, color: "text-lime-500" },
      { href: "/dashboard/mood", label: "Mood", icon: Smile, color: "text-yellow-500" },
      { href: "/dashboard/symptoms", label: "Symptoms", icon: Stethoscope, color: "text-pink-500" },
      { href: "/dashboard/medications", label: "Medications", icon: Pill, color: "text-cyan-500" },
    ],
  },
  {
    title: "Performance",
    items: [
      { href: "/dashboard/training", label: "Training Plans", icon: ClipboardList, color: "text-violet-500" },
      { href: "/dashboard/goals", label: "Goals", icon: Target, color: "text-emerald-500" },
      { href: "/dashboard/achievements", label: "Achievements", icon: Trophy, color: "text-amber-500" },
      { href: "/dashboard/challenges", label: "Challenges", icon: Swords, color: "text-red-500" },
    ],
  },
  {
    title: "Platform",
    items: [
      { href: "/dashboard/providers", label: "Providers", icon: Zap, color: "text-yellow-500" },
      { href: "/dashboard/users", label: "Users", icon: Users, color: "text-blue-500" },
      { href: "/dashboard/sync-jobs", label: "Sync Jobs", icon: RefreshCw, color: "text-green-500" },
      { href: "/dashboard/exports", label: "Data Export", icon: Upload, color: "text-fuchsia-500" },
    ],
  },
  {
    title: "Developer",
    items: [
      { href: "/dashboard/webhooks", label: "Webhooks", icon: Bell, color: "text-orange-500" },
      { href: "/dashboard/notifications", label: "Notifications", icon: Megaphone, color: "text-rose-500" },
      { href: "/dashboard/notification-logs", label: "Notification Logs", icon: ScrollText, color: "text-slate-500" },
      { href: "/dashboard/api-keys", label: "API Keys", icon: KeyRound, color: "text-amber-500" },
      { href: "/dashboard/settings", label: "Settings", icon: Settings, color: "text-gray-500" },
    ],
  },
]

const DARK_ICONS: Record<AppearanceMode, LucideIcon> = {
  light: Sun,
  dark: MoonStar,
  system: Monitor,
  midnight: MoonStar,
  dim: MoonStar,
}

const DARK_LABELS: Record<AppearanceMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
  midnight: "Midnight",
  dim: "Dim",
}

const PREF_CYCLE: AppearanceMode[] = ["system", "light", "dark", "midnight", "dim"]

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="relative h-9 w-9 shrink-0">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 shadow-lg shadow-accent-500/25" />
        <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative h-9 w-9">
          <polyline
            points="4,18 8,18 10,14 13,23 17,7 21,23 23,14 26,18 32,18"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      {!collapsed && (
        <span className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate tracking-tight">
          VitaSync
        </span>
      )}
    </div>
  )
}

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
  const [darkMode, setDarkMode] = useState<AppearanceMode>("system")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)

  useEffect(() => {
    setDarkMode(getStoredAppearance())
  }, [])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMenuOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  // Re-sync the local darkMode state when theme panel changes it
  useEffect(() => {
    const interval = setInterval(() => {
      const current = getStoredAppearance()
      setDarkMode((prev) => (prev !== current ? current : prev))
    }, 300)
    return () => clearInterval(interval)
  }, [])

  const cycleDarkMode = useCallback(() => {
    const next = PREF_CYCLE[(PREF_CYCLE.indexOf(darkMode) + 1) % PREF_CYCLE.length] ?? "system"
    applyAppearance(next)
    setDarkMode(next)
  }, [darkMode])

  const ThemeIcon = DARK_ICONS[darkMode]

  // Find current page label for header
  const currentPage = navSections.flatMap(s => s.items).find((item) =>
    item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)
  )

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4">
        <Logo collapsed={!isMobile && !sidebarOpen} />
        {!isMobile && (
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronLeft className={`h-4 w-4 transition-transform duration-200 ${sidebarOpen ? "" : "rotate-180"}`} />
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navSections.map((section) => {
          const collapsed = !isMobile && !sidebarOpen
          return (
            <div key={section.title} className="mb-4">
              {!collapsed && (
                <h3 className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {section.title}
                </h3>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href as Parameters<typeof Link>[0]["href"]}
                        title={collapsed ? item.label : undefined}
                        className={`group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                          collapsed ? "justify-center" : "gap-3"
                        } ${
                          isActive
                            ? "bg-accent-500 text-white shadow-md shadow-accent-500/25"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                        }`}
                      >
                        <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-white" : `${item.color} group-hover:opacity-80`}`} />
                        {!collapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                        {!collapsed && item.badge && (
                          <span className="ml-auto text-[10px] font-semibold rounded-full bg-accent-100 text-accent-600 dark:bg-accent-900/40 dark:text-accent-400 px-1.5 py-0.5">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* Bottom bar */}
      <div className="border-t border-gray-100 dark:border-gray-800 p-3 space-y-0.5">
        <button
          type="button"
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }))
          }}
          className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors ${
            !isMobile && !sidebarOpen ? "justify-center" : "gap-3"
          }`}
        >
          <Search className="h-[18px] w-[18px] shrink-0" />
          {(isMobile || sidebarOpen) && (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="hidden sm:inline-flex rounded-md border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">⌘K</kbd>
            </>
          )}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setThemeOpen((o) => !o)}
            title={`Theme: ${DARK_LABELS[darkMode]} — click to customize`}
            className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors ${
              !isMobile && !sidebarOpen ? "justify-center" : "gap-3"
            }`}
          >
            <ThemeIcon className="h-[18px] w-[18px] shrink-0" />
            {(isMobile || sidebarOpen) && <span>{DARK_LABELS[darkMode]} mode</span>}
          </button>
          <ThemeSettingsPanel open={themeOpen} onClose={() => setThemeOpen(false)} />
        </div>

        <a
          href="https://biosync-io.github.io/vitasync/"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors ${
            !isMobile && !sidebarOpen ? "justify-center" : "gap-3"
          }`}
        >
          <BookOpen className="h-[18px] w-[18px] shrink-0" />
          {(isMobile || sidebarOpen) && <span>API Reference</span>}
        </a>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <CommandPalette />

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center justify-between bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 dark:bg-gray-900/80 dark:border-gray-800 md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo collapsed={false} />
        <button
          type="button"
          onClick={cycleDarkMode}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label="Toggle theme"
        >
          <ThemeIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {isMobile && mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
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
        className={`hidden md:flex flex-col bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 transition-all duration-200 shrink-0 ${
          sidebarOpen ? "w-64" : "w-[72px]"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <header className="hidden md:flex h-16 items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl px-6 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {currentPage?.label ?? "Dashboard"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Search bar */}
            <button
              type="button"
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }))}
              className="flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 transition-colors w-64"
            >
              <Search className="h-4 w-4" />
              <span>Search anything here...</span>
              <kbd className="ml-auto text-[10px] font-mono opacity-50">⌘K</kbd>
            </button>
            {/* Notifications */}
            <Link
              href="/dashboard/notifications"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors relative"
            >
              <Bell className="h-5 w-5" />
            </Link>
            {/* User avatar */}
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-accent-500/20">
              V
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pt-16 md:pt-0">
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}

