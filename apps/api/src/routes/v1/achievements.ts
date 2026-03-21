import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { defined } from "../../lib/strip-undefined.js"
import { AchievementService } from "../../services/achievement.service.js"
import { UserService } from "../../services/user.service.js"

const achievementService = new AchievementService()
const userService = new UserService()

const achievementsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/achievements
  app.get("/:userId/achievements", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        category: z.string().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(request.query)

    const achievements = await achievementService.listForUser(userId)
    return reply.send({ data: achievements })
  })

  // GET /v1/achievements/definitions — all available achievements
  app.get("/definitions", async (_request, reply) => {
    const definitions = achievementService.getDefinitions()
    return reply.send({ data: definitions })
  })

  // POST /v1/users/:userId/achievements/check — trigger achievement check
  app.post("/:userId/achievements/check", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const newAchievements = await achievementService.checkAndAward(userId)
    return reply.send({ data: newAchievements, count: newAchievements.length })
  })
}

export default achievementsRoutes
