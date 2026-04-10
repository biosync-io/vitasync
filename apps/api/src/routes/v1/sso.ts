import { createHash, randomBytes } from "node:crypto"
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { config } from "../../config.js"
import { SsoService } from "../../services/sso.service.js"

const ssoService = new SsoService()

// ── Helpers ──────────────────────────────────────────────────────

function parseExpiry(val: string): number {
  const match = val.match(/^(\d+)([smhd])$/)
  if (!match) return 900
  const n = match[1]!
  const unit = match[2]!
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
  return Number(n) * (multipliers[unit] ?? 60)
}

const cookieOpts = {
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
}

// Simple in-memory state store for OIDC/SAML state parameters
const stateStore = new Map<
  string,
  { idpId: string; workspaceId: string; codeVerifier?: string; expiresAt: number }
>()

// Periodic cleanup of expired state entries
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of stateStore) {
    if (now > val.expiresAt) stateStore.delete(key)
  }
}, 60_000).unref()

// ── Plugin ──────────────────────────────────────────────────────

const ssoRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/sso/providers — list enabled IdPs for a workspace (public, no auth required)
  app.get("/providers", async (request, reply) => {
    const workspaceId = request.workspaceId
    if (!workspaceId) return reply.send([])
    const providers = await ssoService.listPublicProviders(workspaceId)
    return reply.send(providers)
  })

  // GET /v1/sso/:slug/authorize — redirect user to the external IdP
  app.get("/:slug/authorize", async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params)
    const idp = await ssoService.findIdp(slug)
    if (!idp) {
      return reply
        .status(404)
        .send({ code: "NOT_FOUND", message: "Identity provider not found" })
    }

    if (idp.protocol === "oidc") {
      const state = randomBytes(32).toString("hex")
      const codeVerifier = randomBytes(32).toString("hex")
      const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url")

      stateStore.set(state, {
        idpId: idp.id,
        workspaceId: idp.workspaceId,
        codeVerifier,
        expiresAt: Date.now() + 10 * 60 * 1000,
      })

      const scopes = ((idp.oidcScopes as string[] | null) ?? ["openid", "email", "profile"]).join(
        " ",
      )
      const callbackUrl = `${config.SSO_CALLBACK_BASE_URL}/v1/sso/${slug}/callback`

      // Build authorisation URL from the OIDC issuer
      const authUrl = new URL(`${idp.oidcIssuer}/authorize`)
      authUrl.searchParams.set("client_id", idp.oidcClientId ?? "")
      authUrl.searchParams.set("response_type", "code")
      authUrl.searchParams.set("redirect_uri", callbackUrl)
      authUrl.searchParams.set("scope", scopes)
      authUrl.searchParams.set("state", state)
      authUrl.searchParams.set("code_challenge", codeChallenge)
      authUrl.searchParams.set("code_challenge_method", "S256")

      return reply.redirect(authUrl.toString())
    }

    if (idp.protocol === "saml") {
      const state = randomBytes(32).toString("hex")
      stateStore.set(state, {
        idpId: idp.id,
        workspaceId: idp.workspaceId,
        expiresAt: Date.now() + 10 * 60 * 1000,
      })

      const ssoUrl = new URL(idp.samlSsoUrl ?? "")
      ssoUrl.searchParams.set("RelayState", state)
      return reply.redirect(ssoUrl.toString())
    }

    return reply
      .status(400)
      .send({ code: "UNSUPPORTED", message: `Unsupported protocol: ${idp.protocol}` })
  })

  // GET /v1/sso/:slug/callback — handle OIDC callback via query params
  app.get("/:slug/callback", async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params)
    const query = request.query as Record<string, string | undefined>
    const idp = await ssoService.findIdp(slug)
    if (!idp) {
      return reply
        .status(404)
        .send({ code: "NOT_FOUND", message: "Identity provider not found" })
    }

    if (idp.protocol !== "oidc") {
      return reply
        .status(400)
        .send({ code: "BAD_REQUEST", message: "GET callback only supported for OIDC" })
    }

    try {
      const { code, state } = query
      if (!code || !state) {
        return reply
          .status(400)
          .send({ code: "BAD_REQUEST", message: "Missing code or state parameter" })
      }

      const storedState = stateStore.get(state)
      if (!storedState || storedState.idpId !== idp.id || Date.now() > storedState.expiresAt) {
        return reply
          .status(400)
          .send({ code: "INVALID_STATE", message: "Invalid or expired state" })
      }
      stateStore.delete(state)

      // OIDC code → token exchange (placeholder — full implementation uses openid-client)
      const subject = `oidc:${createHash("sha256").update(code).digest("hex").slice(0, 32)}`
      const rawAttributes: Record<string, unknown> = { code: code.slice(0, 8) }

      const { userId } = await ssoService.findOrProvisionUser({
        idpId: idp.id,
        workspaceId: idp.workspaceId,
        subject,
        rawAttributes,
        autoProvision: idp.autoProvision,
        defaultRole: idp.defaultRole ?? "user",
        attributeMapping: (idp.attributeMapping as Record<string, string>) ?? {},
      })

      const { accessToken, refreshToken } = await ssoService.createSession(
        userId,
        idp.workspaceId,
        request.headers["user-agent"],
        request.ip,
      )

      reply
        .setCookie("vs_access", accessToken, {
          ...cookieOpts,
          maxAge: parseExpiry(config.ACCESS_TOKEN_EXPIRY),
        })
        .setCookie("vs_refresh", refreshToken, {
          ...cookieOpts,
          maxAge: parseExpiry(config.REFRESH_TOKEN_EXPIRY),
        })

      return reply.redirect("/dashboard?sso=success")
    } catch (err) {
      return reply
        .status(400)
        .send({ code: "SSO_ERROR", message: (err as Error).message })
    }
  })

  // POST /v1/sso/:slug/callback — handle SAML POST-back or OIDC form_post
  app.post("/:slug/callback", async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params)
    const idp = await ssoService.findIdp(slug)
    if (!idp) {
      return reply
        .status(404)
        .send({ code: "NOT_FOUND", message: "Identity provider not found" })
    }

    try {
      let subject: string
      let email: string | undefined
      let displayName: string | undefined
      let rawAttributes: Record<string, unknown> = {}

      if (idp.protocol === "oidc") {
        const body = request.body as Record<string, string>
        const { code, state } = body
        if (!code || !state) {
          return reply
            .status(400)
            .send({ code: "BAD_REQUEST", message: "Missing code or state parameter" })
        }

        const storedState = stateStore.get(state)
        if (!storedState || storedState.idpId !== idp.id || Date.now() > storedState.expiresAt) {
          return reply
            .status(400)
            .send({ code: "INVALID_STATE", message: "Invalid or expired state" })
        }
        stateStore.delete(state)

        // OIDC code → token exchange (placeholder — full implementation uses openid-client)
        subject = `oidc:${createHash("sha256").update(code).digest("hex").slice(0, 32)}`
        email = body.email
        rawAttributes = body
      } else if (idp.protocol === "saml") {
        const body = request.body as Record<string, string>
        const samlResponse = body.SAMLResponse
        const relayState = body.RelayState
        if (!samlResponse) {
          return reply
            .status(400)
            .send({ code: "MISSING_RESPONSE", message: "SAMLResponse missing" })
        }

        if (relayState) {
          const storedState = stateStore.get(relayState)
          if (
            !storedState ||
            storedState.idpId !== idp.id ||
            Date.now() > storedState.expiresAt
          ) {
            return reply
              .status(400)
              .send({ code: "INVALID_STATE", message: "Invalid or expired RelayState" })
          }
          stateStore.delete(relayState)
        }

        // Simplified SAML response handling (placeholder — full implementation uses @node-saml/node-saml)
        subject = `saml:${createHash("sha256").update(samlResponse).digest("hex").slice(0, 32)}`
        rawAttributes = body
      } else {
        return reply
          .status(400)
          .send({ code: "UNSUPPORTED", message: `Unsupported protocol: ${idp.protocol}` })
      }

      const provisionParams: Parameters<typeof ssoService.findOrProvisionUser>[0] = {
        idpId: idp.id,
        workspaceId: idp.workspaceId,
        subject,
        rawAttributes,
        autoProvision: idp.autoProvision,
        defaultRole: idp.defaultRole ?? "user",
        attributeMapping: (idp.attributeMapping as Record<string, string>) ?? {},
      }
      if (email !== undefined) provisionParams.email = email
      if (displayName !== undefined) provisionParams.displayName = displayName

      const { userId } = await ssoService.findOrProvisionUser(provisionParams)

      const { accessToken, refreshToken } = await ssoService.createSession(
        userId,
        idp.workspaceId,
        request.headers["user-agent"],
        request.ip,
      )

      reply
        .setCookie("vs_access", accessToken, {
          ...cookieOpts,
          maxAge: parseExpiry(config.ACCESS_TOKEN_EXPIRY),
        })
        .setCookie("vs_refresh", refreshToken, {
          ...cookieOpts,
          maxAge: parseExpiry(config.REFRESH_TOKEN_EXPIRY),
        })

      return reply.redirect("/dashboard?sso=success")
    } catch (err) {
      return reply
        .status(400)
        .send({ code: "SSO_ERROR", message: (err as Error).message })
    }
  })
}

export default ssoRoutes
