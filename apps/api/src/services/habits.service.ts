import { getDb, habits, habitLogs } from "@biosync-io/db"
import type { HabitInsert, HabitRow, HabitLogInsert, HabitLogRow } from "@biosync-io/db"
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"

/**
 * Habits Tracking Service
 *
 * Manages habit definitions, daily completions, and streak calculations.
 */
export class HabitsService {
  private get db() {
    return getDb()
  }

  // ── Habit CRUD ───────────────────────────────────────────────

  async createHabit(data: Omit<HabitInsert, "id" | "createdAt" | "updatedAt" | "currentStreak" | "longestStreak">): Promise<HabitRow> {
    const [row] = await this.db.insert(habits).values(data).returning()
    return row!
  }

  async listHabits(userId: string, opts: { active?: boolean } = {}): Promise<HabitRow[]> {
    const conditions = [eq(habits.userId, userId)]
    if (opts.active !== undefined) conditions.push(eq(habits.active, opts.active))

    return this.db
      .select()
      .from(habits)
      .where(and(...conditions))
      .orderBy(desc(habits.createdAt))
  }

  async updateHabit(id: string, userId: string, data: Partial<Pick<HabitInsert, "name" | "icon" | "color" | "frequency" | "targetDays" | "active">>): Promise<HabitRow | null> {
    const [row] = await this.db
      .update(habits)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(habits.id, id), eq(habits.userId, userId)))
      .returning()
    return row ?? null
  }

  async deleteHabit(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(habits)
      .where(and(eq(habits.id, id), eq(habits.userId, userId)))
      .returning({ id: habits.id })
    return result.length > 0
  }

  // ── Habit Completions ────────────────────────────────────────

  async logCompletion(data: Omit<HabitLogInsert, "id" | "createdAt">): Promise<HabitLogRow> {
    const [row] = await this.db.insert(habitLogs).values(data).returning()

    // Update streak
    await this.recalculateStreak(data.habitId, data.userId)

    return row!
  }

  async removeCompletion(habitId: string, userId: string, date: string): Promise<boolean> {
    const result = await this.db
      .delete(habitLogs)
      .where(
        and(
          eq(habitLogs.habitId, habitId),
          eq(habitLogs.userId, userId),
          eq(habitLogs.completedDate, date),
        ),
      )
      .returning({ id: habitLogs.id })

    if (result.length > 0) {
      await this.recalculateStreak(habitId, userId)
    }
    return result.length > 0
  }

  async getCompletions(userId: string, opts: { from?: string; to?: string; habitId?: string } = {}): Promise<HabitLogRow[]> {
    const conditions = [eq(habitLogs.userId, userId)]
    if (opts.habitId) conditions.push(eq(habitLogs.habitId, opts.habitId))
    if (opts.from) conditions.push(gte(habitLogs.completedDate, opts.from))
    if (opts.to) conditions.push(lte(habitLogs.completedDate, opts.to))

    return this.db
      .select()
      .from(habitLogs)
      .where(and(...conditions))
      .orderBy(desc(habitLogs.completedDate))
      .limit(500)
  }

  // ── Streak Calculation ───────────────────────────────────────

  private async recalculateStreak(habitId: string, userId: string): Promise<void> {
    const logs = await this.db
      .select({ completedDate: habitLogs.completedDate })
      .from(habitLogs)
      .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.userId, userId)))
      .orderBy(desc(habitLogs.completedDate))
      .limit(365)

    const dates: string[] = logs.map((l) => l.completedDate).filter((d, i, arr) => arr.indexOf(d) === i)

    let currentStreak = 0
    const today = new Date().toISOString().slice(0, 10)

    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      if (dates[i] === expected) {
        currentStreak++
      } else {
        break
      }
    }

    // Calculate longest streak
    let longestStreak = currentStreak
    let streak = 1
    const sortedDates = [...dates].sort()
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]!)
      const curr = new Date(sortedDates[i]!)
      const diff = (curr.getTime() - prev.getTime()) / 86400000
      if (diff === 1) {
        streak++
        longestStreak = Math.max(longestStreak, streak)
      } else {
        streak = 1
      }
    }

    await this.db
      .update(habits)
      .set({ currentStreak, longestStreak, updatedAt: new Date() })
      .where(eq(habits.id, habitId))
  }

  // ── Summary ──────────────────────────────────────────────────

  async getDailySummary(userId: string, date?: string): Promise<{
    totalHabits: number
    completedToday: number
    completionRate: number
    habits: Array<{ id: string; name: string; icon: string; completed: boolean; currentStreak: number; longestStreak: number }>
  }> {
    const d = date ?? new Date().toISOString().slice(0, 10)
    const allHabits = await this.listHabits(userId, { active: true })
    const todayLogs = await this.getCompletions(userId, { from: d, to: d })

    const completedIds = new Set(todayLogs.map((l) => l.habitId))

    const habitsList = allHabits.map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon ?? "✅",
      completed: completedIds.has(h.id),
      currentStreak: h.currentStreak,
      longestStreak: h.longestStreak,
    }))

    return {
      totalHabits: allHabits.length,
      completedToday: completedIds.size,
      completionRate: allHabits.length > 0 ? Math.round((completedIds.size / allHabits.length) * 100) : 0,
      habits: habitsList,
    }
  }
}
