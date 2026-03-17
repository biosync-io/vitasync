import { createHash } from "node:crypto"
import { closeDb, getDb, initDb } from "@biosync-io/db"
import { apiKeys, workspaces } from "@biosync-io/db"
import { registerFitbitProvider } from "@biosync-io/provider-fitbit"
import { registerGarminProvider } from "@biosync-io/provider-garmin"
import { registerStravaProvider } from "@biosync-io/provider-strava"
import { registerWhoopProvider } from "@biosync-io/provider-whoop"
import { eq } from "drizzle-orm"
import { config } from "./config.js"
import { buildServer } from "./server.js"

/**
 * Seeds an initial workspace + admin API key on first boot.
 *
 * Runs only when ADMIN_API_KEY is set AND no workspaces exist yet.
 * Idempotent: if the workspace slug already exists, it re-uses it.
 */
async function bootstrap(log: { info: (msg: string) => void }) {
  if (!config.ADMIN_API_KEY) return

  const db = getDb()
  const rawKey = config.ADMIN_API_KEY

  // Find or create the admin workspace
  let [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, config.ADMIN_WORKSPACE_SLUG))
    .limit(1)

  if (!workspace) {
    ;[workspace] = await db
      .insert(workspaces)
      .values({ name: config.ADMIN_WORKSPACE_SLUG, slug: config.ADMIN_WORKSPACE_SLUG })
      .onConflictDoNothing()
      .returning()
    log.info(`Bootstrap: created workspace '${config.ADMIN_WORKSPACE_SLUG}'`)
  }

  if (!workspace) return // conflict race (shouldn't happen in single-instance)

  // Upsert the admin API key by its hash so this is fully idempotent
  // SHA-256 is intentional: API keys are high-entropy random tokens (not passwords).
  // Deterministic hashing is required for O(1) DB lookup on every request.
  // bcrypt/argon2 are non-deterministic and too slow for per-request auth. lgtm[js/insufficient-password-hash]
  const keyHash = createHash("sha256").update(rawKey).digest("hex")
  const keyPrefix = rawKey.slice(0, 12)

  await db
    .insert(apiKeys)
    .values({
      workspaceId: workspace.id,
      name: "Admin Key",
      keyHash,
      keyPrefix,
      scopes: ["read", "write", "admin"],
    })
    .onConflictDoNothing() // unique constraint on key_hash

  log.info(`Bootstrap: admin API key ready (prefix: ${keyPrefix})`)
}

async function main() {
  // ── Register provider plugins ────────────────────────────────
  registerFitbitProvider()
  registerGarminProvider()
  registerStravaProvider()
  registerWhoopProvider()

  // ── Initialize database connection ───────────────────────────
  initDb(config.DATABASE_URL)

  // ── Seed initial admin workspace + API key ───────────────────
  await bootstrap({ info: (msg) => console.info(msg) })

  // ── Build and start Fastify ───────────────────────────────────
  const app = await buildServer()

  // ── Graceful shutdown ────────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutdown signal received")
    try {
      await app.close()
      await closeDb()
      app.log.info("Graceful shutdown complete")
      process.exit(0)
    } catch (err) {
      app.log.error(err, "Error during shutdown")
      process.exit(1)
    }
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))

  // ── Start listening ───────────────────────────────────────────
  await app.listen({ port: config.PORT, host: config.HOST })

  app.log.info(`🚀 VitaSync API running at http://${config.HOST}:${config.PORT}`)
  app.log.info(`📖 API docs available at http://${config.HOST}:${config.PORT}/docs`)
}

main().catch((err) => {
  console.error("Failed to start server:", err)
  process.exit(1)
})
