"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type AppearanceMode,
  applyAppearance,
  getStoredAppearance,
} from "../../lib/ThemeProvider"
import { ThemeSettingsPanel } from "../../lib/ThemeSettingsPanel"
import { CommandPalette } from "../../lib/CommandPalette"
import { useSelectedUser } from "../../lib/user-selection-context"
import { useNotificationStream } from "../../lib/hooks/useNotificationStream"
import { notificationsApi, type InAppNotification } from "../../lib/api"
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
  BookText,
  Cpu,
  Droplets,
  ListChecks,
  Map,
  Radio,
  Scale,
  Bot,
  Shield,
  Lock,
  Key,
  LogOut,
  User,
  Mail,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "../../lib/auth-context"
import { OfflineBanner } from "../../lib/components/OfflineBanner"
import { InstallPrompt } from "../../lib/components/InstallPrompt"

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
      { href: "/dashboard/algorithms", label: "Algorithms", icon: Cpu, color: "text-cyan-500" },
      { href: "/dashboard/chatbot", label: "AI Assistant", icon: Bot, color: "text-indigo-500" },
    ],
  },
  {
    title: "Health Data",
    items: [
      { href: "/dashboard/health", label: "Health Data", icon: Heart, color: "text-red-500" },
      { href: "/dashboard/body-metrics", label: "Body Metrics", icon: Scale, color: "text-blue-500" },
      { href: "/dashboard/sleep", label: "Sleep Analysis", icon: Moon, color: "text-indigo-500" },
      { href: "/dashboard/activity", label: "Activity", icon: Footprints, color: "text-orange-500" },
      { href: "/dashboard/nutrition", label: "Nutrition", icon: Apple, color: "text-lime-500" },
      { href: "/dashboard/mood", label: "Mood", icon: Smile, color: "text-yellow-500" },
      { href: "/dashboard/journal", label: "Journal", icon: BookText, color: "text-indigo-400" },
      { href: "/dashboard/water", label: "Water Intake", icon: Droplets, color: "text-sky-500" },
      { href: "/dashboard/habits", label: "Habits", icon: ListChecks, color: "text-emerald-400" },
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
    title: "Account",
    items: [
      { href: "/dashboard/providers", label: "Connected Devices", icon: Zap, color: "text-yellow-500" },
      { href: "/dashboard/sync-jobs", label: "Sync History", icon: RefreshCw, color: "text-green-500" },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell, color: "text-rose-500" },
      { href: "/dashboard/exports", label: "Data Export", icon: Upload, color: "text-fuchsia-500" },
      { href: "/dashboard/security", label: "Security", icon: Shield, color: "text-indigo-500" },
      { href: "/dashboard/privacy", label: "Privacy", icon: Lock, color: "text-purple-500" },
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
    <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
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
    </Link>
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
  const { user, logout } = useAuth()
  const [darkMode, setDarkMode] = useState<AppearanceMode>("system")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Real-time notification stream — shows toasts and updates bell instantly
  useNotificationStream()
  const [themeOpen, setThemeOpen] = useState(false)

  const [appVersion, setAppVersion] = useState(process.env.NEXT_PUBLIC_APP_VERSION || "")

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d: { appVersion?: string }) => { if (d.appVersion) setAppVersion(d.appVersion) })
      .catch(() => {})
  }, [])

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
      <div className="flex h-20 items-center justify-between px-5 border-b border-gray-200/30 dark:border-white/[0.04]">
        <Logo collapsed={!isMobile && !sidebarOpen} />
        {!isMobile && (
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100/60 hover:text-gray-600 dark:hover:bg-white/[0.04] dark:hover:text-gray-300 transition-all duration-200"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronLeft className={`h-4 w-4 transition-transform duration-300 ease-in-out ${sidebarOpen ? "" : "rotate-180"}`} />
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100/60 hover:text-gray-600 dark:hover:bg-white/[0.04] dark:hover:text-gray-300 transition-all duration-200"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navSections.map((section, sectionIndex) => {
          const collapsed = !isMobile && !sidebarOpen
          return (
            <div key={section.title}>
              {sectionIndex > 0 && (
                <hr className="my-3 border-gray-200/40 dark:border-white/[0.06]" />
              )}
              {!collapsed && (
                <h3 className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
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
                        className={`group relative flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                          collapsed ? "justify-center" : "gap-3"
                        } ${
                          isActive
                            ? "bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 border-l-[3px] border-accent-500"
                            : "text-gray-600 hover:bg-gray-100/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-100 border-l-[3px] border-transparent"
                        }`}
                      >
                        <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${isActive ? "text-accent-500" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"}`} />
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
      <div className="border-t border-gray-200/30 dark:border-white/[0.04] p-3 space-y-0.5">
        <button
          type="button"
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }))
          }}
          className={`flex w-full items-center rounded-xl px-3 py-2 text-sm text-gray-500 hover:bg-gray-100/60 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-200 transition-all duration-200 ${
            !isMobile && !sidebarOpen ? "justify-center" : "gap-3"
          }`}
        >
          <Search className="h-[18px] w-[18px] shrink-0" />
          {(isMobile || sidebarOpen) && (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="hidden sm:inline-flex rounded-md border border-gray-200/60 dark:border-white/[0.08] px-1.5 py-0.5 text-[10px] font-mono text-gray-400">⌘K</kbd>
            </>
          )}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setThemeOpen((o) => !o)}
            title={`Theme: ${DARK_LABELS[darkMode]} — click to customize`}
            className={`flex w-full items-center rounded-xl px-3 py-2 text-sm text-gray-500 hover:bg-gray-100/60 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-200 transition-all duration-200 ${
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
          className={`flex items-center rounded-xl px-3 py-2 text-sm text-gray-500 hover:bg-gray-100/60 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-200 transition-all duration-200 ${
            !isMobile && !sidebarOpen ? "justify-center" : "gap-3"
          }`}
        >
          <BookOpen className="h-[18px] w-[18px] shrink-0" />
          {(isMobile || sidebarOpen) && <span>API Reference</span>}
        </a>

        {appVersion && (
          <div className={`flex items-center rounded-xl px-3 py-2 text-[10px] text-gray-400 dark:text-gray-500 ${
            !isMobile && !sidebarOpen ? "justify-center" : "gap-2"
          }`}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            {(isMobile || sidebarOpen) && <span>v{appVersion}</span>}
          </div>
        )}

        {/* User info & sign out */}
        {user && (
          <div className={`flex items-center rounded-xl px-3 py-2 ${!isMobile && !sidebarOpen ? "justify-center" : "gap-3"}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-white text-xs font-bold shadow-lg shadow-accent-500/20">
              {(user.displayName ?? user.email ?? "U").charAt(0).toUpperCase()}
            </div>
            {(isMobile || sidebarOpen) && (
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {user.displayName ?? "User"}
                </p>
                {user.email && (
                  <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">{user.email}</p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => logout()}
              title="Sign out"
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition-all duration-200"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50/50 dark:bg-gray-950">
      <CommandPalette />

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center justify-between bg-white/60 backdrop-blur-2xl border-b border-accent-500/20 px-4 dark:bg-gray-950/60 dark:border-accent-500/20 md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100/60 dark:text-gray-400 dark:hover:bg-white/[0.04] transition-all duration-200"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo collapsed={false} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cycleDarkMode}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100/60 dark:text-gray-400 dark:hover:bg-white/[0.04] transition-all duration-200"
            aria-label="Toggle theme"
          >
            <ThemeIcon className="h-5 w-5" />
          </button>
          <UserProfileMenu />
        </div>
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
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white/80 dark:bg-gray-950/90 backdrop-blur-2xl shadow-2xl animate-slide-in-left">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-white/60 dark:bg-gray-950/80 backdrop-blur-2xl border-r border-gray-200/30 dark:border-white/[0.04] transition-all duration-300 ease-in-out shrink-0 ${
          sidebarOpen ? "w-64" : "w-[72px]"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <header className="hidden md:flex h-16 items-center justify-between border-b border-gray-200/30 dark:border-white/[0.04] bg-white/60 dark:bg-gray-950/60 backdrop-blur-2xl px-6 lg:px-8 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              {currentPage?.label ?? "Dashboard"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Search bar */}
            <button
              type="button"
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }))}
              className="flex items-center gap-2 rounded-full bg-gray-50/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] px-4 py-2 text-sm text-gray-400 hover:border-gray-300 dark:hover:border-white/[0.12] transition-all duration-200 w-48 lg:w-64"
            >
              <Search className="h-4 w-4" />
              <span>Search anything…</span>
              <kbd className="ml-auto text-[10px] font-mono opacity-50">⌘K</kbd>
            </button>
            {/* Notifications */}
            <NotificationBell />
            {/* User profile monogram */}
            <UserProfileMenu />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pt-16 md:pt-0 scroll-smooth">
          <div className="p-6 lg:p-8 animate-fade-in-down">{children}</div>
        </main>
      </div>

      <OfflineBanner />
      <InstallPrompt />
    </div>
  )
}

