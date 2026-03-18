import { getDb, healthMetrics } from "@biosync-io/db"
import { and, eq, gte, lte, desc, sql } from "drizzle-orm"

// ── Types ───────────────────────────────────────────────────────

export interface BodyScoreResult {
  /** Composite body score 0–100 */
  score: number
  /** Individual components */
  components: BodyScoreComponents
  /** Date this score applies to */
  date: string
}

export interface BodyScoreComponents {
  weightStability: ComponentScore | null
  bodyComposition: ComponentScore | null
  bmi: ComponentScore | null
}

export interface ComponentScore {
  score: number
  detail: string
}

// ── Body Score Engine ───────────────────────────────────────────

/**
 * Computes a body composition score (0–100) from:
 * - Weight stability: consistency over 14 days (low variance = good)
 * - Body composition: body fat % in healthy range
 * - BMI: within normal range
 *
 * Fills the `body_score` field in health_scores.
 */
export async function computeBodyScore(
  userId: string,
  date: Date = new Date(),
): Promise<BodyScoreResult> {
  const db = getDb()
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  const [weightStability, bodyComposition, bmiScore] = await Promise.all([
    computeWeightStability(db, userId, dayStart),
    computeBodyComposition(db, userId, dayStart),
    computeBmiScore(db, userId, dayStart),
  ])

  const components = [weightStability, bodyComposition, bmiScore].filter(
    (c): c is ComponentScore => c != null,
  )

  // Weighted average: stability 40%, composition 35%, BMI 25%
  const weights = [0.40, 0.35, 0.25]
  let totalWeight = 0
  let weightedSum = 0
  const ordered = [weightStability, bodyComposition, bmiScore]

  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i]) {
      weightedSum += ordered[i]!.score * weights[i]!
      totalWeight += weights[i]!
    }
  }

  const score = totalWeight > 0 ? Math.round(Math.min(100, Math.max(0, weightedSum / totalWeight)) * 10) / 10 : 50

  return {
    score,
    components: { weightStability, bodyComposition, bmi: bmiScore },
    date: dayStart.toISOString().slice(0, 10),
  }
}

// ── Component Computations ──────────────────────────────────────

async function computeWeightStability(
  db: ReturnType<typeof getDb>,
  userId: string,
  dayStart: Date,
): Promise<ComponentScore | null> {
  const fourteenDaysAgo = new Date(dayStart)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  const rows = await db
    .select({ value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, "weight"),
        gte(healthMetrics.recordedAt, fourteenDaysAgo),
        lte(healthMetrics.recordedAt, dayStart),
      ),
    )
    .orderBy(desc(healthMetrics.recordedAt))

  const values = rows.map((r) => r.value).filter((v): v is number => v != null)
  if (values.length < 2) return null

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0 // coefficient of variation

  // CV < 1% = very stable = score 95
  // CV 1-2% = stable = score 80
  // CV 2-5% = moderate fluctuation = score 60
  // CV > 5% = high fluctuation = score 35
  let score: number
  if (cv < 0.01) score = 95
  else if (cv < 0.02) score = 80
  else if (cv < 0.05) score = 60
  else score = 35

  return { score, detail: `Weight CV ${(cv * 100).toFixed(1)}% over ${values.length} readings` }
}

async function computeBodyComposition(
  db: ReturnType<typeof getDb>,
  userId: string,
  dayStart: Date,
): Promise<ComponentScore | null> {
  const sevenDaysAgo = new Date(dayStart)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [row] = await db
    .select({ value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, "body_fat"),
        gte(healthMetrics.recordedAt, sevenDaysAgo),
        lte(healthMetrics.recordedAt, dayStart),
      ),
    )
    .orderBy(desc(healthMetrics.recordedAt))
    .limit(1)

  if (!row?.value) return null

  const bf = row.value
  // Healthy body fat ranges (simplified, gender-agnostic midpoint)
  // 10-20% = athletic/fit, 20-25% = healthy, 25-30% = moderate, >30% = elevated
  let score: number
  if (bf >= 10 && bf <= 20) score = 95
  else if (bf > 20 && bf <= 25) score = 80
  else if (bf > 25 && bf <= 30) score = 60
  else if (bf > 30 && bf <= 35) score = 40
  else if (bf < 10) score = 70 // too low can be unhealthy
  else score = 25

  return { score, detail: `Body fat ${bf.toFixed(1)}%` }
}

async function computeBmiScore(
  db: ReturnType<typeof getDb>,
  userId: string,
  dayStart: Date,
): Promise<ComponentScore | null> {
  const sevenDaysAgo = new Date(dayStart)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [row] = await db
    .select({ value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.userId, userId),
        eq(healthMetrics.metricType, "bmi"),
        gte(healthMetrics.recordedAt, sevenDaysAgo),
        lte(healthMetrics.recordedAt, dayStart),
      ),
    )
    .orderBy(desc(healthMetrics.recordedAt))
    .limit(1)

  if (!row?.value) return null

  const bmi = row.value
  // WHO BMI classification
  let score: number
  if (bmi >= 18.5 && bmi <= 24.9) score = 95
  else if (bmi >= 25 && bmi <= 27.5) score = 75
  else if (bmi >= 27.5 && bmi <= 29.9) score = 60
  else if (bmi >= 30 && bmi <= 34.9) score = 40
  else if (bmi < 18.5) score = 55 // underweight
  else score = 25 // obese class 2+

  return { score, detail: `BMI ${bmi.toFixed(1)}` }
}
