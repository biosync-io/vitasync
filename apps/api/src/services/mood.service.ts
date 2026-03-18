import { getDb, moodLogs } from "@biosync-io/db"
import type { MoodLogInsert, MoodLogRow } from "@biosync-io/db"
import { and, avg, count, desc, eq, gte, lte, sql } from "drizzle-orm"

/**
 * Mood Tracking Service — Feature #6 (Mental Health Monitoring)
 *
 * Manages mood logs and provides trend analysis. Supports correlation
 * with physical health metrics for holistic wellness tracking.
 */
export class MoodService {
  private get db() {
    return getDb()
  }

  async create(data: Omit<MoodLogInsert, "id" | "createdAt">): Promise<MoodLogRow> {
    const [row] = await this.db.insert(moodLogs).values(data).returning()
    return row!
  }

  async list(userId: string, opts: { from?: Date; to?: Date; mood?: string; limit?: number } = {}): Promise<MoodLogRow[]> {
    const conditions = [eq(moodLogs.userId, userId)]
    if (opts.from) conditions.push(gte(moodLogs.recordedAt, opts.from))
    if (opts.to) conditions.push(lte(moodLogs.recordedAt, opts.to))
    if (opts.mood) conditions.push(eq(moodLogs.mood, opts.mood))

    return this.db
      .select()
      .from(moodLogs)
      .where(and(...conditions))
      .orderBy(desc(moodLogs.recordedAt))
      .limit(opts.limit ?? 50)
  }

  async findById(id: string, userId: string): Promise<MoodLogRow | null> {
    const [row] = await this.db
      .select()
      .from(moodLogs)
      .where(and(eq(moodLogs.id, id), eq(moodLogs.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(moodLogs)
      .where(and(eq(moodLogs.id, id), eq(moodLogs.userId, userId)))
      .returning({ id: moodLogs.id })
    return result.length > 0
  }

  async getStats(userId: string, opts: { from?: Date; to?: Date } = {}): Promise<{
    avgScore: number
    avgEnergy: number
    avgStress: number
    totalEntries: number
    moodDistribution: Record<string, number>
    trend: "improving" | "declining" | "stable"
    topFactors: string[]
  }> {
    const to = opts.to ?? new Date()
    const from = opts.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

    const rows = await this.list(userId, { from, to, limit: 1000 })
    if (rows.length === 0) {
      return { avgScore: 0, avgEnergy: 0, avgStress: 0, totalEntries: 0, moodDistribution: {}, trend: "stable", topFactors: [] }
    }

    const scores = rows.map((r) => r.score)
    const energies = rows.filter((r) => r.energyLevel != null).map((r) => r.energyLevel!)
    const stresses = rows.filter((r) => r.stressLevel != null).map((r) => r.stressLevel!)

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
    const avgEnergy = energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : 0
    const avgStress = stresses.length > 0 ? stresses.reduce((a, b) => a + b, 0) / stresses.length : 0

    // Mood distribution
    const moodDistribution: Record<string, number> = {}
    for (const row of rows) {
      moodDistribution[row.mood] = (moodDistribution[row.mood] ?? 0) + 1
    }

    // Trend: compare first half vs second half
    const half = Math.floor(rows.length / 2)
    const firstHalf = scores.slice(0, half)
    const secondHalf = scores.slice(half)
    const avg1 = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0
    const avg2 = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0
    const trendPct = avg1 > 0 ? ((avg2 - avg1) / avg1) * 100 : 0
    const trend = trendPct > 5 ? "improving" : trendPct < -5 ? "declining" : "stable"

    // Top factors
    const factorCounts: Record<string, number> = {}
    for (const row of rows) {
      const factors = row.factors as string[] | null
      if (factors) {
        for (const f of factors) {
          factorCounts[f] = (factorCounts[f] ?? 0) + 1
        }
      }
    }
    const topFactors = Object.entries(factorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([f]) => f)

    return {
      avgScore: Math.round(avgScore * 10) / 10,
      avgEnergy: Math.round(avgEnergy * 10) / 10,
      avgStress: Math.round(avgStress * 10) / 10,
      totalEntries: rows.length,
      moodDistribution,
      trend,
      topFactors,
    }
  }
}
