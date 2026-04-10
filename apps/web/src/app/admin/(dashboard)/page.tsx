"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Users,
  KeyRound,
  Bell,
  RefreshCw,
  Activity,
  Shield,
  Key,
  Zap,
  RotateCcw,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Server,
  Workflow,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { PageHeader, Card, CardHeader, CardContent, StatCard, Badge, EmptyState, CardSkeleton, StatSkeleton } from "../../../lib/components/ui"
import { useAdminAuth } from "../../../lib/admin-auth-context"
import {
  usersApi,
  apiKeysApi,
  webhooksApi,
  providersApi,
  circuitBreakersApi,
} from "../../../lib/api"
import type { CircuitBreakerMetrics } from "../../../lib/api"

/* ── Circuit Breaker Helpers───────────────────────────────── */

function stateColor(state: CircuitBreakerMetrics["state"]): string {
  switch (state) {
    case "closed":
      return "bg-emerald-500"
    case "half_open":
      return "bg-amber-500"
    case "open":
      return "bg-red-500"
  }
}

function stateLabel(state: CircuitBreakerMetrics["state"]): string {
  switch (state) {
    case "closed":
      return "Healthy"
    case "half_open":
      return "Degraded"
    case "open":
      return "Down"
  }
}

function stateTextColor(state: CircuitBreakerMetrics["state"]): string {
  switch (state) {
    case "closed":
      return "text-emerald-400"
    case "half_open":
      return "text-amber-400"
    case "open":
      return "text-red-400"
  }
}

/* ── Circuit Breaker Status Strip ──────────────────────────── */

