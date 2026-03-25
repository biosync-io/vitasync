"use client"

import { useCallback, useEffect, useState } from "react"

export function usePushSubscription() {
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window
    setIsSupported(supported)
    if (!supported) return

    // Check current subscription status
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(!!sub))
      .catch(() => {})
  }, [])

  const subscribe = useCallback(async () => {
    if (!isSupported) return false
    setIsLoading(true)
    setError(null)

    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setError("Notification permission denied")
        return false
      }

      const registration = await navigator.serviceWorker.ready
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

      if (!vapidPublicKey) {
        setError("Push notifications not configured on this server")
        return false
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      // Send subscription to backend
      const apiKey = localStorage.getItem("vitasync_api_key") ?? ""
      const res = await fetch("/api/v1/push-subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(subscription.toJSON()),
      })

      if (!res.ok) throw new Error("Failed to register push subscription")
      setIsSubscribed(true)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to subscribe")
      return false
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  const unsubscribe = useCallback(async () => {
    setIsLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        // Notify backend
        const apiKey = localStorage.getItem("vitasync_api_key") ?? ""
        await fetch("/api/v1/push-subscriptions", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {})
      }
      setIsSubscribed(false)
    } catch {
      setError("Failed to unsubscribe")
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { isSubscribed, isSupported, isLoading, error, subscribe, unsubscribe }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
