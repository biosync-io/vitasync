"use client"

import { CheckCircle2, Zap, Star, Rocket, Server, Bell, Brain, Globe, Users, Shield } from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface ChecklistItem {
  label: string
  done: boolean
  inProgress?: boolean
}

interface FeatureCard {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  items: ChecklistItem[]
}

const completed: FeatureCard[] = [
  {
    icon: Server,
    title: "Core Platform",
    subtitle: "Unified wearable health data aggregation and analytics",
    items: [
      { label: "Multi-provider data sync (Fitbit, Garmin, WHOOP, Strava, Withings)", done: true },
      { label: "OAuth 2.0 and OAuth 1.0a authentication flows", done: true },
      { label: "Real-time background sync with BullMQ job processing", done: true },
      { label: "Health score engine (composite daily 0-100 scoring)", done: true },
      { label: "Anomaly detection (z-score, IQR, clinical thresholds)", done: true },
      { label: "Correlation engine (Pearson and Spearman analysis)", done: true },
      { label: "261+ proprietary health algorithms catalog", done: true },
      { label: "Next.js dashboard with dark mode and command palette", done: true },
      { label: "Grafana dashboards (8 pre-built)", done: true },
      { label: "Helm chart with production-grade deployment", done: true },
      { label: "MCP server for AI assistant integration", done: true },
      { label: "FHIR R4 data export", done: true },
    ],
  },
  {
    icon: Bell,
    title: "Notifications & Alerts",
    subtitle: "Multi-channel notification delivery system",
    items: [
      { label: "7 notification channels (Discord, Slack, Teams, Email, Push, ntfy, Webhook)", done: true },
      { label: "In-app notification bell with unread tracking", done: true },
      { label: "Rule-based notification routing", done: true },
      { label: "Anomaly-triggered health alerts", done: true },
      { label: "Report completion notifications", done: true },
    ],
  },
]

const inProgress: FeatureCard[] = [
  {
    icon: Brain,
    title: "Intelligence & Insights",
    subtitle: "Advanced analytics, personalization, and predictive models",
    items: [
      { label: "Readiness score auto-personalization (14-day weight calibration)", done: false, inProgress: true },
      { label: "Training load periodization recommendations", done: false, inProgress: true },
      { label: "Recovery prediction with Banister model refinement", done: false, inProgress: true },
      { label: "Circadian rhythm optimization suggestions", done: false, inProgress: true },
      { label: "Metabolic efficiency trend analysis", done: false, inProgress: true },
      { label: "Stress resilience longitudinal tracking", done: false, inProgress: true },
      { label: "LLM-powered health coaching via MCP", done: false, inProgress: true },
      { label: "Sleep debt payback modeling", done: false, inProgress: true },
    ],
  },
]

const upNext: FeatureCard[] = [
  {
    icon: Globe,
    title: "Polar & Oura Integration",
    subtitle: "Expand provider ecosystem with two major platforms",
    items: [
      { label: "Polar Flow OAuth 2.0 provider adapter", done: false },
      { label: "Oura Ring API integration (sleep, readiness, activity)", done: false },
      { label: "Apple Health import via CSV/XML upload", done: false },
      { label: "Google Fit REST API provider", done: false },
      { label: "Samsung Health data bridge", done: false },
      { label: "Provider data backfill for historical import", done: false },
    ],
  },
  {
    icon: Users,
    title: "Social & Challenges",
    subtitle: "Community features and gamification",
    items: [
      { label: "Workspace-wide health challenges with leaderboards", done: false },
      { label: "Training plan sharing between users", done: false },
      { label: "Achievement showcase profiles", done: false },
      { label: "Weekly challenge auto-generation", done: false },
      { label: "Team-based competitions", done: false },
    ],
  },
]

