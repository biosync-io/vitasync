import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { BiometricBaselineService } from "../../services/biometric-baseline.service.js"
import { UserService } from "../../services/user.service.js"

const baselineService = new BiometricBaselineService()
const userService = new UserService()

const baselinesRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/baselines
  app.get("/:userId/baselines", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ metricType: z.string().optional() }).parse(request.query)
    const baselines = await baselineService.getBaselines(userId, query)
    return reply.send({ data: baselines })
  })

  // GET /v1/users/:userId/baselines/:metricType
  app.get("/:userId/baselines/:metricType", async (request, reply) => {
    const { userId, metricType } = z
      .object({ userId: z.string().uuid(), metricType: z.string() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const baseline = await baselineService.getBaseline(userId, metricType)
    if (!baseline) return reply.status(404).send({ code: "NOT_FOUND", message: "Baseline not found" })
    return reply.send(baseline)
  })

  // POST /v1/users/:userId/baselines/compute — recompute all baselines
  app.post("/:userId/baselines/compute", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const baselines = await baselineService.computeAllBaselines(userId)
    return reply.send({ data: baselines, count: baselines.length })
  })
}

export default baselinesRoutes
