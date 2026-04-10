"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RotateCcw, Zap, CheckCircle2, AlertTriangle, XCircle, Radio } from "lucide-react"
import { type CircuitBreakerMetrics, circuitBreakersApi } from "../../../../lib/api"
import {
  PageHeader,
  Card,
  CardContent,
  Badge,
  Button,
  EmptyState,
  CardSkeleton,
  cn,
} from "../../../../lib/components/ui"

/* ── State visual mappings ─────────────────────────────────── */

const STATE_CONFIG: Record<string, {
  border: string
  glow: string
  dotClass: string
  badge: string
  badgeText: string
  label: string
  icon: typeof CheckCircle2
  iconColor: string
}> = {
  closed: {
    border: "border-emerald-500/30",
    glow: "shadow-emerald-500/5",
    dotClass: "bg-emerald-500 pulse-glow",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    badgeText: "text-emerald-400",
    label: "Closed · Healthy",
    icon: CheckCircle2,
    iconColor: "text-emerald-400",
  },
  half_open: {
    border: "border-amber-500/30",
    glow: "shadow-amber-500/5",
    dotClass: "bg-amber-500 animate-pulse",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    badgeText: "text-amber-400",
    label: "Half-Open · Testing",
    icon: AlertTriangle,
    iconColor: "text-amber-400",
  },
  open: {
    border: "border-red-500/30",
    glow: "shadow-red-500/5",
    dotClass: "bg-red-500",
    badge: "bg-red-500/10 text-red-400 border-red-500/20",
    badgeText: "text-red-400",
    label: "Open · Tripped",
    icon: XCircle,
    iconColor: "text-red-400",
  },
}

const FALLBACK_CONFIG = {
  border: "border-white/[0.06]",
  glow: "",
  dotClass: "bg-gray-500",
  badge: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  badgeText: "text-gray-400",
  label: "Unknown",
  icon: Radio,
  iconColor: "text-gray-400",
}

function formatTime(ts: number | null): string {
  if (!ts) return "Never"
  return new Date(ts).toLocaleString()
}

