import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { getConfig } from "../config.js"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex")
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decrypt(ciphertext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex")
  const parts = ciphertext.split(":")
  if (parts.length !== 3) throw new Error("Invalid ciphertext format")
  const [ivHex, authTagHex, dataHex] = parts as [string, string, string]
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"), {
    authTagLength: AUTH_TAG_LENGTH,
  })
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"))
  return decipher.update(Buffer.from(dataHex, "hex")).toString("utf8") + decipher.final("utf8")
}