// ── Notification Bell─────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-blue-500",
  warning: "text-amber-500",
  critical: "text-red-500",
}

const CATEGORY_ICONS: Record<string, string> = {
  sync: "🔄",
  report: "📊",
  anomaly: "⚠️",
  achievement: "🏆",
  goal: "🎯",
  insight: "💡",
  system: "⚙️",
}

function NotificationBell() {
  const { selectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ["inbox", selectedUserId],
    queryFn: () => notificationsApi.getInbox(selectedUserId, { limit: 15 }),
    enabled: !!selectedUserId,
    refetchInterval: 30_000,
  })

  const notifications = data?.data ?? []
  const unreadCount = data?.unreadCount ?? 0

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handleMarkAllRead = async () => {
    if (!selectedUserId) return
    await notificationsApi.markRead(selectedUserId)
    queryClient.invalidateQueries({ queryKey: ["inbox"] })
  }

  return (
    <div ref={bellRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100/60 dark:hover:bg-white/[0.04] transition-all duration-200 relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-96 rounded-2xl border border-gray-200/60 dark:border-white/[0.08] bg-white/80 dark:bg-gray-950/90 backdrop-blur-2xl shadow-2xl overflow-hidden animate-fade-in-down">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/30 dark:border-white/[0.04]">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100/60 dark:divide-white/[0.04]">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-xs text-gray-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} onClose={() => setOpen(false)} />
              ))
            )}
          </div>

          <div className="border-t border-gray-200/30 dark:border-white/[0.04] px-4 py-2">
            <Link
              href="/dashboard/inbox"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-indigo-600 dark:text-indigo-400 hover:underline py-1"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationItem({ notification: n, onClose }: { notification: InAppNotification; onClose: () => void }) {
  const ago = formatTimeAgo(n.createdAt)
  const content = (
    <div className={`px-4 py-3 hover:bg-gray-50/60 dark:hover:bg-white/[0.04] transition-all duration-200 ${!n.read ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-base mt-0.5 shrink-0">{CATEGORY_ICONS[n.category] ?? "🔔"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-xs font-semibold truncate ${!n.read ? "text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"}`}>
              {n.title}
            </p>
            {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{n.body}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{ago}</p>
        </div>
      </div>
    </div>
  )

  if (n.link) {
    return <a href={n.link} onClick={onClose}>{content}</a>
  }
  return content
}

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return "just now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

