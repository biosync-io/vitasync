import { channelRegistry } from "./registry.js"
import type { ChannelConfig, NotificationPayload, NotificationResult } from "./types.js"

/**
 * Notification Manager — orchestrates delivery across multiple channels.
 *
 * Given a notification and a set of channel configurations, the manager
 * resolves each channel from the registry and dispatches in parallel.
 * Failed deliveries are captured (not thrown) so other channels still send.
 */
export class NotificationManager {
  /**
   * Dispatch a notification to one or more channels.
   * Returns results for every channel (including failures).
   */
  async dispatch(
    payload: NotificationPayload,
    channels: ChannelConfig[],
  ): Promise<NotificationResult[]> {
    const enabledChannels = channels.filter((c) => c.enabled)
    if (enabledChannels.length === 0) return []

    const results = await Promise.allSettled(
      enabledChannels.map(async (ch): Promise<NotificationResult> => {
        if (!channelRegistry.isRegistered(ch.channelType)) {
          return {
            success: false,
            channelType: ch.channelType,
            error: `Channel type "${ch.channelType}" is not registered`,
          }
        }

        const channel = channelRegistry.resolve(ch.channelType)
        return channel.send(payload, ch.config)
      }),
    )

    return results.map((r, i) => {
      if (r.status === "fulfilled") return r.value
      return {
        success: false,
        channelType: enabledChannels[i]!.channelType,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      }
    })
  }
}
