import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { requireScope } from "../../plugins/auth.js"
import { ApiKeyService } from "../../services/api-key.service.js"

const apiKeyService = new ApiKeyService()

const ApiKeyScopeEnum = z.enum(["read", "write", "admin"])

const apiKeysRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/api-keys — create a new key
  app.post("/", { preHandler: [requireScope("admin")] }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(100),
        scopes: z.array(ApiKeyScopeEnum).min(1),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(request.body)

    const { apiKey, rawKey } = await apiKeyService.create({
      workspaceId: request.workspaceId,
      name: body.name,
      scopes: body.scopes,
      ...(body.expiresAt !== undefined && { expiresAt: new Date(body.expiresAt) }),
    })

    // rawKey is only returned here — never stored, never shown again
    return reply.status(201).send({ ...apiKey, rawKey })
  })

  // GET /v1/api-keys — list all keys in workspace (no raw keys)
  app.get("/", async (request, reply) => {
    const keys = await apiKeyService.list(request.workspaceId)
    return reply.send(keys)
  })

  // DELETE /v1/api-keys/:keyId — revoke
  app.delete("/:keyId", { preHandler: [requireScope("admin")] }, async (request, reply) => {
    const { keyId } = z.object({ keyId: z.string().uuid() }).parse(request.params)
    const ok = await apiKeyService.revoke(keyId, request.workspaceId)
    if (!ok) return reply.status(404).send({ code: "NOT_FOUND", message: "API key not found" })
    return reply.status(204).send()
  })

  // POST /v1/api-keys/:keyId/rotate — invalidate old secret and issue a new one
  app.post("/:keyId/rotate", { preHandler: [requireScope("admin")] }, async (request, reply) => {
    const { keyId } = z.object({ keyId: z.string().uuid() }).parse(request.params)
    const result = await apiKeyService.rotate(keyId, request.workspaceId)
    if (!result) return reply.status(404).send({ code: "NOT_FOUND", message: "API key not found" })
    // rawKey is returned once — caller must store it
    return reply.send({ ...result.apiKey, rawKey: result.rawKey })
  })
}

export default apiKeysRoutes
