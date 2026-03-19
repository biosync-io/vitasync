import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { UserService } from "../../services/user.service.js"
import { ChatService } from "../../services/chat.service.js"

const userService = new UserService()
const chatService = new ChatService()

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string(),
})

/**
 * Chat routes — AI-powered health data Q&A.
 * POST /:userId/chat — send a message, get a grounded response
 */
const chatRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/users/:userId/chat — AI chat
  app.post("/:userId/chat", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const owner = await userService.findById(userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const body = z
      .object({
        message: z.string().min(1).max(2000),
        history: z.array(chatMessageSchema).max(50).optional(),
      })
      .parse(request.body)

    const result = await chatService.processMessage(userId, body)
    return reply.send({ data: result })
  })
}

export default chatRoutes
