import {
  NotificationChannel,
  channelRegistry,
  type NotificationPayload,
  type NotificationResult,
} from "@biosync-io/notification-core"
import { createTransport, type Transporter } from "nodemailer"

/**
 * Email notification channel — delivers via SMTP (nodemailer).
 *
 * Config shape:
 * ```json
 * {
 *   "host": "smtp.example.com",
 *   "port": 587,
 *   "secure": false,
 *   "user": "apikey",
 *   "pass": "SG.xxx",
 *   "from": "VitaSync <alerts@vitasync.io>",
 *   "to": "user@example.com"
 * }
 * ```
 */
export class EmailChannel extends NotificationChannel {
  readonly type = "email" as const
  readonly name = "Email"

  validateConfig(config: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (typeof config.host !== "string" || config.host.length === 0) errors.push("host is required")
    if (typeof config.port !== "number") errors.push("port must be a number")
    if (typeof config.from !== "string" || config.from.length === 0) errors.push("from is required")
    if (typeof config.to !== "string" || config.to.length === 0) errors.push("to is required")
    return errors
  }

  async send(payload: NotificationPayload, config: Record<string, unknown>): Promise<NotificationResult> {
    const transporter: Transporter = createTransport({
      host: config.host as string,
      port: config.port as number,
      secure: config.secure === true,
      ...(config.user
        ? { auth: { user: config.user as string, pass: config.pass as string } }
        : {}),
    })

    const severityBadge =
      payload.severity === "critical" ? "🚨 CRITICAL" : payload.severity === "warning" ? "⚠️ WARNING" : "ℹ️ INFO"

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="padding: 20px; background: ${payload.severity === "critical" ? "#fef2f2" : payload.severity === "warning" ? "#fffbeb" : "#eff6ff"}; border-radius: 8px;">
          <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">${severityBadge} · ${payload.category.toUpperCase()}</p>
          <h2 style="margin: 0 0 12px; color: #111827;">${payload.title}</h2>
          <p style="margin: 0; color: #374151; line-height: 1.5;">${payload.body}</p>
          ${payload.url ? `<p style="margin: 16px 0 0;"><a href="${payload.url}" style="color: #2563eb;">View Details →</a></p>` : ""}
        </div>
        <p style="margin: 16px 0 0; font-size: 11px; color: #9ca3af; text-align: center;">Sent by VitaSync</p>
      </div>
    `

    const info = await transporter.sendMail({
      from: config.from as string,
      to: config.to as string,
      subject: `[VitaSync] ${payload.title}`,
      html,
      text: `${severityBadge}\n\n${payload.title}\n\n${payload.body}`,
    })

    return {
      success: true,
      channelType: "email",
      externalId: info.messageId,
    }
  }
}

export function registerEmailChannel(): void {
  channelRegistry.register("email", () => new EmailChannel())
}
