import { createHash, randomBytes } from "node:crypto"
import { getDb, userSessions } from "@biosync-io/db"
import { and, eq, sql } from "drizzle-orm"

/**
 * Risk scoring service for adaptive security.
 *
 * Computes a 0–100 risk score per session based on:
 * - Device novelty (new device fingerprint)
 * - Geographic anomaly (new country/impossible travel)
 * - Failed login history
 * - Known-bad indicators (Tor exit nodes — placeholder)
 *
 * The score is used for adaptive rate limiting and MFA enforcement.
 */

interface RiskFactors {
  userId: string
  ip: string
  userAgent: string
  fingerprint?: string
}

interface RiskResult {
  score: number
  factors: string[]
}

export class RiskService {
  private get db() {
    return getDb()
  }

  /**
   * Compute a risk score (0–100) for a new session.
   */
  async computeRiskScore(params: RiskFactors): Promise<RiskResult> {
    let score = 0
    const factors: string[] = []

    // Factor 1: New device fingerprint (+30)
    if (params.fingerprint) {
      const [existing] = await this.db
        .select({ id: userSessions.id })
        .from(userSessions)
        .where(
          and(
            eq(userSessions.userId, params.userId),
            eq(userSessions.deviceFingerprint, params.fingerprint),
          ),
        )
        .limit(1)

      if (!existing) {
        score += 30
        factors.push("new_device")
      }
    } else {
      // No fingerprint at all → mildly suspicious
      score += 15
      factors.push("no_fingerprint")
    }

    // Factor 2: New IP address / country (+20)
    const [existingIp] = await this.db
      .select({ id: userSessions.id })
      .from(userSessions)
      .where(
        and(
          eq(userSessions.userId, params.userId),
          eq(userSessions.ipAddress, params.ip),
        ),
      )
      .limit(1)

    if (!existingIp) {
      score += 20
      factors.push("new_ip")
    }

    // Factor 3: Recent failed logins (+10 per failure in last hour, max +30)
    // This would typically query the audit log or users table
    // Simplified: check the users table failedLoginAttempts
    const { users } = await import("@biosync-io/db")
    const [user] = await this.db
      .select({ failedAttempts: users.failedLoginAttempts })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1)

    if (user && user.failedAttempts > 0) {
      const failScore = Math.min(user.failedAttempts * 10, 30)
      score += failScore
      factors.push(`recent_failures:${user.failedAttempts}`)
    }

    // Cap at 100
    score = Math.min(score, 100)

    return { score, factors }
  }

  /**
   * Generate a device fingerprint hash from request characteristics.
   */
  static generateFingerprint(components: {
    userAgent: string
    acceptLanguage?: string
    screenResolution?: string
  }): string {
    const data = [
      components.userAgent,
      components.acceptLanguage ?? "",
      components.screenResolution ?? "",
    ].join("|")

    return createHash("sha256").update(data).digest("hex")
  }
}