const future: FeatureCard[] = [
  {
    icon: Brain,
    title: "AI & Predictive Analytics",
    subtitle: "Machine learning models for predictive health insights",
    items: [
      { label: "Predictive injury risk modeling", done: false },
      { label: "Optimal training load recommendations via ML", done: false },
      { label: "Sleep pattern anomaly prediction", done: false },
      { label: "Personalized nutrition timing suggestions", done: false },
      { label: "Biological age trajectory forecasting", done: false },
      { label: "Women's health cycle-aware training plans", done: false },
    ],
  },
  {
    icon: Shield,
    title: "Enterprise & Scale",
    subtitle: "Multi-tenant support, advanced security, and horizontal scaling",
    items: [
      { label: "Multi-tenant workspace management", done: false },
      { label: "Role-based access control (RBAC)", done: false },
      { label: "Data archiving and retention policies", done: false },
      { label: "Horizontal scaling with read replicas", done: false },
      { label: "TimescaleDB migration for time-series optimization", done: false },
      { label: "SOC 2 compliance preparation", done: false },
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const totalItems = (cards: FeatureCard[]) =>
  cards.reduce((n, c) => n + c.items.length, 0)

const phases = [
  { label: "Completed", count: totalItems(completed), color: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  { label: "In Progress", count: totalItems(inProgress), color: "bg-amber-500", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  { label: "Up Next", count: totalItems(upNext), color: "bg-purple-500", dot: "bg-purple-500", text: "text-purple-600 dark:text-purple-400" },
  { label: "Future", count: totalItems(future), color: "bg-orange-500", dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
] as const

const grand = phases.reduce((s, p) => s + p.count, 0)

function StatusBadge({ variant }: { variant: "completed" | "in-progress" | "up-next" | "future" }) {
  const map = {
    completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" },
    "in-progress": { label: "In Progress", cls: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" },
    "up-next": { label: "Up Next", cls: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400" },
    future: { label: "Future", cls: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" },
  } as const
  const { label, cls } = map[variant]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
}

function Card({
  card,
  variant,
}: {
  card: FeatureCard
  variant: "completed" | "in-progress" | "up-next" | "future"
}) {
  const Icon = card.icon
  const iconBg = {
    completed: "bg-emerald-50 dark:bg-emerald-900/20",
    "in-progress": "bg-amber-50 dark:bg-amber-900/20",
    "up-next": "bg-purple-50 dark:bg-purple-900/20",
    future: "bg-orange-50 dark:bg-orange-900/20",
  }[variant]
  const iconColor = {
    completed: "text-emerald-600 dark:text-emerald-400",
    "in-progress": "text-amber-600 dark:text-amber-400",
    "up-next": "text-purple-600 dark:text-purple-400",
    future: "text-orange-600 dark:text-orange-400",
  }[variant]

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{card.title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{card.subtitle}</p>
          </div>
        </div>
        <StatusBadge variant={variant} />
      </div>

      {/* Checklist */}
      <ul className="space-y-2">
        {card.items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
            ) : item.inProgress ? (
              <Zap className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
            ) : (
              <span className="mt-0.5 shrink-0 h-4 w-4 flex items-center justify-center">
                <span className="block h-2.5 w-2.5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
              </span>
            )}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function RoadmapPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6 md:p-10">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Roadmap</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          What&apos;s been built, what&apos;s in progress, and what&apos;s coming next
        </p>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5">
        {/* Bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          {phases.map((p) => (
            <div
              key={p.label}
              className={`${p.color} transition-all`}
              style={{ width: `${(p.count / grand) * 100}%` }}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {phases.map((p) => (
            <div key={p.label} className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} />
              <span className={`font-medium ${p.text}`}>{p.label}</span>
              <span className="text-gray-400 dark:text-gray-500">({p.count})</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Completed ---- */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" /> Completed
        </h2>
        <div className="space-y-4">
          {completed.map((c) => (
            <Card key={c.title} card={c} variant="completed" />
          ))}
        </div>
      </section>

      {/* ---- In Progress ---- */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-amber-600 dark:text-amber-400">
          <Zap className="h-5 w-5" /> In Progress
        </h2>
        <div className="space-y-4">
          {inProgress.map((c) => (
            <Card key={c.title} card={c} variant="in-progress" />
          ))}
        </div>
      </section>

      {/* ---- Up Next ---- */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-purple-600 dark:text-purple-400">
          <Star className="h-5 w-5" /> Up Next
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {upNext.map((c) => (
            <Card key={c.title} card={c} variant="up-next" />
          ))}
        </div>
      </section>

      {/* ---- Future ---- */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-orange-600 dark:text-orange-400">
          <Rocket className="h-5 w-5" /> Future
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {future.map((c) => (
            <Card key={c.title} card={c} variant="future" />
          ))}
        </div>
      </section>
    </div>
  )
}
