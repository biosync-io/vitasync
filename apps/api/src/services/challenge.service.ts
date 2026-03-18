import { getDb, challenges, challengeParticipants, healthMetrics, users } from "@biosync-io/db"
import type { ChallengeInsert, ChallengeRow, ChallengeParticipantRow } from "@biosync-io/db"
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"

/**
 * Challenges Service — Feature #5 (Social Challenges & Leaderboards)
 *
 * Users create/join fitness challenges within their workspace.
 * Leaderboards are dynamically computed from health metric aggregation.
 */
export class ChallengeService {
  private get db() {
    return getDb()
  }

  async create(data: Omit<ChallengeInsert, "id" | "createdAt" | "updatedAt">): Promise<ChallengeRow> {
    const [row] = await this.db.insert(challenges).values(data).returning()
    return row!
  }

  async list(workspaceId: string, opts: { status?: string; limit?: number } = {}): Promise<ChallengeRow[]> {
    const conditions = [eq(challenges.workspaceId, workspaceId)]
    if (opts.status) conditions.push(eq(challenges.status, opts.status))

    return this.db.select().from(challenges).where(and(...conditions)).orderBy(desc(challenges.createdAt)).limit(opts.limit ?? 50)
  }

  async findById(id: string): Promise<ChallengeRow | null> {
    const [row] = await this.db.select().from(challenges).where(eq(challenges.id, id)).limit(1)
    return row ?? null
  }

  async join(challengeId: string, userId: string): Promise<ChallengeParticipantRow> {
    const [row] = await this.db
      .insert(challengeParticipants)
      .values({ challengeId, userId, score: 0, dailyScores: {} })
      .returning()
    return row!
  }

  async leave(challengeId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(challengeParticipants)
      .where(and(eq(challengeParticipants.challengeId, challengeId), eq(challengeParticipants.userId, userId)))
      .returning({ id: challengeParticipants.id })
    return result.length > 0
  }

  async leaderboard(challengeId: string): Promise<Array<{ userId: string; displayName?: string; score: number; rank: number }>> {
    const participants = await this.db
      .select({
        userId: challengeParticipants.userId,
        displayName: users.displayName,
        score: challengeParticipants.score,
      })
      .from(challengeParticipants)
      .innerJoin(users, eq(users.id, challengeParticipants.userId))
      .where(eq(challengeParticipants.challengeId, challengeId))
      .orderBy(desc(challengeParticipants.score))

    return participants.map((p, i) => ({
      userId: p.userId,
      ...(p.displayName != null && { displayName: p.displayName }),
      score: p.score,
      rank: i + 1,
    }))
  }

  async updateScores(challengeId: string): Promise<number> {
    const challenge = await this.findById(challengeId)
    if (!challenge || challenge.status !== "active") return 0

    const participants = await this.db
      .select()
      .from(challengeParticipants)
      .where(eq(challengeParticipants.challengeId, challengeId))

    let updated = 0

    for (const participant of participants) {
      const metrics = await this.db
        .select({ value: healthMetrics.value, recordedAt: healthMetrics.recordedAt })
        .from(healthMetrics)
        .where(
          and(
            eq(healthMetrics.userId, participant.userId),
            eq(healthMetrics.metricType, challenge.metricType),
            gte(healthMetrics.recordedAt, challenge.startsAt),
            lte(healthMetrics.recordedAt, challenge.endsAt),
          ),
        )

      let score = 0
      const agg = challenge.aggregation
      const values = metrics.filter((m) => m.value != null).map((m) => m.value!)
      if (values.length > 0) {
        if (agg === "sum") score = values.reduce((a, b) => a + b, 0)
        else if (agg === "avg") score = values.reduce((a, b) => a + b, 0) / values.length
        else if (agg === "max") score = Math.max(...values)
        else if (agg === "min") score = Math.min(...values)
        else if (agg === "count") score = values.length
      }

      // Build daily scores
      const dailyScores: Record<string, number> = {}
      for (const m of metrics) {
        if (m.value == null) continue
        const dateKey = new Date(m.recordedAt).toISOString().slice(0, 10)
        dailyScores[dateKey] = (dailyScores[dateKey] ?? 0) + m.value
      }

      await this.db
        .update(challengeParticipants)
        .set({ score: Math.round(score * 100) / 100, dailyScores, updatedAt: new Date() })
        .where(eq(challengeParticipants.id, participant.id))

      updated++
    }

    // Update ranks
    const ranked = await this.db
      .select({ id: challengeParticipants.id })
      .from(challengeParticipants)
      .where(eq(challengeParticipants.challengeId, challengeId))
      .orderBy(desc(challengeParticipants.score))

    for (let i = 0; i < ranked.length; i++) {
      await this.db
        .update(challengeParticipants)
        .set({ rank: i + 1 })
        .where(eq(challengeParticipants.id, ranked[i]!.id))
    }

    return updated
  }

  async activate(id: string): Promise<ChallengeRow | null> {
    const [row] = await this.db
      .update(challenges)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(challenges.id, id))
      .returning()
    return row ?? null
  }

  async complete(id: string): Promise<ChallengeRow | null> {
    await this.updateScores(id)
    const [row] = await this.db
      .update(challenges)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(challenges.id, id))
      .returning()
    return row ?? null
  }
}
