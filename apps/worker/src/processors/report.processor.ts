import { getDb, users } from "@biosync-io/db"
import type { Job } from "bullmq"

export interface ReportJobData {
  userId: string
  reportType: "weekly" | "monthly"
}

/**
 * Periodic report generation processor.
 *
 * Generates weekly/monthly health reports and snapshots.
 */
export async function processReportJob(job: Job<ReportJobData>): Promise<void> {
  const { userId, reportType } = job.data

  const { HealthReportService } = await import("../../api/src/services/health-report.service.js")
  const { HealthSnapshotService } = await import("../../api/src/services/health-snapshot.service.js")
  const { CorrelationService } = await import("../../api/src/services/correlation.service.js")

  const now = new Date()

  // Generate health report
  try {
    const reportService = new HealthReportService()
    let periodStart: Date
    const periodEnd = new Date(now)

    if (reportType === "weekly") {
      periodStart = new Date(now)
      periodStart.setDate(periodStart.getDate() - 7)
    } else {
      periodStart = new Date(now)
      periodStart.setMonth(periodStart.getMonth() - 1)
    }

    const report = await reportService.generate(userId, reportType, periodStart, periodEnd)
    job.log(`Generated ${reportType} report: ${report.id}`)
  } catch (err: any) {
    job.log(`Report generation failed: ${err.message}`)
  }

  // Generate snapshot
  try {
    const snapshotService = new HealthSnapshotService()
    if (reportType === "weekly") {
      const snapshot = await snapshotService.generateWeeklySnapshot(userId)
      job.log(`Generated weekly snapshot: ${snapshot.id}`)
    } else {
      const snapshot = await snapshotService.generateMonthlySnapshot(userId)
      job.log(`Generated monthly snapshot: ${snapshot.id}`)
    }
  } catch (err: any) {
    job.log(`Snapshot generation failed: ${err.message}`)
  }

  // Recompute correlations (monthly only)
  if (reportType === "monthly") {
    try {
      const correlationService = new CorrelationService()
      const correlations = await correlationService.computeCorrelations(userId, 90)
      job.log(`Computed ${correlations.length} correlations`)
    } catch (err: any) {
      job.log(`Correlation computation failed: ${err.message}`)
    }
  }

  job.log(`${reportType} report processing complete for user ${userId}`)
}
