import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { config } from "../../config.js"
import { AuthService } from "../../services/auth.service.js"
import { getEmailService } from "../../services/email.service.js"
import { createHash } from "node:crypto"

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

    // Send verification email
    const emailService = getEmailService()
    const baseUrl = request.headers.origin || config.OAUTH_REDIRECT_BASE_URL
    if (user.email) {
      await emailService.sendVerificationEmail(user.email, user.verificationToken, baseUrl)
    }

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
    // Send verification email
    const emailService = getEmailService()
    const baseUrl = request.headers.origin || config.OAUTH_REDIRECT_BASE_URL
    await emailService.sendVerificationEmail(result.email, result.token, baseUrl)

    request.log.info(
      { verificationUrl: `/v1/auth/verify-email?token=${result.token}` },
      "Verification email sent",
    )
    return reply.send({
      message: "Verification email sent.",
      ...(config.NODE_ENV !== "production" ? { verificationToken: result.token } : {}),
    })
  })

  // POST /forgot-password — request a password reset link
  app.post("/forgot-password", async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body)

    const result = await authService.generatePasswordResetToken(email)

    // Send password reset email
    if (result) {
      const emailService = getEmailService()
      const baseUrl = request.headers.origin || config.OAUTH_REDIRECT_BASE_URL
      await emailService.sendPasswordResetEmail(email, result.token, baseUrl)
    }

    // Always return success to prevent email enumeration
    const response: Record<string, string> = {
      message: "If an account with that email exists, a password reset link has been sent.",
    }

    if (result && config.NODE_ENV !== "production") {
      // Dev mode: include the token directly for testing
      response.resetToken = result.token
      response.resetUrl = `/login/reset-password?token=${result.token}`
      request.log.info({ resetUrl: response.resetUrl }, "Password reset link (dev mode)")
    }

    return reply.send(response)
  })

  // POST /reset-password — reset password with token
  app.post("/reset-password", async (request, reply) => {
    const { token, newPassword } = z.object({
      token: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    }).parse(request.body)

    try {
      await authService.resetPassword(token, newPassword)
      return reply.send({ message: "Password has been reset. You can now sign in." })
    } catch (err) {
      return reply.status(400).send({
        code: "INVALID_TOKEN",
        message: "Invalid or expired reset link. Please request a new one.",
      })
    }
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

  // POST /setup-password — for migrated users setting password for first time
  app.post("/setup-password", async (request, reply) => {
    const body = z.object({
      token: z.string().min(1),
      password: z.string().min(8).max(128),
    }).parse(request.body)

    try {
      await authService.setupPassword(body.token, body.password)
      return reply.send({ message: "Password set successfully. You can now sign in." })
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode || 400
      return reply.status(statusCode).send({
        code: "INVALID_TOKEN",
        message: statusCode === 400 && (err as Error).message.includes("already has a password")
          ? (err as Error).message
          : "Invalid or expired setup link. Please request a new one.",
      })
    }
  })

  // POST /accept-invite — accept an admin invitation
  app.post("/accept-invite", async (request, reply) => {
    const body = z.object({
      token: z.string().min(1),
      password: z.string().min(8).max(128),
      displayName: z.string().max(255).optional(),
    }).parse(request.body)

    const { adminInvitations, getDb, users, workspaces } = await import("@biosync-io/db")
    const { eq } = await import("drizzle-orm")
    const argon2 = await import("argon2")
    const db = getDb()

    const tokenHash = createHash("sha256").update(body.token).digest("hex")

    // Find invitation by token hash
    const [invitation] = await db
      .select()
      .from(adminInvitations)
      .where(eq(adminInvitations.tokenHash, tokenHash))
      .limit(1)

    if (!invitation) {
      return reply.status(400).send({
        code: "INVALID_TOKEN",
        message: "Invalid invitation token.",
      })
    }

    if (invitation.acceptedAt) {
      return reply.status(400).send({
        code: "ALREADY_ACCEPTED",
        message: "This invitation has already been accepted.",
      })
    }

    if (invitation.expiresAt < new Date()) {
      return reply.status(400).send({
        code: "EXPIRED",
        message: "This invitation has expired.",
      })
    }

    // Get workspace for the inviting user
    const [inviter] = await db
      .select({ workspaceId: users.workspaceId })
      .from(users)
      .where(eq(users.id, invitation.invitedBy))
      .limit(1)

    if (!inviter) {
      return reply.status(500).send({
        code: "INTERNAL_ERROR",
        message: "Inviting user not found.",
      })
    }

    // Create the admin user
    const passwordHash = await argon2.hash(body.password)
    const [user] = await db
      .insert(users)
      .values({
        workspaceId: inviter.workspaceId,
        externalId: invitation.email,
        email: invitation.email,
        passwordHash,
        role: invitation.role,
        displayName: body.displayName ?? "Admin",
        emailVerified: true,
      })
      .returning()

    // Mark invitation as accepted
    await db
      .update(adminInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(adminInvitations.id, invitation.id))

    request.log.info({ userId: user!.id, email: invitation.email }, "Admin invitation accepted")

    return reply.status(201).send({
      id: user!.id,
      email: user!.email,
      role: user!.role,
      displayName: user!.displayName,
      message: "Account created. You can now log in.",
    })
  })
}

export default authRoutes
