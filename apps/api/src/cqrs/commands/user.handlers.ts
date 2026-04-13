import type { CommandBus } from "@biosync-io/cqrs"
import { AppError } from "@biosync-io/types"
import { UserCommands } from "./user.commands.js"

/**
 * Register command handlers for the user domain.
 *
 * These handlers wrap UserService operations with CQRS semantics.
 */
export function registerUserCommandHandlers(
  bus: CommandBus,
  deps: {
    userService: {
      update: (
        id: string,
        workspaceId: string,
        patch: Record<string, unknown>,
      ) => Promise<unknown | null>
      delete: (id: string, workspaceId: string) => Promise<boolean>
    }
  },
): void {
  bus.register(UserCommands.UPDATE_PROFILE, async (cmd) => {
    const { userId, ...profileData } = cmd.payload as { userId: string } & Record<string, unknown>
    const { workspaceId } = cmd.metadata

    const user = await deps.userService.update(userId, workspaceId, profileData)
    if (!user) throw AppError.notFound("User", userId)

    return user
  })

  bus.register(UserCommands.UPDATE_PREFERENCES, async (cmd) => {
    const { userId, preferences } = cmd.payload as {
      userId: string
      preferences: Record<string, unknown>
    }
    const { workspaceId } = cmd.metadata

    return deps.userService.update(userId, workspaceId, { metadata: preferences })
  })

  bus.register(UserCommands.DELETE_USER_DATA, async (cmd) => {
    const { userId } = cmd.payload as { userId: string }
    const { workspaceId } = cmd.metadata

    const deleted = await deps.userService.delete(userId, workspaceId)
    if (!deleted) throw AppError.notFound("User", userId)

    return { userId, status: "deleted" }
  })
}
