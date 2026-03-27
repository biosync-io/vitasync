CREATE TABLE IF NOT EXISTS "api_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method" varchar(10) NOT NULL,
	"endpoint" text NOT NULL,
	"status_code" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_api_logs_method" ON "api_logs" USING btree ("method");
CREATE INDEX IF NOT EXISTS "idx_api_logs_endpoint" ON "api_logs" USING btree ("endpoint");
CREATE INDEX IF NOT EXISTS "idx_api_logs_status" ON "api_logs" USING btree ("status_code");
CREATE INDEX IF NOT EXISTS "idx_api_logs_created" ON "api_logs" USING btree ("created_at");
