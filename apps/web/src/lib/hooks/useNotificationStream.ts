"use client"

import { useEffect, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useSelectedUser } from "../user-selection-context"
import { getRuntimeDefaultKey } from "../api"

const CATEGORY_ICONS: Record<string, string> = {
  sync: "🔄",
  report: "📊",
  anomaly: "⚠️",
  achievement: "🏆",
  goal: "🎯",
  insight: "💡",
  system: "⚙️",
}

interface NotificationEvent {
  type: "notification" | "connected"
  id?: string
  title?: string
  body?: string
  category?: string
  severity?: string
  link?: string
}

/**
 * Hook that connects to the SSE notification stream and:
 * 1. Shows a toast for each new notification
 * 2. Invalidates the inbox query so the bell updates instantly
 */
export function useNotificationStream() {
  const { selectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const MAX_RECONNECT_DELAY = 30_000

  const connect = useCallback(async () => {
    if (!selectedUserId) return

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    const apiKey = await getRuntimeDefaultKey()
    const url = `/api/v1/users/${selectedUserId}/notifications/stream${apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : ""}`

    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data: NotificationEvent = JSON.parse(event.data)

        if (data.type === "connected") {
          reconnectAttemptsRef.current = 0
          return
        }

        if (data.type === "notification" && data.title) {
          const icon = CATEGORY_ICONS[data.category ?? ""] ?? "🔔"

          // Show toast based on severity
          const toastFn =
            data.severity === "critical"
              ? toast.error
              : data.severity === "warning"
                ? toast.warning
                : toast.info

          toastFn(`${icon} ${data.title}`, {
            description: data.body,
            duration: data.severity === "critical" ? 8000 : 5000,
            action: data.link
              ? {
                  label: "View",
                  onClick: () => {
                    window.location.href = data.link!
                  },
                }
              : undefined,
          })

          // Invalidate inbox query so bell updates instantly
          queryClient.invalidateQueries({ queryKey: ["inbox"] })
        }
      } catch {
        // Ignore malformed messages
      }
    }

    es.onerror = () => {
      es.close()
      eventSourceRef.current = null

      // Exponential backoff reconnect
      const delay = Math.min(
        1000 * 2 ** reconnectAttemptsRef.current,
        MAX_RECONNECT_DELAY,
      )
      reconnectAttemptsRef.current++

      reconnectTimeoutRef.current = setTimeout(() => {
        connect()
      }, delay)
    }
  }, [selectedUserId, queryClient])

  useEffect(() => {
    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [connect])
}
