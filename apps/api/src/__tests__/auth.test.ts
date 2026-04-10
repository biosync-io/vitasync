import { beforeEach, describe, expect, it, vi } from "vitest"
import cookie from "@fastify/cookie"
import Fastify, { type FastifyError } from "fastify"
import { ZodError } from "zod"
import { AuthService } from "../services/auth.service.js"
import authRoutes from "../routes/v1/auth.js"

const TEST_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001"
const TEST_API_KEY_ID = "00000000-0000-0000-0000-000000000002"
const TEST_USER_ID = "00000000-0000-0000-0000-000000000003"

vi.mock("../services/auth.service.js", () => {
  const AuthService = vi.fn()
  AuthService.prototype.register = vi.fn()
  AuthService.prototype.login = vi.fn()
  AuthService.prototype.refresh = vi.fn()
  AuthService.prototype.logout = vi.fn()
  AuthService.prototype.logoutAll = vi.fn()
  AuthService.prototype.changePassword = vi.fn()
  AuthService.prototype.getMe = vi.fn()
  return { AuthService }
})

/** Builds a test app with @fastify/cookie support for auth route tests. */
async function buildAuthTestApp(
  opts: {
    scopes?: string[]
    authenticatedUserId?: string
    userRole?: string
  } = {},
) {
  const app = Fastify({ logger: false })
  await app.register(cookie)

  app.addHook("onRequest", async (req) => {
    req.workspaceId = TEST_WORKSPACE_ID
    req.apiKeyId = TEST_API_KEY_ID
    req.apiKeyScopes = opts.scopes ?? ["read", "write", "admin"]
    if (opts.authenticatedUserId) {
      req.authenticatedUserId = opts.authenticatedUserId
      req.userRole = opts.userRole ?? "user"
    }
  })

  app.setErrorHandler<FastifyError>(async (error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        errors: error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      })
    }
    return reply.status(error.statusCode ?? 500).send({
      code: error.code ?? "INTERNAL_ERROR",
      message: error.message,
    })
  })

  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: "/auth" })
    },
    { prefix: "/v1" },
  )
  await app.ready()
  return app
}

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
  externalId: "ext-001",
  email: "test@example.com",
  passwordHash: "hashed",
  displayName: "Test User",
  gender: null,
  role: "user",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastLoginAt: null,
  metadata: {},
}

