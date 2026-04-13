import type { CommandBus } from "@biosync-io/cqrs"
import { AppError } from "@biosync-io/types"
import { UserCommands } from "./user.commands.js"

/**
 * Register command handlers for the user domain.
 *
 * These handlers wrap user service operations with command/event semantics.
 */
export function registerUserCommandHandlers(
  bus: CommandBus,
  deps: {
    userService: {
      update: (
        workspaceId: string,
        userId: string,
        data: Record<string, unknown>,
      ) => Promise<unknown>
      deleteUserData: (workspaceId: string, userId: string) => Promise<void>
    }
  },
): void {
  bus.register(UserCommands.UPDATE_PROFILE, async (cmd) => {
    const { userId, ...profileData } = cmd.payload as { userId: string } & Record<string, unknown>
    const { workspaceId } = cmd.metadata

    const user = await deps.userService.update(workspaceId, userId, profileData)
    if (!user) throw AppError.notFound("User", userId)

    return user
  })

  bus.register(UserCommands.UPDATE_PREFERENCES, async (cmd) => {
    const { userId, preferences } = cmd.payload as {
      userId: string
      preferences: Record<string, unknown>
    }
    const { workspaceId } = cmd.metadata

    return deps.userService.update(workspaceId, userId, { metadata: preferences })
  })

  bus.register(UserCommands.DELETE_USER_DATA, async (cmd) => {
    const { userId } = cmd.payload as { userId: string }
    const { workspaceId } = cmd.metadata

    await deps.userService.deleteUserData(workspaceId, userId)
    return { userId, status: "deleted" }
  })
}
