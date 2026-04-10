import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { workspaces } from "./workspaces"

/**
 * Workspace-level identity provider configuration.
 *
 * Supports OIDC and SAML 2.0 protocols.  Workspace admins can
 * configure IdPs from the dashboard; the SSO service reads these
 * at authorize / callback time.
 *
 * Secrets (oidcClientSecret) are stored encrypted with AES-256-GCM
 * using the same ENCRYPTION_KEY as OAuth provider tokens.
 */
export const identityProviders = pgTable(
  "identity_providers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Display name shown on the login page ("Corporate Okta", "Google") */
    name: varchar("name", { length: 255 }).notNull(),
    /** Protocol discriminator */
    protocol: varchar("protocol", { length: 10 }).notNull(), // 'oidc' | 'saml'
    /** URL-safe slug used in SSO callback URLs (unique per workspace) */
    slug: varchar("slug", { length: 100 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),

    // ── OIDC fields ──────────────────────────────────────────
    oidcIssuer: varchar("oidc_issuer", { length: 1024 }),
    oidcClientId: varchar("oidc_client_id", { length: 512 }),
    /** Encrypted with AES-256-GCM */
    oidcClientSecret: text("oidc_client_secret"),
    oidcScopes: text("oidc_scopes")
      .array()
      .default(sql`ARRAY['openid','email','profile']::text[]`),
    oidcDiscoveryUrl: varchar("oidc_discovery_url", { length: 1024 }),

    // ── SAML fields ──────────────────────────────────────────
    samlEntityId: varchar("saml_entity_id", { length: 1024 }),
    samlSsoUrl: varchar("saml_sso_url", { length: 1024 }),
    /** IdP X.509 signing certificate (PEM-encoded) */
    samlCertificate: text("saml_certificate"),
    samlSignRequests: boolean("saml_sign_requests").default(false),
    samlNameIdFormat: varchar("saml_name_id_format", { length: 255 }).default(
      "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    ),

    // ── Common ───────────────────────────────────────────────
    /** Create user on first SSO login */
    autoProvision: boolean("auto_provision").notNull().default(true),
    /** Role assigned to JIT-created users */
    defaultRole: varchar("default_role", { length: 20 }).default("user"),
    /** Maps IdP claims → VitaSync user fields */
    attributeMapping: jsonb("attribute_mapping")
      .$type<Record<string, string>>()
      .default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_idp_workspace").on(t.workspaceId),
    unique("uq_idp_workspace_slug").on(t.workspaceId, t.slug),
  ],
)

export type IdentityProvider = typeof identityProviders.$inferSelect
export type IdentityProviderInsert = typeof identityProviders.$inferInsert
