import {
  NotificationChannel,
  channelRegistry,
  type NotificationPayload,
  type NotificationResult,
} from "@biosync-io/notification-core"
import webpush from "web-push"

/**
 * Web Push notification channel — delivers via the Web Push protocol (RFC 8030).
 *
 * Config shape:
 * ```json
 * {
 *   "vapidPublicKey": "BEl62iU...",
 *   "vapidPrivateKey": "UUxI4o8...",
 *   "vapidSubject": "mailto:admin@vitasync.io",
 *   "subscription": {
 *     "endpoint": "https://fcm.googleapis.com/fcm/send/...",
 *     "keys": { "p256dh": "...", "auth": "..." }
 *   }
 * }
 * ```
 */
export class PushChannel extends NotificationChannel {
  readonly type = "push" as const
  readonly name = "Web Push"

  validateConfig(config: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (typeof config.vapidPublicKey !== "string") errors.push("vapidPublicKey is required")
    if (typeof config.vapidPrivateKey !== "string") errors.push("vapidPrivateKey is required")
    if (typeof config.vapidSubject !== "string") errors.push("vapidSubject is required (mailto: or https: URL)")
    if (!config.subscription || typeof config.subscription !== "object") errors.push("subscription object is required")
    return errors
  }

  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<NotificationResult> {
    webpush.setVapidDetails(
      config.vapidSubject as string,
      config.vapidPublicKey as string,
      config.vapidPrivateKey as string,
    )

    const subscription = config.subscription as webpush.PushSubscription

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: "/icons/vitasync-192.png",
      badge: "/icons/vitasync-badge.png",
      tag: `${payload.category}-${payload.severity}`,
      data: {
        url: payload.url,
        category: payload.category,
        severity: payload.severity,
      },
    })

    const result = await webpush.sendNotification(subscription, pushPayload)

    return {
      success: true,
      channelType: "push",
      ...(result.headers?.location ? { externalId: result.headers.location } : {}),
    }
  }
}

export function registerPushChannel(): void {
  channelRegistry.register("push", () => new PushChannel())
}
