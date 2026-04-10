import { z } from "zod"

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((v) => v.split(",").map((s) => s.trim())),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  OAUTH_REDIRECT_BASE_URL: z.string().url().default("http://localhost:3001"),
  // Bootstrap: if set, a workspace + admin API key are created on first boot
  ADMIN_WORKSPACE_SLUG: z.string().default("default"),
  ADMIN_API_KEY: z.string().optional(),
  ADMIN_EMAIL: z.string().optional().transform(v => v || undefined),
  ADMIN_PASSWORD: z.string().optional().transform(v => v || undefined),
  // ── Auth ───────────────────────────────────────────────────
  ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRY: z.string().default("7d"),
  ACCOUNT_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
  ACCOUNT_LOCKOUT_DURATION_MS: z.coerce.number().int().positive().default(900_000),
  ALLOW_SELF_REGISTRATION: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  // ── SSO ────────────────────────────────────────────────────
  SSO_CALLBACK_BASE_URL: z.string().default("http://localhost:3001"),
  SAML_SP_ENTITY_ID: z.string().default("urn:vitasync:sp"),
  // ── WebAuthn ───────────────────────────────────────────────
  WEBAUTHN_RP_NAME: z.string().default("VitaSync"),
  WEBAUTHN_RP_ID: z.string().default("localhost"),
  WEBAUTHN_ORIGIN: z.string().default("http://localhost:3000"),
  // ── SMTP (optional — can also be configured via admin UI) ───
  SMTP_HOST: z.string().optional().transform(v => v || undefined),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional().transform(v => v || undefined),
  SMTP_PASS: z.string().optional().transform(v => v || undefined),
  SMTP_FROM_NAME: z.string().optional().transform(v => v || undefined),
  SMTP_FROM_EMAIL: z.string().optional().transform(v => v || undefined),
  // OpenTelemetry (optional)
  OTEL_ENABLED:z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  OTEL_SERVICE_NAME: z.string().default("vitasync-api"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default("http://localhost:4317"),
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
