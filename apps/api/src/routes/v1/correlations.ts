import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { CorrelationService } from "../../services/correlation.service.js"
import { UserService } from "../../services/user.service.js"

const correlationService = new CorrelationService()
const userService = new UserService()

const correlationsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/correlations
  app.get("/:userId/correlations", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        minStrength: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
      })
      .parse(request.query)

    const correlations = await correlationService.list(userId, query)
    return reply.send({ data: correlations })
  })

  // POST /v1/users/:userId/correlations/compute — trigger computation
  app.post("/:userId/correlations/compute", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({ days: z.coerce.number().min(7).max(365).default(90) })
      .parse(request.query)

    const correlations = await correlationService.computeCorrelations(userId, query.days)
    return reply.send({ data: correlations, count: correlations.length })
  })
}

export default correlationsRoutes
