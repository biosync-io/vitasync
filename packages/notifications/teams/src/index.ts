import {
  NotificationChannel,
  channelRegistry,
  type NotificationPayload,
  type NotificationResult,
} from "@biosync-io/notification-core"

const SEVERITY_COLOR: Record<string, string> = {
  info: "0078D4",
  warning: "FFC107",
  critical: "D13438",
}

/**
 * Microsoft Teams notification channel — delivers via Teams Incoming Webhook (Adaptive Cards).
 */
export class TeamsChannel extends NotificationChannel {
  readonly type = "teams" as const
  readonly name = "Microsoft Teams"

  validateConfig(config: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (typeof config.webhookUrl !== "string" || !config.webhookUrl.includes(".webhook.office.com")) {
      errors.push("webhookUrl must be a valid Microsoft Teams webhook URL")
    }
    return errors
  }

  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<NotificationResult> {
    const webhookUrl = config.webhookUrl as string
    const color = SEVERITY_COLOR[payload.severity] ?? "808080"

    const card = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              {
                type: "TextBlock",
                text: payload.title,
                weight: "Bolder",
                size: "Medium",
                color: payload.severity === "critical" ? "Attention" : payload.severity === "warning" ? "Warning" : "Default",
              },
              {
                type: "TextBlock",
                text: payload.body,
                wrap: true,
              },
              {
                type: "FactSet",
                facts: [
                  { title: "Category", value: payload.category },
                  { title: "Severity", value: payload.severity },
                  { title: "Time", value: payload.timestamp ?? new Date().toISOString() },
                ],
              },
            ],
            ...(payload.url
              ? {
                  actions: [
                    {
                      type: "Action.OpenUrl",
                      title: "View Details",
                      url: payload.url,
                    },
                  ],
                }
              : {}),
          },
        },
      ],
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown error")
      return { success: false, channelType: "teams", error: `Teams API ${res.status}: ${text}` }
    }

    return { success: true, channelType: "teams" }
  }
}

export function registerTeamsChannel(): void {
  channelRegistry.register("teams", () => new TeamsChannel())
}
