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

    stateStore.set(state, {
      userId,
      workspaceId: request.workspaceId,
      ...(codeVerifier !== undefined && { codeVerifier }),
    })

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
      return reply
        .status(200)
        .type("text/html")
        .send(oauthResultPage({ success: false, providerId, error: error_description ?? error }))
    }

    if (!code || !state) {
      return reply
        .status(200)
        .type("text/html")
        .send(oauthResultPage({ success: false, providerId, error: "Missing code or state parameter" }))
    }

    const stored = stateStore.get(state)
    if (!stored) {
      return reply
        .status(200)
        .type("text/html")
        .send(oauthResultPage({ success: false, providerId, error: "Invalid or expired state. Please try again." }))
    }

    stateStore.delete(state)

    const redirectUri = `${config.OAUTH_REDIRECT_BASE_URL}/v1/oauth/${providerId}/callback`

    let connection: { id: string }
    try {
      connection = await connectionService.completeOAuth2({
        userId: stored.userId,
        workspaceId: stored.workspaceId,
        providerId,
        code,
        redirectUri,
        ...(stored.codeVerifier !== undefined && { codeVerifier: stored.codeVerifier }),
      })
    } catch (err) {
      app.log.error({ providerId, err }, "OAuth code exchange failed")
      return reply
        .status(200)
        .type("text/html")
        .send(oauthResultPage({ success: false, providerId, error: "Token exchange failed. Please try again." }))
    }

    return reply
      .type("text/html")
      .send(
        oauthResultPage({
          success: true,
          providerId,
          connectionId: connection.id,
        }),
      )
  })
}

/** Returns a small HTML page that notifies the opener window and auto-closes. */
function oauthResultPage(result: { success: boolean; providerId: string; connectionId?: string; error?: string }): string {
  const payload = JSON.stringify(result)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${result.success ? "Connected" : "Error"} — VitaSync</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f8fafc; color: #1e293b; }
    .card { text-align: center; padding: 2.5rem 2rem; border-radius: 1rem; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.08); max-width: 360px; width: 90%; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: .5rem; }
    p { font-size: .875rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${result.success ? "✅" : "❌"}</div>
    <h1>${result.success ? `${result.providerId.charAt(0).toUpperCase() + result.providerId.slice(1)} Connected!` : "Connection Failed"}</h1>
    <p>${result.success ? "This window will close automatically." : (result.error ?? "Something went wrong.")}</p>
  </div>
  <script>
    (function () {
      var data = ${payload};
      data.type = "vitasync-oauth-result";
      if (window.opener) {
        window.opener.postMessage(data, window.location.origin);
      }
      setTimeout(function () { window.close(); }, 1500);
    })();
  </script>
</body>
</html>`
}

export default oauthRoutes
