import {
  getDb,
  smartReminders,
  reminderLogs,
  goals,
  goalProgress,
} from "@biosync-io/db"
import type {
  SmartReminderInsert,
  SmartReminderRow,
  ReminderLogInsert,
  ReminderLogRow,
} from "@biosync-io/db"
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"

/**
 * Smart Reminder Service — CRUD + scheduling logic for smart reminders.
 *
 * Handles creation, scheduling, snoozing, dismissing, and evaluation
 * of smart reminders. Works with the reminder worker processor for
 * timed delivery.
 */
export class SmartReminderService {
  private get db() {
    return getDb()
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  async create(data: Omit<SmartReminderInsert, "id" | "createdAt" | "updatedAt">): Promise<SmartReminderRow> {
    const nextTriggerAt = this.computeNextTrigger(data)
    const [row] = await this.db
      .insert(smartReminders)
      .values({ ...data, nextTriggerAt })
      .returning()
    return row!
  }

  async list(userId: string, opts: { active?: boolean } = {}): Promise<SmartReminderRow[]> {
    const conditions = [eq(smartReminders.userId, userId)]
    if (opts.active !== undefined) conditions.push(eq(smartReminders.isActive, opts.active))

    return this.db
      .select()
      .from(smartReminders)
      .where(and(...conditions))
      .orderBy(desc(smartReminders.createdAt))
  }

  async findById(id: string, userId: string): Promise<SmartReminderRow | null> {
    const [row] = await this.db
      .select()
      .from(smartReminders)
      .where(and(eq(smartReminders.id, id), eq(smartReminders.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async update(
    id: string,
    userId: string,
    data: Partial<Pick<SmartReminderInsert, "name" | "description" | "frequency" | "timeOfDay" | "dayOfWeek" | "dayOfMonth" | "timezone" | "channelIds" | "config" | "isActive" | "goalId">>,
  ): Promise<SmartReminderRow | null> {
    const existing = await this.findById(id, userId)
    if (!existing) return null

    const merged = { ...existing, ...data }
    const nextTriggerAt = data.isActive === false ? null : this.computeNextTrigger(merged)

    const [row] = await this.db
      .update(smartReminders)
      .set({ ...data, nextTriggerAt, updatedAt: new Date() })
      .where(and(eq(smartReminders.id, id), eq(smartReminders.userId, userId)))
      .returning()
    return row ?? null
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(smartReminders)
      .where(and(eq(smartReminders.id, id), eq(smartReminders.userId, userId)))
      .returning({ id: smartReminders.id })
    return result.length > 0
  }

  // ── Snooze & Dismiss ──────────────────────────────────────────────

  async snooze(id: string, userId: string, durationMinutes: number): Promise<SmartReminderRow | null> {
    const snoozedUntil = new Date(Date.now() + durationMinutes * 60 * 1000)
    const [row] = await this.db
      .update(smartReminders)
      .set({ snoozedUntil, updatedAt: new Date() })
      .where(and(eq(smartReminders.id, id), eq(smartReminders.userId, userId)))
      .returning()

    if (row) {
      await this.db.insert(reminderLogs).values({
        reminderId: id,
        userId,
        action: "snoozed",
        snoozeDuration: durationMinutes,
      })
    }

    return row ?? null
  }

  async dismiss(id: string, userId: string): Promise<SmartReminderRow | null> {
    const [row] = await this.db
      .update(smartReminders)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(smartReminders.id, id), eq(smartReminders.userId, userId)))
      .returning()

    if (row) {
      await this.db.insert(reminderLogs).values({
        reminderId: id,
        userId,
        action: "dismissed",
      })
    }

    return row ?? null
  }

  // ── Logs ──────────────────────────────────────────────────────────

  async getLogs(userId: string, opts: { reminderId?: string; limit?: number } = {}): Promise<ReminderLogRow[]> {
    const conditions = [eq(reminderLogs.userId, userId)]
    if (opts.reminderId) conditions.push(eq(reminderLogs.reminderId, opts.reminderId))

    return this.db
      .select()
      .from(reminderLogs)
      .where(and(...conditions))
      .orderBy(desc(reminderLogs.createdAt))
      .limit(opts.limit ?? 50)
  }

  // ── Scheduling ────────────────────────────────────────────────────

  /**
   * Fetch reminders that are due to fire (nextTriggerAt <= now, active, not snoozed).
   */
  async getDueReminders(batchSize = 50): Promise<SmartReminderRow[]> {
    const now = new Date()
    return this.db
      .select()
      .from(smartReminders)
      .where(
        and(
          eq(smartReminders.isActive, true),
          lte(smartReminders.nextTriggerAt, now),
        ),
      )
      .limit(batchSize)
  }

  /**
   * After firing a reminder, update timestamps and compute next trigger.
   */
  async markTriggered(id: string): Promise<void> {
    const [reminder] = await this.db
      .select()
      .from(smartReminders)
      .where(eq(smartReminders.id, id))

    if (!reminder) return

    const nextTriggerAt = this.computeNextTrigger(reminder)
    await this.db
      .update(smartReminders)
      .set({
        lastTriggeredAt: new Date(),
        nextTriggerAt,
        snoozedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(smartReminders.id, id))
  }

  /**
   * Build a smart notification body by checking the linked goal's progress.
   */
  async buildReminderContext(reminder: SmartReminderRow): Promise<{
    title: string
    body: string
    progressSnapshot: Record<string, unknown> | null
  }> {
    if (!reminder.goalId) {
      return {
        title: `⏰ ${reminder.name}`,
        body: reminder.description ?? "Time to check in on your health!",
        progressSnapshot: null,
      }
    }

    const [goal] = await this.db
      .select()
      .from(goals)
      .where(eq(goals.id, reminder.goalId))

    if (!goal) {
      return {
        title: `⏰ ${reminder.name}`,
        body: reminder.description ?? "Time to check in on your health!",
        progressSnapshot: null,
      }
    }

    const pct = goal.targetValue > 0
      ? Math.round(((goal.currentValue ?? 0) / goal.targetValue) * 100)
      : 0

    const progressSnapshot = {
      goalName: goal.name,
      currentValue: goal.currentValue,
      targetValue: goal.targetValue,
      unit: goal.unit,
      percentComplete: pct,
      currentStreak: goal.currentStreak,
    }

    let body: string
    if (pct >= 100) {
      body = `🎉 Great job! You've already completed "${goal.name}" (${pct}%). Keep the momentum going!`
    } else if (pct >= 75) {
      body = `💪 Almost there! "${goal.name}" is at ${pct}%. Just a little more to reach your target of ${goal.targetValue} ${goal.unit ?? ""}.`
    } else if (pct >= 50) {
      body = `📊 You're halfway on "${goal.name}" (${pct}%). ${goal.targetValue - (goal.currentValue ?? 0)} ${goal.unit ?? ""} left to go!`
    } else if (pct > 0) {
      body = `🏃 "${goal.name}" is at ${pct}%. You've got ${goal.targetValue - (goal.currentValue ?? 0)} ${goal.unit ?? ""} remaining — you can do it!`
    } else {
      body = `⏰ Time to work on "${goal.name}"! Your target is ${goal.targetValue} ${goal.unit ?? ""} ${goal.cadence}.`
    }

    if ((goal.currentStreak ?? 0) > 0) {
      body += ` 🔥 ${goal.currentStreak}-day streak!`
    }

    return {
      title: `⏰ ${reminder.name}`,
      body,
      progressSnapshot,
    }
  }

  /**
   * Get suggested tasks the user may have forgotten about (incomplete goals
   * with no recent progress).
   */
  async getSuggestions(userId: string, limit = 5): Promise<Array<{ goalId: string; goalName: string; percentComplete: number; lastActivity: Date | null }>> {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

    const activeGoals = await this.db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.isActive, true)))
      .orderBy(goals.updatedAt)
      .limit(limit * 2)

    const suggestions: Array<{ goalId: string; goalName: string; percentComplete: number; lastActivity: Date | null }> = []

    for (const goal of activeGoals) {
      const pct = goal.targetValue > 0
        ? Math.round(((goal.currentValue ?? 0) / goal.targetValue) * 100)
        : 0

      if (pct >= 100) continue

      const lastUpdated = goal.updatedAt
      if (lastUpdated && lastUpdated < threeDaysAgo) {
        suggestions.push({
          goalId: goal.id,
          goalName: goal.name,
          percentComplete: pct,
          lastActivity: lastUpdated,
        })
      }

      if (suggestions.length >= limit) break
    }

    return suggestions
  }

  // ── Private Helpers ───────────────────────────────────────────────

  private computeNextTrigger(
    data: Pick<SmartReminderInsert, "frequency" | "timeOfDay" | "dayOfWeek" | "dayOfMonth" | "timezone">,
  ): Date {
    const now = new Date()
    const [hours, minutes] = (data.timeOfDay ?? "09:00").split(":").map(Number)

    const next = new Date(now)
    next.setSeconds(0, 0)
    next.setHours(hours!, minutes!)

    switch (data.frequency) {
      case "daily":
        if (next <= now) next.setDate(next.getDate() + 1)
        break
      case "weekly": {
        const targetDay = data.dayOfWeek ?? 1
        const currentDay = next.getDay()
        let daysAhead = targetDay - currentDay
        if (daysAhead < 0 || (daysAhead === 0 && next <= now)) daysAhead += 7
        next.setDate(next.getDate() + daysAhead)
        break
      }
      case "monthly": {
        const targetDate = data.dayOfMonth ?? 1
        next.setDate(targetDate)
        if (next <= now) next.setMonth(next.getMonth() + 1)
        break
      }
      default:
        if (next <= now) next.setDate(next.getDate() + 1)
    }

    return next
  }
}