describe("Auth routes", () => {
  let app: Awaited<ReturnType<typeof buildAuthTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await buildAuthTestApp()
  })

  // ── POST /v1/auth/register ────────────────────────────────────

  describe("POST /v1/auth/register", () => {
    it("registers a new user and returns 201", async () => {
      vi.mocked(AuthService.prototype.register).mockResolvedValue(mockUser as never)

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        body: {
          externalId: "ext-001",
          email: "test@example.com",
          password: "securepassword123",
        },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({
        id: TEST_USER_ID,
        externalId: "ext-001",
        email: "test@example.com",
      })
      expect(AuthService.prototype.register).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: TEST_WORKSPACE_ID,
          externalId: "ext-001",
          email: "test@example.com",
          password: "securepassword123",
        }),
      )
    })

    it("returns 400 when required fields are missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        body: { email: "test@example.com" },
      })

      expect(res.statusCode).toBe(400)
    })

    it("returns 403 when self-registration is disabled and scope lacks write/admin", async () => {
      // ALLOW_SELF_REGISTRATION defaults to false; build app with only "read" scope
      const restrictedApp = await buildAuthTestApp({ scopes: ["read"] })

      const res = await restrictedApp.inject({
        method: "POST",
        url: "/v1/auth/register",
        body: {
          externalId: "ext-001",
          email: "test@example.com",
          password: "securepassword123",
        },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json()).toMatchObject({ code: "FORBIDDEN" })
    })
  })

  // ── POST /v1/auth/login ───────────────────────────────────────

  describe("POST /v1/auth/login", () => {
    it("returns 200 with tokens and sets cookies", async () => {
      vi.mocked(AuthService.prototype.login).mockResolvedValue({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        user: mockUser,
      } as never)

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        body: { email: "test@example.com", password: "securepassword123" },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toMatchObject({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        user: expect.objectContaining({ id: TEST_USER_ID, email: "test@example.com" }),
      })

      const cookies = res.cookies
      expect(cookies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "vs_access", value: "mock-access-token" }),
          expect.objectContaining({ name: "vs_refresh", value: "mock-refresh-token" }),
        ]),
      )
    })

    it("returns 400 when email is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        body: { password: "securepassword123" },
      })

      expect(res.statusCode).toBe(400)
    })

    it("returns 401 for invalid credentials", async () => {
      vi.mocked(AuthService.prototype.login).mockRejectedValue(
        Object.assign(new Error("Invalid email or password."), { statusCode: 401 }),
      )

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        body: { email: "wrong@example.com", password: "wrongpassword" },
      })

      expect(res.statusCode).toBe(401)
    })

    it("returns 423 when account is locked", async () => {
      vi.mocked(AuthService.prototype.login).mockRejectedValue(
        Object.assign(new Error("Account is temporarily locked. Try again later."), {
          statusCode: 423,
        }),
      )

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        body: { email: "test@example.com", password: "securepassword123" },
      })

      expect(res.statusCode).toBe(423)
    })
  })

  // ── POST /v1/auth/refresh ─────────────────────────────────────

  describe("POST /v1/auth/refresh", () => {
    it("returns 200 with new tokens when refresh cookie is present", async () => {
      vi.mocked(AuthService.prototype.refresh).mockResolvedValue({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      } as never)

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        cookies: { vs_refresh: "old-refresh-token" },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      })
      expect(AuthService.prototype.refresh).toHaveBeenCalledWith(
        "old-refresh-token",
        expect.anything(),
        expect.anything(),
      )
    })

    it("returns 401 when refresh cookie is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
      })

      expect(res.statusCode).toBe(401)
      expect(res.json()).toMatchObject({ code: "UNAUTHORIZED" })
    })
  })

  // ── GET /v1/auth/me ───────────────────────────────────────────

  describe("GET /v1/auth/me", () => {
    it("returns 200 with user data when authenticated", async () => {
      const meUser = {
        id: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        externalId: "ext-001",
        email: "test@example.com",
        displayName: "Test User",
        gender: null,
        role: "user",
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
      }
      vi.mocked(AuthService.prototype.getMe).mockResolvedValue(meUser as never)

      const authedApp = await buildAuthTestApp({
        authenticatedUserId: TEST_USER_ID,
        userRole: "user",
      })

      const res = await authedApp.inject({
        method: "GET",
        url: "/v1/auth/me",
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ id: TEST_USER_ID, email: "test@example.com" })
      expect(AuthService.prototype.getMe).toHaveBeenCalledWith(TEST_USER_ID, TEST_WORKSPACE_ID)
    })

    it("returns 401 when not authenticated", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
      })

      expect(res.statusCode).toBe(401)
      expect(res.json()).toMatchObject({ code: "UNAUTHORIZED" })
    })
  })

  // ── PATCH /v1/auth/password ───────────────────────────────────

  describe("PATCH /v1/auth/password", () => {
    it("returns 200 on successful password change", async () => {
      vi.mocked(AuthService.prototype.changePassword).mockResolvedValue(undefined as never)

      const authedApp = await buildAuthTestApp({
        authenticatedUserId: TEST_USER_ID,
        userRole: "user",
      })

      const res = await authedApp.inject({
        method: "PATCH",
        url: "/v1/auth/password",
        body: { oldPassword: "oldpassword123", newPassword: "newpassword123" },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ success: true })
      expect(AuthService.prototype.changePassword).toHaveBeenCalledWith(
        TEST_USER_ID,
        "oldpassword123",
        "newpassword123",
      )
    })

    it("returns 401 when not authenticated", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/v1/auth/password",
        body: { oldPassword: "oldpassword123", newPassword: "newpassword123" },
      })

      expect(res.statusCode).toBe(401)
      expect(res.json()).toMatchObject({ code: "UNAUTHORIZED" })
    })

    it("returns 401 when old password is incorrect", async () => {
      vi.mocked(AuthService.prototype.changePassword).mockRejectedValue(
        Object.assign(new Error("Current password is incorrect."), { statusCode: 401 }),
      )

      const authedApp = await buildAuthTestApp({
        authenticatedUserId: TEST_USER_ID,
        userRole: "user",
      })

      const res = await authedApp.inject({
        method: "PATCH",
        url: "/v1/auth/password",
        body: { oldPassword: "wrongpassword1", newPassword: "newpassword123" },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  // ── POST /v1/auth/logout ──────────────────────────────────────

  describe("POST /v1/auth/logout", () => {
    it("logs out and clears cookies when refresh token is present", async () => {
      vi.mocked(AuthService.prototype.logout).mockResolvedValue(undefined as never)

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/logout",
        cookies: { vs_refresh: "some-refresh-token" },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ success: true })
      expect(AuthService.prototype.logout).toHaveBeenCalledWith("some-refresh-token")
    })

    it("succeeds even without refresh cookie", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/logout",
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ success: true })
      expect(AuthService.prototype.logout).not.toHaveBeenCalled()
    })
  })

  // ── POST /v1/auth/logout-all ──────────────────────────────────

  describe("POST /v1/auth/logout-all", () => {
    it("logs out all sessions when authenticated", async () => {
      vi.mocked(AuthService.prototype.logoutAll).mockResolvedValue(undefined as never)

      const authedApp = await buildAuthTestApp({
        authenticatedUserId: TEST_USER_ID,
        userRole: "user",
      })

      const res = await authedApp.inject({
        method: "POST",
        url: "/v1/auth/logout-all",
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ success: true })
      expect(AuthService.prototype.logoutAll).toHaveBeenCalledWith(TEST_USER_ID)
    })

    it("returns 401 when not authenticated", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/logout-all",
      })

      expect(res.statusCode).toBe(401)
      expect(res.json()).toMatchObject({ code: "UNAUTHORIZED" })
    })
  })
})
