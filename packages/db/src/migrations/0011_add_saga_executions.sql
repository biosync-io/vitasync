CREATE TABLE "saga_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"saga_name" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL DEFAULT 'running',
	"context" jsonb NOT NULL DEFAULT '{}',
	"current_step" integer NOT NULL DEFAULT 0,
	"step_results" jsonb NOT NULL DEFAULT '[]',
	"started_at" timestamp with time zone NOT NULL DEFAULT now(),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "saga_executions_saga_name_idx" ON "saga_executions" USING btree ("saga_name");
--> statement-breakpoint
CREATE INDEX "saga_executions_status_idx" ON "saga_executions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "saga_executions_started_at_idx" ON "saga_executions" USING btree ("started_at");
