import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { JournalService } from "../../services/journal.service.js"
import { UserService } from "../../services/user.service.js"

const journalService = new JournalService()
const userService = new UserService()

const journalRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/journal
  app.get("/:userId/journal", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        search: z.string().max(200).optional(),
        tag: z.string().max(50).optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(request.query)

    const entries = await journalService.list(userId, {
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.tag ? { tag: query.tag } : {}),
      limit: query.limit,
    })
    return reply.send({ data: entries })
  })

  // POST /v1/users/:userId/journal
  app.post("/:userId/journal", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        title: z.string().max(200).optional(),
        body: z.string().min(1).max(50000),
        moodScore: z.number().min(1).max(5).optional(),
        moodLabel: z.string().max(50).optional(),
        gratitude: z.array(z.string().max(200)).max(10).optional(),
        tags: z.array(z.string().max(50)).max(20).optional(),
        entryDate: z.string().datetime().optional(),
      })
      .parse(request.body)

    const entry = await journalService.create({
      userId,
      ...body,
      entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
    })
    return reply.status(201).send(entry)
  })

  // PATCH /v1/users/:userId/journal/:entryId
  app.patch("/:userId/journal/:entryId", async (request, reply) => {
    const params = z.object({ userId: z.string().uuid(), entryId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(params.userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        title: z.string().max(200).optional(),
        body: z.string().min(1).max(50000).optional(),
        moodScore: z.number().min(1).max(5).optional(),
        moodLabel: z.string().max(50).optional(),
        gratitude: z.array(z.string().max(200)).max(10).optional(),
        tags: z.array(z.string().max(50)).max(20).optional(),
      })
      .parse(request.body)

    const updated = await journalService.update(params.entryId, params.userId, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)))
    if (!updated) return reply.status(404).send({ code: "NOT_FOUND", message: "Entry not found" })
    return reply.send(updated)
  })

  // DELETE /v1/users/:userId/journal/:entryId
  app.delete("/:userId/journal/:entryId", async (request, reply) => {
    const params = z.object({ userId: z.string().uuid(), entryId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(params.userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const deleted = await journalService.delete(params.entryId, params.userId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "Entry not found" })
    return reply.status(204).send()
  })

  // GET /v1/users/:userId/journal/stats
  app.get("/:userId/journal/stats", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({ days: z.coerce.number().min(7).max(365).default(30) })
      .parse(request.query)

    const to = new Date()
    const from = new Date(to.getTime() - query.days * 24 * 60 * 60 * 1000)
    const stats = await journalService.getStats(userId, { from, to })
    return reply.send(stats)
  })
}

export default journalRoutes