function formatTimeShort(ts: number | null): string {
  if (!ts) return "—"
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export default function CircuitBreakersPage() {
  const queryClient = useQueryClient()

  const { data: metrics, isLoading, dataUpdatedAt } = useQuery({
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

  const entries = Object.entries(metrics ?? {})

  const summary = entries.reduce(
    (acc, [, m]) => {
      acc[m.state] = (acc[m.state] ?? 0) + 1
      acc.total = (acc.total ?? 0) + 1
      return acc
    },
    { closed: 0, half_open: 0, open: 0, total: 0 } as { closed: number; half_open: number; open: number; total: number },
  )

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────── */}
      <PageHeader
        title="Circuit Breakers"
        subtitle="Per-provider circuit breaker status · Auto-refreshes every 10 s"
        badge={
          <Badge variant="success" dot pulse size="sm">
            LIVE
          </Badge>
        }
        actions={
          dataUpdatedAt > 0 ? (
            <span className="text-[10px] font-mono text-gray-600 bg-white/[0.04] border border-white/[0.06] rounded-md px-2 py-1">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          ) : undefined
        }
      />

      {/* ── Summary Bar ─────────────────────────────────── */}
      {entries.length > 0 && (
        <Card className="animate-fade-in-down" style={{ animationDelay: "60ms" }}>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Text summary */}
              <div className="flex items-center gap-4 text-sm font-medium">
                {summary.closed > 0 && (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 pulse-glow" />
                    {summary.closed}/{summary.total} Healthy
                  </span>
                )}
                {summary.half_open > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                    {summary.half_open} Degraded
                  </span>
                )}
                {summary.open > 0 && (
                  <span className="flex items-center gap-1.5 text-red-400">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    {summary.open} Down
                  </span>
                )}
              </div>

              {/* Colored segment bar */}
              <div className="flex h-2 w-full sm:w-48 rounded-full overflow-hidden bg-white/[0.06]">
                {summary.closed > 0 && (
                  <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${(summary.closed / summary.total) * 100}%` }} />
                )}
                {summary.half_open > 0 && (
                  <div className="bg-amber-500 transition-all duration-500" style={{ width: `${(summary.half_open / summary.total) * 100}%` }} />
                )}
                {summary.open > 0 && (
                  <div className="bg-red-500 transition-all duration-500" style={{ width: `${(summary.open / summary.total) * 100}%` }} />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Cards ───────────────────────────────────────── */}
      {isLoading ? (
        <CardSkeleton count={3} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No circuit breakers registered yet"
          description="They are created automatically on the first provider sync."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 cyber-stagger">
          {entries.map(([provider, m]) => {
            const config = STATE_CONFIG[m.state] ?? FALLBACK_CONFIG
            const badgeVariant = m.state === "closed"
              ? "success"
              : m.state === "half_open"
                ? "warning"
                : m.state === "open"
                  ? "danger"
                  : "default" as const
            const badgePulse = m.state === "closed" || m.state === "half_open"

            return (
              <Card
                key={provider}
                className={cn(
                  "group",
                  config.border,
                  config.border.replace("border-", "dark:border-"),
                  config.glow,
                  "shadow-lg hover:-translate-y-0.5 hover:shadow-xl",
                )}
              >
                <CardContent className="p-5">
                  {/* Provider header */}
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      {/* Large status dot */}
                      <div className="relative">
                        <span className={`flex h-4 w-4 rounded-full ${config.dotClass}`} />
                        {m.state === "closed" && (
                          <span className="absolute inset-0 h-4 w-4 rounded-full bg-emerald-500 animate-ping opacity-20" />
                        )}
                      </div>
                      {/* Logo placeholder + name */}
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.06] text-gray-400">
                          <Zap className="h-4 w-4" />
                        </div>
                        <h3 className="text-base font-bold text-gray-100 capitalize tracking-tight">
                          {provider}
                        </h3>
                      </div>
                    </div>
                    <Badge variant={badgeVariant} size="sm" dot pulse={badgePulse}>
                      {config.label}
                    </Badge>
                  </div>

                  {/* Metrics mini-grid */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="rounded-lg bg-white/[0.04] border border-white/[0.04] p-3 text-center transition-all duration-200 group-hover:bg-white/[0.06]">
                      <p className="text-lg font-bold text-red-400 number-pop">{m.failureCount}</p>
                      <p className="text-[9px] uppercase tracking-wider text-gray-500 font-medium mt-0.5">Failures</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.04] border border-white/[0.04] p-3 text-center transition-all duration-200 group-hover:bg-white/[0.06]">
                      <p className="text-lg font-bold text-emerald-400 number-pop">{m.successCount}</p>
                      <p className="text-[9px] uppercase tracking-wider text-gray-500 font-medium mt-0.5">Successes</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.04] border border-white/[0.04] p-3 text-center transition-all duration-200 group-hover:bg-white/[0.06]">
                      <p className="text-lg font-bold text-gray-200 number-pop">{m.totalRequests}</p>
                      <p className="text-[9px] uppercase tracking-wider text-gray-500 font-medium mt-0.5">Total</p>
                    </div>
                  </div>

                  {/* Last failure timestamp */}
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-4 px-1">
                    <span className="font-medium">Last Failure</span>
                    <span className="font-mono text-gray-400">{formatTime(m.lastFailureTime)}</span>
                  </div>

                  {/* Reset button */}
                  <Button
                    variant="outline"
                    size="sm"
                    icon={RotateCcw}
                    loading={resetMutation.isPending && resetMutation.variables === provider}
                    disabled={resetMutation.isPending || m.state === "closed"}
                    onClick={() => resetMutation.mutate(provider)}
                    className="w-full"
                  >
                    Reset Breaker
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
