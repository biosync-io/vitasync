import type { Job } from "bullmq"
import {
  getDb,
  notificationChannels,
  notificationLogs,
} from "@biosync-io/db"
import { NotificationManager, type ChannelConfig } from "@biosync-io/notification-core"
import { and, eq } from "drizzle-orm"

interface NotificationJobData {
  userId: string
  workspaceId: string
  title: string
  body: string
  severity: string
  category: string
  url?: string
  metadata?: Record<string, unknown>
  /** If set, delivers to this specific channel only (e.g. test) */
  channelId?: string
}

const manager = new NotificationManager()

/**
 * BullMQ processor for notification delivery jobs.
 *
 * The job payload specifies the notification content. If `channelId` is
 * provided, only that channel receives it (test notifications). Otherwise,
 * the processor resolves all enabled channels for the user and dispatches
 * to all of them.
 */
export async function processNotificationJob(job: Job<NotificationJobData>): Promise<void> {
  const { userId, title, body, severity, category, url, metadata, channelId } = job.data
  const db = getDb()

  // Resolve target channels
  let channelRows
  if (channelId) {
    channelRows = await db
      .select()
      .from(notificationChannels)
      .where(and(eq(notificationChannels.id, channelId), eq(notificationChannels.userId, userId)))
  } else {
    channelRows = await db
      .select()
      .from(notificationChannels)
      .where(and(eq(notificationChannels.userId, userId), eq(notificationChannels.enabled, true)))
  }

  if (channelRows.length === 0) {
    console.info(`[notification] No channels configured for user ${userId}`)
    return
  }

  const payload = {
    title,
    body,
    severity: severity as "info" | "warning" | "critical",
    category: category as "anomaly" | "goal" | "achievement" | "sync" | "report" | "system" | "insight",
    userId,
    workspaceId: job.data.workspaceId,
    url,
    metadata,
    timestamp: new Date().toISOString(),
  }

  const channelConfigs: ChannelConfig[] = channelRows.map((ch) => ({
    id: ch.id,
    channelType: ch.channelType as ChannelConfig["channelType"],
    config: ch.config as Record<string, unknown>,
    enabled: ch.enabled,
  }))

  const results = await manager.dispatch(payload, channelConfigs)

  // Log delivery results
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!
    const ch = channelRows[i]!
    await db.insert(notificationLogs).values({
      userId,
      channelId: ch.id,
      channelType: ch.channelType,
      title,
      payload: payload as unknown as Record<string, unknown>,
      status: result.success ? "delivered" : "failed",
      attempts: 1,
      error: result.error ?? undefined,
      deliveredAt: result.success ? new Date() : undefined,
    })
  }

  const successCount = results.filter((r) => r.success).length
  console.info(`[notification] Delivered ${successCount}/${results.length} for user ${userId}`)
}
