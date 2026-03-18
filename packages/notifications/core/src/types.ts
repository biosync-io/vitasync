import { z } from "zod"

// ── Notification Severity & Category ────────────────────────────────────

export const NotificationSeverity = z.enum(["info", "warning", "critical"])
export type NotificationSeverity = z.infer<typeof NotificationSeverity>

export const NotificationCategory = z.enum([
  "anomaly",
  "goal",
  "achievement",
  "sync",
  "report",
  "system",
  "insight",
])
export type NotificationCategory = z.infer<typeof NotificationCategory>

// ── Channel Types ───────────────────────────────────────────────────────

export const ChannelType = z.enum([
  "discord",
  "slack",
  "teams",
  "email",
  "push",
  "ntfy",
  "webhook",
])
export type ChannelType = z.infer<typeof ChannelType>

// ── Core Notification Payload ───────────────────────────────────────────

export const NotificationPayload = z.object({
  title: z.string().max(255),
  body: z.string().max(4000),
  severity: NotificationSeverity,
  category: NotificationCategory,
  userId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  /** Optional deep-link URL */
  url: z.string().url().optional(),
  /** Arbitrary structured data */
  metadata: z.record(z.unknown()).optional(),
  /** ISO timestamp */
  timestamp: z.string().datetime().optional(),
})
export type NotificationPayload = z.infer<typeof NotificationPayload>

// ── Delivery Result ─────────────────────────────────────────────────────

export interface NotificationResult {
  success: boolean
  channelType: ChannelType
  /** External message/delivery ID from the service */
  externalId?: string
  error?: string
}

// ── Channel Configuration (per-channel config stored in DB) ─────────────

export interface ChannelConfig {
  id: string
  channelType: ChannelType
  /** Channel-specific configuration (webhook URL, SMTP settings, etc.) */
  config: Record<string, unknown>
  enabled: boolean
}

// ── Notification Rule ───────────────────────────────────────────────────

export interface NotificationRule {
  id: string
  workspaceId: string
  /** Event types that trigger this rule */
  eventTypes: string[]
  /** Minimum severity to trigger */
  minSeverity: NotificationSeverity
  /** Which channel IDs to send to */
  channelIds: string[]
  /** Optional filter conditions */
  conditions?: Record<string, unknown>
  enabled: boolean
}
