import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { getDb, aiProviders } from "@biosync-io/db"
import { encrypt, decrypt } from "../../lib/crypto.js"
import { eq } from "drizzle-orm"
import OpenAI from "openai"
import Anthropic from "@anthropic-ai/sdk"

const encryptionKey = process.env.ENCRYPTION_KEY ?? ""

/** Mask an API key to show only the last 4 characters. */
function maskKey(key: string): string {
  if (key.length <= 4) return key
  return "•".repeat(key.length - 4) + key.slice(-4)
}

const providerSchema = z.object({
  name: z.string().min(1).max(255),
  providerType: z.string().min(1).max(50),
  model: z.string().min(1).max(100),
  apiKey: z.string().optional(),
  baseUrl: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
})

const aiProvidersRoutes: FastifyPluginAsync = async (app) => {
  const db = getDb()

  // GET / — list all providers (masked API keys)
  app.get("/", async (_request, reply) => {
    const rows = await db.select().from(aiProviders).orderBy(aiProviders.createdAt)

    const result = rows.map((row) => {
      let maskedKey: string | null = null
      if (row.encryptedApiKey) {
        try {
          const plain = decrypt(row.encryptedApiKey, encryptionKey)
          maskedKey = maskKey(plain)
        } catch {
          maskedKey = "••••"
        }
      }
      return {
        id: row.id,
        name: row.name,
        providerType: row.providerType,
        model: row.model,
        apiKey: maskedKey,
        baseUrl: row.baseUrl,
        isDefault: row.isDefault,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    })

    return reply.send({ data: result })
  })

  // POST / — create provider
  app.post("/", async (request, reply) => {
    const body = providerSchema.parse(request.body)

    const encryptedApiKey = body.apiKey ? encrypt(body.apiKey, encryptionKey) : null

    // If marking as default, clear other defaults first
    if (body.isDefault) {
      await db.update(aiProviders).set({ isDefault: false })
    }

    const [created] = await db
      .insert(aiProviders)
      .values({
        name: body.name,
        providerType: body.providerType,
        model: body.model,
        encryptedApiKey,
        baseUrl: body.baseUrl ?? null,
        isDefault: body.isDefault ?? false,
      })
      .returning()

    return reply.status(201).send(created)
  })

  // PUT /:id — update provider
  app.put("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = providerSchema.partial().parse(request.body)

    const [existing] = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, id))
      .limit(1)

    if (!existing) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "AI provider not found" })
    }

    // If marking as default, clear other defaults first
    if (body.isDefault) {
      await db.update(aiProviders).set({ isDefault: false })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined) updates.name = body.name
    if (body.providerType !== undefined) updates.providerType = body.providerType
    if (body.model !== undefined) updates.model = body.model
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault
    if (body.apiKey !== undefined) {
      updates.encryptedApiKey = body.apiKey ? encrypt(body.apiKey, encryptionKey) : null
    }

    const [updated] = await db
      .update(aiProviders)
      .set(updates)
      .where(eq(aiProviders.id, id))
      .returning()

    return reply.send(updated)
  })

  // DELETE /:id — delete provider
  app.delete("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const [deleted] = await db
      .delete(aiProviders)
      .where(eq(aiProviders.id, id))
      .returning({ id: aiProviders.id })

    if (!deleted) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "AI provider not found" })
    }

    return reply.send({ deleted: true })
  })

  // POST /:id/test — test connection
  app.post("/:id/test", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const [provider] = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, id))
      .limit(1)

    if (!provider) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "AI provider not found" })
    }

    let apiKey: string | null = null
    if (provider.encryptedApiKey) {
      apiKey = decrypt(provider.encryptedApiKey, encryptionKey)
    }

    try {
      switch (provider.providerType) {
        case "openai": {
          if (!apiKey) throw new Error("API key required for OpenAI")
          const openai = new OpenAI({
            apiKey,
            ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
          })
          await openai.models.list()
          break
        }
        case "anthropic": {
          if (!apiKey) throw new Error("API key required for Anthropic")
          const anthropic = new Anthropic({ apiKey })
          await anthropic.messages.create({
            model: provider.model,
            max_tokens: 10,
            messages: [{ role: "user", content: "Hi" }],
          })
          break
        }
        case "ollama": {
          const baseUrl = provider.baseUrl ?? "http://localhost:11434"
          const res = await fetch(`${baseUrl}/api/tags`)
          if (!res.ok) throw new Error(`Ollama returned ${res.status}`)
          break
        }
        default:
          return reply
            .status(400)
            .send({ code: "UNSUPPORTED", message: `Provider type '${provider.providerType}' is not supported for testing` })
      }

      return reply.send({ success: true, message: "Connection successful" })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      return reply.status(422).send({ success: false, message: `Connection failed: ${message}` })
    }
  })
}

export default aiProvidersRoutes
