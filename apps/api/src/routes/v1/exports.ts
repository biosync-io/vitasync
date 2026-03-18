import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { DataExportService } from "../../services/data-export.service.js"
import { UserService } from "../../services/user.service.js"

const exportService = new DataExportService()
const userService = new UserService()

const exportsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/exports
  app.get("/:userId/exports", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const exports = await exportService.list(userId)
    return reply.send({ data: exports })
  })

  // GET /v1/users/:userId/exports/:exportId
  app.get("/:userId/exports/:exportId", async (request, reply) => {
    const { userId, exportId } = z
      .object({ userId: z.string().uuid(), exportId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const exp = await exportService.findById(exportId, userId)
    if (!exp) return reply.status(404).send({ code: "NOT_FOUND", message: "Export not found" })
    return reply.send(exp)
  })

  // POST /v1/users/:userId/exports — request a new export
  app.post("/:userId/exports", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        format: z.enum(["json", "csv", "fhir_r4", "pdf"]),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        metricTypes: z.array(z.string()).optional(),
      })
      .parse(request.body)

    const exp = await exportService.requestExport(userId, body.format, {
      from: body.from ? new Date(body.from) : undefined,
      to: body.to ? new Date(body.to) : undefined,
      metricTypes: body.metricTypes,
    })
    return reply.status(201).send(exp)
  })
}

export default exportsRoutes
