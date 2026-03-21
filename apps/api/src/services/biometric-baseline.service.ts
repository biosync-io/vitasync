import { getDb, biometricBaselines, healthMetrics } from "@biosync-io/db"
import type { BiometricBaselineRow } from "@biosync-io/db"
import { and, avg, count, desc, eq, gte, max, min, sql } from "drizzle-orm"

export class BiometricBaselineService {
  private get db() {
    return getDb()
  }

  async getBaselines(userId: string, opts: { metricType?: string } = {}): Promise<BiometricBaselineRow[]> {
    const conditions = [eq(biometricBaselines.userId, userId)]
    if (opts.metricType) conditions.push(eq(biometricBaselines.metricType, opts.metricType))

    return this.db
      .select()
      .from(biometricBaselines)
      .where(and(...conditions))
      .orderBy(biometricBaselines.metricType)
  }

  async getBaseline(userId: string, metricType: string): Promise<BiometricBaselineRow | null> {
    const [row] = await this.db
      .select()
      .from(biometricBaselines)
      .where(
        and(
          eq(biometricBaselines.userId, userId),
          eq(biometricBaselines.metricType, metricType),
        ),
      )
      .limit(1)
    return row ?? null
  }

  async computeBaseline(userId: string, metricType: string, windowDays = 30): Promise<BiometricBaselineRow> {
    const since = new Date()
    since.setDate(since.getDate() - windowDays)

    const metrics = await this.db
      .select({ value: healthMetrics.value })
      .from(healthMetrics)
      .where(
        and(
          eq(healthMetrics.userId, userId),
          eq(healthMetrics.metricType, metricType),
          gte(healthMetrics.recordedAt, since),
        ),
      )
      .orderBy(healthMetrics.value)

    const values = metrics.map((m) => m.value).filter((v): v is number => v != null)
    const sampleSize = values.length

    if (sampleSize === 0) {
      // No data, insert/update with zeros
      return this.upsertBaseline(userId, metricType, {
        mean: 0,
        stddev: 0,
        min: 0,
        max: 0,
        median: 0,
        p25: 0,
        p75: 0,
        sampleSize: 0,
      })
    }

    const mean = values.reduce((a, b) => a + b, 0) / sampleSize
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sampleSize
    const stddev = Math.sqrt(variance)

    const percentile = (arr: number[], p: number) => {
      const idx = Math.ceil((p / 100) * arr.length) - 1
      return arr[Math.max(0, idx)]!
    }

    const stats = {
      mean: Math.round(mean * 100) / 100,
      stddev: Math.round(stddev * 100) / 100,
      min: values[0]!,
      max: values[values.length - 1]!,
      median: percentile(values, 50),
      p25: percentile(values, 25),
      p75: percentile(values, 75),
      sampleSize,
    }

    return this.upsertBaseline(userId, metricType, stats)
  }

  async computeAllBaselines(userId: string): Promise<BiometricBaselineRow[]> {
    const metricTypes = [
      "resting_heart_rate",
      "heart_rate_variability",
      "blood_oxygen",
      "respiratory_rate",
      "body_temperature",
      "steps",
      "sleep_score",
      "active_calories",
      "systolic_bp",
      "diastolic_bp",
    ]

    const results: BiometricBaselineRow[] = []
    for (const metricType of metricTypes) {
      const baseline = await this.computeBaseline(userId, metricType)
      if ((baseline.sampleSize ?? 0) > 0) results.push(baseline)
    }

    return results
  }

  private async upsertBaseline(
    userId: string,
    metricType: string,
    stats: {
      mean: number
      stddev: number
      min: number
      max: number
      median: number
      p25: number
      p75: number
      sampleSize: number
    },
  ): Promise<BiometricBaselineRow> {
    // Try update first
    const [existing] = await this.db
      .update(biometricBaselines)
      .set({
        ...stats,
        date: new Date(),
      })
      .where(
        and(
          eq(biometricBaselines.userId, userId),
          eq(biometricBaselines.metricType, metricType),
        ),
      )
      .returning()

    if (existing) return existing

    // Insert new
    const [row] = await this.db
      .insert(biometricBaselines)
      .values({
        userId,
        metricType,
        date: new Date(),
        ...stats,
      })
      .returning()

    return row!
  }
}
