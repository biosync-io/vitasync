import {
  NotificationChannel,
  channelRegistry,
  type NotificationPayload,
  type NotificationResult,
} from "@biosync-io/notification-core"

/**
 * Generic webhook notification channel — delivers via HTTP POST with JSON body.
 *
 * Config shape:
 * ```json
 * {
 *   "url": "https://example.com/hooks/vitasync",
 *   "headers": { "Authorization": "Bearer token" },   // optional extra headers
 *   "secret": "hmac-secret"                            // optional HMAC-SHA256 signing
 * }
 * ```
 */
export class WebhookNotificationChannel extends NotificationChannel {
  readonly type = "webhook" as const
  readonly name = "Webhook"

  validateConfig(config: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (typeof config.url !== "string" || !config.url.startsWith("https://")) {
      errors.push("url must be a valid HTTPS URL")
    }
    return errors
  }

  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<NotificationResult> {
    const url = config.url as string
    const extraHeaders = (config.headers ?? {}) as Record<string, string>

    const body = JSON.stringify({
      event: `notification.${payload.category}`,
      severity: payload.severity,
      title: payload.title,
      body: payload.body,
      userId: payload.userId,
      workspaceId: payload.workspaceId,
      url: payload.url,
      metadata: payload.metadata,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    })

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "VitaSync-Notifications/1.0",
      ...extraHeaders,
    }

    // HMAC-SHA256 signing if secret is configured
    if (typeof config.secret === "string" && config.secret.length > 0) {
      const { createHmac } = await import("node:crypto")
      const signature = createHmac("sha256", config.secret).update(body).digest("hex")
      headers["X-VitaSync-Signature"] = `sha256=${signature}`
    }

    const res = await fetch(url, { method: "POST", headers, body })

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown error")
      return { success: false, channelType: "webhook", error: `HTTP ${res.status}: ${text}` }
    }

    return { success: true, channelType: "webhook" }
  }
}

export function registerWebhookNotificationChannel(): void {
  channelRegistry.register("webhook", () => new WebhookNotificationChannel())
}
