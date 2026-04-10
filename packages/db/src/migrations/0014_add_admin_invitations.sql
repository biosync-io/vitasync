-- Admin invitations table for invite-based admin onboarding

CREATE TABLE "admin_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(255) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"invited_by" uuid NOT NULL REFERENCES "users"("id"),
	"role" varchar(50) NOT NULL DEFAULT 'admin',
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_admin_invitations_email" ON "admin_invitations" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "idx_admin_invitations_token_hash" ON "admin_invitations" USING btree ("token_hash");
