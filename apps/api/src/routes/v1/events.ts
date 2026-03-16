import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { EventService } from "../../services/event.service.js"
import { UserService } from "../../services/user.service.js"

const eventService = new EventService()
const userService = new UserService()

const eventsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/users/:userId/events — list events with cursor-based pagination
  app.get("/:userId/events", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const query = z
      .object({
        eventType: z.enum(["workout", "sleep", "activity"]).optional(),
        activityType: z.string().max(100).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
        cursor: z.string().optional(),
      })
      .parse(request.query)

    const result = await eventService.query({
      userId,
      workspaceId: request.workspaceId,
      limit: query.limit,
      ...(query.eventType !== undefined && { eventType: query.eventType }),
      ...(query.activityType !== undefined && { activityType: query.activityType }),
      ...(query.from !== undefined && { from: new Date(query.from) }),
      ...(query.to !== undefined && { to: new Date(query.to) }),
      ...(query.cursor !== undefined && { cursor: query.cursor }),
    })

    return reply.send(result)
  })

  // GET /v1/users/:userId/events/:eventId — single event detail
  app.get("/:userId/events/:eventId", async (request, reply) => {
    const { userId, eventId } = z
      .object({ userId: z.string().uuid(), eventId: z.string().uuid() })
      .parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const event = await eventService.findById(eventId, userId)
    if (!event) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Event not found" })
    }

    return reply.send(event)
  })
}

export default eventsRoutes
