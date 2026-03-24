CREATE TABLE IF NOT EXISTS "inbound_webhook_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar(50) NOT NULL,
	"provider_user_id" varchar(255),
	"connection_id" uuid,
	"event_type" varchar(100),
	"status" varchar(20) DEFAULT 'processed' NOT NULL,
	"data_points_ingested" integer DEFAULT 0,
	"signature_valid" boolean,
	"http_status" integer,
	"error" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_inbound_wh_logs_provider" ON "inbound_webhook_logs" USING btree ("provider_id");
CREATE INDEX IF NOT EXISTS "idx_inbound_wh_logs_created" ON "inbound_webhook_logs" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_inbound_wh_logs_status" ON "inbound_webhook_logs" USING btree ("status");

DO $$ BEGIN
  ALTER TABLE "inbound_webhook_logs" ADD CONSTRAINT "inbound_webhook_logs_connection_id_provider_connections_id_fk"
    FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
