import type { ChannelType, NotificationPayload, NotificationResult } from "./types.js"

/**
 * Abstract base class for notification channels.
 *
 * Each channel (Discord, Slack, Email, etc.) extends this class and
 * implements `send()` with the channel-specific delivery logic.
 *
 * Follows the same plugin pattern as VitaSync provider packages.
 */
export abstract class NotificationChannel {
  abstract readonly type: ChannelType
  abstract readonly name: string

  /**
   * Deliver a notification through this channel.
   * @param payload - The notification content
   * @param config - Channel-specific configuration (webhook URL, API key, etc.)
   */
  abstract send(
    payload: NotificationPayload,
    config: Record<string, unknown>,
  ): Promise<NotificationResult>

  /**
   * Validate that the provided config is valid for this channel.
   * Returns a list of error messages, or empty array if valid.
   */
  abstract validateConfig(config: Record<string, unknown>): string[]

  /**
   * Format the notification into a human-readable message.
   * Override for channel-specific formatting (Markdown, HTML, etc.).
   */
  protected formatMessage(payload: NotificationPayload): string {
    const icon = payload.severity === "critical" ? "🚨" : payload.severity === "warning" ? "⚠️" : "ℹ️"
    return `${icon} **${payload.title}**\n\n${payload.body}`
  }
}
