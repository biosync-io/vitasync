import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { requireScope } from "../../plugins/auth.js"
import { UserService } from "../../services/user.service.js"

const userService = new UserService()

const CreateUserBody = z.object({
  externalId: z.string().min(1).max(255),
  email: z.string().email().optional(),
  displayName: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const UpdateUserBody = z.object({
  email: z.string().email().optional(),
  displayName: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const usersRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/users — create or find existing user
  app.post("/", { preHandler: [requireScope("write")] }, async (request, reply) => {
    const body = CreateUserBody.parse(request.body)
    const { user, created } = await userService.findOrCreate({
      workspaceId: request.workspaceId,
      externalId: body.externalId,
      ...(body.email !== undefined && { email: body.email }),
      ...(body.displayName !== undefined && { displayName: body.displayName }),
      ...(body.metadata !== undefined && { metadata: body.metadata }),
    })
    return reply.status(created ? 201 : 200).send(user)
  })

  // GET /v1/users — list users in workspace
  app.get("/", async (request, reply) => {
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) })
      .parse(request.query)
    const result = await userService.list(request.workspaceId, query)
    return reply.send(result)
  })

  // GET /v1/users/:userId
  app.get("/:userId", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const user = await userService.findById(userId, request.workspaceId)
    if (!user) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })
    return reply.send(user)
  })

  // PATCH /v1/users/:userId
  app.patch("/:userId", { preHandler: [requireScope("write")] }, async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const body = UpdateUserBody.parse(request.body)
    const user = await userService.update(userId, request.workspaceId, {
      ...(body.email !== undefined && { email: body.email }),
      ...(body.displayName !== undefined && { displayName: body.displayName }),
      ...(body.metadata !== undefined && { metadata: body.metadata }),
    })
    if (!user) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })
    return reply.send(user)
  })

  // DELETE /v1/users/:userId
  app.delete("/:userId", { preHandler: [requireScope("admin")] }, async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const deleted = await userService.delete(userId, request.workspaceId)
    if (!deleted) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })
    return reply.status(204).send()
  })
}

export default usersRoutes
