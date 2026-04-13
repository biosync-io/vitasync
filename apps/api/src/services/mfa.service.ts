import { createHash, randomBytes } from "node:crypto"
import { getDb, mfaTotp } from "@biosync-io/db"
import { AppError } from "@biosync-io/types"
import { eq } from "drizzle-orm"
import * as OTPAuth from "otpauth"
import * as argon2 from "argon2"

const RECOVERY_CODE_COUNT = 10
const TOTP_ISSUER = "VitaSync"
const TOTP_PERIOD = 30
const TOTP_DIGITS = 6

// Simple AES-256-GCM encrypt/decrypt for TOTP secrets
// Reuses the same ENCRYPTION_KEY as the rest of the system
import { createCipheriv, createDecipheriv, createHash as sha256Hash } from "node:crypto"

function encryptSecret(plaintext: string): string {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) throw AppError.internal("ENCRYPTION_KEY required")
  const key = Buffer.from(hex, "hex")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 })
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`
}

function decryptSecret(ciphertext: string): string {
  if (!ciphertext.startsWith("v1:")) return ciphertext
  const parts = ciphertext.slice(3).split(":")
  if (parts.length !== 3) return ciphertext
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) throw AppError.internal("ENCRYPTION_KEY required")
  const key = Buffer.from(hex, "hex")
  const [ivHex, dataHex, tagHex] = parts as [string, string, string]
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"), { authTagLength: 16 })
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8")
}

export class MfaService {
  private get db() {
    return getDb()
  }

  /**
   * Start TOTP enrollment — generate secret and return otpauth URI.
   * The enrollment is not active until `verifyEnrollment()` is called.
   */
  async enrollTotp(
    userId: string,
    userEmail?: string,
  ): Promise<{ secret: string; uri: string; recoveryCodes: string[] }> {
    // Check if already enrolled
    const [existing] = await this.db
      .select()
      .from(mfaTotp)
      .where(eq(mfaTotp.userId, userId))
      .limit(1)

    if (existing?.verified) {
      throw AppError.conflict("TOTP already enrolled. Disable it first.")
    }

    // Remove any unverified enrollment
    if (existing) {
      await this.db.delete(mfaTotp).where(eq(mfaTotp.userId, userId))
    }

    // Generate TOTP secret
    const secret = new OTPAuth.Secret({ size: 20 })
    const totp = new OTPAuth.TOTP({
      issuer: TOTP_ISSUER,
      label: userEmail || userId,
      algorithm: "SHA1",
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret,
    })

    // Generate recovery codes
    const rawCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      randomBytes(5).toString("hex").toUpperCase().match(/.{5}/g)!.join("-"),
    )

    // Hash recovery codes for storage
    const hashedCodes = await Promise.all(
      rawCodes.map((code) => argon2.hash(code, { type: argon2.argon2id })),
    )

    // Encrypt the TOTP secret
    const encryptedSecret = encryptSecret(secret.base32)

    await this.db.insert(mfaTotp).values({
      userId,
      secret: encryptedSecret,
      verified: false,
      recoveryCodes: hashedCodes,
    })

    return {
      secret: secret.base32,
      uri: totp.toString(),
      recoveryCodes: rawCodes,
    }
  }

  /**
   * Verify enrollment by validating the first TOTP code.
   * Marks the enrollment as active.
   */
  async verifyEnrollment(userId: string, code: string): Promise<boolean> {
    const [enrollment] = await this.db
      .select()
      .from(mfaTotp)
      .where(eq(mfaTotp.userId, userId))
      .limit(1)

    if (!enrollment) throw AppError.notFound("TOTP enrollment")
    if (enrollment.verified) throw AppError.conflict("TOTP already verified.")

    const secret = decryptSecret(enrollment.secret)
    const valid = this.validateCode(secret, code)

    if (!valid) return false

    await this.db
      .update(mfaTotp)
      .set({ verified: true })
      .where(eq(mfaTotp.userId, userId))

    return true
  }

  /**
   * Validate a TOTP code during login. Allows ±1 time step drift.
   */
  async validateTotp(userId: string, code: string): Promise<boolean> {
    const [enrollment] = await this.db
      .select()
      .from(mfaTotp)
      .where(eq(mfaTotp.userId, userId))
      .limit(1)

    if (!enrollment?.verified) return false

    const secret = decryptSecret(enrollment.secret)
    return this.validateCode(secret, code)
  }

  /**
   * Use a one-time recovery code. Consumed codes are removed.
   */
  async useRecoveryCode(userId: string, code: string): Promise<boolean> {
    const [enrollment] = await this.db
      .select()
      .from(mfaTotp)
      .where(eq(mfaTotp.userId, userId))
      .limit(1)

    if (!enrollment?.verified) return false

    const codes = enrollment.recoveryCodes as string[]
    for (let i = 0; i < codes.length; i++) {
      try {
        if (await argon2.verify(codes[i]!, code.toUpperCase())) {
          // Remove used code
          const updatedCodes = [...codes.slice(0, i), ...codes.slice(i + 1)]
          await this.db
            .update(mfaTotp)
            .set({ recoveryCodes: updatedCodes })
            .where(eq(mfaTotp.userId, userId))
          return true
        }
      } catch {
        continue
      }
    }

    return false
  }

  /** Check if MFA is enrolled and verified for a user. */
  async isEnrolled(userId: string): Promise<boolean> {
    const [enrollment] = await this.db
      .select({ verified: mfaTotp.verified })
      .from(mfaTotp)
      .where(eq(mfaTotp.userId, userId))
      .limit(1)

    return enrollment?.verified ?? false
  }

  /** Disable TOTP for a user. */
  async disableTotp(userId: string): Promise<boolean> {
    const result = await this.db
      .delete(mfaTotp)
      .where(eq(mfaTotp.userId, userId))
      .returning({ id: mfaTotp.id })

    return result.length > 0
  }

  private validateCode(secretBase32: string, code: string): boolean {
    const totp = new OTPAuth.TOTP({
      issuer: TOTP_ISSUER,
      algorithm: "SHA1",
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    })

    // delta allows ±1 time step drift
    const delta = totp.validate({ token: code, window: 1 })
    return delta !== null
  }
}
