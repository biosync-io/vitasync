CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" varchar(200) NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"sequence_number" bigint NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_domain_events_aggregate_seq" ON "domain_events" USING btree ("aggregate_type", "aggregate_id", "sequence_number");
--> statement-breakpoint
CREATE INDEX "idx_domain_events_event_type" ON "domain_events" USING btree ("event_type");
--> statement-breakpoint
CREATE INDEX "idx_domain_events_workspace_time" ON "domain_events" USING btree ("workspace_id", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_domain_events_created_at" ON "domain_events" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE "aggregate_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"sequence_number" bigint NOT NULL,
	"state" jsonb NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_aggregate_snapshots_agg_seq" ON "aggregate_snapshots" USING btree ("aggregate_type", "aggregate_id", "sequence_number");
--> statement-breakpoint
-- Notify listeners on new domain events (enables reactive projections / read-model updates)
CREATE OR REPLACE FUNCTION notify_domain_event() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('event_store_new', NEW.aggregate_id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_domain_events_notify
  AFTER INSERT ON "domain_events"
  FOR EACH ROW
  EXECUTE FUNCTION notify_domain_event();
