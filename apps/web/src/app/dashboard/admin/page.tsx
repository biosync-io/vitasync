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
} from "lucide-react"
import Link from "next/link"
import { useAuth } from "../../../lib/auth-context"
import { usersApi, apiKeysApi, webhooksApi, providersApi, circuitBreakersApi } from "../../../lib/api"
import type { CircuitBreakerMetrics } from "../../../lib/api"

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  color,
}: {
  icon: typeof Users
  label: string
  value: number | string
  href: string
  color: string
}) {
  return (
    <Link
      href={href as any}
      className="group rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        </div>
      </div>
    </Link>
  )
}

function stateColor(state: CircuitBreakerMetrics["state"]): string {
  switch (state) {
    case "closed": return "bg-green-500"
    case "half_open": return "bg-yellow-500"
    case "open": return "bg-red-500"
  }
}

function stateLabel(state: CircuitBreakerMetrics["state"]): string {
  switch (state) {
    case "closed": return "Healthy"
    case "half_open": return "Half Open"
    case "open": return "Open"
  }
}

function CircuitBreakerCard({
  provider,
  metrics,
  onReset,
  isResetting,
}: {
  provider: string
  metrics: CircuitBreakerMetrics
  onReset: () => void
  isResetting: boolean
}) {
  const label = provider.charAt(0).toUpperCase() + provider.slice(1)
  const lastFailure = metrics.lastFailureTime
    ? new Date(metrics.lastFailureTime).toLocaleString()
    : "–"

  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${stateColor(metrics.state)}`} />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{label}</h3>
        </div>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          {stateLabel(metrics.state)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-gray-500 dark:text-gray-400">Successes</dt>
        <dd className="text-gray-900 dark:text-gray-100 text-right font-mono">{metrics.successCount}</dd>
        <dt className="text-gray-500 dark:text-gray-400">Failures</dt>
        <dd className="text-gray-900 dark:text-gray-100 text-right font-mono">{metrics.failureCount}</dd>
        <dt className="text-gray-500 dark:text-gray-400">Total</dt>
        <dd className="text-gray-900 dark:text-gray-100 text-right font-mono">{metrics.totalRequests}</dd>
        <dt className="text-gray-500 dark:text-gray-400">Last Failure</dt>
        <dd className="text-gray-900 dark:text-gray-100 text-right font-mono truncate" title={lastFailure}>{lastFailure}</dd>
      </dl>

      <button
        type="button"
        onClick={onReset}
        disabled={isResetting || metrics.state === "closed"}
        className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <RotateCcw className="h-3 w-3" />
        {isResetting ? "Resetting…" : "Reset"}
      </button>
    </div>
  )
}

function CircuitBreakersSection() {
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
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Loading circuit breaker metrics…
      </div>
    )
  }

  const entries = Object.entries(metrics ?? {})

  if (entries.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        No circuit breakers registered yet. They are created on first provider sync.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([provider, m]) => (
        <CircuitBreakerCard
          key={provider}
          provider={provider}
          metrics={m}
          onReset={() => resetMutation.mutate(provider)}
          isResetting={resetMutation.isPending && resetMutation.variables === provider}
        />
      ))}
    </div>
  )
}

export default function AdminPage() {
  const { isAdmin } = useAuth()

  const { data: usersResult } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => usersApi.list({ limit: 1 }),
    enabled: isAdmin,
  })
  const { data: keys = [] } = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: apiKeysApi.list,
    enabled: isAdmin,
  })
  const { data: webhooks = [] } = useQuery({
    queryKey: ["admin-webhooks"],
    queryFn: webhooksApi.list,
    enabled: isAdmin,
  })
  const { data: providers = [] } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: providersApi.list,
    enabled: isAdmin,
  })

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Shield className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Access Denied</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          The admin console is only available to workspace administrators.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-down">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Admin Console
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Workspace management and system configuration
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-grid">
        <StatCard
          icon={Users}
          label="Total Users"
          value={usersResult?.total ?? "–"}
          href="/dashboard/users"
          color="text-blue-500"
        />
        <StatCard
          icon={KeyRound}
          label="API Keys"
          value={keys.length}
          href="/dashboard/api-keys"
          color="text-amber-500"
        />
        <StatCard
          icon={Zap}
          label="Providers"
          value={providers.length}
          href="/dashboard/providers"
          color="text-yellow-500"
        />
        <StatCard
          icon={Bell}
          label="Webhooks"
          value={webhooks.length}
          href="/dashboard/webhooks"
          color="text-orange-500"
        />
      </div>

      {/* Circuit Breakers */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-500" />
          Circuit Breakers
        </h2>
        <CircuitBreakersSection />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { href: "/dashboard/users", icon: Users, label: "User Management", desc: "Create, view, and manage workspace users", color: "text-blue-500" },
          { href: "/dashboard/identity-providers", icon: Key, label: "Identity Providers", desc: "Configure SSO (OIDC / SAML 2.0) providers", color: "text-amber-500" },
          { href: "/dashboard/api-keys", icon: KeyRound, label: "API Keys", desc: "Manage API keys and access scopes", color: "text-amber-500" },
          { href: "/dashboard/sync-jobs", icon: RefreshCw, label: "Sync Jobs", desc: "Monitor data sync status and history", color: "text-green-500" },
          { href: "/dashboard/system-status", icon: Activity, label: "System Status", desc: "Health checks, queues, and service status", color: "text-emerald-500" },
          { href: "/dashboard/api-logs", icon: Activity, label: "API Logs", desc: "Request logs, latency, and error tracking", color: "text-cyan-500" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href as any}
            className="group rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 ${item.color}`}>
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {item.label}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
