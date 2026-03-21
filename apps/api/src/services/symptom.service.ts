import { getDb, symptomLogs } from "@biosync-io/db"
import type { SymptomLogInsert, SymptomLogRow } from "@biosync-io/db"
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm"

export class SymptomService {
  private get db() {
    return getDb()
  }

  async create(data: Omit<SymptomLogInsert, "id" | "createdAt">): Promise<SymptomLogRow> {
    const [row] = await this.db.insert(symptomLogs).values(data).returning()
    return row!
  }

  async list(userId: string, opts: { from?: Date; to?: Date; symptom?: string; limit?: number } = {}): Promise<SymptomLogRow[]> {
    const conditions = [eq(symptomLogs.userId, userId)]
    if (opts.from) conditions.push(gte(symptomLogs.startedAt, opts.from))
    if (opts.to) conditions.push(lte(symptomLogs.startedAt, opts.to))
    if (opts.symptom) conditions.push(eq(symptomLogs.symptom, opts.symptom))

    return this.db
      .select()
      .from(symptomLogs)
      .where(and(...conditions))
      .orderBy(desc(symptomLogs.startedAt))
      .limit(opts.limit ?? 50)
  }

  async findById(id: string, userId: string): Promise<SymptomLogRow | null> {
    const [row] = await this.db
      .select()
      .from(symptomLogs)
      .where(and(eq(symptomLogs.id, id), eq(symptomLogs.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async update(id: string, userId: string, data: Partial<SymptomLogInsert>): Promise<SymptomLogRow | null> {
    const [row] = await this.db
      .update(symptomLogs)
      .set(data)
      .where(and(eq(symptomLogs.id, id), eq(symptomLogs.userId, userId)))
      .returning()
    return row ?? null
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(symptomLogs)
      .where(and(eq(symptomLogs.id, id), eq(symptomLogs.userId, userId)))
      .returning({ id: symptomLogs.id })
    return result.length > 0
  }

  async getTopSymptoms(userId: string, days = 30): Promise<{ symptom: string; count: number }[]> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const rows = await this.db
      .select({
        symptom: symptomLogs.symptom,
        count: count(),
      })
      .from(symptomLogs)
      .where(
        and(
          eq(symptomLogs.userId, userId),
          gte(symptomLogs.startedAt, since),
        ),
      )
      .groupBy(symptomLogs.symptom)
      .orderBy(desc(count()))
      .limit(10)

    return rows.map((r) => ({ symptom: r.symptom, count: Number(r.count) }))
  }

  async getPatterns(userId: string, days = 90): Promise<{
    frequentTriggers: { trigger: string; count: number }[]
    frequentLocations: { location: string; count: number }[]
    severityTrend: string
  }> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const logs = await this.db
      .select()
      .from(symptomLogs)
      .where(
        and(
          eq(symptomLogs.userId, userId),
          gte(symptomLogs.startedAt, since),
        ),
      )
      .orderBy(symptomLogs.startedAt)

    // Analyze triggers
    const triggerCounts: Record<string, number> = {}
    const locationCounts: Record<string, number> = {}
    const severities: number[] = []

    for (const log of logs) {
      if (log.severity) severities.push(log.severity)
      if (log.bodyLocation) locationCounts[log.bodyLocation] = (locationCounts[log.bodyLocation] ?? 0) + 1
      if (log.triggers && Array.isArray(log.triggers)) {
        for (const t of log.triggers as string[]) {
          triggerCounts[t] = (triggerCounts[t] ?? 0) + 1
        }
      }
    }

    const frequentTriggers = Object.entries(triggerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([trigger, count]) => ({ trigger, count }))

    const frequentLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([location, count]) => ({ location, count }))

    // Severity trend — compare first half to second half
    let severityTrend = "stable"
    if (severities.length >= 4) {
      const mid = Math.floor(severities.length / 2)
      const firstHalf = severities.slice(0, mid).reduce((a, b) => a + b, 0) / mid
      const secondHalf = severities.slice(mid).reduce((a, b) => a + b, 0) / (severities.length - mid)
      if (secondHalf > firstHalf + 0.5) severityTrend = "worsening"
      else if (secondHalf < firstHalf - 0.5) severityTrend = "improving"
    }

    return { frequentTriggers, frequentLocations, severityTrend }
  }
}
