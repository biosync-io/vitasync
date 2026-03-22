import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { defined } from "../../lib/strip-undefined.js"
import { HealthReportService } from "../../services/health-report.service.js"
import { UserService } from "../../services/user.service.js"

const reportService = new HealthReportService()
const userService = new UserService()

const reportsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/reports
  app.get("/:userId/reports", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        reportType: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
      })
      .parse(request.query)

    const reports = await reportService.list(userId, defined(query))
    return reply.send({ data: reports })
  })

  // GET /v1/users/:userId/reports/:reportId
  app.get("/:userId/reports/:reportId", async (request, reply) => {
    const { userId, reportId } = z
      .object({ userId: z.string().uuid(), reportId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const report = await reportService.findById(reportId, userId)
    if (!report) return reply.status(404).send({ code: "NOT_FOUND", message: "Report not found" })
    return reply.send(report)
  })

  // POST /v1/users/:userId/reports/generate — generate a new report
  app.post("/:userId/reports/generate", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        reportType: z.enum(["weekly", "monthly", "quarterly", "annual"]),
        periodStart: z.string().datetime().optional(),
        periodEnd: z.string().datetime().optional(),
      })
      .parse(request.body)

    // Auto-compute period if not provided
    const periodEnd = body.periodEnd ? new Date(body.periodEnd) : new Date()
    const periodDays = { weekly: 7, monthly: 30, quarterly: 90, annual: 365 }[body.reportType]
    const periodStart = body.periodStart ? new Date(body.periodStart) : new Date(periodEnd.getTime() - periodDays * 86400000)

    const report = await reportService.generate(
      userId,
      body.reportType,
      periodStart,
      periodEnd,
    )
    return reply.status(201).send(report)
  })
}

export default reportsRoutes
