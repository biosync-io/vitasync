import { z } from "zod"

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().length(64, "Must be 64 hex chars (32 bytes)"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  // Provider credentials (optional — providers self-disable if missing)
  FITBIT_CLIENT_ID: z.string().optional(),
  FITBIT_CLIENT_SECRET: z.string().optional(),
  GARMIN_CONSUMER_KEY: z.string().optional(),
  GARMIN_CONSUMER_SECRET: z.string().optional(),
})

export type WorkerConfig = z.infer<typeof EnvSchema>

let _config: WorkerConfig | null = null

export function getConfig(): WorkerConfig {
  if (!_config) {
    const result = EnvSchema.safeParse(process.env)
    if (!result.success) {
      console.error("Worker configuration is invalid:", result.error.format())
      process.exit(1)
    }
    _config = result.data
  }
  return _config
}
