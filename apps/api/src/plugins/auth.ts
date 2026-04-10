import { createHash, timingSafeEqual } from "node:crypto"
import { apiKeys, getDb } from "@biosync-io/db"
import { eq } from "drizzle-orm"
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import * as jose from "jose"
import { config } from "../config.js"

const jwtSecret = new TextEncoder().encode(config.JWT_SECRET)

declare module "fastify" {
  interface FastifyRequest {
    workspaceId: string
    apiKeyId: string
    apiKeyScopes: string[]
    authenticatedUserId?: string
    userRole?: string
    sessionId?: string
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
    // Skip auth for docs, health checks, inbound webhooks, SSO, and public auth routes
    // Note: /v1/auth/me, /v1/auth/password, /v1/auth/mfa/* need auth — only skip public endpoints
    const skipPaths = ["/docs", "/health", "/v1/inbound", "/v1/sso"]
    const skipAuthRoutes = [
      "/v1/auth/login", "/v1/auth/register", "/v1/auth/refresh", "/v1/auth/logout",
      "/v1/auth/verify-email", "/v1/auth/forgot-password", "/v1/auth/reset-password",
      "/v1/auth/accept-invite",
      "/v1/auth/setup-password",
    ]
    if (skipPaths.some((p) => request.url.startsWith(p))) return
    if (skipAuthRoutes.some((p) => request.url.startsWith(p))) return
    // OAuth authorize and callbacks are browser redirects — no API key in this flow
    if (/^\/v1\/oauth\/[^/]+\/(authorize|callback)(\?|$)/.test(request.url)) return

    // ── JWT cookie authentication (dashboard / end-user sessions) ──
    const accessCookie = (request.cookies as Record<string, string | undefined>)?.vs_access
    if (accessCookie) {
      try {
        const { payload } = await jose.jwtVerify(accessCookie, jwtSecret)
        request.workspaceId = payload.wid as string
        request.authenticatedUserId = payload.sub as string
        request.userRole = payload.role as string
        request.sessionId = payload.sid as string
        // JWT auth successful — skip API key check
        return
      } catch {
        // Invalid/expired JWT — fall through to API key check
      }
    }

    // ── API key authentication (M2M) ─────────────────────────────
    // Support API key from query param for SSE endpoints (EventSource can't send headers)
    const query = request.query as Record<string, string | undefined>
    const authHeader = request.headers.authorization
    const rawKey = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : query.apiKey?.trim() ?? ""

    if (!rawKey) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header. Use: Bearer <api_key>",
      })
    }

    // Hash the incoming key — SHA-256 is intentional for token lookup, not password storage.
    // API keys have 192 bits of entropy; deterministic hashing is required for indexed DB lookup.
    // lgtm[js/insufficient-password-hash]
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
    request.apiKeyScopes = (key.scopes as string[]) ?? []

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

/**
 * Require that the authenticated user can only access their own resources.
 * API key (M2M) auth bypasses this check. Admin users also bypass.
 */
export function requireSelf() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // API key auth (M2M) → full workspace access
    if (!request.authenticatedUserId) return
    // Admin users pass through
    if (request.userRole === "admin") return
    // Extract userId from route params
    const params = request.params as Record<string, string>
    const userId = params.userId
    if (!userId) return
    if (userId !== request.authenticatedUserId) {
      return reply.status(403).send({
        code: "FORBIDDEN",
        message: "You can only access your own data.",
      })
    }
  }
}

/**
 * Require admin role for JWT-authenticated requests.
 * API key (M2M) auth bypasses this check.
 */
export function requireAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authenticatedUserId) return // API key auth, skip
    if (request.userRole === "admin") return
    return reply.status(403).send({
      code: "FORBIDDEN",
      message: "Admin access required.",
    })
  }
}
