import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { SleepAnalysisService } from "../../services/sleep-analysis.service.js"
import { UserService } from "../../services/user.service.js"

const sleepService = new SleepAnalysisService()
const userService = new UserService()

const sleepAnalysisRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/sleep-analysis/debt
  app.get("/:userId/sleep-analysis/debt", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ days: z.coerce.number().min(3).max(90).default(14) }).parse(request.query)
    const debt = await sleepService.getSleepDebt(userId, query.days, owner.gender)
    return reply.send(debt)
  })

  // GET /v1/users/:userId/sleep-analysis/quality
  app.get("/:userId/sleep-analysis/quality", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ days: z.coerce.number().min(7).max(365).default(30) }).parse(request.query)
    const report = await sleepService.getSleepQualityReport(userId, query.days, owner.gender)
    return reply.send(report)
  })
}

export default sleepAnalysisRoutes
