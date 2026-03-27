ALTER TABLE "sync_jobs" ADD COLUMN IF NOT EXISTS "events_synced" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN IF NOT EXISTS "provider_id" varchar(50);
--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN IF NOT EXISTS "duration_ms" integer;
--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN IF NOT EXISTS "provider_call_stats" jsonb;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_jobs_provider" ON "sync_jobs" USING btree ("provider_id");
