ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
