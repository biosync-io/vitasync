import {
  NotificationChannel,
  channelRegistry,
  type NotificationPayload,
  type NotificationResult,
} from "@biosync-io/notification-core"

const SEVERITY_COLORS: Record<string, number> = {
  info: 0x3498db,
  warning: 0xf39c12,
  critical: 0xe74c3c,
}

/**
 * Discord notification channel — delivers via Discord webhook embeds.
 */
export class DiscordChannel extends NotificationChannel {
  readonly type = "discord" as const
  readonly name = "Discord"

  validateConfig(config: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (typeof config.webhookUrl !== "string" || !config.webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
      errors.push("webhookUrl must be a valid Discord webhook URL starting with https://discord.com/api/webhooks/")
    }
    return errors
  }

  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<NotificationResult> {
    const webhookUrl = config.webhookUrl as string

    const embed = {
      title: payload.title,
      description: payload.body,
      color: SEVERITY_COLORS[payload.severity] ?? 0x95a5a6,
      timestamp: payload.timestamp ?? new Date().toISOString(),
      footer: { text: `VitaSync · ${payload.category}` },
      ...(payload.url ? { url: payload.url } : {}),
    }

    const body = JSON.stringify({
      username: "VitaSync",
      embeds: [embed],
    })

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown error")
      return { success: false, channelType: "discord", error: `Discord API ${res.status}: ${text}` }
    }

    return { success: true, channelType: "discord" }
  }
}

export function registerDiscordChannel(): void {
  channelRegistry.register("discord", () => new DiscordChannel())
}
