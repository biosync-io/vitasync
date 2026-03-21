import type { NotificationChannel } from "./channel.js"
import type { ChannelType } from "./types.js"

type ChannelFactory = () => NotificationChannel

interface RegisteredChannel {
  type: ChannelType
  factory: ChannelFactory
}

/**
 * Central registry for notification channel plugins.
 *
 * Channels self-register (like data providers) so the notification
 * system discovers them at startup without hard-coded imports.
 *
 * @example
 * ```ts
 * import { channelRegistry } from "@biosync-io/notification-core"
 * channelRegistry.register("discord", () => new DiscordChannel())
 * ```
 */
class ChannelRegistry {
  private readonly channels = new Map<string, RegisteredChannel>()

  register(type: ChannelType, factory: ChannelFactory): void {
    if (this.channels.has(type)) {
      throw new Error(`Channel "${type}" is already registered.`)
    }
    this.channels.set(type, { type, factory })
  }

  resolve(type: string): NotificationChannel {
    const entry = this.channels.get(type)
    if (!entry) {
      throw new Error(
        `Channel "${type}" is not registered. Available: [${[...this.channels.keys()].join(", ")}]`,
      )
    }
    return entry.factory()
  }

  listTypes(): ChannelType[] {
    return [...this.channels.values()].map((c) => c.type)
  }

  isRegistered(type: string): boolean {
    return this.channels.has(type)
  }

  clear(): void {
    this.channels.clear()
  }
}

/** Singleton registry shared across the application. */
export const channelRegistry = new ChannelRegistry()
