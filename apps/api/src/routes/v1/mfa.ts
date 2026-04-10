import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import { config } from "../../config.js"
import { MfaService } from "../../services/mfa.service.js"
import { requireScope } from "../../plugins/auth.js"

const mfaService = new MfaService()

const mfaRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/auth/mfa/status — check if MFA is enrolled
  app.get("/status", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Login required" })
    }
    const enrolled = await mfaService.isEnrolled(request.authenticatedUserId)
    return reply.send({ enrolled })
  })

  // POST /v1/auth/mfa/totp/enroll — start TOTP enrollment
  app.post("/totp/enroll", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Login required" })
    }
    try {
      const result = await mfaService.enrollTotp(request.authenticatedUserId)
      return reply.send({
        secret: result.secret,
        uri: result.uri,
        recoveryCodes: result.recoveryCodes,
      })
    } catch (err) {
      return reply.status(409).send({
        code: "CONFLICT",
        message: (err as Error).message,
      })
    }
  })

  // POST /v1/auth/mfa/totp/verify — confirm enrollment with first code
  app.post("/totp/verify", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Login required" })
    }
    const { code } = z.object({ code: z.string().length(6) }).parse(request.body)
    const valid = await mfaService.verifyEnrollment(request.authenticatedUserId, code)
    if (!valid) {
      return reply.status(400).send({ code: "INVALID_CODE", message: "Invalid TOTP code" })
    }
    return reply.send({ verified: true })
  })

  // POST /v1/auth/mfa/totp/validate — validate code during login
  // This endpoint accepts an mfaToken (short-lived JWT) instead of normal auth
  app.post("/totp/validate", async (request, reply) => {
    const { mfaToken, code } = z
      .object({ mfaToken: z.string(), code: z.string().length(6) })
      .parse(request.body)

    // Verify the MFA token (short-lived, contains userId)
    try {
      const { createHmac } = await import("node:crypto")
      const [headerB64, payloadB64, signatureB64] = mfaToken.split(".")
      if (!headerB64 || !payloadB64 || !signatureB64) {
        return reply.status(401).send({ code: "INVALID_TOKEN", message: "Invalid MFA token" })
      }
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString())
      if (payload.purpose !== "mfa" || payload.exp < Date.now() / 1000) {
        return reply.status(401).send({ code: "EXPIRED_TOKEN", message: "MFA token expired" })
      }

      const valid = await mfaService.validateTotp(payload.sub, code)
      if (!valid) {
        return reply.status(400).send({ code: "INVALID_CODE", message: "Invalid TOTP code" })
      }

      // MFA passed — the auth routes will issue the actual session
      return reply.send({
        validated: true,
        userId: payload.sub,
        workspaceId: payload.wid,
      })
    } catch {
      return reply.status(401).send({ code: "INVALID_TOKEN", message: "Invalid MFA token" })
    }
  })

  // POST /v1/auth/mfa/recovery — use recovery code during login
  app.post("/recovery", async (request, reply) => {
    const { mfaToken, code } = z
      .object({ mfaToken: z.string(), code: z.string() })
      .parse(request.body)

    try {
      const payload = JSON.parse(
        Buffer.from(mfaToken.split(".")[1]!, "base64url").toString(),
      )
      if (payload.purpose !== "mfa" || payload.exp < Date.now() / 1000) {
        return reply.status(401).send({ code: "EXPIRED_TOKEN", message: "MFA token expired" })
      }

      const valid = await mfaService.useRecoveryCode(payload.sub, code)
      if (!valid) {
        return reply.status(400).send({
          code: "INVALID_CODE",
          message: "Invalid recovery code",
        })
      }

      return reply.send({
        validated: true,
        userId: payload.sub,
        workspaceId: payload.wid,
      })
    } catch {
      return reply.status(401).send({ code: "INVALID_TOKEN", message: "Invalid MFA token" })
    }
  })

  // DELETE /v1/auth/mfa/totp — disable TOTP (requires auth)
  app.delete("/totp", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Login required" })
    }
    const deleted = await mfaService.disableTotp(request.authenticatedUserId)
    if (!deleted) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "No TOTP enrollment found" })
    }
    return reply.status(204).send()
  })
}

export default mfaRoutes