function CircuitBreakerStrip() {
  const queryClient = useQueryClient()

  const { data: metrics, isLoading } = useQuery({
    queryKey: ["admin-circuit-breakers"],
    queryFn: circuitBreakersApi.list,
    refetchInterval: 10_000,
  })

  const resetMutation = useMutation({
    mutationFn: (provider: string) => circuitBreakersApi.reset(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-circuit-breakers"] })
    },
  })

  if (isLoading) {
    return <CardSkeleton count={1} className="grid-cols-1 sm:grid-cols-1 lg:grid-cols-1" />
  }

  const entries = Object.entries(metrics ?? {})

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState icon={Shield} title="No circuit breakers" description="No circuit breakers registered yet." />
      </Card>
    )
  }

  const healthy = entries.filter(([, m]) => m.state === "closed").length
  const degraded = entries.filter(([, m]) => m.state === "half_open").length
  const down = entries.filter(([, m]) => m.state === "open").length

  return (
    <Card>
      <CardHeader
        icon={<Shield className="h-4 w-4 text-amber-400" />}
        title="Provider Health"
        action={
          <div className="flex items-center gap-3 text-xs font-medium">
            {healthy > 0 && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {healthy} Healthy
              </span>
            )}
            {degraded > 0 && (
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                {degraded} Degraded
              </span>
            )}
            {down > 0 && (
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {down} Down
              </span>
            )}
          </div>
        }
      />
      <CardContent className="space-y-4">
        {/* Colored segment bar */}
        <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-white/[0.06]">
          {healthy > 0 && (
            <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${(healthy / entries.length) * 100}%` }} />
          )}
          {degraded > 0 && (
            <div className="bg-amber-500 transition-all duration-500" style={{ width: `${(degraded / entries.length) * 100}%` }} />
          )}
          {down > 0 && (
            <div className="bg-red-500 transition-all duration-500" style={{ width: `${(down / entries.length) * 100}%` }} />
          )}
        </div>

        {/* Provider dots */}
        <div className="flex flex-wrap gap-3">
          {entries.map(([provider, m]) => (
            <div
              key={provider}
              className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-1.5 transition-all duration-200 hover:bg-white/[0.08]"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${stateColor(m.state)} ${m.state === "closed" ? "pulse-glow" : m.state === "half_open" ? "animate-pulse" : ""}`} />
              <span className="text-xs font-medium text-gray-300 capitalize">{provider}</span>
              <span className={`text-[10px] font-semibold ${stateTextColor(m.state)}`}>{stateLabel(m.state)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Recent Activity Feed ──────────────────────────────────── */

function RecentActivityFeed() {
  const activities = [
    { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", text: "System health check passed", time: "2 min ago" },
    { icon: Users, color: "text-blue-400", bg: "bg-blue-500/10", text: "New user registration", time: "8 min ago" },
    { icon: RefreshCw, color: "text-amber-400", bg: "bg-amber-500/10", text: "Provider sync completed", time: "15 min ago" },
    { icon: Shield, color: "text-emerald-400", bg: "bg-emerald-500/10", text: "Circuit breaker recovered", time: "32 min ago" },
    { icon: KeyRound, color: "text-purple-400", bg: "bg-purple-500/10", text: "API key generated", time: "1 hr ago" },
  ]

  return (
    <Card>
      <CardHeader icon={<Activity className="h-4 w-4 text-amber-400" />} title="Recent Activity" />
      <CardContent>
        <div className="space-y-0">
          {activities.map((item, i) => (
            <div key={item.text} className="flex items-start gap-3 py-2.5 group">
              {/* Timeline connector */}
              <div className="flex flex-col items-center">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${item.bg} transition-all duration-200 group-hover:scale-110`}>
                  <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                </div>
                {i < activities.length - 1 && (
                  <div className="w-px h-full min-h-[12px] bg-white/[0.06] mt-1" />
                )}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">{item.text}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Current Time Hook ─────────────────────────────────────── */

function useCurrentTime() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])
  return time
}

/* ── Main Page ─────────────────────────────────────────────── */

export default function AdminOverviewPage() {
  const { isAuthenticated, user } = useAdminAuth()
  const currentTime = useCurrentTime()

  const { data: usersResult, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => usersApi.list({ limit: 1 }),
    enabled: isAuthenticated,
  })
  const { data: keys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: apiKeysApi.list,
    enabled: isAuthenticated,
  })
  const { data: webhooks = [], isLoading: webhooksLoading } = useQuery({
    queryKey: ["admin-webhooks"],
    queryFn: webhooksApi.list,
    enabled: isAuthenticated,
  })
  const { data: providers = [], isLoading: providersLoading } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: providersApi.list,
    enabled: isAuthenticated,
  })

  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "Admin"

  return (
    <div className="space-y-8">
      {/* ── Hero Section ────────────────────────────────── */}
      <PageHeader
        title="Admin Overview"
        subtitle={`Welcome back, ${displayName} · ${currentTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · ${currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
        badge={<Badge variant="success" dot pulse>All Systems Operational</Badge>}
      />

      {/* ── Stat Cards ──────────────────────────────────── */}
      {(usersLoading || keysLoading || providersLoading || webhooksLoading) ? (
        <StatSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Total Users"
            value={usersResult?.total ?? "–"}
            href="/admin/users"
            color="brand"
          />
          <StatCard
            icon={<KeyRound className="h-5 w-5" />}
            label="API Keys"
            value={keys.length}
            href="/admin/api-keys"
            color="default"
          />
          <StatCard
            icon={<Zap className="h-5 w-5" />}
            label="Providers"
            value={providers.length}
            href="/admin/providers"
            color="accent"
          />
          <StatCard
            icon={<Bell className="h-5 w-5" />}
            label="Webhooks"
            value={webhooks.length}
            href="/admin/webhooks"
            color="vitality"
          />
        </div>
      )}

      {/* ── Circuit Breaker Status Strip ────────────────── */}
      <CircuitBreakerStrip />

      {/* ── Activity + Quick Actions Row ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent Activity — 2 cols */}
        <div className="lg:col-span-2">
          <RecentActivityFeed />
        </div>

        {/* Quick Actions — 3 cols */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader icon={<Workflow className="h-4 w-4 text-amber-400" />} title="Quick Actions" />
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { href: "/admin/users", icon: Users, label: "User Management", desc: "Manage workspace users", color: "from-blue-500/20 to-blue-600/5", iconColor: "text-blue-400", borderHover: "hover:border-blue-500/30" },
                  { href: "/admin/identity-providers", icon: Key, label: "Identity Providers", desc: "SSO configuration", color: "from-amber-500/20 to-amber-600/5", iconColor: "text-amber-400", borderHover: "hover:border-amber-500/30" },
                  { href: "/admin/api-keys", icon: KeyRound, label: "API Keys", desc: "Keys & scopes", color: "from-purple-500/20 to-purple-600/5", iconColor: "text-purple-400", borderHover: "hover:border-purple-500/30" },
                  { href: "/admin/sync-jobs", icon: RefreshCw, label: "Sync Jobs", desc: "Sync status & history", color: "from-emerald-500/20 to-emerald-600/5", iconColor: "text-emerald-400", borderHover: "hover:border-emerald-500/30" },
                  { href: "/admin/system-status", icon: Server, label: "System Status", desc: "Health & services", color: "from-cyan-500/20 to-cyan-600/5", iconColor: "text-cyan-400", borderHover: "hover:border-cyan-500/30" },
                  { href: "/admin/api-logs", icon: ClipboardList, label: "API Logs", desc: "Requests & errors", color: "from-rose-500/20 to-rose-600/5", iconColor: "text-rose-400", borderHover: "hover:border-rose-500/30" },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href as any}
                    className={`group relative flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-gradient-to-b ${item.color} p-4 text-center transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${item.borderHover}`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.06] ${item.iconColor} transition-all duration-200 group-hover:scale-110 group-hover:bg-white/[0.1]`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-200 group-hover:text-white transition-colors">{item.label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 hidden sm:block">{item.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
