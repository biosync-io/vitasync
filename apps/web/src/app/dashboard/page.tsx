"use client"

import { useQuery } from "@tanstack/react-query"
import { useSelectedUser } from "../../lib/user-selection-context"
import {
  apiKeysApi,
  healthScoresApi,
  insightsApi,
  providersApi,
  readinessApi,
  usersApi,
  webhooksApi,
  type Insight,
  type InsightCategory,
  type InsightSeverity,
} from "../../lib/api"
import {
  Activity,
  Heart,
  Zap,
  Shield,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Users,
  KeyRound,
  Webhook,
  Brain,
  ChevronDown,
} from "lucide-react"

/* ─── Score Ring SVG ─── */
function ScoreRing({ value, max = 100, size = 100, label, color, icon: Icon }: {
  value: number; max?: number; size?: number; label: string; color: string
  icon: React.ComponentType<{ className?: string }>
}) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, value / max)
  const offset = circ * (1 - pct)
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-100 dark:text-gray-800" strokeWidth={6} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{Math.round(value)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
    </div>
  )
}

function DashCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      {children}
    </div>
  )
}

function StatCard({ label, value, subtitle, icon: Icon, trend, trendValue }: {
  label: string; value: string | number; subtitle: string
  icon: React.ComponentType<{ className?: string }>
  trend?: "up" | "down"; trendValue?: string
}) {
  return (
    <DashCard>
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 dark:bg-accent-900/20">
          <Icon className="h-5 w-5 text-accent-600 dark:text-accent-400" />
        </div>
        {trend && trendValue && (
          <span className={`inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-medium ${
            trend === "up"
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
          }`}>
            {trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trendValue}
          </span>
        )}
      </div>
      <p className="mt-4 text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>
    </DashCard>
  )
}

