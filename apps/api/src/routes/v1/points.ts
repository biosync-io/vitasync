import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { PointsService } from "../../services/points.service.js"
import { UserService } from "../../services/user.service.js"

const pointsService = new PointsService()
const userService = new UserService()

const pointsRoutes: FastifyPluginAsync = async (app) => {
  // ─── User Points ───────────────────────────────────────────────

  // GET /v1/users/:userId/points — get user's point balance
  app.get("/:userId/points", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const totalPoints = await pointsService.getBalance(userId)
    return reply.send({ data: { userId, totalPoints } })
  })

  // GET /v1/users/:userId/points/history — get point transaction history
  app.get("/:userId/points/history", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        limit: z.coerce.number().min(1).max(200).default(50),
        since: z.string().datetime().optional(),
      })
      .parse(request.query)

    const history = await pointsService.getHistory(userId, {
      limit: query.limit,
      ...(query.since ? { since: new Date(query.since) } : {}),
    })
    return reply.send({ data: history })
  })

  // ─── Leaderboard ───────────────────────────────────────────────

  // GET /v1/points/leaderboard — workspace-scoped leaderboard
  app.get("/leaderboard", async (request, reply) => {
    const query = z
      .object({
        period: z.enum(["week", "month", "all"]).default("all"),
        limit: z.coerce.number().min(1).max(100).default(20),
      })
      .parse(request.query)

    const leaderboard = await pointsService.getLeaderboard(request.workspaceId, query)
    return reply.send({ data: leaderboard })
  })
}

export default pointsRoutes
