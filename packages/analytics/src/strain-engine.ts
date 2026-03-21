import { getDb, healthMetrics, events } from "@biosync-io/db"
import { and, eq, gte, lte, desc, asc, sql } from "drizzle-orm"

// ── Types ───────────────────────────────────────────────────────

export interface TrainingLoadResult {
  /** Acute Training Load — 7-day EWMA */
  atl: number
  /** Chronic Training Load — 42-day EWMA */
  ctl: number
  /** Training Stress Balance: CTL - ATL (positive = fresh, negative = fatigued) */
  tsb: number
  /** Fitness indicator (same as CTL) */
  fitness: number
  /** Fatigue indicator (same as ATL) */
  fatigue: number
  /** Readiness derived from TSB: "peaked" | "fresh" | "neutral" | "fatigued" | "overreached" */
  status: TrainingStatus
  /** Daily strain values used in computation */
  dailyStrain: DailyStrain[]
  /** Date this load applies to */
  date: string
}

export type TrainingStatus = "peaked" | "fresh" | "neutral" | "fatigued" | "overreached"

export interface DailyStrain {
  date: string
  strain: number
  workoutCount: number
  totalDurationMin: number
  totalCalories: number
}

// ── EWMA Constants ──────────────────────────────────────────────

/** ATL decay constant: 2 / (7 + 1) */
const ATL_DECAY = 2 / (7 + 1)
/** CTL decay constant: 2 / (42 + 1) */
const CTL_DECAY = 2 / (42 + 1)
/** Number of days to look back for CTL computation */
const CTL_WINDOW_DAYS = 60

// ── Training Load Engine ────────────────────────────────────────

/**
 * Computes training load using the Impulse-Response model:
 *
 * - **Daily Strain**: Per-day training stress from workouts + activity
 * - **ATL (Acute Training Load)**: 7-day EWMA of daily strain → fatigue
 * - **CTL (Chronic Training Load)**: 42-day EWMA of daily strain → fitness
 * - **TSB (Training Stress Balance)**: CTL - ATL → form/freshness
 *
 * Positive TSB = fresh/peaked, Negative TSB = fatigued/overreached
 */
export async function computeTrainingLoad(
  userId: string,
  date: Date = new Date(),
): Promise<TrainingLoadResult> {
  const db = getDb()
  const targetDate = new Date(date)
  targetDate.setHours(0, 0, 0, 0)

  // Look back far enough for CTL's 42-day window to stabilize
  const lookbackStart = new Date(targetDate)
  lookbackStart.setDate(lookbackStart.getDate() - CTL_WINDOW_DAYS)

  const dailyStrain = await computeDailyStrainSeries(db, userId, lookbackStart, targetDate)

  // Compute EWMA for ATL and CTL
  let atl = 0
  let ctl = 0

  for (const day of dailyStrain) {
    atl = atl + ATL_DECAY * (day.strain - atl)
    ctl = ctl + CTL_DECAY * (day.strain - ctl)
  }

  atl = Math.round(atl * 10) / 10
  ctl = Math.round(ctl * 10) / 10
  const tsb = Math.round((ctl - atl) * 10) / 10

  const status = tsbToStatus(tsb)

  // Return only the last 14 days of strain for the response
  const recentStrain = dailyStrain.slice(-14)

  return {
    atl,
    ctl,
    tsb,
    fitness: ctl,
    fatigue: atl,
    status,
    dailyStrain: recentStrain,
    date: targetDate.toISOString().slice(0, 10),
  }
}

/**
 * Compute daily strain for each day in the window.
 * Strain is a 0–100+ score derived from workout intensity and volume.
 */
async function computeDailyStrainSeries(
  db: ReturnType<typeof getDb>,
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<DailyStrain[]> {
  // Fetch all workouts in the period
  const workoutRows = await db
    .select({
      startedAt: events.startedAt,
      durationSeconds: events.durationSeconds,
      caloriesKcal: events.caloriesKcal,
      avgHeartRate: events.avgHeartRate,
      maxHeartRate: events.maxHeartRate,
    })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.eventType, "workout"),
        gte(events.startedAt, startDate),
        lte(events.startedAt, endDate),
      ),
    )
    .orderBy(asc(events.startedAt))

  // Fetch daily active minutes and steps as supplementary strain signal
  const activityRows = await db
    .select({
      date: sql<string>`date_trunc('day', ${healthMetrics.recordedAt})::date::text`,
      metricType: healthMetrics.metricType,
      total: sql<number>`coalesce(sum(${healthMetrics.value}), 0)`,
    })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        gte(healthMetrics.recordedAt, startDate),
        lte(healthMetrics.recordedAt, endDate),
        sql`${healthMetrics.metricType} IN ('active_minutes', 'steps', 'calories')`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${healthMetrics.recordedAt})::date`, healthMetrics.metricType)

  // Group workouts by date
  const workoutsByDate = new Map<string, typeof workoutRows>()
  for (const w of workoutRows) {
    const dateKey = new Date(w.startedAt).toISOString().slice(0, 10)
    const arr = workoutsByDate.get(dateKey) ?? []
    arr.push(w)
    workoutsByDate.set(dateKey, arr)
  }

  // Group activity by date
  const activityByDate = new Map<string, Map<string, number>>()
  for (const a of activityRows) {
    let dateMap = activityByDate.get(a.date)
    if (!dateMap) {
      dateMap = new Map()
      activityByDate.set(a.date, dateMap)
    }
    dateMap.set(a.metricType, a.total)
  }

  // Build daily strain series
  const result: DailyStrain[] = []
  const current = new Date(startDate)

  while (current <= endDate) {
    const dateKey = current.toISOString().slice(0, 10)
    const dayWorkouts = workoutsByDate.get(dateKey) ?? []
    const dayActivity = activityByDate.get(dateKey)

    let workoutStrain = 0
    let totalDuration = 0
    let totalCals = 0

    for (const w of dayWorkouts) {
      const durationMin = (w.durationSeconds ?? 0) / 60
      totalDuration += durationMin
      totalCals += w.caloriesKcal ?? 0

      // TRIMP-like strain: duration × intensity factor
      let intensity = 0.5 // default moderate
      if (w.avgHeartRate && w.maxHeartRate && w.maxHeartRate > 0) {
        intensity = w.avgHeartRate / w.maxHeartRate
      }

      // Strain formula: duration_min × intensity² × scaling_factor
      // Scaled so a 60-min workout at 75% intensity ≈ 35 strain
      workoutStrain += durationMin * (intensity * intensity) * 1.05
    }

    // Supplementary strain from active minutes (for non-tracked activity)
    const activeMin = dayActivity?.get("active_minutes") ?? 0
    const passiveStrain = Math.min(15, activeMin * 0.2) // cap at 15 to not overshadow workouts

    const strain = Math.round((workoutStrain + (dayWorkouts.length === 0 ? passiveStrain : 0)) * 10) / 10

    result.push({
      date: dateKey,
      strain,
      workoutCount: dayWorkouts.length,
      totalDurationMin: Math.round(totalDuration),
      totalCalories: Math.round(totalCals),
    })

    current.setDate(current.getDate() + 1)
  }

  return result
}

// ── Helpers ─────────────────────────────────────────────────────

function tsbToStatus(tsb: number): TrainingStatus {
  if (tsb >= 20) return "peaked"
  if (tsb >= 5) return "fresh"
  if (tsb >= -5) return "neutral"
  if (tsb >= -20) return "fatigued"
  return "overreached"
}
