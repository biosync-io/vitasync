-- System-wide key-value settings table

CREATE TABLE "system_settings" (
	"key" varchar(255) PRIMARY KEY,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
