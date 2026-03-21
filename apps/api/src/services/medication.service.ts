import { getDb, medications, medicationLogs } from "@biosync-io/db"
import type { MedicationInsert, MedicationRow, MedicationLogInsert, MedicationLogRow } from "@biosync-io/db"
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm"

export class MedicationService {
  private get db() {
    return getDb()
  }

  // --- Medications CRUD ---

  async createMedication(data: Omit<MedicationInsert, "id" | "createdAt">): Promise<MedicationRow> {
    const [row] = await this.db.insert(medications).values(data).returning()
    return row!
  }

  async listMedications(userId: string, opts: { activeOnly?: boolean } = {}): Promise<MedicationRow[]> {
    const conditions = [eq(medications.userId, userId)]
    if (opts.activeOnly !== false) conditions.push(eq(medications.isActive, true))

    return this.db
      .select()
      .from(medications)
      .where(and(...conditions))
      .orderBy(desc(medications.createdAt))
  }

  async findMedicationById(id: string, userId: string): Promise<MedicationRow | null> {
    const [row] = await this.db
      .select()
      .from(medications)
      .where(and(eq(medications.id, id), eq(medications.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async updateMedication(id: string, userId: string, data: Partial<MedicationInsert>): Promise<MedicationRow | null> {
    const [row] = await this.db
      .update(medications)
      .set(data)
      .where(and(eq(medications.id, id), eq(medications.userId, userId)))
      .returning()
    return row ?? null
  }

  async deleteMedication(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(medications)
      .where(and(eq(medications.id, id), eq(medications.userId, userId)))
      .returning({ id: medications.id })
    return result.length > 0
  }

  // --- Adherence logging ---

  async logAdherence(data: Omit<MedicationLogInsert, "id" | "createdAt">): Promise<MedicationLogRow> {
    const [row] = await this.db.insert(medicationLogs).values(data).returning()
    return row!
  }

  async getAdherenceLogs(medicationId: string, userId: string, opts: { from?: Date; to?: Date; limit?: number } = {}): Promise<MedicationLogRow[]> {
    const conditions = [
      eq(medicationLogs.medicationId, medicationId),
      eq(medicationLogs.userId, userId),
    ]
    if (opts.from) conditions.push(gte(medicationLogs.scheduledAt, opts.from))
    if (opts.to) conditions.push(lte(medicationLogs.scheduledAt, opts.to))

    return this.db
      .select()
      .from(medicationLogs)
      .where(and(...conditions))
      .orderBy(desc(medicationLogs.scheduledAt))
      .limit(opts.limit ?? 50)
  }

  async getAdherenceStats(medicationId: string, userId: string, days = 30): Promise<{
    total: number
    taken: number
    missed: number
    skipped: number
    adherenceRate: number
  }> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const rows = await this.db
      .select({
        status: medicationLogs.status,
        cnt: count(),
      })
      .from(medicationLogs)
      .where(
        and(
          eq(medicationLogs.medicationId, medicationId),
          eq(medicationLogs.userId, userId),
          gte(medicationLogs.scheduledAt, since),
        ),
      )
      .groupBy(medicationLogs.status)

    let total = 0
    let taken = 0
    let missed = 0
    let skipped = 0
    for (const r of rows) {
      const c = Number(r.cnt)
      total += c
      if (r.status === "taken") taken = c
      else if (r.status === "missed") missed = c
      else if (r.status === "skipped") skipped = c
    }

    return {
      total,
      taken,
      missed,
      skipped,
      adherenceRate: total > 0 ? Math.round((taken / total) * 1000) / 10 : 0,
    }
  }
}
