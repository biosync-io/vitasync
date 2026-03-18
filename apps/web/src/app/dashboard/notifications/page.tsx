"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  type ChannelType,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationRule,
  type NotificationSeverity,
  notificationsApi,
  usersApi,
} from "../../../lib/api"
import { Pagination } from "../../../lib/Pagination"

// ── Constants ──────────────────────────────────────────────────────

const CHANNEL_TYPES: { value: ChannelType; label: string; icon: string; description: string }[] = [
  { value: "discord", label: "Discord", icon: "💬", description: "Webhook embeds with severity-mapped colors" },
  { value: "slack", label: "Slack", icon: "📱", description: "Block Kit formatted messages" },
  { value: "teams", label: "Teams", icon: "👥", description: "Adaptive Cards v1.4" },
  { value: "email", label: "Email", icon: "✉️", description: "SMTP via nodemailer with HTML templates" },
  { value: "push", label: "Web Push", icon: "🔔", description: "VAPID-based browser push notifications" },
  { value: "ntfy", label: "ntfy", icon: "📡", description: "ntfy.sh topic-based notifications" },
  { value: "webhook", label: "Webhook", icon: "🌐", description: "Generic HTTP POST with HMAC-SHA256 signing" },
]

const CATEGORIES: { value: NotificationCategory; label: string; icon: string }[] = [
  { value: "anomaly", label: "Anomaly", icon: "⚠️" },
  { value: "goal", label: "Goal", icon: "🎯" },
  { value: "achievement", label: "Achievement", icon: "🏆" },
  { value: "sync", label: "Sync", icon: "⟳" },
  { value: "report", label: "Report", icon: "📄" },
  { value: "system", label: "System", icon: "⚙️" },
  { value: "insight", label: "Insight", icon: "🧠" },
]

