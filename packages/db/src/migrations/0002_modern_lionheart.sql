CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(1000),
	"icon" varchar(100),
	"tier" varchar(20),
	"unlocked_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomaly_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric_type" varchar(50) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"detection_method" varchar(30) NOT NULL,
	"observed_value" double precision NOT NULL,
	"expected_value" double precision NOT NULL,
	"z_score" double precision,
	"title" varchar(255) NOT NULL,
	"description" varchar(2000) NOT NULL,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biometric_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric_type" varchar(50) NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"mean" double precision NOT NULL,
	"stddev" double precision,
	"min" double precision,
	"max" double precision,
	"median" double precision,
	"p25" double precision,
	"p75" double precision,
	"sample_size" double precision,
	"trend" varchar(10),
	"trend_slope" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_biometric_baselines_user_metric_date" UNIQUE("user_id","metric_type","date")
);
--> statement-breakpoint
CREATE TABLE "challenge_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"rank" integer,
	"daily_scores" jsonb DEFAULT '{}'::jsonb,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(2000),
	"challenge_type" varchar(50) NOT NULL,
	"metric_type" varchar(50) NOT NULL,
	"aggregation" varchar(20) DEFAULT 'sum' NOT NULL,
	"target_value" double precision,
	"unit" varchar(20),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"max_participants" integer,
	"is_public" boolean DEFAULT true NOT NULL,
	"rules" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correlations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric_a" varchar(50) NOT NULL,
	"metric_b" varchar(50) NOT NULL,
	"pearson_r" double precision NOT NULL,
	"spearman_rho" double precision,
	"p_value" double precision,
	"sample_size" double precision NOT NULL,
	"strength" varchar(20) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"description" varchar(2000),
	"lag_days" double precision DEFAULT 0,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_correlations_user_metrics_period" UNIQUE("user_id","metric_a","metric_b","period_end")
);
--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"format" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"metric_types" jsonb,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"record_count" jsonb,
	"download_url" varchar(2000),
	"expires_at" timestamp with time zone,
	"error" varchar(2000),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "goal_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	"percent_complete" double precision NOT NULL,
	"met" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(1000),
	"category" varchar(50) NOT NULL,
	"metric_type" varchar(50),
	"target_value" double precision NOT NULL,
	"unit" varchar(20),
	"cadence" varchar(20) NOT NULL,
	"current_value" double precision DEFAULT 0,
	"best_value" double precision,
	"current_streak" double precision DEFAULT 0,
	"longest_streak" double precision DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"report_type" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'generating' NOT NULL,
	"content" jsonb,
	"highlights" jsonb,
	"recommendations" jsonb,
	"format" varchar(20) DEFAULT 'json' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"overall_score" double precision NOT NULL,
	"sleep_score" double precision,
	"activity_score" double precision,
	"cardio_score" double precision,
	"recovery_score" double precision,
	"body_score" double precision,
	"delta_from_previous" double precision,
	"weekly_average" double precision,
	"percentile_rank" double precision,
	"grade" varchar(5),
	"breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_health_scores_user_date" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_type" varchar(20) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"overall_score" double precision,
	"avg_steps" double precision,
	"avg_sleep_minutes" double precision,
	"avg_resting_hr" double precision,
	"avg_hrv" double precision,
	"avg_calories" double precision,
	"avg_active_minutes" double precision,
	"avg_weight" double precision,
	"avg_stress" double precision,
	"avg_recovery" double precision,
	"workout_count" double precision,
	"total_distance_meters" double precision,
	"goal_completion_rate" double precision,
	"avg_mood_score" double precision,
	"period_comparison" jsonb,
	"achievements" jsonb,
	"observations" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_health_snapshots_user_period" UNIQUE("user_id","period_type","period_start")
);
--> statement-breakpoint
CREATE TABLE "mood_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"score" double precision NOT NULL,
	"energy_level" double precision,
	"stress_level" double precision,
	"mood" varchar(50) NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"notes" varchar(5000),
	"factors" jsonb DEFAULT '[]'::jsonb,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"meal_type" varchar(50) NOT NULL,
	"description" varchar(1000),
	"calories" double precision,
	"protein_grams" double precision,
	"carbs_grams" double precision,
	"fat_grams" double precision,
	"fiber_grams" double precision,
	"sugar_grams" double precision,
	"sodium_mg" double precision,
	"water_ml" double precision,
	"details" jsonb,
	"consumed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"taken_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone NOT NULL,
	"side_effects" jsonb,
	"notes" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"dosage" varchar(100),
	"frequency" varchar(50) NOT NULL,
	"time_of_day" jsonb DEFAULT '[]'::jsonb,
	"category" varchar(50),
	"purpose" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"notes" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"goal" varchar(50) NOT NULL,
	"difficulty" varchar(20) NOT NULL,
	"duration_weeks" integer NOT NULL,
	"current_week" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"schedule" jsonb,
	"weekly_targets" jsonb,
	"adherence_rate" double precision DEFAULT 0,
	"progression_notes" jsonb,
	"adaptive" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptom_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symptom" varchar(100) NOT NULL,
	"severity" double precision NOT NULL,
	"duration_minutes" double precision,
	"body_location" varchar(50),
	"triggers" jsonb,
	"relief_measures" jsonb,
	"notes" varchar(2000),
	"started_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_type" varchar(30) NOT NULL,
	"label" varchar(100) NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"channel_type" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" varchar(2000),
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"categories" jsonb NOT NULL,
	"min_severity" varchar(20) DEFAULT 'info' NOT NULL,
	"channel_ids" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_events_provider_dedup";--> statement-breakpoint
