import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema/index"

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sql: postgres.Sql | null = null

export function createDbClient(connectionUrl: string) {
  const sql = postgres(connectionUrl, {
    max: Number(process.env["DATABASE_POOL_MAX"] ?? 20),
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {}, // suppress NOTICE messages
  })

  const db = drizzle(sql, { schema, logger: process.env["NODE_ENV"] === "development" })
  return { db, sql }
}

/** Get the singleton DB instance. Must call initDb() first. */
export function getDb() {
  if (!_db) throw new Error("Database not initialized. Call initDb() first.")
  return _db
}

/** Initialize the singleton DB connection (call once at app startup). */
export function initDb(connectionUrl: string) {
  const { db, sql } = createDbClient(connectionUrl)
  _db = db
  _sql = sql
  return db
}

/** Gracefully close the DB connection pool. */
export async function closeDb() {
  await _sql?.end({ timeout: 5 })
  _db = null
  _sql = null
}

export type Db = ReturnType<typeof createDbClient>["db"]
