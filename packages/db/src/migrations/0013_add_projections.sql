-- Materialized read-model projections for CQRS dashboard queries

CREATE TABLE "health_score_projection" (
	"user_id" uuid PRIMARY KEY,
	"workspace_id" uuid NOT NULL,
	"overall_score" double precision,
	"cardio_score" double precision,
	"sleep_score" double precision,
	"recovery_score" double precision,
	"activity_score" double precision,
	"mental_score" double precision,
	"trend" varchar(20),
	"computed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_health_score_proj_workspace" ON "health_score_projection" USING btree ("workspace_id");
--> statement-breakpoint

CREATE TABLE "daily_summary_projection" (
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"date" date NOT NULL,
	"steps" integer,
	"calories_burned" double precision,
	"active_minutes" integer,
	"sleep_hours" double precision,
	"sleep_score" double precision,
	"avg_heart_rate" double precision,
	"resting_heart_rate" double precision,
	"hrv_avg" double precision,
	"mood_score" double precision,
	"readiness_score" double precision,
	"water_ml" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_summary_projection_pkey" PRIMARY KEY ("user_id", "date")
);
--> statement-breakpoint
CREATE INDEX "idx_daily_summary_proj_workspace" ON "daily_summary_projection" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX "idx_daily_summary_proj_user_date" ON "daily_summary_projection" USING btree ("user_id", "date");
--> statement-breakpoint

CREATE TABLE "readiness_projection" (
	"user_id" uuid PRIMARY KEY,
	"workspace_id" uuid NOT NULL,
	"score" double precision,
	"hrv_status" varchar(20),
	"sleep_status" varchar(20),
	"recovery_status" varchar(20),
	"training_load" double precision,
	"fitness" double precision,
	"fatigue" double precision,
	"recommendation" varchar(100),
	"computed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_readiness_proj_workspace" ON "readiness_projection" USING btree ("workspace_id");
