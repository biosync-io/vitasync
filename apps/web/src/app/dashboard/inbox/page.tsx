"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Bell, Check, CheckCheck, ExternalLink, Filter } from "lucide-react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { notificationsApi, usersApi, type InAppNotification } from "../../../lib/api"

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

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list(),
  })
  const userName = users?.data?.find((u) => u.id === selectedUserId)?.displayName

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
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notification Inbox</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          All in-app notifications for {userName ?? "selected user"}. Auto-refreshes every 15 seconds.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{notifications.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unread</p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{unreadCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Read</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{notifications.length - unreadCount}</p>
        </div>
      </div>

      {/* Filters & Actions */}
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
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Notification List */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading ? (
          <div className="px-6 py-12 text-center">
            <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto" />
            <p className="text-xs text-gray-400 mt-3">Loading notifications…</p>
          </div>
        ) : !selectedUserId ? (
          <div className="px-6 py-12 text-center">
            <Bell className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Select a user to view notifications</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Bell className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {showUnreadOnly ? "No unread notifications" : "No notifications yet"}
            </p>
          </div>
        ) : (
          filtered.map((n) => (
            <InboxItem
              key={n.id}
              notification={n}
              onMarkRead={() => markOneRead.mutate([n.id])}
            />
          ))
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
          Showing {filtered.length} of {notifications.length} notifications
        </p>
      )}
    </div>
  )
}

function InboxItem({ notification: n, onMarkRead }: { notification: InAppNotification; onMarkRead: () => void }) {
  const severity = SEVERITY_STYLES[n.severity] ?? { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-500" }

  return (
    <div className={`px-5 py-4 flex items-start gap-3 transition-colors ${!n.read ? "bg-indigo-50/40 dark:bg-indigo-950/15" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"}`}>
      <span className="text-lg mt-0.5 shrink-0">{CATEGORY_ICONS[n.category] ?? "🔔"}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className={`text-sm font-semibold truncate ${!n.read ? "text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"}`}>
            {n.title}
          </p>
          {!n.read && <span className={`h-2 w-2 rounded-full ${severity.dot} shrink-0`} />}
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${severity.badge}`}>
            {n.severity}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 font-medium">
            {n.category}
          </span>
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
            <button
              type="button"
              onClick={onMarkRead}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <Check className="h-3 w-3" /> Mark read
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
