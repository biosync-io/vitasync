import { getDb, systemSettings } from "@biosync-io/db"
import { eq } from "drizzle-orm"
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { requireAdmin } from "../../plugins/auth.js"
import { getEmailService } from "../../services/email.service.js"

const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  secure: z.boolean(),
  user: z.string().optional(),
  pass: z.string().optional(),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
})

const testSendSchema = smtpConfigSchema.extend({
  testEmail: z.string().email(),
})

function maskPassword(config: Record<string, unknown>): Record<string, unknown> {
  if (!config.pass) return config
  return {
    ...config,
    pass: "••••••••",
  }
}

const systemSettingsRoutes: FastifyPluginAsync = async (app) => {
  const preHandler = [requireAdmin()]

  // GET /v1/admin/settings/smtp — get current SMTP config
  app.get("/settings/smtp", { preHandler }, async (_request, reply) => {
    const db = getDb()
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "smtp"))
      .limit(1)

    if (!row) {
      // Check env var fallback
      if (process.env.SMTP_HOST) {
        return reply.send({
          source: "env",
          config: maskPassword({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === "true",
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
            fromName: process.env.SMTP_FROM_NAME || "VitaSync",
            fromEmail: process.env.SMTP_FROM_EMAIL || "noreply@vitasync.local",
          }),
        })
      }
      return reply.send({ source: "none", config: null })
    }

    return reply.send({
      source: "database",
      config: maskPassword(row.value as Record<string, unknown>),
      updatedAt: row.updatedAt,
    })
  })

  // PUT /v1/admin/settings/smtp — update SMTP config
  app.put("/settings/smtp", { preHandler }, async (request, reply) => {
    const body = smtpConfigSchema.parse(request.body)
    const db = getDb()

    await db
      .insert(systemSettings)
      .values({
        key: "smtp",
        value: body,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: body, updatedAt: new Date() },
      })

    // Invalidate cached transporter
    getEmailService().invalidateConfig()

    request.log.info("SMTP settings updated")
    return reply.send({
      message: "SMTP settings updated.",
      config: maskPassword(body as unknown as Record<string, unknown>),
    })
  })

  // POST /v1/admin/settings/smtp/test — test SMTP connection
  app.post("/settings/smtp/test", { preHandler }, async (request, reply) => {
    const body = smtpConfigSchema.parse(request.body)
    const result = await getEmailService().testConnection(body)

    return reply.send(result)
  })

  // POST /v1/admin/settings/smtp/test-send — send a test email
  app.post("/settings/smtp/test-send", { preHandler }, async (request, reply) => {
    const body = testSendSchema.parse(request.body)
    const { testEmail, ...smtpConfig } = body

    // Temporarily use provided config to send
    const emailService = getEmailService()
    const connectionResult = await emailService.testConnection(smtpConfig)
    if (!connectionResult.success) {
      return reply.status(400).send({
        success: false,
        error: `Connection failed: ${connectionResult.error}`,
      })
    }

    try {
      const { createTransport } = await import("nodemailer")
      const transporter = createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        ...(smtpConfig.user ? { auth: { user: smtpConfig.user, pass: smtpConfig.pass } } : {}),
      })

      await transporter.sendMail({
        from: `${smtpConfig.fromName} <${smtpConfig.fromEmail}>`,
        to: testEmail,
        subject: "VitaSync SMTP Test",
        html: "<h2>SMTP Configuration Test</h2><p>If you're reading this, your VitaSync SMTP settings are working correctly!</p>",
        text: "SMTP Configuration Test - Your VitaSync SMTP settings are working correctly!",
      })

      return reply.send({ success: true, message: `Test email sent to ${testEmail}` })
    } catch (err) {
      return reply.status(400).send({
        success: false,
        error: (err as Error).message,
      })
    }
  })
}

export default systemSettingsRoutes
