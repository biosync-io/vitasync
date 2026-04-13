import { createHash, randomBytes } from "node:crypto"
import { getDb, identityProviders, userIdentities, users, userSessions } from "@biosync-io/db"
import { AppError } from "@biosync-io/types"
import { and, eq } from "drizzle-orm"
import * as jose from "jose"
import { config } from "../config.js"

// ── Helpers ──────────────────────────────────────────────────────

function parseExpiry(val: string): number {
  const match = val.match(/^(\d+)([smhd])$/)
  if (!match) return 900
  const n = match[1]!
  const unit = match[2]!
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
  return Number(n) * (multipliers[unit] ?? 60)
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex")
}

const jwtSecret = new TextEncoder().encode(config.JWT_SECRET)

// ── Service ─────────────────────────────────────────────────────

export class SsoService {
  private get db() {
    return getDb()
  }

  /** Find an enabled IdP by its URL slug */
  async findIdp(workspaceSlug: string) {
    const [idp] = await this.db
      .select()
      .from(identityProviders)
      .where(
        and(
          eq(identityProviders.slug, workspaceSlug),
          eq(identityProviders.enabled, true),
        ),
      )
      .limit(1)
    return idp ?? null
  }

  /** Find an IdP by its primary key (for admin routes) */
  async findIdpById(id: string) {
    const [idp] = await this.db
      .select()
      .from(identityProviders)
      .where(eq(identityProviders.id, id))
      .limit(1)
    return idp ?? null
  }

  /** List enabled IdPs for a workspace (public, for login page) */
  async listPublicProviders(workspaceId: string) {
    return this.db
      .select({
        id: identityProviders.id,
        name: identityProviders.name,
        slug: identityProviders.slug,
        protocol: identityProviders.protocol,
      })
      .from(identityProviders)
      .where(
        and(
          eq(identityProviders.workspaceId, workspaceId),
          eq(identityProviders.enabled, true),
        ),
      )
  }

  /**
   * Find or provision a user from SSO identity claims.
   * JIT provisioning creates the user if autoProvision is enabled.
   */
  async findOrProvisionUser(params: {
    idpId: string
    workspaceId: string
    subject: string
    email?: string
    displayName?: string
    rawAttributes: Record<string, unknown>
    autoProvision: boolean
    defaultRole: string
    attributeMapping: Record<string, string>
  }): Promise<{ userId: string; created: boolean }> {
    // Check for existing identity link
    const [existing] = await this.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(
        and(
          eq(userIdentities.providerId, params.idpId),
          eq(userIdentities.subject, params.subject),
        ),
      )
      .limit(1)

    if (existing) {
      // Update last login and raw attributes
      await this.db
        .update(userIdentities)
        .set({
          rawAttributes: params.rawAttributes,
          lastLoginAt: new Date(),
          email: params.email ?? null,
        })
        .where(
          and(
            eq(userIdentities.providerId, params.idpId),
            eq(userIdentities.subject, params.subject),
          ),
        )
      return { userId: existing.userId, created: false }
    }

    if (!params.autoProvision) {
      throw AppError.forbidden("User not found and auto-provisioning is disabled for this IdP.")
    }

    // JIT provision: create user + identity link
    const externalId = `sso:${params.subject}`
    const [newUser] = await this.db
      .insert(users)
      .values({
        workspaceId: params.workspaceId,
        externalId,
        email: params.email ?? null,
        displayName: params.displayName ?? null,
        role: params.defaultRole,
        metadata: {},
      })
      .returning()

    if (!newUser) throw AppError.internal("Failed to create user")

    await this.db.insert(userIdentities).values({
      userId: newUser.id,
      providerId: params.idpId,
      subject: params.subject,
      email: params.email ?? null,
      rawAttributes: params.rawAttributes,
      lastLoginAt: new Date(),
    })

    return { userId: newUser.id, created: true }
  }

  /**
   * Create a session for an SSO-authenticated user and return tokens.
   * Mirrors the login flow in AuthService but skips password verification.
   */
  async createSession(
    userId: string,
    workspaceId: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.workspaceId, workspaceId)))
      .limit(1)

    if (!user) throw AppError.notFound("User")

    // Update last login
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId))

    // Create session & tokens
    const rawRefresh = randomBytes(48).toString("hex")
    const refreshTokenHash = sha256(rawRefresh)
    const familyId = crypto.randomUUID()

    const refreshExpirySec = parseExpiry(config.REFRESH_TOKEN_EXPIRY)
    const expiresAt = new Date(Date.now() + refreshExpirySec * 1000)

    const [session] = await this.db
      .insert(userSessions)
      .values({
        userId: user.id,
        workspaceId,
        refreshTokenHash,
        familyId,
        userAgent: userAgent?.slice(0, 512),
        ipAddress: ip?.slice(0, 45),
        expiresAt,
      })
      .returning()

    const accessToken = await new jose.SignJWT({
      sub: user.id,
      wid: workspaceId,
      role: user.role,
      sid: session!.id,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${parseExpiry(config.ACCESS_TOKEN_EXPIRY)}s`)
      .sign(jwtSecret)

    return { accessToken, refreshToken: rawRefresh }
  }
}
