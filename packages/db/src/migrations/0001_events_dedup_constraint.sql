-- Replace the plain index with a unique constraint so that
-- INSERT ... ON CONFLICT (user_id, provider_id, provider_event_id) DO NOTHING works correctly.
DROP INDEX IF EXISTS "idx_events_provider_dedup";
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "uq_events_provider_dedup" UNIQUE("user_id","provider_id","provider_event_id");
