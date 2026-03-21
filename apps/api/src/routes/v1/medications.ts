import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { defined } from "../../lib/strip-undefined.js"
import { MedicationService } from "../../services/medication.service.js"
import { UserService } from "../../services/user.service.js"

const medicationService = new MedicationService()
const userService = new UserService()

const medicationsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/medications
  app.get("/:userId/medications", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ activeOnly: z.coerce.boolean().default(true) }).parse(request.query)
    const meds = await medicationService.listMedications(userId, { activeOnly: query.activeOnly })
    return reply.send({ data: meds })
  })

  // POST /v1/users/:userId/medications
  app.post("/:userId/medications", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        name: z.string().min(1).max(200),
        dosage: z.string().max(100).optional(),
        frequency: z.string().max(50),
        timeOfDay: z.array(z.string().max(20)).optional(),
        startDate: z.string().datetime(),
        endDate: z.string().datetime().optional(),
      })
      .parse(request.body)

    const med = await medicationService.createMedication({
      userId,
      name: body.name,
      dosage: body.dosage,
      frequency: body.frequency,
      startDate: new Date(body.startDate),
      ...(body.endDate ? { endDate: new Date(body.endDate) } : {}),
      ...(body.timeOfDay !== undefined && { timeOfDay: body.timeOfDay }),
      isActive: true,
    })
    return reply.status(201).send(med)
  })

  // GET /v1/users/:userId/medications/:medId
  app.get("/:userId/medications/:medId", async (request, reply) => {
    const { userId, medId } = z
      .object({ userId: z.string().uuid(), medId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const med = await medicationService.findMedicationById(medId, userId)
    if (!med) return reply.status(404).send({ code: "NOT_FOUND", message: "Medication not found" })
    return reply.send(med)
  })

  // PUT /v1/users/:userId/medications/:medId
  app.put("/:userId/medications/:medId", async (request, reply) => {
    const { userId, medId } = z
      .object({ userId: z.string().uuid(), medId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        name: z.string().min(1).max(200).optional(),
        dosage: z.string().max(100).optional(),
        frequency: z.string().max(50).optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body)

    const med = await medicationService.updateMedication(medId, userId, defined({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.dosage !== undefined && { dosage: body.dosage }),
      ...(body.frequency !== undefined && { frequency: body.frequency }),
      ...(body.active !== undefined && { isActive: body.active }),
    }))
    if (!med) return reply.status(404).send({ code: "NOT_FOUND", message: "Medication not found" })
    return reply.send(med)
  })

  // DELETE /v1/users/:userId/medications/:medId
  app.delete("/:userId/medications/:medId", async (request, reply) => {
    const { userId, medId } = z
      .object({ userId: z.string().uuid(), medId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await medicationService.deleteMedication(medId, userId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Medication not found" })
    return reply.status(204).send()
  })

  // POST /v1/users/:userId/medications/:medId/log — log adherence
  app.post("/:userId/medications/:medId/log", async (request, reply) => {
    const { userId, medId } = z
      .object({ userId: z.string().uuid(), medId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        status: z.enum(["taken", "missed", "skipped"]),
        scheduledAt: z.string().datetime(),
        takenAt: z.string().datetime().optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(request.body)

    const log = await medicationService.logAdherence({
      medicationId: medId,
      userId,
      status: body.status,
      scheduledAt: new Date(body.scheduledAt),
      takenAt: body.takenAt ? new Date(body.takenAt) : null,
      ...(body.notes !== undefined && { notes: body.notes }),
    })
    return reply.status(201).send(log)
  })

  // GET /v1/users/:userId/medications/:medId/logs
  app.get("/:userId/medications/:medId/logs", async (request, reply) => {
    const { userId, medId } = z
      .object({ userId: z.string().uuid(), medId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(request.query)

    const logs = await medicationService.getAdherenceLogs(medId, userId, {
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      limit: query.limit,
    })
    return reply.send({ data: logs })
  })

  // GET /v1/users/:userId/medications/:medId/stats
  app.get("/:userId/medications/:medId/stats", async (request, reply) => {
    const { userId, medId } = z
      .object({ userId: z.string().uuid(), medId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z.object({ days: z.coerce.number().min(7).max(365).default(30) }).parse(request.query)
    const stats = await medicationService.getAdherenceStats(medId, userId, query.days)
    return reply.send(stats)
  })
}

export default medicationsRoutes
