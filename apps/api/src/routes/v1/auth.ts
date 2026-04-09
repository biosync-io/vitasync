import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { config } from "../../config.js"
import { AuthService } from "../../services/auth.service.js"

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

// ── Schemas ─────────────────────────────────────────────────────

const registerBody = z.object({
  externalId: z.string().min(1).max(255),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().max(255).optional(),
  gender: z.string().max(10).optional(),
})

const loginBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
})

const passwordBody = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
})

// ── Plugin ──────────────────────────────────────────────────────

const authRoutes: FastifyPluginAsync = async (app) => {
  const authService = new AuthService()

  // ── Per-route rate limits for auth endpoints ────────────────
  const loginRateLimit = {
    config: {
      rateLimit: { max: 10, timeWindow: 60_000 }, // 10 req/min per IP
    },
  }
  const registerRateLimit = {
    config: {
      rateLimit: { max: 3, timeWindow: 60_000 }, // 3 req/min per IP
    },
  }

  // POST /register
  app.post("/register", registerRateLimit, async (request, reply) => {
    // Require self-registration flag or admin scope (API key)
    if (!config.ALLOW_SELF_REGISTRATION) {
      if (
        !request.apiKeyScopes ||
        (!request.apiKeyScopes.includes("admin") && !request.apiKeyScopes.includes("write"))
      ) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "Self-registration is disabled.",
        })
      }
    }

    // For self-registration without API key, use the default workspace
    let workspaceId = request.workspaceId
    if (!workspaceId) {
      const { getDb, workspaces } = await import("@biosync-io/db")
      const { eq } = await import("drizzle-orm")
      const [ws] = await getDb()
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, config.ADMIN_WORKSPACE_SLUG))
        .limit(1)
      if (!ws) {
        return reply.status(500).send({
          code: "NO_WORKSPACE",
          message: "No default workspace configured.",
        })
      }
      workspaceId = ws.id
    }

    const body = registerBody.parse(request.body)

    const user = await authService.register({
      workspaceId,
      externalId: body.externalId,
      email: body.email,
      password: body.password,
      ...(body.displayName != null ? { displayName: body.displayName } : {}),
      ...(body.gender != null ? { gender: body.gender } : {}),
    })

    return reply.status(201).send({
      id: user.id,
      externalId: user.externalId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: false,
      verificationToken: user.verificationToken,
      message: "Account created. Please verify your email.",
      createdAt: user.createdAt,
    })
  })

  // POST /login
  app.post("/login", loginRateLimit, async (request, reply) => {
    // Resolve workspace: from API key auth or fall back to default workspace
    let workspaceId = request.workspaceId
    if (!workspaceId) {
      const { getDb, workspaces } = await import("@biosync-io/db")
      const { eq } = await import("drizzle-orm")
      const [ws] = await getDb()
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, config.ADMIN_WORKSPACE_SLUG))
        .limit(1)
      if (!ws) {
        return reply.status(500).send({
          code: "NO_WORKSPACE",
          message: "No default workspace configured.",
        })
      }
      workspaceId = ws.id
    }

    const body = loginBody.parse(request.body)

    const { accessToken, refreshToken, user } = await authService.login(
      workspaceId,
      body.email,
      body.password,
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

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    }
  })

  // POST /refresh
  app.post("/refresh", async (request, reply) => {
    const refreshToken = (request.cookies as Record<string, string | undefined>).vs_refresh
    if (!refreshToken) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Missing refresh token.",
      })
    }

    const tokens = await authService.refresh(
      refreshToken,
      request.headers["user-agent"],
      request.ip,
    )

    reply
      .setCookie("vs_access", tokens.accessToken, {
        ...cookieOpts,
        maxAge: parseExpiry(config.ACCESS_TOKEN_EXPIRY),
      })
      .setCookie("vs_refresh", tokens.refreshToken, {
        ...cookieOpts,
        maxAge: parseExpiry(config.REFRESH_TOKEN_EXPIRY),
      })

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }
  })

  // POST /logout
  app.post("/logout", async (request, reply) => {
    const refreshToken = (request.cookies as Record<string, string | undefined>).vs_refresh
    if (refreshToken) {
      await authService.logout(refreshToken)
    }

    reply
      .clearCookie("vs_access", cookieOpts)
      .clearCookie("vs_refresh", cookieOpts)

    return { success: true }
  })

  // POST /logout-all
  app.post("/logout-all", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      })
    }

    await authService.logoutAll(request.authenticatedUserId)

    reply
      .clearCookie("vs_access", cookieOpts)
      .clearCookie("vs_refresh", cookieOpts)

    return { success: true }
  })

  // GET /me
  app.get("/me", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      })
    }

    const user = await authService.getMe(request.authenticatedUserId, request.workspaceId)
    return user
  })

  // GET /verify-email?token=xxx — verify email from link
  app.get("/verify-email", async (request, reply) => {
    const { token } = z.object({ token: z.string() }).parse(request.query)
    try {
      await authService.verifyEmail(token)
      return reply.redirect("/login?verified=true")
    } catch {
      return reply.redirect("/login?verified=false&error=invalid_token")
    }
  })

  // POST /resend-verification — resend verification email (requires auth)
  app.post("/resend-verification", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Login required" })
    }
    const result = await authService.resendVerification(request.authenticatedUserId)
    if (!result) {
      return reply.status(400).send({
        code: "ALREADY_VERIFIED",
        message: "Email already verified or no email set.",
      })
    }
    // In production, send via the notification system. In dev, return the token directly.
    request.log.info(
      { verificationUrl: `/v1/auth/verify-email?token=${result.token}` },
      "Verification email (dev mode)",
    )
    return reply.send({
      message: "Verification email sent.",
      ...(config.NODE_ENV !== "production" ? { verificationToken: result.token } : {}),
    })
  })

  // PATCH /password
  app.patch("/password", async (request, reply) => {
    if (!request.authenticatedUserId) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      })
    }

    const body = passwordBody.parse(request.body)

    await authService.changePassword(
      request.authenticatedUserId,
      body.oldPassword,
      body.newPassword,
    )

    reply
      .clearCookie("vs_access", cookieOpts)
      .clearCookie("vs_refresh", cookieOpts)

    return { success: true, message: "Password changed. All sessions revoked." }
  })
}

export default authRoutes
