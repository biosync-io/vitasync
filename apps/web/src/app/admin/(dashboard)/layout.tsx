"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import {
  type AppearanceMode,
  applyAppearance,
  getStoredAppearance,
} from "../../../lib/ThemeProvider"
import { useAdminAuth } from "../../../lib/admin-auth-context"
import { AdminProviders } from "../providers"
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  UserPlus,
  Zap,
  RefreshCw,
  Key,
  KeyRound,
  ClipboardList,
  Bell,
  Megaphone,
  ScrollText,
  Shield,
  Activity,
  Settings,
  ChevronLeft,
  Menu,
  X,
  Sun,
  MoonStar,
  Monitor,
  LogOut,
  ArrowLeft,
  Mail,
  Bot,
  Webhook,
  type LucideIcon,
} from "lucide-react"

interface NavSection {
  title: string
  items: Array<{ href: string; label: string; icon: LucideIcon; color: string }>
}

const adminNavSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, color: "text-slate-400" },
      { href: "/admin/system-status", label: "System Status", icon: Activity, color: "text-emerald-400" },
      { href: "/admin/circuit-breakers", label: "Circuit Breakers", icon: Shield, color: "text-red-400" },
    ],
  },
  {
    title: "Users & Access",
    items: [
      { href: "/admin/users", label: "Users", icon: Users, color: "text-blue-400" },
      { href: "/admin/invitations", label: "Invitations", icon: UserPlus, color: "text-green-400" },
      { href: "/admin/identity-providers", label: "Identity Providers", icon: Key, color: "text-amber-400" },
    ],
  },
  {
    title: "Data & Sync",
    items: [
      { href: "/admin/providers", label: "Providers", icon: Zap, color: "text-yellow-400" },
      { href: "/admin/sync-jobs", label: "Sync Jobs", icon: RefreshCw, color: "text-green-400" },
      { href: "/admin/webhooks", label: "Webhooks", icon: Webhook, color: "text-orange-400" },
    ],
  },
  {
    title: "Developer",
    items: [
      { href: "/admin/api-keys", label: "API Keys", icon: KeyRound, color: "text-amber-400" },
      { href: "/admin/api-logs", label: "API Logs", icon: ClipboardList, color: "text-cyan-400" },
      { href: "/admin/notifications", label: "Notification Rules", icon: Megaphone, color: "text-rose-400" },
      { href: "/admin/notification-logs", label: "Notification Logs", icon: ScrollText, color: "text-slate-400" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { href: "/admin/settings", label: "General", icon: Settings, color: "text-gray-400" },
      { href: "/admin/settings/email", label: "Email / SMTP", icon: Mail, color: "text-sky-400" },
      { href: "/admin/settings/ai", label: "AI Providers", icon: Bot, color: "text-purple-400" },
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

function AdminLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href={"/admin" as Parameters<typeof Link>[0]["href"]} className="flex items-center gap-2.5 min-w-0">
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
        <ShieldCheck className="h-5 w-5 text-white" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <span className="block text-lg font-bold text-gray-100 truncate tracking-tight">
            VitaSync Admin
          </span>
        </div>
      )}
    </Link>
  )
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const { user, logout, isLoading } = useAdminAuth()
  const [darkMode, setDarkMode] = useState<AppearanceMode>("system")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  const allNavItems = adminNavSections.flatMap(s => s.items)
  const currentPage = allNavItems.find((item) =>
    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href),
  )

  // Show loading screen while authenticating
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 animate-pulse">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <p className="text-sm text-gray-500">Loading admin console...</p>
        </div>
      </div>
    )
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4">
        <AdminLogo collapsed={!isMobile && !sidebarOpen} />
        {!isMobile && (
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-slate-800 hover:text-gray-300 transition-colors"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronLeft className={`h-4 w-4 transition-transform duration-200 ${sidebarOpen ? "" : "rotate-180"}`} />
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-slate-800 hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Admin Portal label */}
      {(isMobile || sidebarOpen) && (
        <div className="mx-4 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
            Admin Portal
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {adminNavSections.map((section, sectionIdx) => {
          const collapsed = !isMobile && !sidebarOpen
          return (
            <div key={section.title} className={sectionIdx > 0 ? "mt-5" : ""}>
              {!collapsed && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {section.title}
                </p>
              )}
              {collapsed && sectionIdx > 0 && (
                <hr className="mx-2 mb-2 border-white/[0.06]" />
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const isActive =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href as Parameters<typeof Link>[0]["href"]}
                        title={collapsed ? item.label : undefined}
                        className={`group flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                          collapsed ? "justify-center" : "gap-3"
                        } ${
                          isActive
                            ? "bg-amber-500/15 text-amber-400 border-l-[3px] border-l-amber-400 border-y border-r border-y-amber-500/20 border-r-amber-500/20"
                            : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200 border-l-[3px] border-l-transparent"
                        }`}
                      >
                        <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-amber-400" : `${item.color} group-hover:opacity-80`}`} />
                        {!collapsed && (
                          <span className="truncate">{item.label}</span>
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
      <div className="border-t border-white/[0.06] p-3 space-y-0.5">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={cycleDarkMode}
          title={`Theme: ${DARK_LABELS[darkMode]}`}
          className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:bg-slate-800 hover:text-gray-300 transition-colors ${
            !isMobile && !sidebarOpen ? "justify-center" : "gap-3"
          }`}
        >
          <ThemeIcon className="h-[18px] w-[18px] shrink-0" />
          {(isMobile || sidebarOpen) && <span>{DARK_LABELS[darkMode]} mode</span>}
        </button>

        {/* User Portal link */}
        <Link
          href="/dashboard"
          className={`flex items-center rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:bg-slate-800 hover:text-gray-300 transition-colors ${
            !isMobile && !sidebarOpen ? "justify-center" : "gap-3"
          }`}
        >
          <ArrowLeft className="h-[18px] w-[18px] shrink-0" />
          {(isMobile || sidebarOpen) && <span>User Portal</span>}
        </Link>

        {/* Version indicator */}
        {(isMobile || sidebarOpen) && (
          <div className="px-3 py-1.5">
            <span className="text-[10px] text-gray-600 font-mono">v1.0.0</span>
          </div>
        )}

        {/* User info & sign out */}
        {user && (
          <div className={`flex items-center rounded-xl px-3 py-2.5 ${!isMobile && !sidebarOpen ? "justify-center" : "gap-3"}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-white text-xs font-bold">
              {(user.displayName ?? user.email ?? "A").charAt(0).toUpperCase()}
            </div>
            {(isMobile || sidebarOpen) && (
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-200">
                  {user.displayName ?? "Admin"}
                </p>
                {user.email && (
                  <p className="truncate text-[11px] text-gray-500">{user.email}</p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => logout()}
              title="Sign out"
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-red-950/30 hover:text-red-400 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center justify-between bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 hover:bg-slate-800"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <AdminLogo collapsed={false} />
        <button
          type="button"
          onClick={cycleDarkMode}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 hover:bg-slate-800"
          aria-label="Toggle theme"
        >
          <ThemeIcon className="h-5 w-5" />
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
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-900/95 backdrop-blur-xl shadow-2xl animate-slide-in-left">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-slate-900/80 backdrop-blur-xl border-r border-white/[0.06] transition-all duration-200 shrink-0 ${
          sidebarOpen ? "w-64" : "w-[72px]"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <header className="hidden md:flex h-16 items-center justify-between border-b border-transparent bg-slate-900/80 backdrop-blur-xl px-6 shrink-0 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-gradient-to-r after:from-amber-500/40 after:via-amber-500/10 after:to-transparent">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-100">
              {currentPage?.label ?? "Admin"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={cycleDarkMode}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-slate-800 hover:text-gray-200 transition-colors"
              aria-label="Toggle theme"
            >
              <ThemeIcon className="h-4 w-4" />
            </button>
            {/* User monogram */}
            {user && (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-white text-xs font-bold">
                {(user.displayName ?? user.email ?? "A").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pt-16 md:pt-0">
          <div className="p-4 sm:p-6 lg:p-8 animate-fade-in-down">{children}</div>
        </main>
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProviders>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminProviders>
  )
}
