/**
 * Standalone database migration runner.
 * Built to dist/migrate.js and executed by the Kubernetes migration Job.
 *
 * Usage (in container): node apps/api/dist/migrate.js
 */
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"

const DATABASE_URL = process.env["DATABASE_URL"]
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set")
  process.exit(1)
}

// Resolve the migrations folder relative to this compiled file:
// dist/migrate.js → dist/ → ../../packages/db/dist/migrations (bundled by tsup)
// We bundle the SQL files via tsup's `loader` option, so they are copied
// next to the output at dist/migrations/.
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = join(__dirname, "migrations")

const sql = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(sql)

console.log("Running database migrations…")
try {
  await migrate(db, { migrationsFolder })
  console.log("Migrations complete.")
} catch (err) {
  console.error("Migration failed:", err)
  process.exit(1)
} finally {
  await sql.end()
}
