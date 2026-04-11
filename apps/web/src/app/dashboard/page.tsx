"use client"

import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { useSelectedUser } from "../../lib/user-selection-context"
import {
  eventsApi,
  goalsApi,
  healthApi,
  healthScoresApi,
  insightsApi,
  moodApi,
  providersApi,
  readinessApi,
  sleepAnalysisApi,
  usersApi,
  type GoalData,
  type HealthScoreData,
  type Insight,
  type InsightCategory,
  type InsightSeverity,
  type WorkoutEvent,
} from "../../lib/api"
import {
  Activity,
  Heart,
  Zap,
  Shield,
  ArrowRight,
  Brain,
  Moon,
  Dumbbell,
  Flame,
  Target,
  Sparkles,
} from "lucide-react"
import {
  Card,
  CardHeader,
  CardContent,
  StatCard,
  PageHeader,
  Badge,
  MetricRing,
  MetricBar,
  MetricTrend,
  StatSkeleton,
  CardSkeleton,
  EmptyState,
} from "../../lib/components/ui"

/* ─── Helpers ─── */
function getScoreLabel(score: number): { text: string; color: string } {
  if (score >= 85) return { text: "Excellent", color: "text-emerald-700 dark:text-emerald-500" }
  if (score >= 70) return { text: "Good", color: "text-blue-700 dark:text-blue-500" }
  if (score >= 50) return { text: "Fair", color: "text-amber-700 dark:text-amber-500" }
  if (score >= 30) return { text: "Low", color: "text-orange-700 dark:text-orange-500" }
  return { text: "Critical", color: "text-red-700 dark:text-red-500" }
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function formatDuration(secs: number): string {
  const m = Math.round(secs / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/* ─── Sparkline ─── */
function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  const chartData = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color.replace("#", "")})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

const SEVERITY_BADGE: Record<InsightSeverity, "danger" | "warning" | "info" | "success"> = {
  critical: "danger",
  warning: "warning",
  info: "info",
  positive: "success",
}

export default function DashboardPage() {
  const { selectedUserId } = useSelectedUser()

  const { data: providers = [] } = useQuery({ queryKey: ["providers"], queryFn: providersApi.list })
  const { data: algorithms } = useQuery({ queryKey: ["insight-algorithms"], queryFn: () => insightsApi.algorithms() })

  const { data: selectedUser } = useQuery({
    queryKey: ["user", selectedUserId],
    queryFn: () => usersApi.get(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: healthScore } = useQuery({
    queryKey: ["health-score", selectedUserId],
    queryFn: () => healthScoresApi.latest(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: scoreHistory } = useQuery({
    queryKey: ["health-score-history", selectedUserId],
    queryFn: () => healthScoresApi.history(selectedUserId, { limit: 14 }),
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

  const weekAgo = useMemo(() => new Date(Date.now() - 7 * 86400000).toISOString(), [])
  const { data: recentEvents } = useQuery({
    queryKey: ["recent-events", selectedUserId],
    queryFn: () => eventsApi.list(selectedUserId, { eventType: "workout", from: weekAgo, limit: 20 }),
    enabled: !!selectedUserId,
  })

  const { data: goalsResult } = useQuery({
    queryKey: ["active-goals", selectedUserId],
    queryFn: () => goalsApi.list(selectedUserId, { status: "active" }),
    enabled: !!selectedUserId,
  })

  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
  }, [])
  const { data: todayHr } = useQuery({
    queryKey: ["today-hr", selectedUserId],
    queryFn: () => healthApi.query(selectedUserId, { metricType: "heart_rate", from: todayStart, limit: 200 }),
    enabled: !!selectedUserId,
  })
  const { data: todayCal } = useQuery({
    queryKey: ["today-cal", selectedUserId],
    queryFn: () => healthApi.query(selectedUserId, { metricType: "calories", from: todayStart, limit: 200 }),
    enabled: !!selectedUserId,
  })

  const { data: moodStats } = useQuery({
    queryKey: ["mood-stats", selectedUserId],
    queryFn: () => moodApi.stats(selectedUserId, 7),
    enabled: !!selectedUserId,
  })

  const { data: sleepQuality } = useQuery({
    queryKey: ["sleep-quality", selectedUserId],
    queryFn: () => sleepAnalysisApi.quality(selectedUserId, 7),
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

  const timelineData = useMemo(() => {
    const hrData = todayHr?.data ?? []
    const calData = todayCal?.data ?? []
    const buckets = new Map<string, { hr: number[]; cal: number[] }>()
    for (const m of hrData) {
      const h = new Date(m.recordedAt).getHours()
      const key = `${String(h).padStart(2, "0")}:00`
      if (!buckets.has(key)) buckets.set(key, { hr: [], cal: [] })
      buckets.get(key)!.hr.push(m.value)
    }
    for (const m of calData) {
      const h = new Date(m.recordedAt).getHours()
      const key = `${String(h).padStart(2, "0")}:00`
      if (!buckets.has(key)) buckets.set(key, { hr: [], cal: [] })
      buckets.get(key)!.cal.push(m.value)
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, vals]) => ({
        time,
        hr: vals.hr.length > 0 ? Math.round(vals.hr.reduce((s, v) => s + v, 0) / vals.hr.length) : null,
        calories: vals.cal.length > 0 ? Math.round(vals.cal.reduce((s, v) => s + v, 0)) : null,
      }))
  }, [todayHr, todayCal])

  const healthSparkline = useMemo(() => (scoreHistory?.data ?? []).map((s) => s.overallScore).reverse(), [scoreHistory])
  const sleepSparkline = useMemo(() => (scoreHistory?.data ?? []).map((s) => s.sleepScore ?? 0).reverse(), [scoreHistory])
  const activitySparkline = useMemo(() => (scoreHistory?.data ?? []).map((s) => s.activityScore ?? 0).reverse(), [scoreHistory])

  const catCounts = new Map<InsightCategory, number>()
  for (const i of insights) catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1)
  const catArray = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1])

  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 }
  const topInsights = [...insights].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]).slice(0, 6)

  const algoCount = algorithms?.total ?? 0

  const [dateStr, setDateStr] = useState("")
  const [greeting, setGreeting] = useState("Welcome")
  useEffect(() => {
    setDateStr(new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }))
    setGreeting(getGreeting())
  }, [])

  const readinessRec = readiness?.recommendation?.replace("_", " ") ?? null

  /* Derived metrics for the new layout */
  const yesterdayScore = scoreHistory?.data?.[1]?.overallScore ?? 0
  const healthScoreChange =
    scoreHistory?.data && scoreHistory.data.length >= 2 && yesterdayScore > 0
      ? Math.round(((healthScore?.overallScore ?? 0) - yesterdayScore) / yesterdayScore * 100)
      : undefined

  const latestHr = useMemo(() => {
    const hrData = todayHr?.data ?? []
    const last = hrData[hrData.length - 1]
    return last ? Math.round(last.value) : null
  }, [todayHr])

  const totalCalories = useMemo(() => {
    const calData = todayCal?.data ?? []
    return calData.length > 0 ? Math.round(calData.reduce((s, m) => s + m.value, 0)) : null
  }, [todayCal])

  const statsLoading = !!selectedUserId && healthScore === undefined && readiness === undefined
  const activeGoals = (goalsResult?.data ?? []).filter((g: GoalData) => g.status === "active").slice(0, 5)
  const workouts = recentEvents?.data ?? []

  return (
    <div className="space-y-8">
      {/* ──── Page Header ──── */}
      <PageHeader
        title={
          selectedUser
            ? `${greeting}, ${selectedUser.displayName || selectedUser.externalId} 👋`
            : "Health Command Center"
        }
        subtitle={
          selectedUser && readinessRec
            ? `${dateStr} · Recommendation: ${readinessRec} · ${algoCount} algorithms active`
            : dateStr || `${algoCount} proprietary algorithms analyzing your biometric data`
        }
        badge={<Badge variant="success" dot pulse>Live</Badge>}
      />

      {/* ──── Stats Row ──── */}
      {selectedUserId && (
        <>
          {statsLoading ? (
            <StatSkeleton count={4} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Health Score"
                value={healthScore?.overallScore ?? "—"}
                {...(healthScoreChange != null ? { change: healthScoreChange, changeLabel: "vs yesterday" } : {})}
                icon={<Heart className="h-5 w-5" />}
                color="brand"
              />
              <StatCard
                label="Readiness"
                value={readiness?.score ?? "—"}
                icon={<Shield className="h-5 w-5" />}
                color="vitality"
              />
              <StatCard
                label="Sleep Quality"
                value={sleepQuality ? sleepQuality.avgSleepScore : "—"}
                icon={<Moon className="h-5 w-5" />}
                color="brand"
              />
              <StatCard
                label="Mood"
                value={moodStats ? moodStats.avgScore.toFixed(1) : "—"}
                icon={<Brain className="h-5 w-5" />}
                color="accent"
              />
            </div>
          )}

          {/* ──── Main Grid ──── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Biometric Timeline */}
              <Card>
                <CardHeader
                  title="Today's Biometrics"
                  subtitle="Heart rate & calorie timeline"
                  icon={<Activity className="h-5 w-5 text-accent-500" />}
                  action={
                    <div className="flex items-center gap-4 text-[10px] font-medium">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        Heart Rate
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        Calories
                      </span>
                    </div>
                  }
                />
                <CardContent>
                  {timelineData.length >= 2 ? (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={timelineData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                          <defs>
                            <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                              <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="calGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              fontSize: 12,
                              borderRadius: 12,
                              border: "1px solid rgba(55,65,81,0.8)",
                              boxShadow: "0 4px 12px rgba(0,0,0,.08)",
                            }}
                            labelStyle={{ fontWeight: 600 }}
                          />
                          <Area type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={2} fill="url(#hrGrad)" dot={false} name="Heart Rate" />
                          <Area type="monotone" dataKey="calories" stroke="#f59e0b" strokeWidth={2} fill="url(#calGrad)" dot={false} name="Calories" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Activity}
                      title="No biometric data yet"
                      description="Heart rate and calorie data will appear here as your devices sync."
                    />
                  )}
                </CardContent>
              </Card>

              {/* Recent Workouts */}
              <Card>
                <CardHeader
                  title="Recent Workouts"
                  subtitle="This week's activity"
                  icon={<Dumbbell className="h-5 w-5 text-orange-500" />}
                  action={
                    <a
                      href="/dashboard/training"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
                    >
                      View all <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  }
                />
                <CardContent>
                  {workouts.length > 0 ? (
                    <div className="space-y-2">
                      {workouts.slice(0, 5).map((ev: WorkoutEvent) => (
                        <div
                          key={ev.id}
                          className="flex items-center gap-3 rounded-xl bg-gray-50/80 dark:bg-white/[0.02] px-4 py-3 transition-colors hover:bg-gray-100/80 dark:hover:bg-white/[0.04]"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-500/10">
                            <Dumbbell className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
                              {ev.title || ev.activityType || ev.eventType}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {ev.durationSeconds ? formatDuration(ev.durationSeconds) : "—"}
                              {ev.caloriesKcal ? ` · ${Math.round(ev.caloriesKcal)} kcal` : ""}
                            </p>
                          </div>
                          {ev.avgHeartRate && (
                            <Badge variant="danger" size="sm">
                              <Heart className="h-3 w-3" /> {ev.avgHeartRate}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Dumbbell}
                      title="No workouts this week"
                      description="Sync your fitness tracker to see workout activity here."
                      action={{ label: "Connect Provider", href: "/dashboard/providers" }}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Active Goals */}
              <Card>
                <CardHeader
                  title="Active Goals"
                  subtitle="Track your progress"
                  icon={<Target className="h-5 w-5 text-vitality-500" />}
                  action={
                    <a
                      href="/dashboard/goals"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
                    >
                      All goals <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  }
                />
                <CardContent>
                  {activeGoals.length > 0 ? (
                    <div className="space-y-5">
                      {activeGoals.map((g: GoalData) => {
                        const pct =
                          g.targetValue > 0
                            ? Math.min(100, Math.round(((g.currentValue ?? 0) / g.targetValue) * 100))
                            : 0
                        const barColor: "vitality" | "brand" | "amber" =
                          pct >= 80 ? "vitality" : pct >= 40 ? "brand" : "amber"
                        return (
                          <div key={g.id} className="space-y-1">
                            <MetricBar
                              label={g.name}
                              value={g.currentValue ?? 0}
                              max={g.targetValue}
                              color={barColor}
                            />
                            {g.streak > 0 && (
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1 pl-0.5">
                                <Flame className="h-3 w-3 text-orange-400" /> {g.streak} day streak
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Target}
                      title="No active goals"
                      description="Set health and fitness goals to track your progress."
                      action={{ label: "Create Goal", href: "/dashboard/goals" }}
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Health Score Ring */}
              <Card glow="brand">
                <CardContent className="flex flex-col items-center py-8 gap-4">
                  <MetricRing
                    value={healthScore?.overallScore ?? 0}
                    size="lg"
                    color="brand"
                    label="Health Score"
                  />
                  <span
                    className={`text-xs font-semibold ${getScoreLabel(healthScore?.overallScore ?? 0).color}`}
                  >
                    {getScoreLabel(healthScore?.overallScore ?? 0).text}
                  </span>
                  {scoreHistory?.data && scoreHistory.data.length >= 2 && (
                    <MetricTrend
                      current={healthScore?.overallScore ?? 0}
                      previous={yesterdayScore}
                      label="vs yesterday"
                    />
                  )}
                  {healthSparkline.length > 2 && (
                    <div className="w-full mt-2">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 text-center">
                        14-day trend
                      </p>
                      <Sparkline data={healthSparkline} color="#6366f1" height={36} />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Status */}
              <Card glow="vitality">
                <CardHeader
                  title="Quick Status"
                  icon={<Sparkles className="h-5 w-5 text-vitality-500" />}
                />
                <CardContent className="space-y-4">
                  {readiness && (
                    <div className="rounded-xl bg-vitality-50/50 dark:bg-vitality-500/5 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Readiness
                        </span>
                        <Badge variant="success" size="sm">
                          {readiness.score}/100
                        </Badge>
                      </div>
                      {readinessRec && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                          Rec:{" "}
                          <span className="font-semibold text-vitality-600 dark:text-vitality-400">
                            {readinessRec}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                  {trainingLoad && (
                    <div className="rounded-xl bg-amber-50/50 dark:bg-amber-500/5 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Training Load
                        </span>
                        <Badge variant="warning" size="sm" className="capitalize">
                          {trainingLoad.status}
                        </Badge>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                          {Math.round(trainingLoad.fitness)}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          fitness · {Math.round(trainingLoad.fatigue)} fatigue
                        </span>
                      </div>
                    </div>
                  )}
                  {sleepQuality && (
                    <div className="rounded-xl bg-brand-50/50 dark:bg-brand-500/5 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Sleep (7d avg)
                        </span>
                        <Badge variant="info" size="sm">
                          {sleepQuality.avgEfficiency.toFixed(0)}% eff
                        </Badge>
                      </div>
                      <MetricBar
                        value={sleepQuality.avgSleepScore}
                        max={100}
                        label="Sleep Score"
                        color="brand"
                      />
                      {sleepSparkline.length > 2 && (
                        <Sparkline data={sleepSparkline} color="#6366f1" height={28} />
                      )}
                    </div>
                  )}
                  {!readiness && !trainingLoad && !sleepQuality && (
                    <EmptyState
                      icon={Sparkles}
                      title="No status data"
                      description="Connect a provider to see your readiness and training status."
                    />
                  )}
                </CardContent>
              </Card>

              {/* Top Insights */}
              <Card>
                <CardHeader
                  title="Top Insights"
                  subtitle={
                    insights.length > 0
                      ? `${sevCounts.critical} critical · ${sevCounts.warning} warnings · ${sevCounts.positive} positive`
                      : "Analytics engine insights"
                  }
                  icon={<Brain className="h-5 w-5 text-purple-500" />}
                  action={
                    insights.length > 0 ? (
                      <a
                        href="/dashboard/insights"
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
                      >
                        All {insights.length} <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    ) : undefined
                  }
                />
                <CardContent>
                  {topInsights.length > 0 ? (
                    <div className="space-y-2.5">
                      {topInsights.map((insight: Insight) => (
                        <div
                          key={insight.id}
                          className="flex items-start gap-3 rounded-xl bg-gray-50/80 dark:bg-white/[0.02] p-3.5 transition-colors hover:bg-gray-100/80 dark:hover:bg-white/[0.04]"
                        >
                          <Badge
                            variant={SEVERITY_BADGE[insight.severity]}
                            size="sm"
                            dot
                            className="mt-0.5 shrink-0 capitalize"
                          >
                            {insight.severity}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
                              {insight.title}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5 leading-relaxed">
                              {insight.description}
                            </p>
                          </div>
                          {insight.value != null && (
                            <div className="text-right flex-shrink-0">
                              <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
                                {insight.value}
                              </span>
                              {insight.unit && (
                                <span className="text-[10px] text-gray-400 ml-0.5">{insight.unit}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {catArray.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100 dark:border-white/[0.04]">
                          {catArray.slice(0, 4).map(([cat]) => (
                            <Badge key={cat} variant="default" size="sm" className="capitalize">
                              {cat.replace("_", " ")}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Brain}
                      title="No insights yet"
                      description="Insights will appear once enough health data has been collected."
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ──── Quick Metrics Row ──── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent>
                <MetricBar
                  label="Heart Rate"
                  value={latestHr ?? 0}
                  max={200}
                  color="accent"
                />
                {latestHr != null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                    Latest: {latestHr} bpm
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <MetricBar
                  label="Calories Burned"
                  value={totalCalories ?? 0}
                  max={2500}
                  color="amber"
                />
                {totalCalories != null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                    {totalCalories.toLocaleString()} kcal today
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <MetricBar
                  label="Activity Score"
                  value={healthScore?.activityScore ?? 0}
                  max={100}
                  color="vitality"
                />
                {activitySparkline.length > 2 && (
                  <div className="mt-2">
                    <Sparkline data={activitySparkline} color="#10b981" height={28} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ──── Platform Stats ──── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Providers"
          value={providers.length}
          icon={<Zap className="h-5 w-5" />}
          color="default"
        />
        <StatCard
          label="Algorithms"
          value={algoCount}
          icon={<Brain className="h-5 w-5" />}
          color="vitality"
        />
      </div>

      {/* Connected Providers */}
      {providers.length > 0 && (
        <Card>
          <CardHeader
            title="Connected Providers"
            action={
              <a
                href="/dashboard/providers"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
              >
                Manage <ArrowRight className="h-3.5 w-3.5" />
              </a>
            }
          />
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02] px-4 py-3.5 transition-all hover:shadow-sm hover:border-brand-200 dark:hover:border-brand-500/20 group"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white uppercase shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform">
                    {p.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{p.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">{p.authType}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
