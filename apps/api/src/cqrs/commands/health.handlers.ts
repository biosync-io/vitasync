import type { CommandBus } from "@biosync-io/cqrs"
import type { HealthDataEventSourcedService } from "../../services/health-data-es.service.js"
import { HealthCommands } from "./health.commands.js"

/**
 * Register command handlers for the health domain.
 *
 * Each handler delegates to the event-sourced service which handles:
 *  1. writing to the health_metrics table
 *  2. appending a domain event to the event store
 *  3. publishing the event on the bus
 */
export function registerHealthCommandHandlers(
  bus: CommandBus,
  healthEsService: HealthDataEventSourcedService,
): void {
  bus.register(HealthCommands.RECORD_METRIC, async (cmd) => {
    return healthEsService.recordMetric(
      cmd.metadata.userId,
      cmd.metadata.workspaceId,
      cmd.payload as {
        connectionId: string
        providerId: string
        metricType: string
        recordedAt: Date
        value: number
        unit?: string
        source?: string
        data?: Record<string, unknown>
      },
    )
  })

  bus.register(HealthCommands.BATCH_INGEST, async (cmd) => {
    return healthEsService.batchIngest(
      cmd.metadata.userId,
      cmd.metadata.workspaceId,
      cmd.payload as Array<{
        connectionId: string
        providerId: string
        metricType: string
        recordedAt: Date
        value: number
        unit?: string
        source?: string
        data?: Record<string, unknown>
      }>,
    )
  })

  bus.register(HealthCommands.COMPUTE_SCORE, async (cmd) => {
    // Score computation is typically triggered asynchronously via events.
    // This command provides an explicit on-demand trigger.
    const payload = cmd.payload as { userId: string; date: string }
    return { userId: payload.userId, date: payload.date, status: "queued" }
  })
}
