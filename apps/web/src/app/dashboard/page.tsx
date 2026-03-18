"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  PieChart, Pie, Cell,
} from "recharts"
import { useSelectedUser } from "../../lib/user-selection-context"
import {
  apiKeysApi,
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
  webhooksApi,
  type GoalData,
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
  TrendingUp,
  TrendingDown,
  ArrowRight,
  KeyRound,
  Webhook,
  Brain,
  ChevronDown,
  Moon,
  Dumbbell,
  Flame,
  Target,
  CalendarDays,
} from "lucide-react"

/* ─── Helpers ─── */
function getScoreLabel(score: number): { text: string; color: string } {
  if (score >= 85) return { text: "Excellent", color: "text-emerald-500" }
  if (score >= 70) return { text: "Good", color: "text-blue-500" }
  if (score >= 50) return { text: "Fair", color: "text-amber-500" }
  if (score >= 30) return { text: "Low", color: "text-orange-500" }
  return { text: "Critical", color: "text-red-500" }
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

/* ─── Score Ring SVG ─── */
function ScoreRing({ value, max = 100, size = 100, label, color, icon: Icon }: {
  value: number; max?: number; size?: number; label: string; color: string
  icon: React.ComponentType<{ className?: string }>
}) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, value / max)
  const offset = circ * (1 - pct)
  const status = getScoreLabel(value)
  return (
    <div className="flex flex-col items-center gap-2">
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
      <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <span className={`text-[11px] font-semibold ${status.color}`}>{status.text}</span>
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

function StatCard({ label, value, subtitle, icon: Icon, trend, trendValue, sparkData, sparkColor, iconBg, iconColor }: {
  label: string; value: string | number; subtitle: string
  icon: React.ComponentType<{ className?: string }>
  trend?: "up" | "down"; trendValue?: string
  sparkData?: number[]; sparkColor?: string
  iconBg?: string; iconColor?: string
}) {
  return (
    <DashCard>
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBg ?? "bg-accent-50 dark:bg-accent-900/20"}`}>
          <Icon className={`h-5 w-5 ${iconColor ?? "text-accent-600 dark:text-accent-400"}`} />
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
      {sparkData && sparkData.length > 2 && (
        <div className="mt-3 -mx-1">
          <Sparkline data={sparkData} color={sparkColor ?? "#ef4444"} />
        </div>
      )}
    </DashCard>
  )
}

/* ─── Donut Chart ─── */
const DONUT_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"]

function CategoryDonut({ data }: { data: [string, number][] }) {
  const total = data.reduce((s, [, v]) => s + v, 0)
  const chartData = data.map(([name, value]) => ({ name, value }))
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData} dataKey="value" cx="50%" cy="50%"
              innerRadius={45} outerRadius={70} paddingAngle={2} strokeWidth={0}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{total}</span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">Total</span>
        </div>
      </div>
      <div className="w-full space-y-2">
        {data.slice(0, 6).map(([cat, count], i) => (
          <div key={cat} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-gray-600 dark:text-gray-400 capitalize flex-1 truncate">{cat.replace("_", " ")}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Weekly Schedule / Recent Workouts ─── */
function WeeklySchedule({ events }: { events: WorkoutEvent[] }) {
  const days = useMemo(() => {
    const now = new Date()
    const result: { label: string; dayNum: number; isToday: boolean; workouts: WorkoutEvent[] }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const dayStr = d.toISOString().slice(0, 10)
      result.push({
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        dayNum: d.getDate(),
        isToday: i === 0,
        workouts: events.filter((e) => e.startedAt.slice(0, 10) === dayStr),
      })
    }
    return result
  }, [events])

  return (
    <DashCard>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-indigo-500" />
          This Week
        </h2>
        <a href="/dashboard/training" className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline">
          Schedule <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
      {/* Day pills */}
      <div className="flex gap-1.5 mb-4">
        {days.map((d) => (
          <div
            key={d.label}
            className={`flex-1 flex flex-col items-center rounded-xl py-2 text-xs transition-colors ${
              d.isToday
                ? "bg-accent-500 text-white shadow-lg shadow-accent-500/25"
                : d.workouts.length > 0
                  ? "bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-300"
                  : "bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500"
            }`}
          >
            <span className="font-medium">{d.label}</span>
            <span className={`text-lg font-bold ${d.isToday ? "" : ""}`}>{d.dayNum}</span>
            {d.workouts.length > 0 && (
              <span className={`h-1.5 w-1.5 rounded-full mt-0.5 ${d.isToday ? "bg-white" : "bg-accent-500"}`} />
            )}
          </div>
        ))}
      </div>
      {/* Recent activity list */}
      <div className="space-y-2">
        {events.slice(0, 4).map((ev) => (
          <div key={ev.id} className="flex items-center gap-3 rounded-xl bg-gray-50/80 dark:bg-gray-800/30 px-3.5 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Dumbbell className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {ev.title || ev.activityType || ev.eventType}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {ev.durationSeconds ? formatDuration(ev.durationSeconds) : "—"}
                {ev.caloriesKcal ? ` · ${Math.round(ev.caloriesKcal)} kcal` : ""}
              </p>
            </div>
            {ev.avgHeartRate && (
              <span className="text-xs font-medium text-red-500 flex items-center gap-0.5">
                <Heart className="h-3 w-3" /> {ev.avgHeartRate}
              </span>
            )}
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">No activities this week</p>
        )}
      </div>
    </DashCard>
  )
}

/* ─── Daily Biometric Timeline (mini area chart) ─── */
function BiometricTimeline({ metrics }: { metrics: { time: string; hr: number | null; calories: number | null }[] }) {
  if (metrics.length < 2) return null
  return (
    <DashCard>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Activity className="h-4 w-4 text-red-500" />
          Today&apos;s Biometrics
        </h2>
        <div className="flex items-center gap-4 text-[10px] font-medium">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Heart Rate</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Calories</span>
        </div>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={metrics} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
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
              contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,.08)" }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Area type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={2} fill="url(#hrGrad)" dot={false} name="Heart Rate" />
            <Area type="monotone" dataKey="calories" stroke="#f59e0b" strokeWidth={2} fill="url(#calGrad)" dot={false} name="Calories" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </DashCard>
  )
}

/* ─── Goal Progress Bars (Mindo-style) ─── */
function GoalProgress({ goals }: { goals: GoalData[] }) {
  const active = goals.filter((g) => g.status === "active").slice(0, 5)
  if (active.length === 0) return null
  return (
    <DashCard>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-500" />
          Active Goals
        </h2>
        <a href="/dashboard/goals" className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline">
          All goals <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="space-y-4">
        {active.map((g) => {
          const pct = g.targetValue > 0 ? Math.min(100, Math.round(((g.currentValue ?? 0) / g.targetValue) * 100)) : 0
          const barColor = pct >= 80 ? "from-emerald-400 to-emerald-500" : pct >= 40 ? "from-blue-400 to-blue-500" : "from-amber-400 to-amber-500"
          return (
            <div key={g.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{g.name}</span>
                <span className="text-xs font-bold text-gray-900 dark:text-gray-100 ml-2 shrink-0">{pct}%</span>
              </div>
              <div className="relative h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {g.streak > 0 && (
                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                  <Flame className="h-3 w-3 text-orange-400" /> {g.streak} day streak
                </p>
              )}
            </div>
          )
        })}
      </div>
    </DashCard>
  )
}

export default function DashboardPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()

  const { data: providers = [] } = useQuery({ queryKey: ["providers"], queryFn: providersApi.list })
  const { data: usersResult } = useQuery({ queryKey: ["users", 0], queryFn: () => usersApi.list({ limit: 200 }) })
  const { data: keys = [] } = useQuery({ queryKey: ["api-keys"], queryFn: apiKeysApi.list })
  const { data: webhooks = [] } = useQuery({ queryKey: ["webhooks"], queryFn: webhooksApi.list })
  const { data: algorithms } = useQuery({ queryKey: ["insight-algorithms"], queryFn: () => insightsApi.algorithms() })

  // Fetch selected user directly so greeting works even if list hasn't loaded
  const { data: selectedUser } = useQuery({
    queryKey: ["user", selectedUserId],
    queryFn: () => usersApi.get(selectedUserId),
    enabled: !!selectedUserId,
  })
  const users = usersResult?.data ?? []

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

  // Recent workouts (this week)
  const weekAgo = useMemo(() => new Date(Date.now() - 7 * 86400000).toISOString(), [])
  const { data: recentEvents } = useQuery({
    queryKey: ["recent-events", selectedUserId],
    queryFn: () => eventsApi.list(selectedUserId, { eventType: "workout", from: weekAgo, limit: 20 }),
    enabled: !!selectedUserId,
  })

  // Active goals
  const { data: goalsResult } = useQuery({
    queryKey: ["active-goals", selectedUserId],
    queryFn: () => goalsApi.list(selectedUserId, { status: "active" }),
    enabled: !!selectedUserId,
  })

  // Today's heart rate metrics for timeline
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

  // Mood stats
  const { data: moodStats } = useQuery({
    queryKey: ["mood-stats", selectedUserId],
    queryFn: () => moodApi.stats(selectedUserId, 7),
    enabled: !!selectedUserId,
  })

  // Sleep quality
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

  // Build biometric timeline data
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

  // Build sparkline data from score history
  const healthSparkline = useMemo(() => (scoreHistory?.data ?? []).map((s) => s.overallScore).reverse(), [scoreHistory])
  const sleepSparkline = useMemo(() => (scoreHistory?.data ?? []).map((s) => s.sleepScore ?? 0).reverse(), [scoreHistory])
  const activitySparkline = useMemo(() => (scoreHistory?.data ?? []).map((s) => s.activityScore ?? 0).reverse(), [scoreHistory])

  const catCounts = new Map<InsightCategory, number>()
  for (const i of insights) catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1)
  const catArray = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1])

  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 }
  const topInsights = [...insights].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]).slice(0, 6)

  const algoCount = algorithms?.total ?? 0

  // Date display
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

  // Quick-glance metrics for the greeting card
  const readinessRec = readiness?.recommendation?.replace("_", " ") ?? null

  return (
    <div className="space-y-6">
      {/* ──────────── Personalized Greeting Header ──────────── */}
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
            {selectedUser
              ? `${getGreeting()}, ${selectedUser.displayName || selectedUser.externalId} 👋`
              : "Health Command Center"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {selectedUser && readinessRec
              ? <>Today&apos;s recommendation: <span className="font-medium text-accent-600 dark:text-accent-400 capitalize">{readinessRec}</span> · {algoCount} algorithms active</>
              : <>{algoCount} proprietary algorithms analyzing your biometric data in real-time.</>}
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
          {/* ──────────── Quick Status Row — Mood / Sleep / Strain ──────────── */}
          {(moodStats || sleepQuality || trainingLoad) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 stagger-grid">
              {moodStats && (
                <div className="flex items-center gap-4 rounded-2xl border border-purple-100 dark:border-purple-800/40 bg-purple-50/60 dark:bg-purple-900/10 px-5 py-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30 text-2xl">
                    {moodStats.avgMood >= 7 ? "😊" : moodStats.avgMood >= 4 ? "😐" : "😞"}
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{moodStats.avgMood.toFixed(1)}<span className="text-sm font-normal text-gray-400">/10</span></p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Avg Mood · 7d</p>
                  </div>
                </div>
              )}
              {sleepQuality && (
                <div className="flex items-center gap-4 rounded-2xl border border-blue-100 dark:border-blue-800/40 bg-blue-50/60 dark:bg-blue-900/10 px-5 py-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
                    <Moon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{sleepQuality.avgDuration.toFixed(1)}<span className="text-sm font-normal text-gray-400"> hrs</span></p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Avg Sleep · Score {sleepQuality.avgScore}</p>
                  </div>
                </div>
              )}
              {trainingLoad && (
                <div className="flex items-center gap-4 rounded-2xl border border-amber-100 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10 px-5 py-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                    <Flame className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{Math.round(trainingLoad.fitness)}<span className="text-sm font-normal text-gray-400"> fit</span></p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium capitalize">Status: {trainingLoad.status}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──────────── Score Rings with Qualitative Labels ──────────── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 stagger-grid">
            <DashCard className="flex items-center justify-center py-6">
              <ScoreRing value={healthScore?.overallScore ?? 0} label="Health" color="#ef4444" icon={Heart} />
            </DashCard>
            <DashCard className="flex items-center justify-center py-6">
              <ScoreRing value={readiness?.score ?? 0} label="Readiness" color="#10b981" icon={Shield} />
            </DashCard>
            <DashCard className="flex items-center justify-center py-6">
              <ScoreRing value={trainingLoad?.fatigue ?? 0} label="Strain" color="#f59e0b" icon={Zap} />
            </DashCard>
            <DashCard className="flex items-center justify-center py-6">
              <ScoreRing value={healthScore?.recoveryScore ?? 0} label="Recovery" color="#8b5cf6" icon={Activity} />
            </DashCard>
          </div>

          {/* ──────────── Daily Biometric Timeline ──────────── */}
          <BiometricTimeline metrics={timelineData} />

          {/* ──────────── Severity Overview ──────────── */}
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

          {/* ──────────── 3-Col: Priority Insights + Donut + Goals ──────────── */}
          {insights.length > 0 && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 stagger-grid">
              {/* Priority Insights */}
              <DashCard className="lg:col-span-1">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Priority Insights</h2>
                  <a href="/dashboard/insights" className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline">
                    All {insights.length} <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="space-y-2.5">
                  {topInsights.map((insight) => (
                    <InsightRow key={insight.id} insight={insight} />
                  ))}
                </div>
              </DashCard>

              {/* Category Donut Chart */}
              <DashCard>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Category Distribution
                </h2>
                <CategoryDonut data={catArray.slice(0, 8)} />
              </DashCard>

              {/* Active Goals (Mindo-style progress bars) */}
              <GoalProgress goals={goalsResult?.data ?? []} />
            </div>
          )}

          {/* ──────────── Weekly Schedule + Metrics Row ──────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 stagger-grid">
            <WeeklySchedule events={recentEvents?.data ?? []} />

            {/* Health Score Trend (sparkline card) */}
            <DashCard>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Health Trend
                </h2>
                <a href="/dashboard/health-scores" className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline">
                  Details <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
              {healthSparkline.length > 2 ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Overall Score · 14d</p>
                    <Sparkline data={healthSparkline} color="#ef4444" height={40} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sleep Score</p>
                    <Sparkline data={sleepSparkline} color="#3b82f6" height={40} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Activity Score</p>
                    <Sparkline data={activitySparkline} color="#10b981" height={40} />
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-8">Not enough data yet</p>
              )}
            </DashCard>
          </div>
        </>
      )}

      {/* ──────────── Platform Stats with Sparklines ──────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 stagger-grid">
        <StatCard label="Providers" value={providers.length} subtitle="OAuth integrations" icon={Zap}
          iconBg="bg-purple-50 dark:bg-purple-900/20" iconColor="text-purple-600 dark:text-purple-400"
          sparkData={[3, 3, 4, 4, 5, providers.length]} sparkColor="#8b5cf6" />
        <StatCard label="Algorithms" value={algoCount} subtitle="Proprietary analyses" icon={Brain} trend="up" trendValue="+12%"
          iconBg="bg-emerald-50 dark:bg-emerald-900/20" iconColor="text-emerald-600 dark:text-emerald-400"
          sparkData={[20, 24, 28, 32, 36, algoCount]} sparkColor="#10b981" />
        <StatCard label="API Keys" value={keys.length} subtitle="Active credentials" icon={KeyRound}
          iconBg="bg-blue-50 dark:bg-blue-900/20" iconColor="text-blue-600 dark:text-blue-400"
          sparkData={[1, 1, 2, 2, 3, keys.length]} sparkColor="#3b82f6" />
        <StatCard label="Webhooks" value={webhooks.length} subtitle="Event subscriptions" icon={Webhook}
          iconBg="bg-amber-50 dark:bg-amber-900/20" iconColor="text-amber-600 dark:text-amber-400"
          sparkData={[0, 1, 1, 2, 2, webhooks.length]} sparkColor="#f59e0b" />
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
