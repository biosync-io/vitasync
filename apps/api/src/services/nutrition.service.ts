import { getDb, nutritionLogs } from "@biosync-io/db"
import type { NutritionLogInsert, NutritionLogRow } from "@biosync-io/db"
import { and, avg, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm"

export class NutritionService {
  private get db() {
    return getDb()
  }

  async create(data: Omit<NutritionLogInsert, "id" | "createdAt">): Promise<NutritionLogRow> {
    const [row] = await this.db.insert(nutritionLogs).values(data).returning()
    return row!
  }

  async list(userId: string, opts: { from?: Date; to?: Date; mealType?: string; limit?: number } = {}): Promise<NutritionLogRow[]> {
    const conditions = [eq(nutritionLogs.userId, userId)]
    if (opts.from) conditions.push(gte(nutritionLogs.loggedAt, opts.from))
    if (opts.to) conditions.push(lte(nutritionLogs.loggedAt, opts.to))
    if (opts.mealType) conditions.push(eq(nutritionLogs.mealType, opts.mealType))

    return this.db
      .select()
      .from(nutritionLogs)
      .where(and(...conditions))
      .orderBy(desc(nutritionLogs.loggedAt))
      .limit(opts.limit ?? 50)
  }

  async findById(id: string, userId: string): Promise<NutritionLogRow | null> {
    const [row] = await this.db
      .select()
      .from(nutritionLogs)
      .where(and(eq(nutritionLogs.id, id), eq(nutritionLogs.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async update(id: string, userId: string, data: Partial<NutritionLogInsert>): Promise<NutritionLogRow | null> {
    const [row] = await this.db
      .update(nutritionLogs)
      .set(data)
      .where(and(eq(nutritionLogs.id, id), eq(nutritionLogs.userId, userId)))
      .returning()
    return row ?? null
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(nutritionLogs)
      .where(and(eq(nutritionLogs.id, id), eq(nutritionLogs.userId, userId)))
      .returning({ id: nutritionLogs.id })
    return result.length > 0
  }

  async getDailySummary(userId: string, date: Date): Promise<{
    meals: number
    totalCalories: number
    totalProtein: number
    totalCarbs: number
    totalFat: number
    totalFiber: number
    totalWater: number
  }> {
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    const [row] = await this.db
      .select({
        meals: count(),
        totalCalories: sum(nutritionLogs.calories),
        totalProtein: sum(nutritionLogs.proteinG),
        totalCarbs: sum(nutritionLogs.carbsG),
        totalFat: sum(nutritionLogs.fatG),
        totalFiber: sum(nutritionLogs.fiberG),
        totalWater: sum(nutritionLogs.waterMl),
      })
      .from(nutritionLogs)
      .where(
        and(
          eq(nutritionLogs.userId, userId),
          gte(nutritionLogs.loggedAt, dayStart),
          lte(nutritionLogs.loggedAt, dayEnd),
        ),
      )

    return {
      meals: row?.meals ?? 0,
      totalCalories: Number(row?.totalCalories ?? 0),
      totalProtein: Number(row?.totalProtein ?? 0),
      totalCarbs: Number(row?.totalCarbs ?? 0),
      totalFat: Number(row?.totalFat ?? 0),
      totalFiber: Number(row?.totalFiber ?? 0),
      totalWater: Number(row?.totalWater ?? 0),
    }
  }

  async getWeeklyAverage(userId: string): Promise<{
    avgCalories: number
    avgProtein: number
    avgCarbs: number
    avgFat: number
  }> {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const [row] = await this.db
      .select({
        avgCalories: avg(nutritionLogs.calories),
        avgProtein: avg(nutritionLogs.proteinG),
        avgCarbs: avg(nutritionLogs.carbsG),
        avgFat: avg(nutritionLogs.fatG),
      })
      .from(nutritionLogs)
      .where(
        and(
          eq(nutritionLogs.userId, userId),
          gte(nutritionLogs.loggedAt, weekAgo),
        ),
      )

    return {
      avgCalories: Math.round(Number(row?.avgCalories ?? 0)),
      avgProtein: Math.round(Number(row?.avgProtein ?? 0)),
      avgCarbs: Math.round(Number(row?.avgCarbs ?? 0)),
      avgFat: Math.round(Number(row?.avgFat ?? 0)),
    }
  }
}
