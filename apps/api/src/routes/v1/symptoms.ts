import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { SymptomService } from "../../services/symptom.service.js"
import { UserService } from "../../services/user.service.js"

const symptomService = new SymptomService()
const userService = new UserService()

const symptomsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/symptoms
  app.get("/:userId/symptoms", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        symptom: z.string().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(request.query)

    const logs = await symptomService.list(userId, {
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      ...(query.symptom !== undefined ? { symptom: query.symptom } : {}),
      limit: query.limit,
    })
    return reply.send({ data: logs })
  })

  // POST /v1/users/:userId/symptoms
  app.post("/:userId/symptoms", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        symptom: z.string().min(1).max(200),
        severity: z.number().min(1).max(10),
        bodyLocation: z.string().max(100).optional(),
        duration: z.string().max(100).optional(),
        notes: z.string().max(2000).optional(),
        triggers: z.array(z.string().max(100)).max(10).optional(),
        reliefMeasures: z.array(z.string().max(200)).max(10).optional(),
        startedAt: z.string().datetime().optional(),
      })
      .parse(request.body)

    const log = await symptomService.create({
      userId,
      symptom: body.symptom,
      severity: body.severity,
      startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
      ...(body.bodyLocation !== undefined && { bodyLocation: body.bodyLocation }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.triggers !== undefined && { triggers: body.triggers }),
    })
    return reply.status(201).send(log)
  })

  // GET /v1/users/:userId/symptoms/:logId
  app.get("/:userId/symptoms/:logId", async (request, reply) => {
    const { userId, logId } = z
      .object({ userId: z.string().uuid(), logId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const log = await symptomService.findById(logId, userId)
    if (!log) return reply.status(404).send({ code: "NOT_FOUND", message: "Symptom log not found" })
    return reply.send(log)
  })

  // DELETE /v1/users/:userId/symptoms/:logId
  app.delete("/:userId/symptoms/:logId", async (request, reply) => {
    const { userId, logId } = z
      .object({ userId: z.string().uuid(), logId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await symptomService.delete(logId, userId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Symptom log not found" })
    return reply.status(204).send()
  })

  // GET /v1/users/:userId/symptoms/top
  app.get("/:userId/symptoms/top", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ days: z.coerce.number().min(7).max(365).default(30) }).parse(request.query)
    const top = await symptomService.getTopSymptoms(userId, query.days)
    return reply.send({ data: top })
  })

  // GET /v1/users/:userId/symptoms/patterns
  app.get("/:userId/symptoms/patterns", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ days: z.coerce.number().min(14).max(365).default(90) }).parse(request.query)
    const patterns = await symptomService.getPatterns(userId, query.days)
    return reply.send(patterns)
  })
}

export default symptomsRoutes
