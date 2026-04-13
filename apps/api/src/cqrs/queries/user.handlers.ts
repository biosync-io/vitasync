import type { QueryBus } from "@biosync-io/cqrs"
import { eq } from "drizzle-orm"
import { UserQueries } from "./user.queries.js"

/**
 * Register query handlers for the user domain.
 */
export function registerUserQueryHandlers(
  bus: QueryBus,
  db: ReturnType<typeof import("@biosync-io/db").getDb>,
): void {
  bus.register(UserQueries.GET_PROFILE, async (query) => {
    const { users } = await import("@biosync-io/db")
    const { userId, workspaceId } = query.params as { userId: string; workspaceId: string }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    return user ?? null
  })

  bus.register(UserQueries.GET_ACTIVITY, async (query) => {
    const { auditLog } = await import("@biosync-io/db")
    const { userId, limit = 20 } = query.params as { userId: string; limit?: number }
    const { desc: descOrder } = await import("drizzle-orm")

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, userId))
      .orderBy(descOrder(auditLog.timestamp))
      .limit(limit)

    return rows
  })

  bus.register(UserQueries.GET_PREFERENCES, async (query) => {
    const { users } = await import("@biosync-io/db")
    const { userId } = query.params as { userId: string }

    const [user] = await db
      .select({ metadata: users.metadata })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    return user?.metadata ?? {}
  })
}
