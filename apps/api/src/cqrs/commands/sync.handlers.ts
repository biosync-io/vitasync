import type { CommandBus } from "@biosync-io/cqrs"
import { SyncCommands } from "./sync.commands.js"

/**
 * Register command handlers for the provider-sync domain.
 *
 * These handlers coordinate sync operations: triggering syncs via the queue
 * and managing sync lifecycle.
 */
export function registerSyncCommandHandlers(
  bus: CommandBus,
  deps: {
    getSyncQueue: () => { add: (name: string, data: unknown, opts?: unknown) => Promise<unknown> }
  },
): void {
  bus.register(SyncCommands.TRIGGER_SYNC, async (cmd) => {
    const { connectionId, providerId } = cmd.payload as {
      connectionId: string
      providerId?: string
    }
    const { workspaceId, userId } = cmd.metadata

    const queue = deps.getSyncQueue()
    const job = await queue.add("sync", {
      connectionId,
      userId,
      workspaceId,
      providerId,
    })

    return { jobId: (job as { id?: string }).id, status: "queued" }
  })

  bus.register(SyncCommands.CANCEL_SYNC, async (cmd) => {
    const { jobId } = cmd.payload as { jobId: string }
    return { jobId, status: "cancel_requested" }
  })

  bus.register(SyncCommands.REFRESH_TOKEN, async (cmd) => {
    const { connectionId } = cmd.payload as { connectionId: string }
    return { connectionId, status: "refresh_requested" }
  })
}
