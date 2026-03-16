import { closeDb, initDb } from "@biosync-io/db"
import { registerFitbitProvider } from "@biosync-io/provider-fitbit"
import { registerGarminProvider } from "@biosync-io/provider-garmin"
import { registerStravaProvider } from "@biosync-io/provider-strava"
import { registerWhoopProvider } from "@biosync-io/provider-whoop"
import { config } from "./config.js"
import { buildServer } from "./server.js"

async function main() {
  // ── Register provider plugins ────────────────────────────────
  registerFitbitProvider()
  registerGarminProvider()
  registerStravaProvider()
  registerWhoopProvider()

  // ── Initialize database connection ───────────────────────────
  initDb(config.DATABASE_URL)

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
