import {
  NotificationChannel,
  channelRegistry,
  type NotificationPayload,
  type NotificationResult,
} from "@biosync-io/notification-core"

const SEVERITY_EMOJI: Record<string, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🚨",
}

/**
 * Slack notification channel — delivers via Slack Incoming Webhooks.
 */
export class SlackChannel extends NotificationChannel {
  readonly type = "slack" as const
  readonly name = "Slack"

  validateConfig(config: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (typeof config.webhookUrl !== "string" || !config.webhookUrl.startsWith("https://hooks.slack.com/")) {
      errors.push("webhookUrl must be a valid Slack webhook URL starting with https://hooks.slack.com/")
    }
    return errors
  }

  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<NotificationResult> {
    const webhookUrl = config.webhookUrl as string
    const emoji = SEVERITY_EMOJI[payload.severity] ?? "📋"
    const channel = typeof config.channel === "string" ? config.channel : undefined

    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} ${payload.title}`, emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: payload.body },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `*Category:* ${payload.category} · *Severity:* ${payload.severity}` },
        ],
      },
    ]

    if (payload.url) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `<${payload.url}|View Details>` },
      } as typeof blocks[number])
    }

    const body = JSON.stringify({
      ...(channel ? { channel } : {}),
      blocks,
      text: `${emoji} ${payload.title}: ${payload.body}`,
    })

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown error")
      return { success: false, channelType: "slack", error: `Slack API ${res.status}: ${text}` }
    }

    return { success: true, channelType: "slack" }
  }
}

export function registerSlackChannel(): void {
  channelRegistry.register("slack", () => new SlackChannel())
}
