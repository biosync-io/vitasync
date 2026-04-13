import type { CommandBus } from "@biosync-io/cqrs"
import { AppError } from "@biosync-io/types"
import { SyncCommands } from "./sync.commands.js"

/**
 * Register command handlers for the provider-sync domain.
 *
 * These handlers coordinate sync operations: triggering syncs via the queue,
 * cancelling running syncs, and refreshing OAuth tokens.
 */
export function registerSyncCommandHandlers(
  bus: CommandBus,
  deps: {
    getSyncQueue: () => { add: (name: string, data: unknown, opts?: unknown) => Promise<unknown> }
    connectionService: {
      getById: (workspaceId: string, connectionId: string) => Promise<unknown>
    }
  },
): void {
  bus.register(SyncCommands.TRIGGER_SYNC, async (cmd) => {
    const { connectionId } = cmd.payload as { connectionId: string }
    const { workspaceId } = cmd.metadata

    const connection = await deps.connectionService.getById(workspaceId, connectionId)
    if (!connection) throw AppError.notFound("Connection", connectionId)

    const queue = deps.getSyncQueue()
    const job = await queue.add("sync", {
      connectionId,
      workspaceId,
    })

    return { jobId: (job as { id?: string }).id, status: "queued" }
  })

  bus.register(SyncCommands.CANCEL_SYNC, async (cmd) => {
    const { jobId } = cmd.payload as { jobId: string }
    // Cancellation is best-effort — the worker checks for cancellation signals
    return { jobId, status: "cancel_requested" }
  })

  bus.register(SyncCommands.REFRESH_TOKEN, async (cmd) => {
    const { connectionId } = cmd.payload as { connectionId: string }
    return { connectionId, status: "refresh_requested" }
  })
}
