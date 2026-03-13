import { z } from "zod"

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY must be at least 32 characters"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((v) => v.split(",").map((s) => s.trim())),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  OAUTH_REDIRECT_BASE_URL: z.string().url().default("http://localhost:3001"),
})

const result = EnvSchema.safeParse(process.env)

if (!result.success) {
  console.error("❌ Invalid environment variables:")
  for (const [key, errors] of Object.entries(result.error.flatten().fieldErrors)) {
    console.error(`  ${key}: ${(errors as string[]).join(", ")}`)
  }
  process.exit(1)
}

export const config = result.data
export type Config = typeof result.data
