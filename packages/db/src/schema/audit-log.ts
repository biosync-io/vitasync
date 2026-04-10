import { sql } from "drizzle-orm"
import {
  bigserial,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { workspaces } from "./workspaces"

/**
 * Tamper-proof cryptographic audit log.
 *
 * Every security-relevant action is recorded here.  Each entry
 * contains the SHA-256 hash of the previous entry (`previousHash`)
 * and a self-hash (`entryHash`) computed over the entire row.  This
 * forms an append-only hash chain — any retroactive modification
 * breaks the chain and is detectable.
 *
 * Writes are append-only.  UPDATE / DELETE should never be executed
 * except during GDPR erasure (which anonymizes actor fields but
 * preserves the chain by re-computing hashes over redacted content).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    /** 'user' | 'api_key' | 'system' */
    actorType: varchar("actor_type", { length: 20 }).notNull(),
    /** userId, apiKeyId, or 'system' */
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    /** Dot-separated action name: 'auth.login', 'user.view_health', 'data.export' */
    action: varchar("action", { length: 100 }).notNull(),
    /** Target resource type: 'user', 'health_metric', 'connection', etc. */
    resourceType: varchar("resource_type", { length: 50 }),
    resourceId: varchar("resource_id", { length: 255 }),
    /** Additional context */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 512 }),
    /** SHA-256 of the previous audit log entry — forms hash chain */
    previousHash: varchar("previous_hash", { length: 64 }).notNull(),
    /** SHA-256(previousHash + timestamp + action + actorId + ...) */
    entryHash: varchar("entry_hash", { length: 64 }).notNull(),
  },
  (t) => [
    index("idx_audit_workspace").on(t.workspaceId),
    index("idx_audit_actor").on(t.actorType, t.actorId),
    index("idx_audit_action").on(t.action),
    index("idx_audit_timestamp").on(t.timestamp),
  ],
)

export type AuditLogEntry = typeof auditLog.$inferSelect
export type AuditLogInsert = typeof auditLog.$inferInsert
