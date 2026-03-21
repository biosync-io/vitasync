import {
  computeReadiness,
  computeTrainingLoad,
  type ReadinessResult,
  type TrainingLoadResult,
} from "@biosync-io/analytics"
import { getDb, trainingLoad } from "@biosync-io/db"
import { and, eq, gte, desc } from "drizzle-orm"

/**
 * Readiness & Training Load Service
 *
 * Exposes the proprietary readiness engine and training load model
 * to the API layer.
 */
export class ReadinessService {
  /** Compute readiness for a given user and date. */
  async getReadiness(userId: string, date?: Date): Promise<ReadinessResult> {
    return computeReadiness(userId, date ?? new Date())
  }

  /** Compute training load (ATL/CTL/TSB) for a given user and date. */
  async getTrainingLoad(userId: string, date?: Date): Promise<TrainingLoadResult> {
    return computeTrainingLoad(userId, date ?? new Date())
  }

  /** Fetch persisted training load history from DB. */
  async getTrainingLoadHistory(
    userId: string,
    opts: { days?: number } = {},
  ): Promise<Array<{ date: Date; dailyStrain: number; atl: number; ctl: number; tsb: number; status: string }>> {
    const db = getDb()
    const since = new Date()
    since.setDate(since.getDate() - (opts.days ?? 30))

    return db
      .select({
        date: trainingLoad.date,
        dailyStrain: trainingLoad.dailyStrain,
        atl: trainingLoad.atl,
        ctl: trainingLoad.ctl,
        tsb: trainingLoad.tsb,
        status: trainingLoad.status,
      })
      .from(trainingLoad)
      .where(and(eq(trainingLoad.userId, userId), gte(trainingLoad.date, since)))
      .orderBy(desc(trainingLoad.date))
  }
}
