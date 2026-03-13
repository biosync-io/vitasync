import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgresql://vitasync:vitasync@localhost:5432/vitasync",
  },
  migrations: {
    table: "_vitasync_migrations",
    schema: "public",
  },
  verbose: true,
  strict: true,
})
