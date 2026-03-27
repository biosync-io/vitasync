import { getDb, pointsTransactions, users } from "@biosync-io/db"
import type { PointsTransactionInsert, PointsTransactionRow } from "@biosync-io/db"
import { and, desc, eq, gte, sql } from "drizzle-orm"

/** Point values for different actions */
export const POINT_VALUES = {
  goal_completed: 10,
  achievement_bronze: 25,
  achievement_silver: 50,
  achievement_gold: 100,
  achievement_platinum: 150,
  achievement_diamond: 250,
  challenge_won: 200,
  challenge_participated: 25,
  streak_7d: 15,
  streak_30d: 50,
  streak_100d: 150,
  streak_365d: 500,
  daily_check_in: 5,
} as const

export interface LeaderboardEntry {
  userId: string
  displayName: string | null
  totalPoints: number
  rank: number
}

/**
 * Points Service — Gamification points ledger & leaderboard.
 *
 * Awards points for completing goals, unlocking achievements, winning
 * challenges, and maintaining streaks. Provides workspace-scoped
 * leaderboards for social competition.
 */
export class PointsService {
  private get db() {
    return getDb()
  }

  // ── Award Points ──────────────────────────────────────────────────

  async awardPoints(data: {
    userId: string
    points: number
    reason: string
    description: string
    relatedType?: string
    relatedId?: string
  }): Promise<PointsTransactionRow> {
    const [row] = await this.db
      .insert(pointsTransactions)
      .values(data)
      .returning()

    // Update denormalised total on user row
    await this.db
      .update(users)
      .set({
        totalPoints: sql`${users.totalPoints} + ${data.points}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, data.userId))

    return row!
  }

  /**
   * Award points for a completed goal.
   */
  async awardGoalCompletion(userId: string, goalId: string, goalName: string): Promise<PointsTransactionRow> {
    return this.awardPoints({
      userId,
      points: POINT_VALUES.goal_completed,
      reason: "goal_completed",
      description: `Completed goal: ${goalName}`,
      relatedType: "goal",
      relatedId: goalId,
    })
  }

  /**
   * Award points for an unlocked achievement based on its tier.
   */
  async awardAchievement(userId: string, achievementId: string, name: string, tier: string): Promise<PointsTransactionRow> {
    const tierKey = `achievement_${tier}` as keyof typeof POINT_VALUES
    const points = POINT_VALUES[tierKey] ?? POINT_VALUES.achievement_bronze

    return this.awardPoints({
      userId,
      points,
      reason: "achievement_unlocked",
      description: `Unlocked achievement: ${name} (${tier})`,
      relatedType: "achievement",
      relatedId: achievementId,
    })
  }

  /**
   * Award points for a streak milestone.
   */
  async awardStreak(userId: string, streakDays: number, goalId?: string): Promise<PointsTransactionRow | null> {
    const milestones = [
      { days: 365, key: "streak_365d" as const },
      { days: 100, key: "streak_100d" as const },
      { days: 30, key: "streak_30d" as const },
      { days: 7, key: "streak_7d" as const },
    ]

    const milestone = milestones.find((m) => streakDays === m.days)
    if (!milestone) return null

    return this.awardPoints({
      userId,
      points: POINT_VALUES[milestone.key],
      reason: "streak_milestone",
      description: `Reached ${streakDays}-day streak!`,
      relatedType: goalId ? "goal" : undefined,
      relatedId: goalId,
    })
  }

  // ── Query ─────────────────────────────────────────────────────────

  async getBalance(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ totalPoints: users.totalPoints })
      .from(users)
      .where(eq(users.id, userId))
    return row?.totalPoints ?? 0
  }

  async getHistory(userId: string, opts: { limit?: number; since?: Date } = {}): Promise<PointsTransactionRow[]> {
    const conditions = [eq(pointsTransactions.userId, userId)]
    if (opts.since) conditions.push(gte(pointsTransactions.createdAt, opts.since))

    return this.db
      .select()
      .from(pointsTransactions)
      .where(and(...conditions))
      .orderBy(desc(pointsTransactions.createdAt))
      .limit(opts.limit ?? 50)
  }

  // ── Leaderboard ───────────────────────────────────────────────────

  async getLeaderboard(workspaceId: string, opts: { limit?: number; period?: "week" | "month" | "all" } = {}): Promise<LeaderboardEntry[]> {
    const limit = opts.limit ?? 20

    if (opts.period === "all" || !opts.period) {
      // Use denormalised totalPoints for all-time leaderboard
      const rows = await this.db
        .select({
          userId: users.id,
          displayName: users.displayName,
          totalPoints: users.totalPoints,
        })
        .from(users)
        .where(eq(users.workspaceId, workspaceId))
        .orderBy(desc(users.totalPoints))
        .limit(limit)

      return rows.map((r, i) => ({
        userId: r.userId,
        displayName: r.displayName,
        totalPoints: r.totalPoints,
        rank: i + 1,
      }))
    }

    // Period-based leaderboard from transactions
    const since = new Date()
    if (opts.period === "week") since.setDate(since.getDate() - 7)
    else since.setMonth(since.getMonth() - 1)

    const rows = await this.db
      .select({
        userId: pointsTransactions.userId,
        displayName: users.displayName,
        totalPoints: sql<number>`cast(sum(${pointsTransactions.points}) as int)`,
      })
      .from(pointsTransactions)
      .innerJoin(users, eq(pointsTransactions.userId, users.id))
      .where(
        and(
          eq(users.workspaceId, workspaceId),
          gte(pointsTransactions.createdAt, since),
        ),
      )
      .groupBy(pointsTransactions.userId, users.displayName)
      .orderBy(sql`sum(${pointsTransactions.points}) desc`)
      .limit(limit)

    return rows.map((r, i) => ({
      userId: r.userId,
      displayName: r.displayName,
      totalPoints: r.totalPoints,
      rank: i + 1,
    }))
  }
}
