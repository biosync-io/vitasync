import {
  getDb,
  notificationChannels,
  notificationLogs,
  notificationRules,
} from "@biosync-io/db"
import type {
  NotificationChannelInsert,
  NotificationChannelRow,
  NotificationRuleInsert,
  NotificationRuleRow,
  NotificationLogRow,
} from "@biosync-io/db"
import { and, desc, eq } from "drizzle-orm"

/**
 * Notification Service — CRUD for notification channels, rules, and logs.
 */
export class NotificationService {
  private get db() {
    return getDb()
  }

  // ── Channel CRUD ────────────────────────────────────────────────────

  async listChannels(userId: string): Promise<NotificationChannelRow[]> {
    return this.db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.userId, userId))
      .orderBy(desc(notificationChannels.createdAt))
  }

  async getChannel(id: string, userId: string): Promise<NotificationChannelRow | null> {
    const [row] = await this.db
      .select()
      .from(notificationChannels)
      .where(and(eq(notificationChannels.id, id), eq(notificationChannels.userId, userId)))
    return row ?? null
  }

  async createChannel(data: NotificationChannelInsert): Promise<NotificationChannelRow> {
    const [row] = await this.db.insert(notificationChannels).values(data).returning()
    return row!
  }

  async updateChannel(
    id: string,
    userId: string,
    data: Partial<Pick<NotificationChannelInsert, "label" | "config" | "enabled">>,
  ): Promise<NotificationChannelRow | null> {
    const [row] = await this.db
      .update(notificationChannels)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(notificationChannels.id, id), eq(notificationChannels.userId, userId)))
      .returning()
    return row ?? null
  }

  async deleteChannel(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(notificationChannels)
      .where(and(eq(notificationChannels.id, id), eq(notificationChannels.userId, userId)))
      .returning({ id: notificationChannels.id })
    return result.length > 0
  }

  // ── Rule CRUD ───────────────────────────────────────────────────────

  async listRules(userId: string): Promise<NotificationRuleRow[]> {
    return this.db
      .select()
      .from(notificationRules)
      .where(eq(notificationRules.userId, userId))
      .orderBy(desc(notificationRules.createdAt))
  }

  async createRule(data: NotificationRuleInsert): Promise<NotificationRuleRow> {
    const [row] = await this.db.insert(notificationRules).values(data).returning()
    return row!
  }

  async updateRule(
    id: string,
    userId: string,
    data: Partial<Pick<NotificationRuleInsert, "name" | "categories" | "minSeverity" | "channelIds" | "enabled">>,
  ): Promise<NotificationRuleRow | null> {
    const [row] = await this.db
      .update(notificationRules)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(notificationRules.id, id), eq(notificationRules.userId, userId)))
      .returning()
    return row ?? null
  }

  async deleteRule(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(notificationRules)
      .where(and(eq(notificationRules.id, id), eq(notificationRules.userId, userId)))
      .returning({ id: notificationRules.id })
    return result.length > 0
  }

  // ── Matching — find channels for a given notification payload ──────

  /**
   * Given a notification category and severity, resolve matching channels.
   */
  async resolveChannels(
    userId: string,
    category: string,
    severity: string,
  ): Promise<NotificationChannelRow[]> {
    const SEVERITY_ORDER = ["info", "warning", "critical"]
    const sevIdx = SEVERITY_ORDER.indexOf(severity)

    const rules = await this.db
      .select()
      .from(notificationRules)
      .where(and(eq(notificationRules.userId, userId), eq(notificationRules.enabled, true)))

    const matchingChannelIds = new Set<string>()
    for (const rule of rules) {
      const categories = rule.categories as string[]
      if (!categories.includes(category)) continue
      const ruleMinIdx = SEVERITY_ORDER.indexOf(rule.minSeverity)
      if (sevIdx < ruleMinIdx) continue
      for (const chId of rule.channelIds as string[]) {
        matchingChannelIds.add(chId)
      }
    }

    if (matchingChannelIds.size === 0) return []

    const channels = await this.listChannels(userId)
    return channels.filter((ch) => ch.enabled && matchingChannelIds.has(ch.id))
  }

  // ── Logs ────────────────────────────────────────────────────────────

  async listLogs(userId: string, opts: { limit?: number } = {}): Promise<NotificationLogRow[]> {
    return this.db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.userId, userId))
      .orderBy(desc(notificationLogs.createdAt))
      .limit(opts.limit ?? 50)
  }

  async logDelivery(
    data: {
      userId: string
      channelId: string
      channelType: string
      title: string
      payload: Record<string, unknown>
      status: string
      attempts: number
      error?: string
    },
  ): Promise<void> {
    await this.db.insert(notificationLogs).values({
      ...data,
      deliveredAt: data.status === "delivered" ? new Date() : undefined,
    })
  }
}