ALTER TABLE "provider_connections" ALTER COLUMN "status" SET DEFAULT 'connected';--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_alerts" ADD CONSTRAINT "anomaly_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_baselines" ADD CONSTRAINT "biometric_baselines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correlations" ADD CONSTRAINT "correlations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_reports" ADD CONSTRAINT "health_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_scores" ADD CONSTRAINT "health_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_snapshots" ADD CONSTRAINT "health_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mood_logs" ADD CONSTRAINT "mood_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_logs" ADD CONSTRAINT "nutrition_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_logs" ADD CONSTRAINT "symptom_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_channel_id_notification_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."notification_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_achievements_user" ON "achievements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_achievements_user_type" ON "achievements" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE INDEX "idx_anomaly_alerts_user" ON "anomaly_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_anomaly_alerts_user_severity" ON "anomaly_alerts" USING btree ("user_id","severity");--> statement-breakpoint
CREATE INDEX "idx_anomaly_alerts_user_status" ON "anomaly_alerts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_biometric_baselines_user_metric" ON "biometric_baselines" USING btree ("user_id","metric_type","date");--> statement-breakpoint
CREATE INDEX "idx_challenge_participants_challenge" ON "challenge_participants" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "idx_challenge_participants_user" ON "challenge_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_challenges_workspace" ON "challenges" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_challenges_status" ON "challenges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_correlations_user" ON "correlations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_data_exports_user" ON "data_exports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_data_exports_status" ON "data_exports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_goal_progress_goal_date" ON "goal_progress" USING btree ("goal_id","date");--> statement-breakpoint
CREATE INDEX "idx_goal_progress_user_date" ON "goal_progress" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_goals_user" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_goals_user_category" ON "goals" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "idx_health_reports_user" ON "health_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_health_reports_user_type" ON "health_reports" USING btree ("user_id","report_type");--> statement-breakpoint
CREATE INDEX "idx_health_scores_user_date" ON "health_scores" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_health_snapshots_user" ON "health_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_mood_logs_user_time" ON "mood_logs" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_nutrition_logs_user_time" ON "nutrition_logs" USING btree ("user_id","consumed_at");--> statement-breakpoint
CREATE INDEX "idx_nutrition_logs_user_type" ON "nutrition_logs" USING btree ("user_id","meal_type");--> statement-breakpoint
CREATE INDEX "idx_medication_logs_med" ON "medication_logs" USING btree ("medication_id");--> statement-breakpoint
CREATE INDEX "idx_medication_logs_user_time" ON "medication_logs" USING btree ("user_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_medications_user" ON "medications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_training_plans_user" ON "training_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_training_plans_user_status" ON "training_plans" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_symptom_logs_user_time" ON "symptom_logs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_symptom_logs_user_symptom" ON "symptom_logs" USING btree ("user_id","symptom");--> statement-breakpoint
CREATE INDEX "idx_notification_channels_user" ON "notification_channels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notification_channels_type" ON "notification_channels" USING btree ("user_id","channel_type");--> statement-breakpoint
CREATE INDEX "idx_notification_logs_user" ON "notification_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notification_logs_channel" ON "notification_logs" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_notification_logs_status" ON "notification_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notification_rules_user" ON "notification_rules" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "uq_events_provider_dedup" UNIQUE("user_id","provider_id","provider_event_id");