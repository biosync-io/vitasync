-- Migration: 0009_add_user_auth
-- Adds user authentication, SSO, WebAuthn, MFA, audit, consent, and data retention

-- ── Extend users table ──────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(20) NOT NULL DEFAULT 'user';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;

-- ── User sessions (refresh tokens) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "refresh_token_hash" varchar(64) NOT NULL,
  "family_id" uuid NOT NULL,
  "device_fingerprint" varchar(64),
  "geo_country" varchar(3),
  "geo_city" varchar(100),
  "risk_score" varchar(3),
  "user_agent" varchar(512),
  "ip_address" varchar(45),
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_user_sessions_token" ON "user_sessions" ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "idx_user_sessions_family" ON "user_sessions" ("family_id");
CREATE INDEX IF NOT EXISTS "idx_user_sessions_user" ON "user_sessions" ("user_id");

-- ── Identity providers (OIDC / SAML) ───────────────────────────
CREATE TABLE IF NOT EXISTS "identity_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "protocol" varchar(10) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "oidc_issuer" varchar(1024),
  "oidc_client_id" varchar(512),
  "oidc_client_secret" text,
  "oidc_scopes" text[] DEFAULT ARRAY['openid','email','profile']::text[],
  "oidc_discovery_url" varchar(1024),
  "saml_entity_id" varchar(1024),
  "saml_sso_url" varchar(1024),
  "saml_certificate" text,
  "saml_sign_requests" boolean DEFAULT false,
  "saml_name_id_format" varchar(255) DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  "auto_provision" boolean NOT NULL DEFAULT true,
  "default_role" varchar(20) DEFAULT 'user',
  "attribute_mapping" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_idp_workspace" ON "identity_providers" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_idp_workspace_slug" ON "identity_providers" ("workspace_id", "slug");

-- ── User identities (federated identity links) ─────────────────
CREATE TABLE IF NOT EXISTS "user_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider_id" uuid NOT NULL REFERENCES "identity_providers"("id") ON DELETE CASCADE,
  "subject" varchar(512) NOT NULL,
  "email" varchar(255),
  "raw_attributes" jsonb DEFAULT '{}',
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_identity_provider_subject" ON "user_identities" ("provider_id", "subject");
CREATE INDEX IF NOT EXISTS "idx_identity_user" ON "user_identities" ("user_id");

-- ── WebAuthn credentials ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "webauthn_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "credential_id" bytea NOT NULL,
  "public_key" bytea NOT NULL,
  "counter" bigint NOT NULL DEFAULT 0,
  "transports" text[],
  "device_type" varchar(50),
  "backed_up" boolean DEFAULT false,
  "friendly_name" varchar(255),
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_webauthn_user" ON "webauthn_credentials" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_webauthn_credential_id" ON "webauthn_credentials" ("credential_id");

-- ── MFA TOTP ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mfa_totp" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "secret" text NOT NULL,
  "verified" boolean NOT NULL DEFAULT false,
  "recovery_codes" text[] NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- ── Cryptographic audit log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" bigserial PRIMARY KEY,
  "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
  "actor_type" varchar(20) NOT NULL,
  "actor_id" varchar(255) NOT NULL,
  "workspace_id" uuid REFERENCES "workspaces"("id"),
  "action" varchar(100) NOT NULL,
  "resource_type" varchar(50),
  "resource_id" varchar(255),
  "metadata" jsonb DEFAULT '{}',
  "ip_address" varchar(45),
  "user_agent" varchar(512),
  "previous_hash" varchar(64) NOT NULL,
  "entry_hash" varchar(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_audit_workspace" ON "audit_log" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_audit_actor" ON "audit_log" ("actor_type", "actor_id");
CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "audit_log" ("action");
CREATE INDEX IF NOT EXISTS "idx_audit_timestamp" ON "audit_log" ("timestamp");

-- ── User consents ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "consent_type" varchar(100) NOT NULL,
  "granted" boolean NOT NULL,
  "version" varchar(20) NOT NULL,
  "granted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "ip_address" varchar(45),
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_consent_user" ON "user_consents" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_consent_type" ON "user_consents" ("user_id", "consent_type");

-- ── Data retention policies ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "data_retention_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "data_type" varchar(50) NOT NULL,
  "retention_days" integer NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_retention_workspace" ON "data_retention_policies" ("workspace_id");
