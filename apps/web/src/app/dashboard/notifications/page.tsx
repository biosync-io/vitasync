"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import {
  type ChannelType,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationRule,
  type NotificationSeverity,
  notificationsApi,
} from "../../../lib/api"
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  Button,
  Input,
  Select,
  Toggle,
  Badge,
  CardSkeleton,
  EmptyState,
} from "../../../lib/components/ui"
import { Bell, Plus, Trash2, Send, Pencil, X, Zap } from "lucide-react"

// ── Constants ──────────────────────────────────────────────────────

const CHANNEL_TYPES: {
  value: ChannelType
  label: string
  icon: string
  color: string
  fields: { key: string; label: string; placeholder: string; type?: string }[]
}[] = [
  {
    value: "discord", label: "Discord", icon: "💬",
    color: "border-l-indigo-500",
    fields: [{ key: "webhookUrl", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/..." }],
  },
  {
    value: "slack", label: "Slack", icon: "💼",
    color: "border-l-green-500",
    fields: [{ key: "webhookUrl", label: "Webhook URL", placeholder: "https://hooks.slack.com/..." }],
  },
  {
    value: "teams", label: "Microsoft Teams", icon: "👥",
    color: "border-l-blue-500",
    fields: [{ key: "webhookUrl", label: "Webhook URL", placeholder: "https://outlook.office.com/webhook/..." }],
  },
  {
    value: "email", label: "Email", icon: "📧",
    color: "border-l-amber-500",
    fields: [{ key: "to", label: "Email Address", placeholder: "you@example.com" }],
  },
  {
    value: "push", label: "Push Notification", icon: "🔔",
    color: "border-l-rose-500",
    fields: [],
  },
  {
    value: "ntfy", label: "ntfy", icon: "📡",
    color: "border-l-cyan-500",
    fields: [
      { key: "topic", label: "Topic", placeholder: "vitasync-alerts" },
      { key: "server", label: "Server", placeholder: "https://ntfy.sh" },
    ],
  },
  {
    value: "webhook", label: "Custom Webhook", icon: "🔗",
    color: "border-l-gray-500",
    fields: [
      { key: "url", label: "URL", placeholder: "https://your-server.com/webhook" },
      { key: "secret", label: "Signing Secret (optional)", placeholder: "hmac-sha256-secret", type: "password" },
    ],
  },
]

const CATEGORIES: { value: NotificationCategory; label: string; icon: string }[] = [
  { value: "anomaly", label: "Anomaly", icon: "⚠️" },
  { value: "goal", label: "Goal", icon: "🎯" },
  { value: "achievement", label: "Achievement", icon: "🏆" },
  { value: "sync", label: "Sync", icon: "⟳" },
  { value: "report", label: "Report", icon: "📄" },
  { value: "insight", label: "Insight", icon: "🧠" },
  { value: "system", label: "System", icon: "⚙️" },
]

const SEVERITIES: { value: NotificationSeverity; label: string; variant: "info" | "warning" | "danger" }[] = [
  { value: "info", label: "Info", variant: "info" },
  { value: "warning", label: "Warning", variant: "warning" },
  { value: "critical", label: "Critical", variant: "danger" },
]

function getChannelTypeDef(type: ChannelType) {
  return CHANNEL_TYPES.find((t) => t.value === type)
}

// ── Modal overlay ──────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-gray-200/50 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.06]">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { selectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()

  const { data: channelsResult, isLoading: channelsLoading } = useQuery({
    queryKey: ["notification-channels", selectedUserId],
    queryFn: () => notificationsApi.listChannels(selectedUserId),
  })
  const channels = channelsResult?.data ?? []

  const { data: rulesResult, isLoading: rulesLoading } = useQuery({
    queryKey: ["notification-rules", selectedUserId],
    queryFn: () => notificationsApi.listRules(selectedUserId),
  })
  const rules = rulesResult?.data ?? []

  // Modal states
  const [channelModal, setChannelModal] = useState<{ open: boolean; edit?: NotificationChannel }>({ open: false })
  const [ruleModal, setRuleModal] = useState<{ open: boolean; edit?: NotificationRule }>({ open: false })

  return (
    <div className="space-y-10">
      <PageHeader
        title="Notifications"
        subtitle="Choose how and when you receive alerts"
      />

      {/* ── Section: Your Channels ───────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Your Channels</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {channels.length} channel{channels.length !== 1 ? "s" : ""} configured
            </p>
          </div>
          <Button icon={Plus} onClick={() => setChannelModal({ open: true })}>
            Add Channel
          </Button>
        </div>

        {channelsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <CardSkeleton count={3} />
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No channels yet"
            description="Add your first notification channel to start receiving alerts."
            action={{ label: "Add Channel", icon: Plus, onClick: () => setChannelModal({ open: true }) }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {channels.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                userId={selectedUserId}
                queryClient={queryClient}
                onEdit={() => setChannelModal({ open: true, edit: ch })}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Section: Alert Rules ─────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Alert Rules</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {rules.length} rule{rules.length !== 1 ? "s" : ""} configured
            </p>
          </div>
          <Button
            icon={Plus}
            onClick={() => setRuleModal({ open: true })}
            disabled={channels.length === 0}
            title={channels.length === 0 ? "Add a channel first" : undefined}
          >
            Add Rule
          </Button>
        </div>

        {channels.length === 0 && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-500/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            Create at least one channel before adding alert rules.
          </div>
        )}

        {rulesLoading ? (
          <CardSkeleton count={3} />
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No alert rules"
            description="Rules determine which channels receive notifications based on category and severity."
            {...(channels.length > 0 ? { action: { label: "Add Rule", icon: Plus, onClick: () => setRuleModal({ open: true }) } } : {})}
          />
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                channels={channels}
                userId={selectedUserId}
                queryClient={queryClient}
                onEdit={() => setRuleModal({ open: true, edit: rule })}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Modals ───────────────────────────────────────────────── */}
      <Modal
        open={channelModal.open}
        onClose={() => setChannelModal({ open: false })}
        title={channelModal.edit ? `Edit Channel — ${channelModal.edit.label}` : "Add Channel"}
      >
        <ChannelForm
          userId={selectedUserId}
          queryClient={queryClient}
          {...(channelModal.edit ? { editChannel: channelModal.edit } : {})}
          onClose={() => setChannelModal({ open: false })}
        />
      </Modal>

      <Modal
        open={ruleModal.open}
        onClose={() => setRuleModal({ open: false })}
        title={ruleModal.edit ? `Edit Rule — ${ruleModal.edit.name}` : "Add Rule"}
      >
        <RuleForm
          userId={selectedUserId}
          channels={channels}
          queryClient={queryClient}
          {...(ruleModal.edit ? { editRule: ruleModal.edit } : {})}
          onClose={() => setRuleModal({ open: false })}
        />
      </Modal>
    </div>
  )
}

// ── Channel Card ──────────────────────────────────────────────────

function ChannelCard({ channel, userId, queryClient, onEdit }: {
  channel: NotificationChannel
  userId: string
  queryClient: ReturnType<typeof useQueryClient>
  onEdit: () => void
}) {
  const typeDef = getChannelTypeDef(channel.channelType)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) => notificationsApi.updateChannel(userId, channel.id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-channels", userId] }),
  })

  const deleteMut = useMutation({
    mutationFn: () => notificationsApi.deleteChannel(userId, channel.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-channels", userId] }),
  })

  const testMut = useMutation({
    mutationFn: () => notificationsApi.testChannel(userId, channel.id),
    onSuccess: () => setTestResult({ ok: true, msg: "Test notification sent!" }),
    onError: (err: Error) => setTestResult({ ok: false, msg: err.message }),
  })

  // Auto-dismiss test result after 4s
  useEffect(() => {
    if (!testResult) return
    const t = setTimeout(() => setTestResult(null), 4000)
    return () => clearTimeout(t)
  }, [testResult])

  return (
    <Card className={`border-l-4 ${typeDef?.color ?? "border-l-gray-400"}`} hover>
      <CardContent>
        <div className="space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-2xl flex-shrink-0" role="img" aria-label={typeDef?.label}>
                {typeDef?.icon ?? "📣"}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {channel.label}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {typeDef?.label ?? channel.channelType}
                </p>
              </div>
            </div>
            <Badge variant={channel.enabled ? "success" : "default"} dot pulse={channel.enabled}>
              {channel.enabled ? "Active" : "Paused"}
            </Badge>
          </div>

          {/* Config summary */}
          <ChannelConfigSummary channel={channel} />

          {/* Toggle */}
          <Toggle
            label="Enabled"
            checked={channel.enabled}
            onChange={(v) => toggleMut.mutate(v)}
            disabled={toggleMut.isPending}
          />

          {/* Test result feedback */}
          {testResult && (
            <div className={`rounded-lg px-3 py-2 text-xs font-medium ${
              testResult.ok
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
            }`}>
              {testResult.ok ? "✓" : "✗"} {testResult.msg}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100 dark:border-white/[0.04]">
            <Button
              variant="ghost" size="sm" icon={Send}
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending || !channel.enabled}
              loading={testMut.isPending}
              title={!channel.enabled ? "Enable channel to test" : "Send test notification"}
            >
              Test
            </Button>
            <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost" size="sm" icon={Trash2}
              className="text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => { if (confirm(`Delete channel "${channel.label}"?`)) deleteMut.mutate() }}
              loading={deleteMut.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Channel Config Summary ────────────────────────────────────────

function ChannelConfigSummary({ channel }: { channel: NotificationChannel }) {
  const cfg = channel.config
  let summary = ""

  switch (channel.channelType) {
    case "discord":
    case "slack":
    case "teams":
      summary = cfg.webhookUrl ? `Webhook: ${maskUrl(String(cfg.webhookUrl))}` : ""
      break
    case "email":
      summary = cfg.to ? `→ ${cfg.to}` : ""
      break
    case "push":
      summary = "Auto-configured via browser"
      break
    case "ntfy":
      summary = [cfg.server ?? cfg.serverUrl, cfg.topic && `topic: ${cfg.topic}`].filter(Boolean).join(" — ")
      break
    case "webhook":
      summary = cfg.url ? `URL: ${maskUrl(String(cfg.url))}` : ""
      break
  }

  if (!summary) return null
  return (
    <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{summary}</p>
  )
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname
    return `${u.hostname}${path.length > 20 ? path.slice(0, 20) + "…" : path}`
  } catch {
    return url.slice(0, 40) + (url.length > 40 ? "…" : "")
  }
}

// ── Channel Form (inside modal) ───────────────────────────────────

function ChannelForm({ userId, queryClient, editChannel, onClose }: {
  userId: string
  queryClient: ReturnType<typeof useQueryClient>
  editChannel?: NotificationChannel
  onClose: () => void
}) {
  const isEdit = !!editChannel
  const [channelType, setChannelType] = useState<ChannelType>(editChannel?.channelType ?? "discord")
  const [label, setLabel] = useState(editChannel?.label ?? "")
  const [config, setConfig] = useState<Record<string, string>>(
    editChannel ? Object.fromEntries(Object.entries(editChannel.config).map(([k, v]) => [k, String(v ?? "")])) : {},
  )
  const [error, setError] = useState("")

  const typeDef = getChannelTypeDef(channelType)!
  const fields = typeDef.fields

  const updateConfig = useCallback((key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }, [])

  const createMut = useMutation({
    mutationFn: () => {
      const cleanConfig: Record<string, unknown> = {}
      for (const f of fields) {
        const v = config[f.key]?.trim()
        if (v) cleanConfig[f.key] = v
      }
      return notificationsApi.createChannel(userId, { channelType, label, config: cleanConfig })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-channels", userId] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  const updateMut = useMutation({
    mutationFn: () => {
      const cleanConfig: Record<string, unknown> = {}
      for (const f of fields) {
        const v = config[f.key]?.trim()
        if (v) cleanConfig[f.key] = v
      }
      return notificationsApi.updateChannel(userId, editChannel!.id, { label, config: cleanConfig })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-channels", userId] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  function handleSubmit() {
    setError("")
    if (!label.trim()) { setError("Label is required"); return }
    if (isEdit) updateMut.mutate()
    else createMut.mutate()
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Channel type selector */}
      {!isEdit && (
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Channel Type</p>
          <div className="grid grid-cols-2 gap-2">
            {CHANNEL_TYPES.map((ct) => (
              <button
                key={ct.value}
                type="button"
                onClick={() => { setChannelType(ct.value); setConfig({}) }}
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                  channelType === ct.value
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 ring-1 ring-brand-500/50"
                    : "border-gray-200/60 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.12]"
                }`}
              >
                <span className="text-xl">{ct.icon}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{ct.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Label */}
      <Input
        label="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. Work Slack, Personal Email"
      />

      {/* Dynamic config fields */}
      {fields.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {typeDef.label} Configuration
          </p>
          {fields.map((field) => (
            <Input
              key={field.key}
              label={field.label}
              type={field.type ?? "text"}
              value={config[field.key] ?? ""}
              onChange={(e) => updateConfig(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          ))}
        </div>
      )}

      {fields.length === 0 && channelType === "push" && (
        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-500/20 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
          Push notifications are auto-configured through your browser. Just save to enable.
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSubmit} loading={isPending}>
          {isEdit ? "Update Channel" : "Save Channel"}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ── Rule Card ─────────────────────────────────────────────────────

function RuleCard({ rule, channels, userId, queryClient, onEdit }: {
  rule: NotificationRule
  channels: NotificationChannel[]
  userId: string
  queryClient: ReturnType<typeof useQueryClient>
  onEdit: () => void
}) {
  const ruleChannels = channels.filter((c) => rule.channelIds.includes(c.id))
  const severityDef = SEVERITIES.find((s) => s.value === rule.minSeverity)

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) => notificationsApi.updateRule(userId, rule.id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-rules", userId] }),
  })

  const deleteMut = useMutation({
    mutationFn: () => notificationsApi.deleteRule(userId, rule.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-rules", userId] }),
  })

  return (
    <Card hover>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2.5">
            {/* Name + status */}
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{rule.name}</h3>
              <Toggle
                checked={rule.enabled}
                onChange={(v) => toggleMut.mutate(v)}
                disabled={toggleMut.isPending}
              />
            </div>

            {/* Category badges */}
            <div className="flex flex-wrap gap-1.5">
              {rule.categories.map((cat) => {
                const catDef = CATEGORIES.find((c) => c.value === cat)
                return (
                  <Badge key={cat} variant="default" size="sm">
                    {catDef?.icon} {catDef?.label ?? cat}
                  </Badge>
                )
              })}
            </div>

            {/* Severity + channels row */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                Min severity:
                <Badge variant={severityDef?.variant ?? "info"} size="sm">{rule.minSeverity}</Badge>
              </span>
              <span className="text-gray-300 dark:text-gray-600">→</span>
              <span className="flex items-center gap-1">
                {ruleChannels.length > 0 ? ruleChannels.map((c) => {
                  const td = getChannelTypeDef(c.channelType)
                  return (
                    <Badge key={c.id} variant="default" size="sm">
                      {td?.icon} {c.label}
                    </Badge>
                  )
                }) : (
                  <span className="text-gray-400 italic">No channels</span>
                )}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost" size="sm" icon={Trash2}
              className="text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => { if (confirm(`Delete rule "${rule.name}"?`)) deleteMut.mutate() }}
              loading={deleteMut.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Rule Form (inside modal) ──────────────────────────────────────

function RuleForm({ userId, channels, queryClient, editRule, onClose }: {
  userId: string
  channels: NotificationChannel[]
  queryClient: ReturnType<typeof useQueryClient>
  editRule?: NotificationRule
  onClose: () => void
}) {
  const isEdit = !!editRule
  const [name, setName] = useState(editRule?.name ?? "")
  const [selectedCategories, setSelectedCategories] = useState<NotificationCategory[]>(editRule?.categories ?? [])
  const [minSeverity, setMinSeverity] = useState<NotificationSeverity>(editRule?.minSeverity ?? "info")
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>(editRule?.channelIds ?? [])
  const [error, setError] = useState("")

  function toggleCategory(cat: NotificationCategory) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  function toggleChannel(id: string) {
    setSelectedChannelIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  const createMut = useMutation({
    mutationFn: () => notificationsApi.createRule(userId, { name, categories: selectedCategories, minSeverity, channelIds: selectedChannelIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules", userId] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  const updateMut = useMutation({
    mutationFn: () => notificationsApi.updateRule(userId, editRule!.id, { name, categories: selectedCategories, minSeverity, channelIds: selectedChannelIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules", userId] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  function handleSubmit() {
    setError("")
    if (!name.trim()) { setError("Rule name is required"); return }
    if (selectedCategories.length === 0) { setError("Select at least one category"); return }
    if (selectedChannelIds.length === 0) { setError("Select at least one channel"); return }
    if (isEdit) updateMut.mutate()
    else createMut.mutate()
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Rule name */}
      <Input
        label="Rule Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Critical anomalies to Discord"
      />

      {/* Categories (checkbox-style toggles) */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Categories <span className="font-normal text-gray-400">(when these events occur)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => toggleCategory(cat.value)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium border transition-all ${
                selectedCategories.includes(cat.value)
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 ring-1 ring-brand-500/30"
                  : "border-gray-200/60 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-white/[0.12]"
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Min severity */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Minimum Severity</p>
        <div className="flex gap-2">
          {SEVERITIES.map((sev) => (
            <button
              key={sev.value}
              type="button"
              onClick={() => setMinSeverity(sev.value)}
              className={`rounded-xl px-4 py-2 text-xs font-medium border transition-all ${
                minSeverity === sev.value
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 ring-1 ring-brand-500/30"
                  : "border-gray-200/60 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-white/[0.12]"
              }`}
            >
              {sev.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target channels */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Deliver To <span className="font-normal text-gray-400">(select channels)</span>
        </p>
        {channels.length === 0 ? (
          <p className="text-xs text-gray-400">No channels available. Create a channel first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {channels.map((ch) => {
              const td = getChannelTypeDef(ch.channelType)
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => toggleChannel(ch.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium border transition-all ${
                    selectedChannelIds.includes(ch.id)
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 ring-1 ring-brand-500/30"
                      : "border-gray-200/60 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-white/[0.12]"
                  }`}
                >
                  {td?.icon} {ch.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSubmit} loading={isPending}>
          {isEdit ? "Update Rule" : "Save Rule"}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
