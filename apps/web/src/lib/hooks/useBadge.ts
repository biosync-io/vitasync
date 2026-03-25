"use client"

import { useCallback, useEffect } from "react"

/**
 * Manages the PWA app badge (unread count shown on the app icon).
 * Gracefully degrades when Badge API is not supported.
 */
export function useBadge(count: number) {
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return

    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {})
    } else {
      navigator.clearAppBadge().catch(() => {})
    }
  }, [count])

  const clearBadge = useCallback(() => {
    if ("clearAppBadge" in navigator) {
      navigator.clearAppBadge().catch(() => {})
    }
  }, [])

  return { clearBadge, isSupported: typeof navigator !== "undefined" && "setAppBadge" in navigator }
}
