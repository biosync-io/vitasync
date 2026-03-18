"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
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

/* ─── Score Ring SVG ─── */
function ScoreRing({ value, max = 100, size = 120, label, color }: { value: number; max?: number; size?: number; label: string; color: string }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, value / max)
  const offset = circ * (1 - pct)
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-800" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{Math.round(value)}</span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
    </div>
  )
}

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-5 shadow-glass animate-fade-in ${className}`}>
      {children}
    </div>
  )
}

function SeverityBadge({ severity, count }: { severity: InsightSeverity; count: number }) {
  const styles: Record<InsightSeverity, string> = {
    critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 shadow-glow-red",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 shadow-glow-amber",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
    positive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 shadow-glow-green",
  }
  const icons: Record<InsightSeverity, string> = { critical: "✕", warning: "⚠", info: "ℹ", positive: "✓" }
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${styles[severity]}`}>
      <span className="text-lg">{icons[severity]}</span>
      <div>
        <p className="text-xl font-bold">{count}</p>
        <p className="text-[10px] uppercase tracking-wide opacity-70">{severity}</p>
      </div>
    </div>
  )
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function DashboardPage() {
  const [selectedUserId, setSelectedUserId] = useState("")

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

  // Top 5 insights (critical + warning first)
  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 }
  const topInsights = [...insights].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]).slice(0, 5)

  const algoCount = algorithms?.total ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Health Command Center
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {algoCount} proprietary algorithms analyzing your biometric data in real-time.
          </p>
        </div>
        <select
          className="w-full sm:w-64 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm"
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
      </div>

      {/* Score Rings Row (shown when user selected) */}
      {selectedUserId && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-slide-up">
          <GlassCard className="flex items-center justify-center relative">
            <ScoreRing
              value={healthScore?.overallScore ?? 0}
              label="Health"
              color="#6366f1"
            />
          </GlassCard>
          <GlassCard className="flex items-center justify-center relative">
            <ScoreRing
              value={readiness?.score ?? 0}
              label="Readiness"
              color="#10b981"
            />
          </GlassCard>
          <GlassCard className="flex items-center justify-center relative">
            <ScoreRing
              value={trainingLoad?.fatigue ?? 0}
              label="Strain"
              color="#f59e0b"
            />
          </GlassCard>
          <GlassCard className="flex items-center justify-center relative">
            <ScoreRing
              value={healthScore?.recoveryScore ?? 0}
              label="Recovery"
              color="#8b5cf6"
            />
          </GlassCard>
        </div>
      )}

      {/* Severity Overview */}
      {selectedUserId && insights.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 animate-slide-up">
          {(["critical", "warning", "info", "positive"] as const).map((sev) => (
            <SeverityBadge key={sev} severity={sev} count={sevCounts[sev]} />
          ))}
        </div>
      )}

      {/* Two-column layout for insights + category breakdown */}
      {selectedUserId && insights.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 animate-slide-up">
          {/* Top Insights */}
          <GlassCard className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Priority Insights</h2>
              <a href="/dashboard/insights" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                View all {insights.length} →
              </a>
            </div>
            <div className="space-y-3">
              {topInsights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </div>
          </GlassCard>

          {/* Category Breakdown */}
          <GlassCard>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Category Distribution
            </h2>
            <div className="space-y-3">
              {Array.from(catCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([cat, count]) => (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-700 dark:text-gray-300 capitalize">{cat.replace("_", " ")}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{count}</span>
                    </div>
                    <MiniBar value={count} max={Math.max(...Array.from(catCounts.values()))} color="bg-brand-500 dark:bg-brand-400" />
                  </div>
                ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Platform Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GlassCard>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Providers</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{providers.length}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">OAuth integrations</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Algorithms</p>
          <p className="mt-2 text-3xl font-bold bg-gradient-to-r from-brand-600 to-violet-500 bg-clip-text text-transparent">{algoCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Proprietary analyses</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">API Keys</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{keys.length}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Active credentials</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Webhooks</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{webhooks.length}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Event subscriptions</p>
        </GlassCard>
      </div>

      {/* Providers Grid */}
      {providers.length > 0 && (
        <GlassCard>
          <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Connected Providers</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 px-4 py-3 transition-all hover:shadow-sm hover:border-brand-200 dark:hover:border-brand-800"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-sm font-bold text-white uppercase shadow-glow">
                  {p.name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{p.authType}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Empty state (no user selected) */}
      {!selectedUserId && (
        <GlassCard className="text-center py-16">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 mb-4 shadow-glow">
            <span className="text-4xl">🧬</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Select a User to Begin</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
            Choose a user above to unlock the full health intelligence dashboard — real-time health scores,
            readiness tracking, {algoCount} proprietary algorithms, and personalized recommendations
            powered by state-of-the-art biometric analysis.
          </p>
        </GlassCard>
      )}
    </div>
  )
}

function InsightRow({ insight }: { insight: Insight }) {
  const icons: Record<InsightSeverity, string> = { critical: "🔴", warning: "🟡", info: "🔵", positive: "🟢" }
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 p-3">
      <span className="text-sm mt-0.5">{icons[insight.severity]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{insight.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{insight.description}</p>
      </div>
      {insight.value != null && (
        <div className="text-right flex-shrink-0">
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{insight.value}</span>
          {insight.unit && <span className="text-[10px] text-gray-400 ml-0.5">{insight.unit}</span>}
        </div>
      )}
    </div>
  )
}
