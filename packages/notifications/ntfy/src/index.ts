import {
  NotificationChannel,
  channelRegistry,
  type NotificationPayload,
  type NotificationResult,
} from "@biosync-io/notification-core"

const SEVERITY_PRIORITY: Record<string, number> = {
  info: 3,
  warning: 4,
  critical: 5,
}

const SEVERITY_TAGS: Record<string, string> = {
  info: "information_source",
  warning: "warning",
  critical: "rotating_light",
}

/**
 * ntfy.sh notification channel — delivers via the ntfy REST API.
 *
 * Supports both the public ntfy.sh instance and self-hosted ntfy servers.
 *
 * Config shape:
 * ```json
 * {
 *   "serverUrl": "https://ntfy.sh",   // or self-hosted URL
 *   "topic": "vitasync-alerts",
 *   "token": "tk_xxx"                  // optional access token
 * }
 * ```
 */
export class NtfyChannel extends NotificationChannel {
  readonly type = "ntfy" as const
  readonly name = "ntfy"

  validateConfig(config: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (typeof config.topic !== "string" || config.topic.length === 0) {
      errors.push("topic is required")
    }
    if (config.serverUrl !== undefined && typeof config.serverUrl !== "string") {
      errors.push("serverUrl must be a string URL")
    }
    return errors
  }

  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<NotificationResult> {
    const serverUrl = (config.serverUrl as string) || "https://ntfy.sh"
    const topic = config.topic as string
    const token = config.token as string | undefined

    const headers: Record<string, string> = {
      Title: payload.title,
      Priority: String(SEVERITY_PRIORITY[payload.severity] ?? 3),
      Tags: [SEVERITY_TAGS[payload.severity] ?? "bell", payload.category].join(","),
    }

    if (payload.url) {
      headers.Click = payload.url
      headers.Actions = `view, View Details, ${payload.url}`
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const url = `${serverUrl.replace(/\/+$/, "")}/${encodeURIComponent(topic)}`
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payload.body,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown error")
      return { success: false, channelType: "ntfy", error: `ntfy ${res.status}: ${text}` }
    }

    const data = await res.json().catch(() => null) as { id?: string } | null
    return {
      success: true,
      channelType: "ntfy",
      ...(data?.id ? { externalId: data.id } : {}),
    }
  }
}

export function registerNtfyChannel(): void {
  channelRegistry.register("ntfy", () => new NtfyChannel())
}