function SeverityDot({ severity }: { severity: InsightSeverity }) {
  const colors: Record<InsightSeverity, string> = {
    critical: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-blue-500",
    positive: "bg-emerald-500",
  }
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[severity]}`} />
}

export default function DashboardPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()

  const { data: providers = [] } = useQuery({ queryKey: ["providers"], queryFn: providersApi.list })
  const { data: usersResult } = useQuery({ queryKey: ["users", 0], queryFn: () => usersApi.list({ limit: 200 }) })
  const { data: keys = [] } = useQuery({ queryKey: ["api-keys"], queryFn: apiKeysApi.list })
  const { data: webhooks = [] } = useQuery({ queryKey: ["webhooks"], queryFn: webhooksApi.list })
  const { data: algorithms } = useQuery({ queryKey: ["insight-algorithms"], queryFn: () => insightsApi.algorithms() })

  const users = usersResult?.data ?? []

  const { data: healthScore } = useQuery({
    queryKey: ["health-score", selectedUserId],
    queryFn: () => healthScoresApi.latest(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: readiness } = useQuery({
    queryKey: ["readiness", selectedUserId],
    queryFn: () => readinessApi.get(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: trainingLoad } = useQuery({
    queryKey: ["training-load", selectedUserId],
    queryFn: () => readinessApi.trainingLoad(selectedUserId),
    enabled: !!selectedUserId,
  })

  const now = new Date()
  const from30d = new Date(now.getTime() - 30 * 86400000)
  const { data: insightsResult } = useQuery({
    queryKey: ["insights-overview", selectedUserId],
    queryFn: () => insightsApi.generate(selectedUserId, { from: from30d.toISOString(), to: now.toISOString() }),
    enabled: !!selectedUserId,
  })

  const insights = insightsResult?.data ?? []
  const sevCounts: Record<InsightSeverity, number> = { critical: 0, warning: 0, info: 0, positive: 0 }
  for (const i of insights) sevCounts[i.severity]++

  const catCounts = new Map<InsightCategory, number>()
  for (const i of insights) catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1)

  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 }
  const topInsights = [...insights].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]).slice(0, 6)

  const algoCount = algorithms?.total ?? 0

  // Date display
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent-50 dark:bg-accent-900/20 px-3 py-1 text-xs font-semibold text-accent-600 dark:text-accent-400">
              <Activity className="h-3.5 w-3.5" />
              Live
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{dateStr}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight animate-fade-in-down">
            Health Command Center
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {algoCount} proprietary algorithms analyzing your biometric data in real-time.
          </p>
        </div>

        {/* User selector */}
        <div className="relative">
          <select
            className="appearance-none w-full sm:w-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-4 pr-10 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 shadow-sm focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none transition-all"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">Select a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName || u.externalId} {u.email ? `(${u.email})` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {selectedUserId && (
        <>
          {/* Score Rings */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 stagger-grid">
            <DashCard className="flex items-center justify-center py-8">
              <ScoreRing
                value={healthScore?.overallScore ?? 0}
                label="Health"
                color="#ef4444"
                icon={Heart}
              />
            </DashCard>
            <DashCard className="flex items-center justify-center py-8">
              <ScoreRing
                value={readiness?.score ?? 0}
                label="Readiness"
                color="#10b981"
                icon={Shield}
              />
            </DashCard>
            <DashCard className="flex items-center justify-center py-8">
              <ScoreRing
                value={trainingLoad?.fatigue ?? 0}
                label="Strain"
                color="#f59e0b"
                icon={Zap}
              />
            </DashCard>
            <DashCard className="flex items-center justify-center py-8">
              <ScoreRing
                value={healthScore?.recoveryScore ?? 0}
                label="Recovery"
                color="#8b5cf6"
                icon={Activity}
              />
            </DashCard>
          </div>

          {/* Severity Overview */}
          {insights.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 stagger-grid">
              {(["critical", "warning", "info", "positive"] as const).map((sev) => {
                const config: Record<InsightSeverity, { bg: string; text: string; icon: string; border: string }> = {
                  critical: { bg: "bg-red-50 dark:bg-red-900/10", text: "text-red-600 dark:text-red-400", icon: "✕", border: "border-red-100 dark:border-red-800/40" },
                  warning: { bg: "bg-amber-50 dark:bg-amber-900/10", text: "text-amber-600 dark:text-amber-400", icon: "⚠", border: "border-amber-100 dark:border-amber-800/40" },
                  info: { bg: "bg-blue-50 dark:bg-blue-900/10", text: "text-blue-600 dark:text-blue-400", icon: "ℹ", border: "border-blue-100 dark:border-blue-800/40" },
                  positive: { bg: "bg-emerald-50 dark:bg-emerald-900/10", text: "text-emerald-600 dark:text-emerald-400", icon: "✓", border: "border-emerald-100 dark:border-emerald-800/40" },
                }
                const s = config[sev]
                return (
                  <div key={sev} className={`flex items-center gap-3 rounded-2xl border ${s.border} ${s.bg} px-4 py-3.5 transition-all hover:scale-[1.02]`}>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.text} text-lg font-bold`}>
                      {s.icon}
                    </div>
                    <div>
                      <p className={`text-2xl font-bold ${s.text}`}>{sevCounts[sev]}</p>
                      <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-medium">{sev}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Two-column: Priority Insights + Category */}
          {insights.length > 0 && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 stagger-grid">
              <DashCard className="lg:col-span-2">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Priority Insights</h2>
                  <a href="/dashboard/insights" className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline">
                    View all {insights.length}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="space-y-2.5">
                  {topInsights.map((insight) => (
                    <InsightRow key={insight.id} insight={insight} />
                  ))}
                </div>
              </DashCard>

              <DashCard>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">
                  Category Distribution
                </h2>
                <div className="space-y-3.5">
                  {Array.from(catCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([cat, count]) => {
                      const maxCount = Math.max(...Array.from(catCounts.values()))
                      const pct = Math.round((count / maxCount) * 100)
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-gray-700 dark:text-gray-300 capitalize font-medium">{cat.replace("_", " ")}</span>
                            <span className="font-bold text-gray-900 dark:text-gray-100">{count}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-600 transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                </div>
              </DashCard>
            </div>
          )}
        </>
      )}

      {/* Platform Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 stagger-grid">
        <StatCard label="Providers" value={providers.length} subtitle="OAuth integrations" icon={Zap} />
        <StatCard label="Algorithms" value={algoCount} subtitle="Proprietary analyses" icon={Brain} trend="up" trendValue="+12%" />
        <StatCard label="API Keys" value={keys.length} subtitle="Active credentials" icon={KeyRound} />
        <StatCard label="Webhooks" value={webhooks.length} subtitle="Event subscriptions" icon={Webhook} />
      </div>

      {/* Connected Providers */}
      {providers.length > 0 && (
        <DashCard>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Connected Providers</h2>
            <a href="/dashboard/providers" className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline">
              Manage
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 px-4 py-3.5 transition-all hover:shadow-sm hover:border-accent-200 dark:hover:border-accent-800 group"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-sm font-bold text-white uppercase shadow-lg shadow-accent-500/20 group-hover:scale-105 transition-transform">
                  {p.name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{p.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{p.authType}</p>
                </div>
              </div>
            ))}
          </div>
        </DashCard>
      )}

      {/* Empty state */}
      {!selectedUserId && (
        <DashCard className="text-center py-20">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 mb-5 shadow-xl shadow-accent-500/25">
            <Activity className="h-10 w-10 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Select a User to Begin</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            Choose a user above to unlock real-time health scores, readiness tracking,
            {algoCount} proprietary algorithms & personalized biometric recommendations.
          </p>
        </DashCard>
      )}
    </div>
  )
}

function InsightRow({ insight }: { insight: Insight }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 p-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
      <span className={`mt-1.5 inline-block h-2 w-2 rounded-full shrink-0 ${
        { critical: "bg-red-500", warning: "bg-amber-500", info: "bg-blue-500", positive: "bg-emerald-500" }[insight.severity]
      }`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{insight.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5 leading-relaxed">{insight.description}</p>
      </div>
      {insight.value != null && (
        <div className="text-right flex-shrink-0">
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">{insight.value}</span>
          {insight.unit && <span className="text-[10px] text-gray-400 ml-0.5">{insight.unit}</span>}
        </div>
      )}
    </div>
  )
}
