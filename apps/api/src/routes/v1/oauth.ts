import { providerRegistry } from "@biosync-io/provider-core"
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { config } from "../../config.js"
import { ConnectionService } from "../../services/connection.service.js"

const connectionService = new ConnectionService()

// Simple in-memory store for OAuth state params (use Redis in production cluster)
const stateStore = new Map<string, { userId: string; workspaceId: string; codeVerifier?: string }>()

function cleanExpiredState() {
  // States older than 10 minutes are removed — called lazily
  const TEN_MIN = 10 * 60 * 1000
  const now = Date.now()
  for (const [key, _] of stateStore) {
    const timestamp = Number(key.split("_")[0])
    if (!Number.isNaN(timestamp) && now - timestamp > TEN_MIN) stateStore.delete(key)
  }
}

const oauthRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/oauth/:providerId/authorize?userId=<id>
   * Redirects the user's browser to the provider's authorization page.
   */
  app.get("/:providerId/authorize", async (request, reply) => {
    const { providerId } = z.object({ providerId: z.string() }).parse(request.params)
    const { userId } = z
      .object({ userId: z.string().uuid("userId must be a valid UUID") })
      .parse(request.query)

    if (!providerRegistry.isRegistered(providerId)) {
      return reply
        .status(404)
        .send({ code: "NOT_FOUND", message: `Provider '${providerId}' is not available` })
    }

    cleanExpiredState()

    const state = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const redirectUri = `${config.OAUTH_REDIRECT_BASE_URL}/v1/oauth/${providerId}/callback`

    const { url, codeVerifier } = await connectionService.getAuthorizationUrl(
      providerId,
      redirectUri,
      state,
    )

    stateStore.set(state, { userId, workspaceId: request.workspaceId, codeVerifier })

    return reply.redirect(url, 302)
  })

  /**
   * GET /v1/oauth/:providerId/callback?code=<code>&state=<state>
   * Provider redirects back here after authorization.
   */
  app.get("/:providerId/callback", async (request, reply) => {
    const { providerId } = z.object({ providerId: z.string() }).parse(request.params)
    const { code, state, error, error_description } = z
      .object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      })
      .parse(request.query)

    if (error) {
      app.log.warn({ providerId, error, error_description }, "OAuth authorization error")
      return reply.status(400).send({ code: "OAUTH_ERROR", message: error_description ?? error })
    }

    if (!code || !state) {
      return reply
        .status(400)
        .send({ code: "OAUTH_ERROR", message: "Missing code or state parameter" })
    }

    const stored = stateStore.get(state)
    if (!stored) {
      return reply
        .status(400)
        .send({ code: "OAUTH_STATE_MISMATCH", message: "Invalid or expired state parameter" })
    }

    stateStore.delete(state)

    const redirectUri = `${config.OAUTH_REDIRECT_BASE_URL}/v1/oauth/${providerId}/callback`

    const connection = await connectionService.completeOAuth2({
      userId: stored.userId,
      workspaceId: stored.workspaceId,
      providerId,
      code,
      redirectUri,
      codeVerifier: stored.codeVerifier,
    })

    return reply.send({
      message: "Connected successfully",
      connectionId: connection.id,
      providerId,
    })
  })
}

export default oauthRoutes
