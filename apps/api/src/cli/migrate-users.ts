#!/usr/bin/env tsx
/**
 * Migrate Users CLI
 *
 * Generates setup-password URLs for users without a password.
 * Optionally sends invitation emails via SMTP.
 *
 * Usage:
 *   # Print setup URLs (manual sharing)
 *   npx tsx apps/api/src/cli/migrate-users.ts
 *
 *   # Print URLs with custom base URL
 *   npx tsx apps/api/src/cli/migrate-users.ts --base-url https://app.vitasync.io
 *
 *   # Send invitation emails via SMTP
 *   npx tsx apps/api/src/cli/migrate-users.ts --send
 *
 * Environment:
 *   DATABASE_URL          — required PostgreSQL connection string
 *   JWT_SECRET            — required for token generation
 */

import * as readline from "node:readline"
import { initDb, getDb, closeDb, users } from "@biosync-io/db"
import { and, isNull, isNotNull } from "drizzle-orm"
import * as jose from "jose"

// ── Helpers ──────────────────────────────────────────────────────

function parseArgs(argv: string[]): { baseUrl: string; send: boolean } {
  let baseUrl = "http://localhost:3000"
  let send = false
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--base-url" && argv[i + 1]) {
      baseUrl = argv[++i]!
    } else if (argv[i] === "--send") {
      send = true
    }
  }
  return { baseUrl, send }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

async function generateSetupToken(userId: string, email: string): Promise<string> {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    console.error("ERROR: JWT_SECRET environment variable is required")
    process.exit(1)
  }

  const secret = new TextEncoder().encode(jwtSecret)
  return new jose.SignJWT({ sub: userId, email, purpose: "password-setup" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(secret)
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const args = parseArgs(process.argv)

  console.log("🔄 VitaSync — User Migration Tool")
  console.log("=".repeat(50))
  console.log(`Base URL: ${args.baseUrl}`)
  console.log(`Mode:     ${args.send ? "Send emails via SMTP" : "Print URLs only"}`)
  console.log()

  // Connect to DB
  console.log("📡 Connecting to database…")
  initDb(databaseUrl)
  const db = getDb()

  // Find passwordless users with email
  const passwordlessUsers = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(and(isNull(users.passwordHash), isNotNull(users.email)))

  if (passwordlessUsers.length === 0) {
    console.log("\n✅ No users without passwords found. Nothing to migrate.")
    await closeDb()
    return
  }

  console.log(`\nFound ${passwordlessUsers.length} user(s) without passwords:\n`)

  // Print table header
  const emailCol = 40
  const nameCol = 25
  console.log(
    `${"Email".padEnd(emailCol)} ${"Display Name".padEnd(nameCol)} ID`,
  )
  console.log("-".repeat(emailCol + nameCol + 40))

  for (const user of passwordlessUsers) {
    console.log(
      `${(user.email || "—").padEnd(emailCol)} ${(user.displayName || "—").padEnd(nameCol)} ${user.id}`,
    )
  }

  console.log()

  // Confirm
  const answer = await prompt(
    `Generate setup tokens for ${passwordlessUsers.length} user(s)? (y/n): `,
  )

  if (answer !== "y" && answer !== "yes") {
    console.log("Aborted.")
    await closeDb()
    return
  }

  console.log()

  // Generate tokens and print/send
  let sent = 0
  let skipped = 0

  // Dynamically import EmailService only if sending
  let emailService: Awaited<ReturnType<typeof import("../services/email.service.js")["getEmailService"]>> | null = null
  if (args.send) {
    const { getEmailService } = await import("../services/email.service.js")
    emailService = getEmailService()
    const isConfigured = await (emailService as any).isConfigured()
    if (!isConfigured) {
      console.warn("⚠️  SMTP is not configured. Falling back to printing URLs only.\n")
      emailService = null
    }
  }

  // Print URL table header
  if (!emailService) {
    console.log(`${"Email".padEnd(emailCol)} Setup URL`)
    console.log("-".repeat(emailCol + 80))
  }

  for (const user of passwordlessUsers) {
    if (!user.email) {
      skipped++
      continue
    }

    const token = await generateSetupToken(user.id, user.email)
    const setupUrl = `${args.baseUrl}/login/setup-password?token=${token}`

    if (emailService) {
      const ok = await emailService.sendSetupPasswordEmail(
        user.email,
        token,
        user.displayName || "User",
        args.baseUrl,
      )
      if (ok) {
        console.log(`  ✉️  Sent to ${user.email}`)
        sent++
      } else {
        console.log(`  ⚠️  Failed: ${user.email}`)
        skipped++
      }
    } else {
      console.log(`${user.email.padEnd(emailCol)} ${setupUrl}`)
      sent++
    }
  }

  console.log(`\n${"=".repeat(50)}`)
  console.log(`Total:   ${passwordlessUsers.length}`)
  console.log(`${emailService ? "Sent" : "Generated"}:  ${sent}`)
  if (skipped > 0) console.log(`Skipped: ${skipped}`)
  console.log(`\n✅ Done. Tokens expire in 24 hours.`)

  await closeDb()
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err)
  process.exit(1)
})
