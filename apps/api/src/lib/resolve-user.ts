import { AppError } from "@biosync-io/types"
import { UserService } from "../services/user.service.js"

const userService = new UserService()

/**
 * Resolve and validate a user exists in the workspace.
 * Throws AppError.notFound if the user doesn't exist — the Fastify
 * error handler will convert it to a 404 response.
 *
 * Use in route handlers to replace the repeated pattern:
 * ```ts
 * const owner = await userService.findById(userId, workspaceId)
 * if (!owner) return reply.status(404).send({ code: "NOT_FOUND", ... })
 * ```
 */
export async function resolveUser(userId: string, workspaceId: string) {
  const user = await userService.findById(userId, workspaceId)
  if (!user) throw AppError.notFound("User", userId)
  return user
}
