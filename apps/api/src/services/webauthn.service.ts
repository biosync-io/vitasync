import { webauthnCredentials, users } from "@biosync-io/db"
import { BaseService } from "./base.service.js"
import { and, eq } from "drizzle-orm"
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server"
import type { AuthenticatorTransportFuture, CredentialDeviceType } from "@simplewebauthn/types"
import { config } from "../config.js"

// In-memory challenge store (use Redis in production cluster)
const challengeStore = new Map<string, { challenge: string; expiresAt: number }>()

function setChallenge(key: string, challenge: string) {
  challengeStore.set(key, { challenge, expiresAt: Date.now() + 5 * 60 * 1000 })
}

function getChallenge(key: string): string | null {
  const entry = challengeStore.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    challengeStore.delete(key)
    return null
  }
  challengeStore.delete(key)
  return entry.challenge
}

export class WebauthnService extends BaseService {
  private get rpName() {
    return config.WEBAUTHN_RP_NAME
  }

  private get rpID() {
    return config.WEBAUTHN_RP_ID
  }

  private get origin() {
    return config.WEBAUTHN_ORIGIN
  }

  /**
   * Generate registration options for a new credential.
   */
  async generateRegistrationOptions(userId: string): Promise<{
    options: Awaited<ReturnType<typeof generateRegistrationOptions>>
  }> {
    // Get existing credentials to exclude
    const existing = await this.db
      .select({
        credentialId: webauthnCredentials.credentialId,
        transports: webauthnCredentials.transports,
      })
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.userId, userId))

    // Get user info for display name
    const [user] = await this.db
      .select({ displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: new TextEncoder().encode(userId),
      userName: user?.email ?? userId,
      userDisplayName: user?.displayName ?? user?.email ?? userId,
      attestationType: "none",
      excludeCredentials: existing.map((cred) => ({
        id: new Uint8Array(cred.credentialId),
        transports: (cred.transports ?? []) as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    })

    // Store challenge for verification
    setChallenge(`reg:${userId}`, options.challenge)

    return { options }
  }

  /**
   * Verify a registration response and store the credential.
   */
  async verifyRegistration(
    userId: string,
    response: Parameters<typeof verifyRegistrationResponse>[0]["response"],
    friendlyName?: string,
  ): Promise<{ verified: boolean; credentialId?: string }> {
    const expectedChallenge = getChallenge(`reg:${userId}`)
    if (!expectedChallenge) {
      return { verified: false }
    }

    let verification: VerifiedRegistrationResponse
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
      })
    } catch {
      return { verified: false }
    }

    if (!verification.verified || !verification.registrationInfo) {
      return { verified: false }
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    const [created] = await this.db
      .insert(webauthnCredentials)
      .values({
        userId,
        credentialId: Buffer.from(credential.id),
        publicKey: Buffer.from(credential.publicKey),
        counter: Number(credential.counter),
        transports: (response.response.transports ?? []) as string[],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        friendlyName: friendlyName ?? null,
      })
      .returning({ id: webauthnCredentials.id })

    return { verified: true, credentialId: created?.id }
  }

  /**
   * Generate authentication options (for login).
   */
  async generateAuthenticationOptions(email?: string): Promise<{
    options: Awaited<ReturnType<typeof generateAuthenticationOptions>>
    sessionKey: string
  }> {
    const sessionKey = `auth:${Date.now()}:${Math.random().toString(36).slice(2)}`

    let allowCredentials: { id: Uint8Array; transports?: AuthenticatorTransportFuture[] }[] = []

    if (email) {
      // Look up user by email and get their credentials
      const [user] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)

      if (user) {
        const creds = await this.db
          .select({
            credentialId: webauthnCredentials.credentialId,
            transports: webauthnCredentials.transports,
          })
          .from(webauthnCredentials)
          .where(eq(webauthnCredentials.userId, user.id))

        allowCredentials = creds.map((c) => ({
          id: new Uint8Array(c.credentialId),
          transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
        }))
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: "preferred",
    })

    setChallenge(sessionKey, options.challenge)

    return { options, sessionKey }
  }

  /**
   * Verify an authentication response (login).
   * Returns the userId if successful.
   */
  async verifyAuthentication(
    sessionKey: string,
    response: Parameters<typeof verifyAuthenticationResponse>[0]["response"],
  ): Promise<{ verified: boolean; userId?: string }> {
    const expectedChallenge = getChallenge(sessionKey)
    if (!expectedChallenge) return { verified: false }

    // Find the credential
    const credIdBuffer = Buffer.from(response.id, "base64url")
    const [cred] = await this.db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.credentialId, credIdBuffer))
      .limit(1)

    if (!cred) return { verified: false }

    let verification: VerifiedAuthenticationResponse
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: new Uint8Array(cred.credentialId),
          publicKey: new Uint8Array(cred.publicKey),
          counter: Number(cred.counter),
          transports: (cred.transports ?? []) as AuthenticatorTransportFuture[],
        },
      })
    } catch {
      return { verified: false }
    }

    if (!verification.verified) return { verified: false }

    // Update counter (clone detection: if new counter < stored, potential clone)
    const newCounter = verification.authenticationInfo.newCounter
    if (newCounter <= cred.counter && cred.counter > 0) {
      // Potential credential clone detected — still allow but could flag
      // In production, you might want to alert/block
    }

    await this.db
      .update(webauthnCredentials)
      .set({
        counter: newCounter,
        lastUsedAt: new Date(),
      })
      .where(eq(webauthnCredentials.id, cred.id))

    return { verified: true, userId: cred.userId }
  }

  /** List credentials for a user. */
  async listCredentials(userId: string) {
    return this.db
      .select({
        id: webauthnCredentials.id,
        deviceType: webauthnCredentials.deviceType,
        backedUp: webauthnCredentials.backedUp,
        friendlyName: webauthnCredentials.friendlyName,
        lastUsedAt: webauthnCredentials.lastUsedAt,
        createdAt: webauthnCredentials.createdAt,
      })
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.userId, userId))
  }

  /** Delete a credential. */
  async deleteCredential(credentialId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(webauthnCredentials)
      .where(and(eq(webauthnCredentials.id, credentialId), eq(webauthnCredentials.userId, userId)))
      .returning({ id: webauthnCredentials.id })

    return result.length > 0
  }
}
