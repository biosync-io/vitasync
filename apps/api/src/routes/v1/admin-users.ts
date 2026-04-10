import { getDb, users } from "@biosync-io/db"
import { and, count, eq, isNotNull, isNull, ne, sql } from "drizzle-orm"
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { config } from "../../config.js"
import { AuthService } from "../../services/auth.service.js"
import { getEmailService } from "../../services/email.service.js"
import { requireAdmin } from "../../plugins/auth.js"

const adminUsersRoutes: FastifyPluginAsync = async (app) => {
  const preHandler = [requireAdmin()]
  const authService = new AuthService()

  // POST /v1/admin/users/:userId/promote — promote user to admin
  app.post("/users/:userId/promote", { preHandler }, async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const db = getDb()

    // Cannot promote yourself (already admin)
    if (request.authenticatedUserId && userId === request.authenticatedUserId) {
      return reply.status(400).send({
        code: "SELF_PROMOTE",
        message: "You are already an admin.",
      })
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    if (!user) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "User not found." })
    }

    if (user.role === "admin") {
      return reply.status(400).send({
        code: "ALREADY_ADMIN",
        message: "User is already an admin.",
      })
    }

    await db.update(users).set({ role: "admin" }).where(eq(users.id, userId))

    request.log.info({ userId }, "User promoted to admin")
    return { success: true, message: "User promoted to admin." }
  })

  // POST /v1/admin/users/:userId/demote — demote admin to user
  app.post("/users/:userId/demote", { preHandler }, async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const db = getDb()

    // Cannot demote yourself
    if (request.authenticatedUserId && userId === request.authenticatedUserId) {
      return reply.status(400).send({
        code: "SELF_DEMOTE",
        message: "You cannot demote yourself.",
      })
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    if (!user) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "User not found." })
    }

    if (user.role !== "admin") {
      return reply.status(400).send({
        code: "NOT_ADMIN",
        message: "User is not an admin.",
      })
    }

    // Check if this is the last admin
    const [adminCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, "admin"))

    if (Number(adminCount?.count ?? 0) <= 1) {
      return reply.status(400).send({
        code: "LAST_ADMIN",
        message: "Cannot demote the last remaining admin.",
      })
    }

    await db.update(users).set({ role: "user" }).where(eq(users.id, userId))

    request.log.info({ userId }, "Admin demoted to user")
    return { success: true, message: "User demoted to regular user." }
  })

  // POST /v1/admin/users/bulk-invite — invite all passwordless users to set up login
  app.post("/users/bulk-invite", { preHandler }, async (request, reply) => {
    const db = getDb()

    const passwordlessUsers = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users)
      .where(and(isNull(users.passwordHash), isNotNull(users.email)))

    const emailService = getEmailService()
    let sent = 0
    let skipped = 0

    for (const user of passwordlessUsers) {
      if (!user.email) {
        skipped++
        continue
      }
      const { token } = await authService.generateSetupToken(user.id, user.email)
      const baseUrl = request.headers.origin || config.OAUTH_REDIRECT_BASE_URL
      const emailSent = await emailService.sendSetupPasswordEmail(
        user.email,
        token,
        user.displayName || "User",
        baseUrl,
      )
      if (emailSent) sent++
      else skipped++
    }

    return {
      total: passwordlessUsers.length,
      sent,
      skipped,
      message: `Invited ${sent} users to set up their login.`,
    }
  })

  // GET /v1/admin/users/migration-status — count of users by login status
  app.get("/users/migration-status", { preHandler }, async (request, reply) => {
    const db = getDb()
    const total = await db.select({ count: count() }).from(users)
    const withLogin = await db.select({ count: count() }).from(users).where(isNotNull(users.passwordHash))
    const withoutLogin = await db.select({ count: count() }).from(users).where(isNull(users.passwordHash))

    return {
      total: total[0]!.count,
      withLogin: withLogin[0]!.count,
      withoutLogin: withoutLogin[0]!.count,
    }
  })
}

export default adminUsersRoutes
