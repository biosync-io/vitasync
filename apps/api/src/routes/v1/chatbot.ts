import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { getDb, aiProviders } from "@biosync-io/db"
import { eq } from "drizzle-orm"
import { ChatbotService } from "../../services/chatbot.service.js"

const chatbotService = new ChatbotService()

const chatbotRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/users/:userId/chatbot — stream SSE response
  app.post("/:userId/chatbot", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)

    const body = z
      .object({
        message: z.string().min(1),
        providerId: z.string().uuid().optional(),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            }),
          )
          .optional(),
      })
      .parse(request.body)

    // Resolve provider: use provided ID, or find default, or first available
    let providerId = body.providerId
    if (!providerId) {
      const db = getDb()
      const [defaultProvider] = await db
        .select({ id: aiProviders.id })
        .from(aiProviders)
        .where(eq(aiProviders.isDefault, true))
        .limit(1)

      if (defaultProvider) {
        providerId = defaultProvider.id
      } else {
        const [firstProvider] = await db
          .select({ id: aiProviders.id })
          .from(aiProviders)
          .limit(1)

        if (!firstProvider) {
          return reply
            .status(400)
            .send({ code: "NO_PROVIDER", message: "No AI provider configured" })
        }
        providerId = firstProvider.id
      }
    }

    // Set SSE headers
    void reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })

    try {
      const stream = chatbotService.streamChat({
        providerId,
        userId,
        message: body.message,
        history: body.history,
      })

      for await (const chunk of stream) {
        reply.raw.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
      }

      reply.raw.write("data: [DONE]\n\n")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      reply.raw.write(`data: ${JSON.stringify({ error: message })}\n\n`)
      reply.raw.write("data: [DONE]\n\n")
    }

    reply.raw.end()
  })
}

export default chatbotRoutes
