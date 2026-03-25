"use client"

import { useEffect } from "react"

/**
 * Registers a periodic background sync to refresh health data.
 * Only works in supported browsers (Chromium-based).
 * Gracefully degrades — no-op on unsupported browsers.
 */
export function usePeriodicSync(intervalMs: number = 12 * 60 * 60 * 1000) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    if (!("periodicSync" in ServiceWorkerRegistration.prototype)) return

    let cancelled = false

    navigator.serviceWorker.ready.then(async (registration) => {
      if (cancelled) return

      try {
        const status = await navigator.permissions.query({
          name: "periodic-background-sync" as PermissionName,
        })
        if (status.state !== "granted") return

        await (registration as ServiceWorkerRegistration & {
          periodicSync: { register(tag: string, options: { minInterval: number }): Promise<void> }
        }).periodicSync.register("vitasync-health-refresh", {
          minInterval: intervalMs,
        })
      } catch {
        // Periodic sync not available — graceful degradation
      }
    })

    return () => { cancelled = true }
  }, [intervalMs])
}
