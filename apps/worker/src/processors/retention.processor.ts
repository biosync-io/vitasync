import { getDb, dataRetentionPolicies, healthMetrics, moodLogs, nutritionLogs, medications, symptomLogs, journalEntries, waterIntake, habits, anomalyAlerts, correlations, auditLog } from "@biosync-io/db"
import { and, eq, lt, sql } from "drizzle-orm"
import type { Job } from "bullmq"

/**
 * Data retention processor — purges expired data per workspace policies.
 *
 * Runs as a daily BullMQ scheduled job.  For each enabled retention policy,
 * deletes rows older than `retentionDays` from the target table.
 *
 * `retentionDays = 0` means retain forever (skip).
 */

/** Maps policy dataType → drizzle table + timestamp column */
const RETENTION_TARGETS: Record<string, { table: any; timestampCol: any }> = {
  health_metrics: { table: healthMetrics, timestampCol: healthMetrics.recordedAt },
  mood_logs: { table: moodLogs, timestampCol: moodLogs.createdAt },
  nutrition_logs: { table: nutritionLogs, timestampCol: nutritionLogs.createdAt },
  medications: { table: medications, timestampCol: medications.createdAt },
  symptom_logs: { table: symptomLogs, timestampCol: symptomLogs.createdAt },
  journal_entries: { table: journalEntries, timestampCol: journalEntries.createdAt },
  water_intake: { table: waterIntake, timestampCol: waterIntake.createdAt },
  habits: { table: habits, timestampCol: habits.createdAt },
  anomaly_alerts: { table: anomalyAlerts, timestampCol: anomalyAlerts.createdAt },
  correlations: { table: correlations, timestampCol: correlations.createdAt },
  audit_log: { table: auditLog, timestampCol: auditLog.timestamp },
}

export async function processRetentionJob(job: Job): Promise<void> {
  const db = getDb()

  // Fetch all enabled policies
  const policies = await db
    .select()
    .from(dataRetentionPolicies)
    .where(eq(dataRetentionPolicies.enabled, true))

  let totalDeleted = 0

  for (const policy of policies) {
    if (policy.retentionDays <= 0) continue // 0 = retain forever

    const target = RETENTION_TARGETS[policy.dataType]
    if (!target) {
      console.warn(`[retention] Unknown data type: ${policy.dataType}, skipping`)
      continue
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays)

    try {
      const deleted = await db
        .delete(target.table)
        .where(lt(target.timestampCol, cutoffDate))
        .returning({ id: sql`1` })

      const count = deleted.length
      totalDeleted += count

      if (count > 0) {
        console.info(
          `[retention] Purged ${count} rows from ${policy.dataType} (workspace: ${policy.workspaceId}, retention: ${policy.retentionDays}d)`,
        )
      }
    } catch (err) {
      console.error(`[retention] Failed to purge ${policy.dataType}:`, err)
    }
  }

  if (totalDeleted > 0) {
    console.info(`[retention] Total purged: ${totalDeleted} rows across ${policies.length} policies`)
  }
}