const SEVERITIES: { value: NotificationSeverity; label: string; color: string }[] = [
  { value: "info", label: "Info", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  { value: "warning", label: "Warning", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
]

// ── Channel config field definitions per type ───────────────────

interface ConfigField {
  key: string
  label: string
  type: "text" | "password" | "number" | "url" | "email" | "textarea"
  placeholder: string
  required?: boolean
}

const CHANNEL_CONFIG_FIELDS: Record<ChannelType, ConfigField[]> = {
  discord: [
    { key: "webhookUrl", label: "Webhook URL", type: "url", placeholder: "https://discord.com/api/webhooks/...", required: true },
    { key: "username", label: "Bot Username", type: "text", placeholder: "VitaSync (optional)" },
    { key: "avatarUrl", label: "Avatar URL", type: "url", placeholder: "https://example.com/avatar.png (optional)" },
  ],
  slack: [
    { key: "webhookUrl", label: "Webhook URL", type: "url", placeholder: "https://hooks.slack.com/services/...", required: true },
    { key: "channel", label: "Channel Override", type: "text", placeholder: "#health-alerts (optional)" },
    { key: "username", label: "Bot Username", type: "text", placeholder: "VitaSync (optional)" },
  ],
  teams: [
    { key: "webhookUrl", label: "Webhook URL", type: "url", placeholder: "https://outlook.office.com/webhook/...", required: true },
  ],
  email: [
    { key: "host", label: "SMTP Host", type: "text", placeholder: "smtp.gmail.com", required: true },
    { key: "port", label: "SMTP Port", type: "number", placeholder: "587", required: true },
    { key: "secure", label: "Use TLS", type: "text", placeholder: "true or false" },
    { key: "user", label: "Username", type: "text", placeholder: "user@example.com", required: true },
    { key: "pass", label: "Password", type: "password", placeholder: "App password or SMTP password", required: true },
    { key: "from", label: "From Address", type: "email", placeholder: "VitaSync <noreply@example.com>", required: true },
    { key: "to", label: "To Address", type: "email", placeholder: "recipient@example.com", required: true },
  ],
  push: [
    { key: "vapidPublicKey", label: "VAPID Public Key", type: "text", placeholder: "BEl62i...", required: true },
    { key: "vapidPrivateKey", label: "VAPID Private Key", type: "password", placeholder: "UUxI4o8...", required: true },
    { key: "vapidSubject", label: "VAPID Subject", type: "text", placeholder: "mailto:admin@example.com", required: true },
    { key: "subscription", label: "Push Subscription (JSON)", type: "textarea", placeholder: '{"endpoint":"https://fcm.googleapis.com/...","keys":{...}}', required: true },
  ],
  ntfy: [
    { key: "serverUrl", label: "Server URL", type: "url", placeholder: "https://ntfy.sh", required: true },
    { key: "topic", label: "Topic", type: "text", placeholder: "vitasync-alerts", required: true },
    { key: "token", label: "Access Token", type: "password", placeholder: "tk_... (optional)" },
    { key: "priority", label: "Default Priority", type: "number", placeholder: "3 (1=min, 5=max)" },
  ],
  webhook: [
    { key: "url", label: "Endpoint URL", type: "url", placeholder: "https://your-server.com/webhook", required: true },
    { key: "secret", label: "HMAC Secret", type: "password", placeholder: "Signing secret for HMAC-SHA256 verification", required: true },
    { key: "headers", label: "Custom Headers (JSON)", type: "textarea", placeholder: '{"X-Custom":"value"} (optional)' },
  ],
}

const PAGE_SIZE = 10

// ── Main Page ──────────────────────────────────────────────────────

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const [selectedUserId, setSelectedUserId] = useState("")
  const [activeTab, setActiveTab] = useState<"channels" | "rules">("channels")

  // ── User selector ──
  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure notification channels and routing rules. All settings are stored per-user in the database.
          </p>
        </div>
      </div>

      {/* User selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="notif-user" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          User
        </label>
        <select
          id="notif-user"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Select user…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName || u.email || u.externalId}
            </option>
          ))}
        </select>
      </div>

      {!selectedUserId ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-16 text-center">
          <p className="text-gray-400 dark:text-gray-500 text-sm">Select a user to manage their notification settings.</p>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {(["channels", "rules"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {tab === "channels" ? "📣 Channels" : "📋 Routing Rules"}
              </button>
            ))}
          </div>

          {activeTab === "channels" ? (
            <ChannelsPanel userId={selectedUserId} queryClient={queryClient} />
          ) : (
            <RulesPanel userId={selectedUserId} queryClient={queryClient} />
          )}
        </>
      )}
    </div>
  )
}

// ── Channels Panel ────────────────────────────────────────────────

function ChannelsPanel({ userId, queryClient }: { userId: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

  const { data: channelsResult, isLoading } = useQuery({
    queryKey: ["notification-channels", userId],
    queryFn: () => notificationsApi.listChannels(userId),
  })
  const channels = channelsResult?.data ?? []
  const pagedChannels = channels.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const deleteMut = useMutation({
    mutationFn: (channelId: string) => notificationsApi.deleteChannel(userId, channelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-channels", userId] }),
  })

  const toggleMut = useMutation({
    mutationFn: ({ channelId, enabled }: { channelId: string; enabled: boolean }) =>
      notificationsApi.updateChannel(userId, channelId, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-channels", userId] }),
  })

  const testMut = useMutation({
    mutationFn: (channelId: string) => notificationsApi.testChannel(userId, channelId),
    onMutate: (channelId) => {
      setTestingId(channelId)
      setTestResult(null)
    },
    onSuccess: (_data, channelId) => {
      setTestResult({ id: channelId, ok: true, msg: "Test notification queued!" })
      setTestingId(null)
    },
    onError: (err: Error, channelId) => {
      setTestResult({ id: channelId, ok: false, msg: err.message })
      setTestingId(null)
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {channels.length} channel{channels.length !== 1 ? "s" : ""} configured
        </p>
        <button
          type="button"
          onClick={() => { setShowCreate(true); setEditingId(null) }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          + Add Channel
        </button>
      </div>

      {/* Create / Edit form */}
      {showCreate && (
        <ChannelForm
          userId={userId}
          queryClient={queryClient}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editingId && (() => {
        const ch = channels.find((c) => c.id === editingId)
        return ch ? (
          <ChannelForm
            userId={userId}
            queryClient={queryClient}
            editChannel={ch}
            onClose={() => setEditingId(null)}
          />
        ) : null
      })()}

      {/* Channel list */}
      {isLoading ? (
        <LoadingSpinner />
      ) : channels.length === 0 && !showCreate ? (
        <EmptyState message="No notification channels configured yet." action="Add your first channel to start receiving notifications." />
      ) : (
        <>
          <div className="space-y-3">
            {pagedChannels.map((ch) => {
              const typeDef = CHANNEL_TYPES.find((t) => t.value === ch.channelType)
              return (
                <div
                  key={ch.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-2xl flex-shrink-0">{typeDef?.icon ?? "📣"}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {ch.label}
                            </h3>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              ch.enabled
                                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                            }`}>
                              {ch.enabled ? "Active" : "Paused"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {typeDef?.label ?? ch.channelType} &middot; Created {new Date(ch.createdAt).toLocaleDateString()}
                          </p>
                          <ChannelConfigSummary channel={ch} />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => testMut.mutate(ch.id)}
                          disabled={testingId === ch.id || !ch.enabled}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors disabled:opacity-50"
                          title={!ch.enabled ? "Enable channel to test" : "Send test notification"}
                        >
                          {testingId === ch.id ? "Sending…" : "Test"}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMut.mutate({ channelId: ch.id, enabled: !ch.enabled })}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          {ch.enabled ? "Pause" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingId(ch.id); setShowCreate(false) }}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => { if (confirm(`Delete channel "${ch.label}"?`)) deleteMut.mutate(ch.id) }}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Test result inline feedback */}
                    {testResult && testResult.id === ch.id && (
                      <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
                        testResult.ok
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                          : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                      }`}>
                        {testResult.ok ? "✓" : "✗"} {testResult.msg}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={channels.length} onChange={setPage} />
        </>
      )}
    </div>
  )
}

// ── Channel Config Summary (show key details without exposing secrets) ──

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
      summary = [cfg.host && `${cfg.host}:${cfg.port ?? 587}`, cfg.to && `→ ${cfg.to}`].filter(Boolean).join(" ")
      break
    case "push":
      summary = cfg.vapidSubject ? `Subject: ${cfg.vapidSubject}` : ""
      break
    case "ntfy":
      summary = [cfg.serverUrl, cfg.topic && `topic: ${cfg.topic}`].filter(Boolean).join(" — ")
      break
    case "webhook":
      summary = cfg.url ? `URL: ${maskUrl(String(cfg.url))}` : ""
      break
  }

  if (!summary) return null
  return (
    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono truncate max-w-md">{summary}</p>
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

// ── Channel Create / Edit Form ────────────────────────────────────

function ChannelForm({
  userId,
  queryClient,
  editChannel,
  onClose,
}: {
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

  const fields = CHANNEL_CONFIG_FIELDS[channelType] ?? []

  function updateConfig(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const createMut = useMutation({
    mutationFn: () => {
      const cleanConfig = buildCleanConfig(channelType, config)
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
      const cleanConfig = buildCleanConfig(channelType, config)
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
    const missingRequired = fields.filter((f) => f.required && !config[f.key]?.trim())
    if (missingRequired.length > 0) {
      setError(`Required: ${missingRequired.map((f) => f.label).join(", ")}`)
      return
    }
    if (isEdit) updateMut.mutate()
    else createMut.mutate()
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {isEdit ? `Edit Channel — ${editChannel.label}` : "New Notification Channel"}
        </h2>
      </div>
      <div className="px-6 py-5 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Channel type selector */}
        {!isEdit && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              Channel Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CHANNEL_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  type="button"
                  onClick={() => { setChannelType(ct.value); setConfig({}) }}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    channelType === ct.value
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-500"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <span className="text-lg">{ct.icon}</span>
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mt-1">{ct.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2">{ct.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Label */}
        <div>
          <label htmlFor="ch-label" className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Label *
          </label>
          <input
            id="ch-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Work Slack, Personal Email"
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Config fields */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {CHANNEL_TYPES.find((t) => t.value === channelType)?.label} Configuration
          </p>
          {fields.map((field) => (
            <div key={field.key}>
              <label htmlFor={`cfg-${field.key}`} className="block text-xs text-gray-600 dark:text-gray-400">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  id={`cfg-${field.key}`}
                  rows={3}
                  value={config[field.key] ?? ""}
                  onChange={(e) => updateConfig(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <input
                  id={`cfg-${field.key}`}
                  type={field.type === "password" ? "password" : "text"}
                  inputMode={field.type === "number" ? "numeric" : undefined}
                  value={config[field.key] ?? ""}
                  onChange={(e) => updateConfig(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving…" : isEdit ? "Update Channel" : "Create Channel"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function buildCleanConfig(channelType: ChannelType, raw: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const fields = CHANNEL_CONFIG_FIELDS[channelType] ?? []
  for (const field of fields) {
    const val = raw[field.key]?.trim()
    if (!val) continue
    if (field.type === "number") {
      result[field.key] = Number(val)
    } else if (field.key === "secure") {
      result[field.key] = val === "true"
    } else if (field.type === "textarea" && (field.key === "subscription" || field.key === "headers")) {
      try { result[field.key] = JSON.parse(val) } catch { result[field.key] = val }
    } else {
      result[field.key] = val
    }
  }
  return result
}

// ── Rules Panel ───────────────────────────────────────────────────

function RulesPanel({ userId, queryClient }: { userId: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const { data: rulesResult, isLoading } = useQuery({
    queryKey: ["notification-rules", userId],
    queryFn: () => notificationsApi.listRules(userId),
  })
  const rules = rulesResult?.data ?? []
  const pagedRules = rules.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const { data: channelsResult } = useQuery({
    queryKey: ["notification-channels", userId],
    queryFn: () => notificationsApi.listChannels(userId),
  })
  const channels = channelsResult?.data ?? []

  const deleteMut = useMutation({
    mutationFn: (ruleId: string) => notificationsApi.deleteRule(userId, ruleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-rules", userId] }),
  })

  const toggleMut = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      notificationsApi.updateRule(userId, ruleId, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-rules", userId] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {rules.length} rule{rules.length !== 1 ? "s" : ""} configured
        </p>
        <button
          type="button"
          onClick={() => { setShowCreate(true); setEditingId(null) }}
          disabled={channels.length === 0}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          title={channels.length === 0 ? "Add a channel first" : undefined}
        >
          + Add Rule
        </button>
      </div>

      {channels.length === 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          You need to create at least one channel before adding routing rules.
        </div>
      )}

      {showCreate && (
        <RuleForm userId={userId} channels={channels} queryClient={queryClient} onClose={() => setShowCreate(false)} />
      )}

      {editingId && (() => {
        const r = rules.find((r) => r.id === editingId)
        return r ? (
          <RuleForm
            userId={userId}
            channels={channels}
            queryClient={queryClient}
            editRule={r}
            onClose={() => setEditingId(null)}
          />
        ) : null
      })()}

      {isLoading ? (
        <LoadingSpinner />
      ) : rules.length === 0 && !showCreate ? (
        <EmptyState message="No routing rules configured yet." action="Rules determine which channels receive notifications based on category and severity." />
      ) : (
        <>
          <div className="space-y-3">
            {pagedRules.map((rule) => {
              const ruleChannels = channels.filter((c) => (rule.channelIds as string[]).includes(c.id))
              return (
                <div
                  key={rule.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{rule.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          rule.enabled
                            ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                        }`}>
                          {rule.enabled ? "Active" : "Paused"}
                        </span>
                      </div>

                      {/* Categories */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(rule.categories as string[]).map((cat) => {
                          const catDef = CATEGORIES.find((c) => c.value === cat)
                          return (
                            <span key={cat} className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400">
                              {catDef?.icon} {catDef?.label ?? cat}
                            </span>
                          )
                        })}
                      </div>

                      {/* Severity + channels */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          Min severity: <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            SEVERITIES.find((s) => s.value === rule.minSeverity)?.color ?? ""
                          }`}>{rule.minSeverity}</span>
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <span>
                          → {ruleChannels.map((c) => c.label).join(", ") || "No channels"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleMut.mutate({ ruleId: rule.id, enabled: !rule.enabled })}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        {rule.enabled ? "Pause" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(rule.id); setShowCreate(false) }}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Delete rule "${rule.name}"?`)) deleteMut.mutate(rule.id) }}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={rules.length} onChange={setPage} />
        </>
      )}
    </div>
  )
}

// ── Rule Create / Edit Form ───────────────────────────────────────

function RuleForm({
  userId,
  channels,
  queryClient,
  editRule,
  onClose,
}: {
  userId: string
  channels: NotificationChannel[]
  queryClient: ReturnType<typeof useQueryClient>
  editRule?: NotificationRule
  onClose: () => void
}) {
  const isEdit = !!editRule
  const [name, setName] = useState(editRule?.name ?? "")
  const [selectedCategories, setSelectedCategories] = useState<NotificationCategory[]>(
    (editRule?.categories as NotificationCategory[]) ?? [],
  )
  const [minSeverity, setMinSeverity] = useState<NotificationSeverity>(
    (editRule?.minSeverity as NotificationSeverity) ?? "info",
  )
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>(
    (editRule?.channelIds as string[]) ?? [],
  )
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
    mutationFn: () =>
      notificationsApi.createRule(userId, {
        name,
        categories: selectedCategories,
        minSeverity,
        channelIds: selectedChannelIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules", userId] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  const updateMut = useMutation({
    mutationFn: () =>
      notificationsApi.updateRule(userId, editRule!.id, {
        name,
        categories: selectedCategories,
        minSeverity,
        channelIds: selectedChannelIds,
      }),
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
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {isEdit ? `Edit Rule — ${editRule.name}` : "New Routing Rule"}
        </h2>
      </div>
      <div className="px-6 py-5 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Rule name */}
        <div>
          <label htmlFor="rule-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Rule Name *
          </label>
          <input
            id="rule-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Critical anomalies to Discord"
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Categories */}
        <div>
          <p className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Categories * <span className="font-normal text-gray-400">(when these events occur)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => toggleCategory(cat.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                  selectedCategories.includes(cat.value)
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400"
                    : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400"
                }`}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Minimum severity */}
        <div>
          <p className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Minimum Severity
          </p>
          <div className="flex gap-2">
            {SEVERITIES.map((sev) => (
              <button
                key={sev.value}
                type="button"
                onClick={() => setMinSeverity(sev.value)}
                className={`rounded-lg px-4 py-2 text-xs font-medium border transition-colors ${
                  minSeverity === sev.value
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400"
                    : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400"
                }`}
              >
                {sev.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target channels */}
        <div>
          <p className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Deliver To * <span className="font-normal text-gray-400">(select channels)</span>
          </p>
          {channels.length === 0 ? (
            <p className="text-xs text-gray-400">No channels available. Create a channel first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {channels.map((ch) => {
                const typeDef = CHANNEL_TYPES.find((t) => t.value === ch.channelType)
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleChannel(ch.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                      selectedChannelIds.includes(ch.id)
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400"
                        : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400"
                    }`}
                  >
                    {typeDef?.icon} {ch.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving…" : isEdit ? "Update Rule" : "Create Rule"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-indigo-600" />
    </div>
  )
}

function EmptyState({ message, action }: { message: string; action: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-12 text-center">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{message}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{action}</p>
    </div>
  )
}
