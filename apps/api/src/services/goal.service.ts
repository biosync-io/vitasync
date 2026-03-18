import { getDb, goals, goalProgress, healthMetrics } from "@biosync-io/db"
import type { GoalInsert, GoalRow, GoalProgressInsert, GoalProgressRow } from "@biosync-io/db"
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"

/**
 * Goals Service — Feature #2 & #3 (Goal Setting + Streak Tracking)
 *
 * CRUD for health goals with automatic progress tracking from synced metrics.
 * Supports daily/weekly/monthly cadences with streak counting.
 */
export class GoalService {
  private get db() {
    return getDb()
  }

  async create(data: Omit<GoalInsert, "id" | "createdAt" | "updatedAt">): Promise<GoalRow> {
    const [row] = await this.db.insert(goals).values(data).returning()
    return row!
  }

  async list(userId: string, opts: { category?: string; active?: boolean } = {}): Promise<GoalRow[]> {
    const conditions = [eq(goals.userId, userId)]
    if (opts.category) conditions.push(eq(goals.category, opts.category))
    if (opts.active !== undefined) conditions.push(eq(goals.isActive, opts.active))

    return this.db.select().from(goals).where(and(...conditions)).orderBy(desc(goals.createdAt))
  }

  async findById(id: string, userId: string): Promise<GoalRow | null> {
    const [row] = await this.db
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async update(id: string, userId: string, data: Partial<GoalInsert>): Promise<GoalRow | null> {
    const [row] = await this.db
      .update(goals)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
      .returning()
    return row ?? null
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
      .returning({ id: goals.id })
    return result.length > 0
  }

  async getProgress(goalId: string, opts: { from?: Date; to?: Date; limit?: number } = {}): Promise<GoalProgressRow[]> {
    const conditions = [eq(goalProgress.goalId, goalId)]
    if (opts.from) conditions.push(gte(goalProgress.date, opts.from))
    if (opts.to) conditions.push(lte(goalProgress.date, opts.to))

    return this.db
      .select()
      .from(goalProgress)
      .where(and(...conditions))
      .orderBy(desc(goalProgress.date))
      .limit(opts.limit ?? 30)
  }

  async evaluateProgress(userId: string, date: Date): Promise<number> {
    const activeGoals = await this.list(userId, { active: true })
    let goalsUpdated = 0

    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    for (const goal of activeGoals) {
      if (!goal.metricType) continue

      // Query metric for this day
      const metrics = await this.db
        .select({ value: healthMetrics.value })
        .from(healthMetrics)
        .where(
          and(
            eq(healthMetrics.userId, userId),
            eq(healthMetrics.metricType, goal.metricType),
            gte(healthMetrics.recordedAt, dayStart),
            lte(healthMetrics.recordedAt, dayEnd),
          ),
        )

      const total = metrics.reduce((s, m) => s + (m.value ?? 0), 0)
      const pct = Math.min(100, (total / goal.targetValue) * 100)
      const met = pct >= 100

      // Upsert progress
      await this.db.insert(goalProgress).values({
        goalId: goal.id,
        userId,
        date: dayStart,
        value: total,
        percentComplete: Math.round(pct * 10) / 10,
        met,
      }).onConflictDoNothing()

      // Update streak
      const currentStreak = met ? (goal.currentStreak ?? 0) + 1 : 0
      const longestStreak = Math.max(currentStreak, goal.longestStreak ?? 0)
      const bestValue = Math.max(total, goal.bestValue ?? 0)

      await this.db
        .update(goals)
        .set({
          currentValue: total,
          currentStreak,
          longestStreak,
          bestValue,
          updatedAt: new Date(),
        })
        .where(eq(goals.id, goal.id))

      goalsUpdated++
    }

    return goalsUpdated
  }
}
