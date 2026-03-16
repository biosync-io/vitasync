/**
 * Standalone database migration runner.
 * Built to dist/migrate.js and executed by the Kubernetes migration Job.
 *
 * Usage (in container): node apps/api/dist/migrate.js
 */
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set")
  process.exit(1)
}

// Resolve the migrations folder relative to this compiled file.
// The SQL files are copied next to the output at dist/migrations/.
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = join(__dirname, "migrations")

const sql = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(sql)

console.info("Running database migrations…")
try {
  await migrate(db, { migrationsFolder })
  console.info("Migrations complete.")
} catch (err) {
  console.error("Migration failed:", err)
  process.exit(1)
} finally {
  await sql.end()
}
