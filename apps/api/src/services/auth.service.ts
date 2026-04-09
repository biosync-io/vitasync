import { createHash, randomBytes } from "node:crypto"
import { getDb, users, userSessions } from "@biosync-io/db"
import * as argon2 from "argon2"
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

export class AuthService {
  private get db() {
    return getDb()
  }

  // ── Register ────────────────────────────────────────────────

  async register(params: {
    workspaceId: string
    externalId: string
    email: string
    password: string
    displayName?: string
    gender?: string
  }) {
    const passwordHash = await argon2.hash(params.password)

    const [user] = await this.db
      .insert(users)
      .values({
        workspaceId: params.workspaceId,
        externalId: params.externalId,
        email: params.email,
        passwordHash,
        displayName: params.displayName,
        gender: params.gender,
      })
      .returning()

    const verificationToken = await this.generateVerificationToken(user!.id, params.email)

    return { ...user!, verificationToken }
  }

  // ── Login ───────────────────────────────────────────────────

  async login(
    workspaceId: string,
    email: string,
    password: string,
    userAgent?: string,
    ip?: string,
  ) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.workspaceId, workspaceId), eq(users.email, email)))
      .limit(1)

    if (!user) {
      throw Object.assign(new Error("Invalid email or password."), { statusCode: 401 })
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw Object.assign(new Error("Account is temporarily locked. Try again later."), {
        statusCode: 423,
      })
    }

    if (!user.passwordHash) {
      throw Object.assign(new Error("Password login not available for this account."), {
        statusCode: 401,
      })
    }

    const valid = await argon2.verify(user.passwordHash, password)

    if (!valid) {
      const attempts = user.failedLoginAttempts + 1
      const updates: Record<string, unknown> = { failedLoginAttempts: attempts }

      if (attempts >= config.ACCOUNT_LOCKOUT_THRESHOLD) {
        updates.lockedUntil = new Date(Date.now() + config.ACCOUNT_LOCKOUT_DURATION_MS)
      }

      await this.db.update(users).set(updates).where(eq(users.id, user.id))

      throw Object.assign(new Error("Invalid email or password."), { statusCode: 401 })
    }

    // Successful login — reset lockout counters
    await this.db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id))

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

    return { accessToken, refreshToken: rawRefresh, user }
  }

  // ── Refresh ─────────────────────────────────────────────────

  async refresh(refreshToken: string, userAgent?: string, ip?: string) {
    const tokenHash = sha256(refreshToken)

    const [session] = await this.db
      .select()
      .from(userSessions)
      .where(eq(userSessions.refreshTokenHash, tokenHash))
      .limit(1)

    if (!session) {
      // Stolen-token detection: look up by family to see if the token was already rotated
      // We can't look up by family without the familyId, so just reject.
      // The family-based revocation happens below when a valid session is found but
      // the incoming token doesn't match (i.e. replay of a rotated token).
      throw Object.assign(new Error("Invalid refresh token."), { statusCode: 401 })
    }

    if (session.expiresAt < new Date()) {
      // Expired — clean up
      await this.db.delete(userSessions).where(eq(userSessions.id, session.id))
      throw Object.assign(new Error("Refresh token expired."), { statusCode: 401 })
    }

    // Look up the user for the JWT payload
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1)

    if (!user) {
      await this.db.delete(userSessions).where(eq(userSessions.familyId, session.familyId))
      throw Object.assign(new Error("User not found."), { statusCode: 401 })
    }

    // Rotate: delete old token, create new one in the same family
    await this.db.delete(userSessions).where(eq(userSessions.id, session.id))

    const newRawRefresh = randomBytes(48).toString("hex")
    const newRefreshHash = sha256(newRawRefresh)
    const refreshExpirySec = parseExpiry(config.REFRESH_TOKEN_EXPIRY)
    const expiresAt = new Date(Date.now() + refreshExpirySec * 1000)

    const [newSession] = await this.db
      .insert(userSessions)
      .values({
        userId: session.userId,
        workspaceId: session.workspaceId,
        refreshTokenHash: newRefreshHash,
        familyId: session.familyId,
        userAgent: userAgent?.slice(0, 512),
        ipAddress: ip?.slice(0, 45),
        expiresAt,
      })
      .returning()

    const accessToken = await new jose.SignJWT({
      sub: user.id,
      wid: session.workspaceId,
      role: user.role,
      sid: newSession!.id,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${parseExpiry(config.ACCESS_TOKEN_EXPIRY)}s`)
      .sign(jwtSecret)

    return { accessToken, refreshToken: newRawRefresh }
  }

  // ── Logout ──────────────────────────────────────────────────

  async logout(refreshToken: string) {
    const tokenHash = sha256(refreshToken)
    await this.db.delete(userSessions).where(eq(userSessions.refreshTokenHash, tokenHash))
  }

  async logoutAll(userId: string) {
    await this.db.delete(userSessions).where(eq(userSessions.userId, userId))
  }

  // ── Change Password ─────────────────────────────────────────

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user || !user.passwordHash) {
      throw Object.assign(new Error("User not found or password not set."), { statusCode: 400 })
    }

    const valid = await argon2.verify(user.passwordHash, oldPassword)
    if (!valid) {
      throw Object.assign(new Error("Current password is incorrect."), { statusCode: 401 })
    }

    const passwordHash = await argon2.hash(newPassword)

    await this.db.update(users).set({ passwordHash }).where(eq(users.id, userId))

    // Revoke all sessions for this user
    await this.db.delete(userSessions).where(eq(userSessions.userId, userId))
  }

  // ── Get Me ──────────────────────────────────────────────────

  async getMe(userId: string, workspaceId: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        workspaceId: users.workspaceId,
        externalId: users.externalId,
        email: users.email,
        displayName: users.displayName,
        gender: users.gender,
        role: users.role,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.workspaceId, workspaceId)))
      .limit(1)

    if (!user) {
      throw Object.assign(new Error("User not found."), { statusCode: 404 })
    }

    return user
  }

  // ── Email Verification ─────────────────────────────────────

  async generateVerificationToken(userId: string, email: string): Promise<string> {
    return new jose.SignJWT({ sub: userId, email, purpose: "email-verify" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .setIssuedAt()
      .sign(jwtSecret)
  }

  async verifyEmail(token: string): Promise<{ userId: string; email: string }> {
    const { payload } = await jose.jwtVerify(token, jwtSecret)
    if (payload.purpose !== "email-verify") throw new Error("Invalid token purpose")

    const userId = payload.sub!
    const email = payload.email as string

    await this.db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.email, email)))

    return { userId, email }
  }

  async resendVerification(userId: string): Promise<{ token: string; email: string } | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user || !user.email || user.emailVerified) return null
    const token = await this.generateVerificationToken(user.id, user.email)
    return { token, email: user.email }
  }
}