// ── User Profile Menu ───────────────────────────────────────────────────

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      const first = parts[0] ?? ""
      const last = parts[parts.length - 1] ?? ""
      return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return "?"
}

function UserProfileMenu() {
  const { user, isAdmin, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open])

  const initials = getInitials(user?.displayName, user?.email)

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-accent-500/20 hover:scale-105 active:scale-95 transition-transform"
        aria-label="User profile"
        aria-expanded={open}
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-gray-200/60 dark:border-white/[0.08] bg-white/80 dark:bg-gray-950/90 backdrop-blur-2xl shadow-2xl overflow-hidden animate-fade-in-down">
          {/* Profile header */}
          <div className="px-5 py-4 bg-gradient-to-br from-accent-50 to-accent-100/50 dark:from-accent-950/30 dark:to-accent-900/20 border-b border-gray-200/30 dark:border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-accent-500/20">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {user?.displayName || "User"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3 w-3 text-gray-400" />
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user?.email || "No email"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Profile details */}
          <div className="px-5 py-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <BadgeCheck className="h-3.5 w-3.5" />
                <span>Role</span>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                isAdmin
                  ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                  : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              }`}>
                {isAdmin ? "Admin" : "User"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <User className="h-3.5 w-3.5" />
                <span>User ID</span>
              </div>
              <code className="text-[10px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                {user?.id ? `${user.id.slice(0, 8)}…` : "—"}
              </code>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200/30 dark:border-white/[0.04] px-2 py-2">
            <Link
              href="/dashboard/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100/60 dark:hover:bg-white/[0.04] transition-all duration-200"
            >
              <Settings className="h-4 w-4 text-gray-400" />
              Settings
            </Link>
            <Link
              href="/dashboard/security"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100/60 dark:hover:bg-white/[0.04] transition-all duration-200"
            >
              <Shield className="h-4 w-4 text-gray-400" />
              Security
            </Link>
            <button
              type="button"
              onClick={() => { setOpen(false); logout() }}
              className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

