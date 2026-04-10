import { createTransport, type Transporter } from "nodemailer"
import { getDb, systemSettings } from "@biosync-io/db"
import { eq } from "drizzle-orm"
import { emailTemplates } from "./email-templates.js"

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user?: string | undefined
  pass?: string | undefined
  fromName: string
  fromEmail: string
}

export class EmailService {
  private transporter: Transporter | null = null
  private config: SmtpConfig | null = null

  async getConfig(): Promise<SmtpConfig | null> {
    if (this.config) return this.config

    const db = getDb()
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "smtp"))
      .limit(1)

    if (row) {
      this.config = row.value as SmtpConfig
      return this.config
    }

    // Fallback to env vars
    if (process.env.SMTP_HOST) {
      return {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        fromName: process.env.SMTP_FROM_NAME || "VitaSync",
        fromEmail: process.env.SMTP_FROM_EMAIL || "noreply@vitasync.local",
      }
    }

    return null
  }

  private async getTransporter(): Promise<Transporter | null> {
    const config = await this.getConfig()
    if (!config) return null

    if (!this.transporter) {
      this.transporter = createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.user ? { auth: { user: config.user, pass: config.pass } } : {}),
      })
    }
    return this.transporter
  }

  /** Invalidate cached config (call after settings update) */
  invalidateConfig(): void {
    this.config = null
    this.transporter = null
  }

  async isConfigured(): Promise<boolean> {
    return (await this.getConfig()) !== null
  }

  /** Send a transactional email */
  async send(to: string, subject: string, html: string, text?: string): Promise<boolean> {
    const transporter = await this.getTransporter()
    if (!transporter) {
      console.warn(`[email] SMTP not configured — skipping email to ${to}: ${subject}`)
      return false
    }
    const config = this.config!
    await transporter.sendMail({
      from: `${config.fromName} <${config.fromEmail}>`,
      to,
      subject,
      html,
      text: text || subject,
    })
    return true
  }

  /** Test SMTP connection with provided config */
  async testConnection(config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const t = createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.user ? { auth: { user: config.user, pass: config.pass } } : {}),
      })
      await t.verify()
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  // ── Transactional email methods ──

  async sendVerificationEmail(to: string, token: string, baseUrl: string): Promise<boolean> {
    const verifyUrl = `${baseUrl}/api/v1/auth/verify-email?token=${token}`
    return this.send(to, "Verify your VitaSync email", emailTemplates.verification(verifyUrl))
  }

  async sendPasswordResetEmail(to: string, token: string, baseUrl: string): Promise<boolean> {
    const resetUrl = `${baseUrl}/login/reset-password?token=${token}`
    return this.send(to, "Reset your VitaSync password", emailTemplates.passwordReset(resetUrl))
  }

  async sendAdminInvitationEmail(
    to: string,
    token: string,
    invitedBy: string,
    baseUrl: string,
  ): Promise<boolean> {
    const acceptUrl = `${baseUrl}/admin/accept-invite?token=${token}`
    return this.send(
      to,
      "You've been invited to VitaSync Admin",
      emailTemplates.adminInvitation(acceptUrl, invitedBy),
    )
  }

  async sendSetupPasswordEmail(
    to: string,
    token: string,
    displayName: string,
    baseUrl: string,
  ): Promise<boolean> {
    const setupUrl = `${baseUrl}/login/setup-password?token=${token}`
    return this.send(
      to,
      "Set up your VitaSync login",
      emailTemplates.setupPassword(setupUrl, displayName),
    )
  }

  async sendWelcomeEmail(to: string, displayName: string): Promise<boolean> {
    return this.send(to, "Welcome to VitaSync!", emailTemplates.welcome(displayName))
  }
}

// Singleton
let instance: EmailService | null = null
export function getEmailService(): EmailService {
  if (!instance) instance = new EmailService()
  return instance
}
