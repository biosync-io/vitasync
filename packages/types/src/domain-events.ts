// ── Domain Event Type Constants ─────────────────────────────────

export const DomainEventTypes = {
  // User lifecycle
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",

  // Health data
  HEALTH_METRIC_RECORDED: "health.metric.recorded",
  HEALTH_METRIC_BATCH_INGESTED: "health.metric.batch_ingested",
  HEALTH_SCORE_COMPUTED: "health.score.computed",

  // Sync
  SYNC_STARTED: "sync.started",
  SYNC_COMPLETED: "sync.completed",
  SYNC_FAILED: "sync.failed",

  // Analytics
  ANOMALY_DETECTED: "analytics.anomaly.detected",
  INSIGHT_GENERATED: "analytics.insight.generated",
  CORRELATION_FOUND: "analytics.correlation.found",

  // Goals & achievements
  GOAL_CREATED: "goal.created",
  GOAL_ACHIEVED: "goal.achieved",
  ACHIEVEMENT_UNLOCKED: "achievement.unlocked",

  // Notifications
  NOTIFICATION_SENT: "notification.sent",
  NOTIFICATION_FAILED: "notification.failed",

  // Provider
  PROVIDER_CONNECTED: "provider.connected",
  PROVIDER_DISCONNECTED: "provider.disconnected",

  // Webhook
  WEBHOOK_DELIVERED: "webhook.delivered",
  WEBHOOK_FAILED: "webhook.failed",

  // Export
  EXPORT_STARTED: "export.started",
  EXPORT_COMPLETED: "export.completed",
  EXPORT_FAILED: "export.failed",
} as const

export type DomainEventType =
  (typeof DomainEventTypes)[keyof typeof DomainEventTypes]

// ── Payload Interfaces ──────────────────────────────────────────

// User lifecycle
export interface UserCreatedPayload {
  userId: string
  email: string | null
  displayName: string | null
  role: string
}

export interface UserUpdatedPayload {
  userId: string
  changes: Record<string, unknown>
}

export interface UserDeletedPayload {
  userId: string
}

export interface UserLoginPayload {
  userId: string
  method: string
  ip: string | null
}

export interface UserLogoutPayload {
  userId: string
  sessionId: string | null
}

// Health data
export interface HealthMetricRecordedPayload {
  userId: string
  metricType: string
  value: number
  unit: string
  source: string
  recordedAt: string
}

export interface HealthMetricBatchIngestedPayload {
  userId: string
  count: number
  source: string
  metricTypes: string[]
}

export interface HealthScoreComputedPayload {
  userId: string
  overallScore: number
  grade: string
  date: string
}

// Sync
export interface SyncStartedPayload {
  syncJobId: string
  connectionId: string
  userId: string
  provider: string
}

export interface SyncCompletedPayload {
  syncJobId: string
  connectionId: string
  userId: string
  provider: string
  metricsCount: number
  eventsCount: number
  duration: number
}

export interface SyncFailedPayload {
  syncJobId: string
  connectionId: string
  userId: string
  provider: string
  error: string
}

// Analytics
export interface AnomalyDetectedPayload {
  userId: string
  metricType: string
  severity: string
  value: number
  expectedRange: [number, number]
}

export interface InsightGeneratedPayload {
  userId: string
  insightType: string
  summary: string
  metricTypes: string[]
}

export interface CorrelationFoundPayload {
  userId: string
  metricA: string
  metricB: string
  pearsonR: number
  strength: string
  direction: string
}

// Goals & achievements
export interface GoalCreatedPayload {
  userId: string
  goalId: string
  name: string
  metricType: string
  targetValue: number
}

export interface GoalAchievedPayload {
  userId: string
  goalId: string
  name: string
  targetValue: number
  currentValue: number
}

export interface AchievementUnlockedPayload {
  userId: string
  achievementId: string
  name: string
  category: string
  tier: string
}

// Notifications
export interface NotificationSentPayload {
  userId: string
  channelCount: number
  successCount: number
  title: string
  category: string
}

export interface NotificationFailedPayload {
  userId: string
  title: string
  category: string
  error: string
}

// Provider
export interface ProviderConnectedPayload {
  userId: string
  connectionId: string
  provider: string
}

export interface ProviderDisconnectedPayload {
  userId: string
  connectionId: string
  provider: string
  reason: string
}

// Webhook
export interface WebhookDeliveredPayload {
  webhookId: string
  deliveryId: string
  eventType: string
  responseStatus: number
}

export interface WebhookFailedPayload {
  webhookId: string
  deliveryId: string
  eventType: string
  error: string
}

// Export
export interface ExportStartedPayload {
  userId: string
  exportId: string
  format: string
}

export interface ExportCompletedPayload {
  userId: string
  exportId: string
  format: string
  sizeBytes: number | null
}

export interface ExportFailedPayload {
  userId: string
  exportId: string
  format: string
  error: string
}

// ── Event Payload Map ───────────────────────────────────────────

export interface DomainEventPayloadMap {
  [DomainEventTypes.USER_CREATED]: UserCreatedPayload
  [DomainEventTypes.USER_UPDATED]: UserUpdatedPayload
  [DomainEventTypes.USER_DELETED]: UserDeletedPayload
  [DomainEventTypes.USER_LOGIN]: UserLoginPayload
  [DomainEventTypes.USER_LOGOUT]: UserLogoutPayload
  [DomainEventTypes.HEALTH_METRIC_RECORDED]: HealthMetricRecordedPayload
  [DomainEventTypes.HEALTH_METRIC_BATCH_INGESTED]: HealthMetricBatchIngestedPayload
  [DomainEventTypes.HEALTH_SCORE_COMPUTED]: HealthScoreComputedPayload
  [DomainEventTypes.SYNC_STARTED]: SyncStartedPayload
  [DomainEventTypes.SYNC_COMPLETED]: SyncCompletedPayload
  [DomainEventTypes.SYNC_FAILED]: SyncFailedPayload
  [DomainEventTypes.ANOMALY_DETECTED]: AnomalyDetectedPayload
  [DomainEventTypes.INSIGHT_GENERATED]: InsightGeneratedPayload
  [DomainEventTypes.CORRELATION_FOUND]: CorrelationFoundPayload
  [DomainEventTypes.GOAL_CREATED]: GoalCreatedPayload
  [DomainEventTypes.GOAL_ACHIEVED]: GoalAchievedPayload
  [DomainEventTypes.ACHIEVEMENT_UNLOCKED]: AchievementUnlockedPayload
  [DomainEventTypes.NOTIFICATION_SENT]: NotificationSentPayload
  [DomainEventTypes.NOTIFICATION_FAILED]: NotificationFailedPayload
  [DomainEventTypes.PROVIDER_CONNECTED]: ProviderConnectedPayload
  [DomainEventTypes.PROVIDER_DISCONNECTED]: ProviderDisconnectedPayload
  [DomainEventTypes.WEBHOOK_DELIVERED]: WebhookDeliveredPayload
  [DomainEventTypes.WEBHOOK_FAILED]: WebhookFailedPayload
  [DomainEventTypes.EXPORT_STARTED]: ExportStartedPayload
  [DomainEventTypes.EXPORT_COMPLETED]: ExportCompletedPayload
  [DomainEventTypes.EXPORT_FAILED]: ExportFailedPayload
}
