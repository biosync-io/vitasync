import { createHash, randomBytes } from "node:crypto"
import { adminInvitations, getDb, users } from "@biosync-io/db"
import * as argon2 from "argon2"
import { and, eq, isNull } from "drizzle-orm"
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { config } from "../../config.js"
import { requireAdmin } from "../../plugins/auth.js"
import { getEmailService } from "../../services/email.service.js"

const createBody = z.object({
  email: z.string().email().max(255),
})

const adminInvitationsRoutes: FastifyPluginAsync = async (app) => {
  const preHandler = [requireAdmin()]

  // POST /v1/admin/invitations — create a new invitation
  app.post("/invitations", { preHandler }, async (request, reply) => {
    const { email } = createBody.parse(request.body)
    const db = getDb()

    // Generate a random token
    const rawToken = randomBytes(32).toString("hex")
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours

    const [invitation] = await db
      .insert(adminInvitations)
      .values({
        email,
        tokenHash,
        invitedBy: request.authenticatedUserId!,
        role: "admin",
        expiresAt,
      })
      .returning()

    request.log.info({ invitationId: invitation!.id, email }, "Admin invitation created")

    // Send invitation email
    const emailService = getEmailService()
    const baseUrl = request.headers.origin || config.OAUTH_REDIRECT_BASE_URL
    await emailService.sendAdminInvitationEmail(email, rawToken, request.authenticatedUserId!, baseUrl)

    return reply.status(201).send({
      id: invitation!.id,
      email: invitation!.email,
      token: rawToken, // shown once — in production would be sent via email
      expiresAt: invitation!.expiresAt.toISOString(),
      createdAt: invitation!.createdAt.toISOString(),
    })
  })

  // GET /v1/admin/invitations — list all invitations
  app.get("/invitations", { preHandler }, async (_request, _reply) => {
    const db = getDb()

    const rows = await db
      .select({
        id: adminInvitations.id,
        email: adminInvitations.email,
        role: adminInvitations.role,
        invitedBy: adminInvitations.invitedBy,
        expiresAt: adminInvitations.expiresAt,
        acceptedAt: adminInvitations.acceptedAt,
        createdAt: adminInvitations.createdAt,
      })
      .from(adminInvitations)
      .orderBy(adminInvitations.createdAt)

    return { data: rows }
  })

  // DELETE /v1/admin/invitations/:id — revoke a pending invitation
  app.delete("/invitations/:id", { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const db = getDb()

    // Only delete if not yet accepted
    const deleted = await db
      .delete(adminInvitations)
      .where(and(eq(adminInvitations.id, id), isNull(adminInvitations.acceptedAt)))
      .returning()

    if (deleted.length === 0) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "Invitation not found or already accepted.",
      })
    }

    request.log.info({ invitationId: id }, "Admin invitation revoked")
    return reply.status(204).send()
  })
}

export default adminInvitationsRoutes
