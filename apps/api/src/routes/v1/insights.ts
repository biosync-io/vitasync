import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { InsightsService } from "../../services/insights/index.js"
import { UserService } from "../../services/user.service.js"

const insightsService = new InsightsService()
const userService = new UserService()

const insightsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/insights — generate all applicable insights
  app.get("/:userId/insights", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(request.query)

    const insights = await insightsService.generateInsights(userId, {
      ...(query.from !== undefined && { from: new Date(query.from) }),
      ...(query.to !== undefined && { to: new Date(query.to) }),
    })

    // Filter out sex-specific categories based on user's biological sex
    const filtered = owner.sex === "male"
      ? insights.filter((i) => i.category !== "womens_health")
      : insights

    return reply.send({ data: filtered, total: filtered.length })
  })

  // GET /v1/insights/algorithms — list all available algorithms
  app.get("/algorithms", async (_request, reply) => {
    const algorithms = insightsService.listAlgorithms()
    return reply.send({ data: algorithms, total: algorithms.length })
  })
}

export default insightsRoutes
