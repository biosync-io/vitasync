#!/usr/bin/env tsx
/**
 * Create Admin CLI
 *
 * Creates an admin user or promotes an existing user to admin.
 * Supports both interactive and non-interactive modes.
 *
 * Usage:
 *   # Interactive (prompts for email/password)
 *   npx tsx apps/api/src/cli/create-admin.ts
 *
 *   # Non-interactive
 *   npx tsx apps/api/src/cli/create-admin.ts --email admin@example.com --password SecurePass!
 *
 * Environment:
 *   DATABASE_URL          — required PostgreSQL connection string
 *   ADMIN_WORKSPACE_SLUG  — workspace slug (default: "default")
 */

import * as readline from "node:readline"
import { initDb, getDb, closeDb, users, workspaces } from "@biosync-io/db"
import * as argon2 from "argon2"
import { eq } from "drizzle-orm"

// ── Helpers ──────────────────────────────────────────────────────

function parseArgs(argv: string[]): { email: string | undefined; password: string | undefined } {
  let email: string | undefined
  let password: string | undefined
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--email" && argv[i + 1]) {
      email = argv[++i]
    } else if (argv[i] === "--password" && argv[i + 1]) {
      password = argv[++i]
    }
  }
  return { email, password }
}

function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      // Mask password input
      process.stdout.write(question)
      const stdin = process.stdin
      stdin.setRawMode(true)
      stdin.resume()
      stdin.setEncoding("utf8")
      let password = ""
      const onData = (ch: string) => {
        const c = ch.toString()
        if (c === "\n" || c === "\r" || c === "\u0004") {
          stdin.setRawMode(false)
          stdin.removeListener("data", onData)
          stdin.pause()
          process.stdout.write("\n")
          rl.close()
          resolve(password)
        } else if (c === "\u0003") {
          // Ctrl+C
          process.exit(1)
        } else if (c === "\u007f" || c === "\b") {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1)
            process.stdout.write("\b \b")
          }
        } else {
          password += c
          process.stdout.write("*")
        }
      }
      stdin.on("data", onData)
    } else {
      rl.question(question, (answer) => {
        rl.close()
        resolve(answer)
      })
    }
  })
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is required")
    process.exit(1)
  }

  console.log("🔑 VitaSync — Create Admin User")
  console.log("=".repeat(40))

  // Parse CLI args
  const args = parseArgs(process.argv)
  let { email, password } = args

  // Interactive prompts if args missing
  if (!email) {
    email = await prompt("Email: ")
  }
  if (!password) {
    password = await prompt("Password: ", true)
  }

  // Validate
  if (!isValidEmail(email)) {
    console.error("❌ Invalid email format.")
    process.exit(1)
  }
  if (password.length < 8) {
    console.error("❌ Password must be at least 8 characters.")
    process.exit(1)
  }

  // Connect to DB
  console.log("\n📡 Connecting to database…")
  initDb(databaseUrl)
  const db = getDb()

  // Find workspace
  const workspaceSlug = process.env.ADMIN_WORKSPACE_SLUG || "default"
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug))
    .limit(1)

  if (!workspace) {
    console.error(`❌ Workspace '${workspaceSlug}' not found. Run the API server first to bootstrap.`)
    await closeDb()
    process.exit(1)
  }

  // Check if user already exists
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing) {
    if (existing.role === "admin") {
      console.log(`\n✅ User ${email} is already an admin (ID: ${existing.id})`)
    } else {
      await db.update(users).set({ role: "admin" }).where(eq(users.id, existing.id))
      console.log(`\n✅ User promoted to admin: ${email} (ID: ${existing.id})`)
    }
    await closeDb()
    return
  }

  // Create new admin user
  const passwordHash = await argon2.hash(password)
  const [user] = await db
    .insert(users)
    .values({
      workspaceId: workspace.id,
      externalId: email,
      email,
      passwordHash,
      role: "admin",
      displayName: "Admin",
      emailVerified: true,
    })
    .returning()

  console.log(`\n✅ Admin user created: ${email} (ID: ${user!.id})`)

  await closeDb()
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err)
  process.exit(1)
})
