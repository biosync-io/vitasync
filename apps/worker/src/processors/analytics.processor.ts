import { getDb, providerConnections } from "@biosync-io/db"
import type { Job } from "bullmq"
import { eq } from "drizzle-orm"

export interface AnalyticsJobData {
  userId: string
  workspaceId: string
  connectionId?: string
  trigger: "post_sync" | "scheduled"
}

/**
 * Post-sync analytics processor.
 *
 * After a provider sync completes, this processor runs:
 * 1. Health score computation for today
 * 2. Anomaly detection scan
 * 3. Achievement check
 * 4. Biometric baseline recomputation
 * 5. Goal progress evaluation
 */
export async function processAnalyticsJob(job: Job<AnalyticsJobData>): Promise<void> {
  const { userId, trigger } = job.data

  // Lazy-import services to keep the worker bundle minimal when not running analytics
  const { HealthScoreService } = await import("../../api/src/services/health-score.service.js")
  const { AnomalyDetectionService } = await import("../../api/src/services/anomaly-detection.service.js")
  const { AchievementService } = await import("../../api/src/services/achievement.service.js")
  const { BiometricBaselineService } = await import("../../api/src/services/biometric-baseline.service.js")
  const { GoalService } = await import("../../api/src/services/goal.service.js")

  const today = new Date()

  // 1. Compute health score
  try {
    const scoreService = new HealthScoreService()
    const score = await scoreService.computeForDate(userId, today)
    job.log(`Health score computed: ${score.overallScore} (${score.grade})`)
  } catch (err: any) {
    job.log(`Health score computation failed: ${err.message}`)
  }

  // 2. Anomaly detection
  try {
    const anomalyService = new AnomalyDetectionService()
    const anomalies = await anomalyService.detectAnomalies(userId)
    if (anomalies.length > 0) {
      job.log(`Detected ${anomalies.length} anomalies`)
    }
  } catch (err: any) {
    job.log(`Anomaly detection failed: ${err.message}`)
  }

  // 3. Achievement check
  try {
    const achievementService = new AchievementService()
    const awarded = await achievementService.checkAndAward(userId)
    if (awarded.length > 0) {
      job.log(`Awarded ${awarded.length} new achievements`)
    }
  } catch (err: any) {
    job.log(`Achievement check failed: ${err.message}`)
  }

  // 4. Baseline recomputation (only on scheduled runs to avoid excessive computation)
  if (trigger === "scheduled") {
    try {
      const baselineService = new BiometricBaselineService()
      const baselines = await baselineService.computeAllBaselines(userId)
      job.log(`Recomputed ${baselines.length} biometric baselines`)
    } catch (err: any) {
      job.log(`Baseline computation failed: ${err.message}`)
    }
  }

  // 5. Evaluate active goals
  try {
    const goalService = new GoalService()
    const goals = await goalService.list(userId, { status: "active", limit: 50 })
    let evaluated = 0
    for (const goal of goals) {
      await goalService.evaluateProgress(goal.id, userId)
      evaluated++
    }
    if (evaluated > 0) job.log(`Evaluated ${evaluated} active goals`)
  } catch (err: any) {
    job.log(`Goal evaluation failed: ${err.message}`)
  }

  job.log(`Analytics processing complete for user ${userId}`)
}
