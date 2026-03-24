CREATE TABLE IF NOT EXISTS "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"provider_type" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"encrypted_api_key" text,
	"base_url" varchar(500),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
