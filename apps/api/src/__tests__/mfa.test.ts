import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FastifyInstance } from "fastify"
import Fastify from "fastify"
import { ZodError } from "zod"

// Mock @biosync-io/db so identity-providers.ts (loaded by registerV1Routes)
// doesn't blow up calling getDb() at module scope.
vi.mock("@biosync-io/db", () => {
  const noop = () => ({})
  const chain: any = new Proxy(noop, {
    apply: () => chain,
    get: () => chain,
  })
  return {
    getDb: () => chain,
    // Table stubs referenced across all routes
    ...Object.fromEntries(
      [
        "users","healthMetrics","events","providerConnections","goals",
        "healthScores","moodLogs","nutritionLogs","medications","anomalyAlerts",
        "correlations","healthReports","dataExports","trainingPlans","symptomLogs",
        "biometricBaselines","healthSnapshots","personalRecords","journalEntries",
        "waterIntake","habits","userSessions","userIdentities","userConsents",
        "mfaTotp","webauthnCredentials","auditLog","inAppNotifications","trainingLoad",
        "apiKeys","webhooks","webhookEvents","syncJobs","achievementDefinitions",
        "userAchievements","challenges","challengeParticipants","identityProviders",
      ].map((t) => [t, new Proxy({}, { get: (_, p) => `${t}.${String(p)}` })]),
    ),
  }
})

vi.mock("../services/mfa.service.js", () => {
  const MfaService = vi.fn()
  MfaService.prototype.enrollTotp = vi.fn()
  MfaService.prototype.verifyEnrollment = vi.fn()
  MfaService.prototype.validateTotp = vi.fn()
  MfaService.prototype.useRecoveryCode = vi.fn()
  MfaService.prototype.isEnrolled = vi.fn()
  MfaService.prototype.disableTotp = vi.fn()
  return { MfaService }
})

import { MfaService } from "../services/mfa.service.js"
import { registerV1Routes } from "../routes/v1/index.js"

const TEST_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001"
const TEST_API_KEY_ID = "00000000-0000-0000-0000-000000000002"
const TEST_USER_ID = "00000000-0000-0000-0000-000000000003"

/**
 * Build a test app with scopes and optional authenticatedUserId.
 */
async function buildMfaTestApp(opts: {
  scopes?: string[]
  authenticatedUserId?: string
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  app.addHook("onRequest", async (req) => {
    req.workspaceId = TEST_WORKSPACE_ID
    req.apiKeyId = TEST_API_KEY_ID
    req.apiKeyScopes = opts.scopes ?? ["read", "write", "admin"]
    if (opts.authenticatedUserId) {
      req.authenticatedUserId = opts.authenticatedUserId
    }
  })

  app.setErrorHandler(async (error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        errors: error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      })
    }
    return reply
      .status(error.statusCode ?? 500)
      .send({ code: error.code ?? "INTERNAL_ERROR", message: error.message })
  })

  await registerV1Routes(app)
  await app.ready()
  return app
}

