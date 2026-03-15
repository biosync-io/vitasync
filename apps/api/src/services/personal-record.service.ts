import { getDb, personalRecords } from "@biosync-io/db"
import type { PersonalRecordInsert, PersonalRecordRow } from "@biosync-io/db"
import { and, eq } from "drizzle-orm"

export class PersonalRecordService {
  private get db() {
    return getDb()
  }

  async list(userId: string): Promise<PersonalRecordRow[]> {
    return this.db
      .select()
      .from(personalRecords)
      .where(eq(personalRecords.userId, userId))
      .orderBy(personalRecords.metricType)
  }

  async findByType(
    userId: string,
    metricType: string,
    category?: string,
  ): Promise<PersonalRecordRow | null> {
    const conditions = [
      eq(personalRecords.userId, userId),
      eq(personalRecords.metricType, metricType),
    ]
    if (category !== undefined) {
      conditions.push(eq(personalRecords.category, category))
    }

    const [row] = await this.db
      .select()
      .from(personalRecords)
      .where(and(...conditions))
      .limit(1)

    return row ?? null
  }

  /**
   * Upsert a personal record.
   * Only stores the new value if it is greater than the existing record.
   * Returns true if the record was updated / created, false otherwise.
   */
  async maybeUpdate(candidate: PersonalRecordInsert): Promise<boolean> {
    const existing = await this.findByType(
      candidate.userId,
      candidate.metricType,
      candidate.category ?? undefined,
    )

    if (existing && existing.value >= candidate.value) {
      return false // existing record is better
    }

    await this.db
      .insert(personalRecords)
      .values({ ...candidate, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [personalRecords.userId, personalRecords.metricType, personalRecords.category],
        set: {
          value: candidate.value,
          recordedAt: candidate.recordedAt,
          providerId: candidate.providerId,
          unit: candidate.unit,
          updatedAt: new Date(),
        },
      })

    return true
  }
}
