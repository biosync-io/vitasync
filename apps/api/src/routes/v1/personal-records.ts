import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { PersonalRecordService } from "../../services/personal-record.service.js"

const personalRecordService = new PersonalRecordService()

const personalRecordsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/personal-records — list all PRs for a user
  app.get("/:userId/personal-records", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const records = await personalRecordService.list(userId)
    return reply.send({ data: records })
  })

  // GET /v1/users/:userId/personal-records/:metricType — get PR for a specific metric
  app.get("/:userId/personal-records/:metricType", async (request, reply) => {
    const { userId, metricType } = z
      .object({ userId: z.string().uuid(), metricType: z.string() })
      .parse(request.params)

    const category = z
      .object({ category: z.string().optional() })
      .parse(request.query).category

    const record = await personalRecordService.findByType(userId, metricType, category)
    if (!record) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Personal record not found" })
    }

    return reply.send(record)
  })
}

export default personalRecordsRoutes
