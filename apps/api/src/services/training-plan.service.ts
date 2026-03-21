import { getDb, trainingPlans, events, healthMetrics } from "@biosync-io/db"
import type { TrainingPlanInsert, TrainingPlanRow } from "@biosync-io/db"
import { and, avg, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm"

export class TrainingPlanService {
  private get db() {
    return getDb()
  }

  async list(userId: string, opts: { status?: string; limit?: number } = {}): Promise<TrainingPlanRow[]> {
    const conditions = [eq(trainingPlans.userId, userId)]
    if (opts.status) conditions.push(eq(trainingPlans.status, opts.status))

    return this.db
      .select()
      .from(trainingPlans)
      .where(and(...conditions))
      .orderBy(desc(trainingPlans.createdAt))
      .limit(opts.limit ?? 20)
  }

  async findById(id: string, userId: string): Promise<TrainingPlanRow | null> {
    const [row] = await this.db
      .select()
      .from(trainingPlans)
      .where(and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async generate(userId: string, opts: {
    goal: string
    difficulty: string
    durationWeeks: number
    daysPerWeek: number
    focusAreas?: string[]
  }): Promise<TrainingPlanRow> {
    // Analyze recent workout data
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [recentStats] = await this.db
      .select({
        workoutCount: count(),
        avgDuration: avg(events.durationSeconds),
        totalCalories: sum(events.caloriesKcal),
      })
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          eq(events.eventType, "workout"),
          gte(events.startedAt, thirtyDaysAgo),
        ),
      )

    const workoutsPerWeek = Math.round((Number(recentStats?.workoutCount ?? 0) / 30) * 7 * 10) / 10
    const avgDurationMin = Math.round(Number(recentStats?.avgDuration ?? 1800) / 60)

    // Compute target durations based on difficulty
    const durationMultiplier = opts.difficulty === "beginner" ? 0.8 : opts.difficulty === "advanced" ? 1.3 : 1.0
    const targetDuration = Math.round(avgDurationMin * durationMultiplier)

    // Build a weekly schedule
    const weeklySchedule = this.buildWeeklySchedule(opts.daysPerWeek, opts.goal, targetDuration, opts.focusAreas)

    // Build weekly targets
    const weeklyTargets: Record<string, number>[] = []
    for (let w = 0; w < opts.durationWeeks; w++) {
      const progressFactor = 1 + (w / opts.durationWeeks) * 0.3
      weeklyTargets.push({
        week: w + 1,
        sessions: opts.daysPerWeek,
        totalMinutes: Math.round(targetDuration * opts.daysPerWeek * progressFactor),
        targetCalories: Math.round(300 * opts.daysPerWeek * progressFactor),
      })
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() + 1) // start tomorrow
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + opts.durationWeeks * 7)

    const [plan] = await this.db
      .insert(trainingPlans)
      .values({
        userId,
        name: `${opts.goal.charAt(0).toUpperCase() + opts.goal.slice(1)} ${opts.difficulty} Plan`,
        goal: opts.goal,
        difficulty: opts.difficulty,
        durationWeeks: opts.durationWeeks,
        startsAt: startDate,
        endsAt: endDate,
        status: "active",
        schedule: weeklySchedule as Record<string, unknown>[],
        weeklyTargets: weeklyTargets[0] ?? {},
        adaptive: true,
        currentWeek: 1,
        adherenceRate: 0,
      })
      .returning()

    return plan!
  }

  async updateProgress(planId: string, userId: string): Promise<TrainingPlanRow | null> {
    const plan = await this.findById(planId, userId)
    if (!plan || plan.status !== "active") return null

    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)

    const [weekStats] = await this.db
      .select({ workoutCount: count() })
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          eq(events.eventType, "workout"),
          gte(events.startedAt, weekStart),
        ),
      )

    const currentWeek = Math.max(1, Math.ceil(
      (Date.now() - plan.startsAt.getTime()) / (7 * 24 * 60 * 60 * 1000),
    ))

    const scheduledPerWeek = Array.isArray(plan.schedule) ? plan.schedule.length : 3
    const adherenceRate = scheduledPerWeek > 0
      ? Math.min(100, Math.round((Number(weekStats?.workoutCount ?? 0) / scheduledPerWeek) * 100))
      : 0

    const [updated] = await this.db
      .update(trainingPlans)
      .set({
        currentWeek: Math.min(currentWeek, plan.durationWeeks),
        adherenceRate,
        status: currentWeek > plan.durationWeeks ? "completed" : "active",
      })
      .where(eq(trainingPlans.id, planId))
      .returning()

    return updated ?? null
  }

  private buildWeeklySchedule(
    daysPerWeek: number,
    goal: string,
    targetDuration: number,
    focusAreas?: string[],
  ): Record<string, unknown>[] {
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    const restDays = 7 - daysPerWeek
    const schedule: Record<string, unknown>[] = []

    const workoutTypes = goal === "endurance"
      ? ["Long Run", "Tempo Run", "Easy Run", "Cross-Training", "Interval Training"]
      : goal === "strength"
        ? ["Upper Body", "Lower Body", "Full Body", "Core & Mobility", "Power Training"]
        : ["Cardio", "Strength", "HIIT", "Yoga/Mobility", "Mixed Training"]

    let workoutIdx = 0
    for (let d = 0; d < 7; d++) {
      if (d < daysPerWeek) {
        schedule.push({
          day: dayNames[d],
          type: workoutTypes[workoutIdx % workoutTypes.length],
          durationMinutes: targetDuration,
          intensity: workoutIdx % 3 === 0 ? "high" : workoutIdx % 3 === 1 ? "moderate" : "low",
          focus: focusAreas?.[workoutIdx % (focusAreas.length || 1)] ?? null,
        })
        workoutIdx++
      } else {
        schedule.push({ day: dayNames[d], type: "Rest", durationMinutes: 0, intensity: "rest" })
      }
    }

    return schedule
  }
}
