import { getDb, dataExports, healthMetrics, events, users } from "@biosync-io/db"
import { SagaBuilder } from "@biosync-io/saga"
import { and, eq, gte, lte, sql } from "drizzle-orm"
import { getWorkerEventBus } from "../lib/event-bus.js"
import { getNotificationQueue } from "../queues/notification.js"

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ExportSagaContext {
  exportId: string
  userId: string
  workspaceId: string
  format: "json" | "csv"
  dateRange?: { from: string; to: string }
  filePath?: string
  fileSize?: number
  recordCount?: number
  error?: string
}

// ---------------------------------------------------------------------------
// Saga definition
// ---------------------------------------------------------------------------

export const exportSaga = new SagaBuilder<ExportSagaContext>("data-export")

  // ── 1. Validate the export request ──────────────────────────────
  .step("validate-request", {
    execute: async (ctx) => {
      const db = getDb()

      // Validate user exists
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1)

      if (!user) {
        throw new Error(`User '${ctx.userId}' not found`)
      }

      // Validate format
      if (ctx.format !== "json" && ctx.format !== "csv") {
        throw new Error(`Unsupported export format: ${ctx.format}`)
      }

      // Validate date range if provided
      if (ctx.dateRange) {
        const from = new Date(ctx.dateRange.from)
        const to = new Date(ctx.dateRange.to)
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          throw new Error("Invalid date range: dates must be valid ISO 8601 strings")
        }
        if (from > to) {
          throw new Error("Invalid date range: 'from' must be before 'to'")
        }
      }

      // Mark export as processing
      await db
        .update(dataExports)
        .set({ status: "processing" })
        .where(eq(dataExports.id, ctx.exportId))

      return ctx
    },
  })

  // ── 2. Collect data from all tables ─────────────────────────────
  .step("collect-data", {
    execute: async (ctx) => {
      const db = getDb()
      const conditions = [eq(healthMetrics.userId, ctx.userId)]

      if (ctx.dateRange) {
        conditions.push(gte(healthMetrics.recordedAt, new Date(ctx.dateRange.from)))
        conditions.push(lte(healthMetrics.recordedAt, new Date(ctx.dateRange.to)))
      }

      // Count metrics to be exported
      const [metricsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(healthMetrics)
        .where(and(...conditions))

      // Count events
      const eventConditions = [eq(events.userId, ctx.userId)]
      if (ctx.dateRange) {
        eventConditions.push(gte(events.startedAt, new Date(ctx.dateRange.from)))
        eventConditions.push(lte(events.startedAt, new Date(ctx.dateRange.to)))
      }

      const [eventsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(events)
        .where(and(...eventConditions))

      const totalRecords = (metricsCount?.count ?? 0) + (eventsCount?.count ?? 0)

      return {
        ...ctx,
        recordCount: totalRecords,
        filePath: `exports/${ctx.userId}/${ctx.exportId}.${ctx.format}`,
      }
    },
    timeout: 120_000,
  })

  // ── 3. Package the export file ──────────────────────────────────
  .step("package-export", {
    execute: async (ctx) => {
      const db = getDb()
      const conditions = [eq(healthMetrics.userId, ctx.userId)]

      if (ctx.dateRange) {
        conditions.push(gte(healthMetrics.recordedAt, new Date(ctx.dateRange.from)))
        conditions.push(lte(healthMetrics.recordedAt, new Date(ctx.dateRange.to)))
      }

      // Fetch actual data for export
      const metrics = await db
        .select()
        .from(healthMetrics)
        .where(and(...conditions))
        .limit(50_000)

      const eventConditions = [eq(events.userId, ctx.userId)]
      if (ctx.dateRange) {
        eventConditions.push(gte(events.startedAt, new Date(ctx.dateRange.from)))
        eventConditions.push(lte(events.startedAt, new Date(ctx.dateRange.to)))
      }

      const userEvents = await db
        .select()
        .from(events)
        .where(and(...eventConditions))
        .limit(10_000)

      let exportContent: string
      if (ctx.format === "json") {
        exportContent = JSON.stringify(
          { exportId: ctx.exportId, metrics, events: userEvents },
          null,
          2,
        )
      } else {
        // CSV: header + metric rows
        const header = "type,metricType,recordedAt,value,unit,source\n"
        const rows = metrics.map(
          (m) =>
            `metric,${m.metricType},${m.recordedAt.toISOString()},${m.value},${m.unit ?? ""},${m.source ?? ""}`,
        )
        const eventRows = userEvents.map(
          (e) =>
            `event,${e.eventType},${e.startedAt.toISOString()},${e.durationSeconds ?? ""},${e.activityType ?? ""},${e.providerId}`,
        )
        exportContent = header + [...rows, ...eventRows].join("\n")
      }

      const fileSize = Buffer.byteLength(exportContent, "utf-8")

      return {
        ...ctx,
        fileSize,
        recordCount: metrics.length + userEvents.length,
      }
    },
    compensate: async (ctx) => {
      // If packaging failed, clean up any partial state.
      // In a real system this would delete the partial file from object storage.
      console.warn(`[export-saga] Cleaning up partial export file: ${ctx.filePath}`)
      return ctx
    },
  })

  // ── 4. Update the export record ─────────────────────────────────
  .step("update-export-record", {
    execute: async (ctx) => {
      const db = getDb()

      await db
        .update(dataExports)
        .set({
          status: "completed",
          downloadUrl: ctx.filePath,
          recordCount: ctx.recordCount ?? 0,
          completedAt: new Date(),
          metadata: {
            format: ctx.format,
            fileSize: ctx.fileSize,
            dateRange: ctx.dateRange ?? null,
          },
        })
        .where(eq(dataExports.id, ctx.exportId))

      return ctx
    },
  })

  // ── 5. Send notification to user ────────────────────────────────
  .step("send-notification", {
    execute: async (ctx) => {
      await getNotificationQueue().add("export-ready", {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        title: "Data Export Ready",
        body: `Your ${ctx.format.toUpperCase()} export is ready for download (${ctx.recordCount ?? 0} records).`,
        severity: "info",
        category: "export",
        metadata: { exportId: ctx.exportId },
      })

      return ctx
    },
  })

  // ── Lifecycle hooks ─────────────────────────────────────────────
  .onComplete(async (ctx) => {
    getWorkerEventBus()
      .publish({
        type: "export.completed",
        aggregateType: "export",
        aggregateId: ctx.exportId,
        payload: {
          exportId: ctx.exportId,
          userId: ctx.userId,
          format: ctx.format,
          recordCount: ctx.recordCount ?? 0,
          fileSize: ctx.fileSize ?? 0,
        },
        metadata: { userId: ctx.userId, workspaceId: ctx.workspaceId },
      })
      .catch((e) => console.error("[export-saga] Failed to emit export.completed event:", e))
  })

  .onFailed(async (ctx, err, step) => {
    console.error(
      `[export-saga] Failed at step "${step}" for export ${ctx.exportId}: ${err.message}`,
    )

    // Update the export record to reflect the failure
    const db = getDb()
    await db
      .update(dataExports)
      .set({
        status: "failed",
        error: err.message.slice(0, 2000),
        completedAt: new Date(),
      })
      .where(eq(dataExports.id, ctx.exportId))
      .catch(() => {})

    getWorkerEventBus()
      .publish({
        type: "export.failed",
        aggregateType: "export",
        aggregateId: ctx.exportId,
        payload: {
          exportId: ctx.exportId,
          userId: ctx.userId,
          error: err.message,
          failedStep: step,
        },
        metadata: { userId: ctx.userId, workspaceId: ctx.workspaceId },
      })
      .catch((e) => console.error("[export-saga] Failed to emit export.failed event:", e))
  })

  .build()
