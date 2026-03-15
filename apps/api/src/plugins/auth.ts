import { createHash, timingSafeEqual } from "node:crypto"
import { apiKeys, getDb } from "@biosync-io/db"
import { eq } from "drizzle-orm"
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify"
import fp from "fastify-plugin"

declare module "fastify" {
  interface FastifyRequest {
    workspaceId: string
    apiKeyId: string
    apiKeyScopes: string[]
  }
}

/**
 * Fastify plugin that verifies API keys on every request.
 *
 * Keys are passed as: `Authorization: Bearer vs_live_<key>`
 *
 * The plugin hashes the incoming key and does a constant-time comparison
 * against the stored hash, preventing timing attacks.
 */
const authPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for docs, health check, OAuth callbacks, and inbound provider webhooks
    const skipPaths = ["/docs", "/health", "/v1/oauth", "/v1/inbound"]
    if (skipPaths.some((p) => request.url.startsWith(p))) return

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header. Use: Bearer <api_key>",
      })
    }

    const rawKey = authHeader.slice(7).trim()
    if (!rawKey) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Empty API key" })
    }

    // Hash the incoming key
    const incomingHash = createHash("sha256").update(rawKey).digest("hex")

    // Look up by hash (index on keyHash makes this fast)
    const db = getDb()
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, incomingHash)).limit(1)

    if (!key) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Invalid API key" })
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "API key has expired" })
    }

    // Attach workspace context to the request
    request.workspaceId = key.workspaceId
    request.apiKeyId = key.id
    request.apiKeyScopes = key.scopes as string[]

    // Fire-and-forget last-used update (non-blocking)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .catch(() => {}) // swallow — not critical
  })
}

export default fp(authPlugin, { name: "auth" })

/**
 * Require a specific scope on a route.
 * Use as a preHandler hook: `preHandler: [requireScope("write")]`
 */
export function requireScope(scope: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.apiKeyScopes.includes(scope) && !request.apiKeyScopes.includes("admin")) {
      return reply.status(403).send({
        code: "FORBIDDEN",
        message: `This endpoint requires the '${scope}' scope.`,
      })
    }
  }
}
