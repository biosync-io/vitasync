import { getDb, waterIntake } from "@biosync-io/db"
import type { WaterIntakeInsert, WaterIntakeRow } from "@biosync-io/db"
import { and, desc, eq, gte, lte, sql, sum } from "drizzle-orm"

/**
 * Water Intake Tracking Service
 *
 * Logs individual water intake events and provides daily summaries
 * with progress toward hydration goals.
 */
export class WaterIntakeService {
  private get db() {
    return getDb()
  }

  async create(data: Omit<WaterIntakeInsert, "id" | "createdAt">): Promise<WaterIntakeRow> {
    const [row] = await this.db.insert(waterIntake).values(data).returning()
    return row!
  }

  async list(userId: string, opts: { from?: Date; to?: Date; limit?: number } = {}): Promise<WaterIntakeRow[]> {
    const conditions = [eq(waterIntake.userId, userId)]
    if (opts.from) conditions.push(gte(waterIntake.loggedAt, opts.from))
    if (opts.to) conditions.push(lte(waterIntake.loggedAt, opts.to))

    return this.db
      .select()
      .from(waterIntake)
      .where(and(...conditions))
      .orderBy(desc(waterIntake.loggedAt))
      .limit(opts.limit ?? 50)
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(waterIntake)
      .where(and(eq(waterIntake.id, id), eq(waterIntake.userId, userId)))
      .returning({ id: waterIntake.id })
    return result.length > 0
  }

  async getDailySummary(userId: string, date?: Date): Promise<{
    totalMl: number
    goalMl: number
    progressPct: number
    logCount: number
    byBeverage: Record<string, number>
  }> {
    const d = date ?? new Date()
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const dayEnd = new Date(dayStart.getTime() + 86400000)

    const rows = await this.list(userId, { from: dayStart, to: dayEnd, limit: 200 })

    const totalMl = rows.reduce((sum, r) => sum + r.amountMl, 0)
    const goalMl = rows.length > 0 ? (rows[0]!.dailyGoalMl ?? 2500) : 2500
    const progressPct = goalMl > 0 ? Math.min(100, Math.round((totalMl / goalMl) * 100)) : 0

    const byBeverage: Record<string, number> = {}
    for (const row of rows) {
      byBeverage[row.beverageType] = (byBeverage[row.beverageType] ?? 0) + row.amountMl
    }

    return { totalMl, goalMl, progressPct, logCount: rows.length, byBeverage }
  }

  async getWeeklyStats(userId: string): Promise<{
    days: Array<{ date: string; totalMl: number; goalMl: number }>
    avgDailyMl: number
    goalMetDays: number
  }> {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)

    const rows = await this.list(userId, { from: weekAgo, to: now, limit: 500 })

    const byDay: Record<string, { totalMl: number; goalMl: number }> = {}
    for (let i = 0; i < 7; i++) {
      const date = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10)
      byDay[date] = { totalMl: 0, goalMl: 2500 }
    }

    for (const row of rows) {
      const date = new Date(row.loggedAt).toISOString().slice(0, 10)
      if (byDay[date]) {
        byDay[date]!.totalMl += row.amountMl
        byDay[date]!.goalMl = row.dailyGoalMl ?? 2500
      }
    }

    const days = Object.entries(byDay)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const totalMl = days.reduce((s, d) => s + d.totalMl, 0)
    const avgDailyMl = Math.round(totalMl / 7)
    const goalMetDays = days.filter((d) => d.totalMl >= d.goalMl).length

    return { days, avgDailyMl, goalMetDays }
  }
}