describe("MFA routes", () => {
  // ── Unauthenticated requests (no authenticatedUserId) ──────────

  describe("without authenticatedUserId (API-key only)", () => {
    let app: FastifyInstance

    beforeEach(async () => {
      vi.resetAllMocks()
      app = await buildMfaTestApp()
    })

    it("GET /v1/auth/mfa/status returns 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/auth/mfa/status",
      })
      expect(res.statusCode).toBe(401)
      expect(res.json()).toMatchObject({ code: "UNAUTHORIZED" })
    })

    it("POST /v1/auth/mfa/totp/enroll returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/mfa/totp/enroll",
      })
      expect(res.statusCode).toBe(401)
    })

    it("POST /v1/auth/mfa/totp/verify returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/mfa/totp/verify",
        body: { code: "123456" },
      })
      expect(res.statusCode).toBe(401)
    })

    it("DELETE /v1/auth/mfa/totp returns 401", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/v1/auth/mfa/totp",
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // ── Authenticated requests ────────────────────────────────────

  describe("with authenticatedUserId", () => {
    let app: FastifyInstance

    beforeEach(async () => {
      vi.resetAllMocks()
      app = await buildMfaTestApp({ authenticatedUserId: TEST_USER_ID })
    })

    describe("GET /v1/auth/mfa/status", () => {
      it("returns enrolled: true when MFA is active", async () => {
        vi.mocked(MfaService.prototype.isEnrolled).mockResolvedValue(true)

        const res = await app.inject({
          method: "GET",
          url: "/v1/auth/mfa/status",
        })

        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ enrolled: true })
        expect(MfaService.prototype.isEnrolled).toHaveBeenCalledWith(
          TEST_USER_ID,
        )
      })

      it("returns enrolled: false when MFA is not active", async () => {
        vi.mocked(MfaService.prototype.isEnrolled).mockResolvedValue(false)

        const res = await app.inject({
          method: "GET",
          url: "/v1/auth/mfa/status",
        })

        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ enrolled: false })
      })
    })

    describe("POST /v1/auth/mfa/totp/enroll", () => {
      it("returns secret, URI and recovery codes", async () => {
        vi.mocked(MfaService.prototype.enrollTotp).mockResolvedValue({
          secret: "JBSWY3DPEHPK3PXP",
          uri: "otpauth://totp/VitaSync:user?secret=JBSWY3DPEHPK3PXP&issuer=VitaSync",
          recoveryCodes: ["ABCDE-12345", "FGHIJ-67890"],
        })

        const res = await app.inject({
          method: "POST",
          url: "/v1/auth/mfa/totp/enroll",
        })

        expect(res.statusCode).toBe(200)
        const body = res.json()
        expect(body).toHaveProperty("secret")
        expect(body).toHaveProperty("uri")
        expect(body).toHaveProperty("recoveryCodes")
        expect(body.recoveryCodes).toHaveLength(2)
      })

      it("returns 409 when TOTP is already enrolled", async () => {
        vi.mocked(MfaService.prototype.enrollTotp).mockRejectedValue(
          new Error("TOTP already enrolled. Disable it first."),
        )

        const res = await app.inject({
          method: "POST",
          url: "/v1/auth/mfa/totp/enroll",
        })

        expect(res.statusCode).toBe(409)
        expect(res.json()).toMatchObject({ code: "CONFLICT" })
      })
    })

    describe("POST /v1/auth/mfa/totp/verify", () => {
      it("returns verified: true for valid code", async () => {
        vi.mocked(MfaService.prototype.verifyEnrollment).mockResolvedValue(
          true,
        )

        const res = await app.inject({
          method: "POST",
          url: "/v1/auth/mfa/totp/verify",
          body: { code: "123456" },
        })

        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ verified: true })
        expect(MfaService.prototype.verifyEnrollment).toHaveBeenCalledWith(
          TEST_USER_ID,
          "123456",
        )
      })

      it("returns 400 for invalid code", async () => {
        vi.mocked(MfaService.prototype.verifyEnrollment).mockResolvedValue(
          false,
        )

        const res = await app.inject({
          method: "POST",
          url: "/v1/auth/mfa/totp/verify",
          body: { code: "000000" },
        })

        expect(res.statusCode).toBe(400)
        expect(res.json()).toMatchObject({ code: "INVALID_CODE" })
      })

      it("returns 400 when code is wrong length", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/v1/auth/mfa/totp/verify",
          body: { code: "12" },
        })

        expect(res.statusCode).toBe(400)
      })
    })

    describe("DELETE /v1/auth/mfa/totp", () => {
      it("returns 204 on successful disable", async () => {
        vi.mocked(MfaService.prototype.disableTotp).mockResolvedValue(true)

        const res = await app.inject({
          method: "DELETE",
          url: "/v1/auth/mfa/totp",
        })

        expect(res.statusCode).toBe(204)
        expect(MfaService.prototype.disableTotp).toHaveBeenCalledWith(
          TEST_USER_ID,
        )
      })

      it("returns 404 when no enrollment exists", async () => {
        vi.mocked(MfaService.prototype.disableTotp).mockResolvedValue(false)

        const res = await app.inject({
          method: "DELETE",
          url: "/v1/auth/mfa/totp",
        })

        expect(res.statusCode).toBe(404)
        expect(res.json()).toMatchObject({ code: "NOT_FOUND" })
      })
    })
  })

  // ── TOTP validate (MFA token flow) ────────────────────────────

  describe("POST /v1/auth/mfa/totp/validate", () => {
    let app: FastifyInstance

    beforeEach(async () => {
      vi.resetAllMocks()
      app = await buildMfaTestApp()
    })

    function createMfaToken(
      payload: Record<string, unknown>,
      secret = "test-jwt-secret-at-least-32-characters-long-xxxxxxxxx",
    ): string {
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
      const { createHmac } = require("node:crypto")
      const sig = createHmac("sha256", secret)
        .update(`${header}.${body}`)
        .digest("base64url")
      return `${header}.${body}.${sig}`
    }

    it("returns validated: true for valid token and code", async () => {
      vi.mocked(MfaService.prototype.validateTotp).mockResolvedValue(true)

      const token = createMfaToken({
        sub: TEST_USER_ID,
        wid: TEST_WORKSPACE_ID,
        purpose: "mfa",
        exp: Math.floor(Date.now() / 1000) + 300,
      })

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/mfa/totp/validate",
        body: { mfaToken: token, code: "123456" },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ validated: true, userId: TEST_USER_ID })
    })

    it("returns 400 for invalid TOTP code", async () => {
      vi.mocked(MfaService.prototype.validateTotp).mockResolvedValue(false)

      const token = createMfaToken({
        sub: TEST_USER_ID,
        wid: TEST_WORKSPACE_ID,
        purpose: "mfa",
        exp: Math.floor(Date.now() / 1000) + 300,
      })

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/mfa/totp/validate",
        body: { mfaToken: token, code: "000000" },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json()).toMatchObject({ code: "INVALID_CODE" })
    })

    it("returns 401 for expired MFA token", async () => {
      const token = createMfaToken({
        sub: TEST_USER_ID,
        wid: TEST_WORKSPACE_ID,
        purpose: "mfa",
        exp: Math.floor(Date.now() / 1000) - 60, // expired
      })

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/mfa/totp/validate",
        body: { mfaToken: token, code: "123456" },
      })

      expect(res.statusCode).toBe(401)
    })

    it("returns 401 for wrong purpose in MFA token", async () => {
      const token = createMfaToken({
        sub: TEST_USER_ID,
        wid: TEST_WORKSPACE_ID,
        purpose: "not-mfa",
        exp: Math.floor(Date.now() / 1000) + 300,
      })

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/mfa/totp/validate",
        body: { mfaToken: token, code: "123456" },
      })

      expect(res.statusCode).toBe(401)
    })

    it("returns 401 for malformed MFA token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/mfa/totp/validate",
        body: { mfaToken: "not.a.valid.jwt", code: "123456" },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  // ── Recovery code flow ────────────────────────────────────────

  describe("POST /v1/auth/mfa/recovery", () => {
    let app: FastifyInstance

    beforeEach(async () => {
      vi.resetAllMocks()
      app = await buildMfaTestApp()
    })

    function createMfaToken(
      payload: Record<string, unknown>,
    ): string {
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
      const { createHmac } = require("node:crypto")
      const sig = createHmac("sha256", "secret")
        .update(`${header}.${body}`)
        .digest("base64url")
      return `${header}.${body}.${sig}`
    }

    it("returns validated: true with a valid recovery code", async () => {
      vi.mocked(MfaService.prototype.useRecoveryCode).mockResolvedValue(true)

      const token = createMfaToken({
        sub: TEST_USER_ID,
        wid: TEST_WORKSPACE_ID,
        purpose: "mfa",
        exp: Math.floor(Date.now() / 1000) + 300,
      })

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/mfa/recovery",
        body: { mfaToken: token, code: "ABCDE-12345" },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({
        validated: true,
        userId: TEST_USER_ID,
      })
    })

    it("returns 400 for invalid recovery code", async () => {
      vi.mocked(MfaService.prototype.useRecoveryCode).mockResolvedValue(false)

      const token = createMfaToken({
        sub: TEST_USER_ID,
        wid: TEST_WORKSPACE_ID,
        purpose: "mfa",
        exp: Math.floor(Date.now() / 1000) + 300,
      })

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/mfa/recovery",
        body: { mfaToken: token, code: "WRONG-CODE1" },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json()).toMatchObject({ code: "INVALID_CODE" })
    })

    it("returns 401 for expired MFA token", async () => {
      const token = createMfaToken({
        sub: TEST_USER_ID,
        wid: TEST_WORKSPACE_ID,
        purpose: "mfa",
        exp: Math.floor(Date.now() / 1000) - 60,
      })

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/mfa/recovery",
        body: { mfaToken: token, code: "ABCDE-12345" },
      })

      expect(res.statusCode).toBe(401)
    })
  })
})
