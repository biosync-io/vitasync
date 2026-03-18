import { getDb, dataExports, healthMetrics, events } from "@biosync-io/db"
import type { DataExportInsert, DataExportRow } from "@biosync-io/db"
import { and, desc, eq, gte, lte, count } from "drizzle-orm"

export class DataExportService {
  private get db() {
    return getDb()
  }

  async list(userId: string, opts: { limit?: number } = {}): Promise<DataExportRow[]> {
    return this.db
      .select()
      .from(dataExports)
      .where(eq(dataExports.userId, userId))
      .orderBy(desc(dataExports.createdAt))
      .limit(opts.limit ?? 20)
  }

  async findById(id: string, userId: string): Promise<DataExportRow | null> {
    const [row] = await this.db
      .select()
      .from(dataExports)
      .where(and(eq(dataExports.id, id), eq(dataExports.userId, userId)))
      .limit(1)
    return row ?? null
  }

  async requestExport(userId: string, format: string, opts: { from?: Date; to?: Date; metricTypes?: string[] } = {}): Promise<DataExportRow> {
    const [row] = await this.db
      .insert(dataExports)
      .values({
        userId,
        format,
        status: "pending",
        periodStart: opts.from ?? null,
        periodEnd: opts.to ?? null,
        metricTypes: opts.metricTypes ? opts.metricTypes : null,
      })
      .returning()
    return row!
  }

  async buildExport(exportId: string): Promise<DataExportRow> {
    const [exportRow] = await this.db
      .select()
      .from(dataExports)
      .where(eq(dataExports.id, exportId))
      .limit(1)

    if (!exportRow) throw new Error("Export not found")

    await this.db
      .update(dataExports)
      .set({ status: "processing" })
      .where(eq(dataExports.id, exportId))

    try {
      const conditions = [eq(healthMetrics.userId, exportRow.userId)]
      if (exportRow.periodStart) conditions.push(gte(healthMetrics.recordedAt, exportRow.periodStart))
      if (exportRow.periodEnd) conditions.push(lte(healthMetrics.recordedAt, exportRow.periodEnd))

      const metrics = await this.db
        .select()
        .from(healthMetrics)
        .where(and(...conditions))
        .orderBy(healthMetrics.recordedAt)
        .limit(50000)

      const eventConditions = [eq(events.userId, exportRow.userId)]
      if (exportRow.periodStart) eventConditions.push(gte(events.startedAt, exportRow.periodStart))
      if (exportRow.periodEnd) eventConditions.push(lte(events.startedAt, exportRow.periodEnd))

      const eventRows = await this.db
        .select()
        .from(events)
        .where(and(...eventConditions))
        .orderBy(events.startedAt)
        .limit(10000)

      let content: unknown
      if (exportRow.format === "fhir_r4") {
        content = this.buildFhirBundle(metrics, eventRows)
      } else if (exportRow.format === "csv") {
        content = { metrics: metrics.length, events: eventRows.length, format: "csv" }
      } else {
        content = { metrics, events: eventRows }
      }

      const [updated] = await this.db
        .update(dataExports)
        .set({
          status: "ready",
          recordCount: metrics.length + eventRows.length,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        })
        .where(eq(dataExports.id, exportId))
        .returning()

      return updated!
    } catch {
      await this.db
        .update(dataExports)
        .set({ status: "failed" })
        .where(eq(dataExports.id, exportId))
      throw new Error("Export build failed")
    }
  }

  private buildFhirBundle(metrics: unknown[], eventRows: unknown[]): object {
    return {
      resourceType: "Bundle",
      type: "collection",
      total: metrics.length + eventRows.length,
      entry: [
        ...metrics.map((m: any) => ({
          resource: {
            resourceType: "Observation",
            status: "final",
            code: { text: m.metricType },
            valueQuantity: { value: m.value, unit: m.unit },
            effectiveDateTime: m.recordedAt,
          },
        })),
      ],
    }
  }
}
