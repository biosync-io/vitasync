"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Bell, Check, CheckCheck, ExternalLink, Filter } from "lucide-react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { notificationsApi, type InAppNotification } from "../../../lib/api"
import { Card, CardContent, PageHeader, Badge, StatCard, Button, EmptyState, CardSkeleton } from "../../../lib/components/ui"

const CATEGORY_ICONS: Record<string, string> = {
  sync: "🔄",
  report: "📊",
  anomaly: "⚠️",
  achievement: "🏆",
  goal: "🎯",
  insight: "💡",
  system: "⚙️",
}

const SEVERITY_STYLES: Record<string, { badge: string; dot: string }> = {
  info: { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-500" },
  warning: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
  critical: { badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-500" },
}

const CATEGORIES = ["all", "sync", "report", "anomaly", "achievement", "goal", "insight", "system"] as const

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const ms = now.getTime() - d.getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return "just now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined })
}

export default function InboxPage() {
  const { selectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<string>("all")
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["inbox-full", selectedUserId],
    queryFn: () => notificationsApi.getInbox(selectedUserId, { limit: 100 }),
    enabled: !!selectedUserId,
    refetchInterval: 15_000,
  })

  const notifications = data?.data ?? []
  const unreadCount = data?.unreadCount ?? 0

  const filtered = notifications.filter((n) => {
    if (filter !== "all" && n.category !== filter) return false
    if (showUnreadOnly && n.read) return false
    return true
  })

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markRead(selectedUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  })

  const markOneRead = useMutation({
    mutationFn: (ids: string[]) => notificationsApi.markRead(selectedUserId, ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  })

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Inbox"
        subtitle="All in-app notifications. Auto-refreshes every 15 seconds."
        badge={unreadCount > 0 ? <Badge variant="danger" dot pulse>{unreadCount} unread</Badge> : undefined}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total" value={notifications.length} />
        <StatCard label="Unread" value={unreadCount} color="brand" />
        <StatCard label="Read" value={notifications.length - unreadCount} color="vitality" />
      </div>

      {/* Filters & Actions */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-gray-400" />
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilter(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filter === cat
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                  }`}
                >
                  {cat === "all" ? "All" : `${CATEGORY_ICONS[cat] ?? "🔔"} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnreadOnly}
                  onChange={(e) => setShowUnreadOnly(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                />
                Unread only
              </label>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending} icon={CheckCheck}>
                  Mark all read
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification List */}
      {isLoading ? (
        <CardSkeleton count={3} className="grid-cols-1" />
      ) : !selectedUserId ? (
        <Card>
          <CardContent>
            <EmptyState icon={Bell} title="Select a user" description="Choose a user to view notifications." />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Bell} title={showUnreadOnly ? "No unread notifications" : "No notifications yet"} description="Check back later for updates." />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((n) => (
                <InboxItem
                  key={n.id}
                  notification={n}
                  onMarkRead={() => markOneRead.mutate([n.id])}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
          Showing {filtered.length} of {notifications.length} notifications
        </p>
      )}
    </div>
  )
}

function InboxItem({ notification: n, onMarkRead }: { notification: InAppNotification; onMarkRead: () => void }) {
  const severityVariant = n.severity === "critical" ? "danger" : n.severity === "warning" ? "warning" : "info"

  return (
    <div className={`px-5 py-4 flex items-start gap-3 transition-colors ${!n.read ? "bg-indigo-50/40 dark:bg-indigo-950/15" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"}`}>
      <span className="text-lg mt-0.5 shrink-0">{CATEGORY_ICONS[n.category] ?? "🔔"}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className={`text-sm font-semibold truncate ${!n.read ? "text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"}`}>
            {n.title}
          </p>
          {!n.read && <Badge variant="danger" dot size="sm">{""}</Badge>}
          <Badge variant={severityVariant} size="sm" className="ml-auto">{n.severity}</Badge>
          <Badge variant="default" size="sm">{n.category}</Badge>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.body}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(n.createdAt)}</span>
          {n.link && (
            <a href={n.link} className="flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline">
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          )}
          {!n.read && (
            <Button variant="ghost" size="sm" onClick={onMarkRead} icon={Check}>
              Mark read
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
