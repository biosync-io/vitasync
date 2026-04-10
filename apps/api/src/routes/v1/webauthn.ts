import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { WebauthnService } from "../../services/webauthn.service.js"

const webauthnService = new WebauthnService()

const webauthnRoutes: FastifyPluginAsync = async (app) => {
  // ── Registration (requires existing auth) ────────────────────

  // POST /v1/auth/webauthn/register/options
  app.post("/register/options", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Login required" })
    }
    const { options } = await webauthnService.generateRegistrationOptions(
      request.authenticatedUserId,
    )
    return reply.send(options)
  })

  // POST /v1/auth/webauthn/register/verify
  app.post("/register/verify", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Login required" })
    }
    const body = z
      .object({
        response: z.any(),
        friendlyName: z.string().max(255).optional(),
      })
      .parse(request.body)

    const result = await webauthnService.verifyRegistration(
      request.authenticatedUserId,
      body.response,
      body.friendlyName,
    )

    if (!result.verified) {
      return reply.status(400).send({
        code: "VERIFICATION_FAILED",
        message: "WebAuthn registration verification failed",
      })
    }

    return reply.status(201).send({ credentialId: result.credentialId })
  })

  // ── Authentication (public, no auth required) ─────────────────

  // POST /v1/auth/webauthn/login/options
  app.post("/login/options", async (request, reply) => {
    const body = z
      .object({ email: z.string().email().optional() })
      .parse(request.body)

    const { options, sessionKey } =
      await webauthnService.generateAuthenticationOptions(body.email)

    // Store session key in a short-lived cookie so callback can find it
    reply.setCookie("vs_webauthn_session", sessionKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 300, // 5 minutes
    })

    return reply.send(options)
  })

  // POST /v1/auth/webauthn/login/verify
  app.post("/login/verify", async (request, reply) => {
    const sessionKey = (request.cookies as Record<string, string>)?.vs_webauthn_session
    if (!sessionKey) {
      return reply.status(400).send({
        code: "MISSING_SESSION",
        message: "WebAuthn session not found. Start with /login/options first.",
      })
    }

    const body = z.object({ response: z.any() }).parse(request.body)
    const result = await webauthnService.verifyAuthentication(sessionKey, body.response)

    // Clear the session cookie
    reply.clearCookie("vs_webauthn_session", { path: "/" })

    if (!result.verified || !result.userId) {
      return reply.status(401).send({
        code: "VERIFICATION_FAILED",
        message: "WebAuthn authentication failed",
      })
    }

    // The caller (auth routes) will need to create a session for this user.
    // For now, return the userId — the login page will call /auth/login-webauthn
    // which creates the JWT session.
    return reply.send({ verified: true, userId: result.userId })
  })

  // ── Credential management (requires auth) ─────────────────────

  // GET /v1/auth/webauthn/credentials
  app.get("/credentials", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Login required" })
    }
    const credentials = await webauthnService.listCredentials(
      request.authenticatedUserId,
    )
    return reply.send(credentials)
  })

  // DELETE /v1/auth/webauthn/credentials/:credentialId
  app.delete("/credentials/:credentialId", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Login required" })
    }
    const { credentialId } = z
      .object({ credentialId: z.string().uuid() })
      .parse(request.params)

    const deleted = await webauthnService.deleteCredential(
      credentialId,
      request.authenticatedUserId,
    )
    if (!deleted) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Credential not found" })
    }
    return reply.status(204).send()
  })
}

export default webauthnRoutes
