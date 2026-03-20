import { getDb, journalEntries } from "@biosync-io/db"
import type { JournalEntryInsert, JournalEntryRow } from "@biosync-io/db"
import { and, desc, eq, gte, ilike, lte, or, sql, count } from "drizzle-orm"

/**
 * Daily Journal Service
 *
 * Manages journal entries with mood tagging, gratitude tracking,
 * and full-text search capabilities.
 */
export class JournalService {
  private get db() {
    return getDb()
  }

  async create(data: Omit<JournalEntryInsert, "id" | "createdAt" | "updatedAt">): Promise<JournalEntryRow> {
    const [row] = await this.db.insert(journalEntries).values(data).returning()
    return row!
  }

  async update(id: string, userId: string, data: Partial<Pick<JournalEntryInsert, "title" | "body" | "moodScore" | "moodLabel" | "gratitude" | "tags">>): Promise<JournalEntryRow | null> {
    const [row] = await this.db
      .update(journalEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
      .returning()
    return row ?? null
  }

  async list(userId: string, opts: { from?: Date; to?: Date; search?: string; tag?: string; limit?: number } = {}): Promise<JournalEntryRow[]> {
    const conditions = [eq(journalEntries.userId, userId)]
    if (opts.from) conditions.push(gte(journalEntries.entryDate, opts.from))
    if (opts.to) conditions.push(lte(journalEntries.entryDate, opts.to))
    if (opts.search) {
      conditions.push(
        or(
          ilike(journalEntries.title, `%${opts.search}%`),
          ilike(journalEntries.body, `%${opts.search}%`),
        )!,
      )
    }

    return this.db
      .select()
      .from(journalEntries)
      .where(and(...conditions))
      .orderBy(desc(journalEntries.entryDate))
      .limit(opts.limit ?? 50)
  }

  async findById(id: string, userId: string): Promise<JournalEntryRow | null> {
    const [row] = await this.db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
      .returning({ id: journalEntries.id })
    return result.length > 0
  }

  async getStats(userId: string, opts: { from?: Date; to?: Date } = {}): Promise<{
    totalEntries: number
    avgMoodScore: number
    streak: number
    topTags: string[]
    moodDistribution: Record<string, number>
  }> {
    const to = opts.to ?? new Date()
    const from = opts.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

    const rows = await this.list(userId, { from, to, limit: 1000 })
    if (rows.length === 0) {
      return { totalEntries: 0, avgMoodScore: 0, streak: 0, topTags: [], moodDistribution: {} }
    }

    const scores = rows.filter((r) => r.moodScore != null).map((r) => r.moodScore!)
    const avgMoodScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0

    // Calculate streak (consecutive days with entries)
    const sortedDates = rows
      .map((r) => new Date(r.entryDate).toISOString().slice(0, 10))
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .sort()
      .reverse()

    let streak = 0
    const today = new Date().toISOString().slice(0, 10)
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      if (sortedDates[i] === expected) {
        streak++
      } else {
        break
      }
    }

    // Tag frequency
    const tagCounts: Record<string, number> = {}
    for (const row of rows) {
      const tags = row.tags as string[] | null
      if (tags) {
        for (const t of tags) {
          tagCounts[t] = (tagCounts[t] ?? 0) + 1
        }
      }
    }
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t)

    // Mood distribution
    const moodDistribution: Record<string, number> = {}
    for (const row of rows) {
      if (row.moodLabel) {
        moodDistribution[row.moodLabel] = (moodDistribution[row.moodLabel] ?? 0) + 1
      }
    }

    return {
      totalEntries: rows.length,
      avgMoodScore: Math.round(avgMoodScore * 10) / 10,
      streak,
      topTags,
      moodDistribution,
    }
  }
}
