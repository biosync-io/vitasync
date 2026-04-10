import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  customType,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/** Custom bytea column type for binary credential data */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
})

/**
 * WebAuthn / FIDO2 credential storage.
 *
 * Each row represents a single authenticator credential registered
 * by a user (e.g. Touch ID, YubiKey, synced passkey).
 *
 * The `counter` is used for clone detection — if the authenticator
 * returns a counter lower than the stored value, the credential may
 * have been cloned.
 */
export const webauthnCredentials = pgTable(
  "webauthn_credentials",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Raw credential ID from the authenticator */
    credentialId: bytea("credential_id").notNull(),
    /** COSE public key */
    publicKey: bytea("public_key").notNull(),
    /** Signature counter for clone detection */
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    /** Transports the authenticator supports */
    transports: text("transports").array(),
    /** 'singleDevice' or 'multiDevice' (synced passkey) */
    deviceType: varchar("device_type", { length: 50 }),
    /** Whether the credential is backed up / synced */
    backedUp: boolean("backed_up").default(false),
    /** User-friendly label ("MacBook Touch ID", "YubiKey 5") */
    friendlyName: varchar("friendly_name", { length: 255 }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_webauthn_user").on(t.userId),
    index("idx_webauthn_credential_id").on(t.credentialId),
  ],
)

export type WebauthnCredential = typeof webauthnCredentials.$inferSelect
export type WebauthnCredentialInsert = typeof webauthnCredentials.$inferInsert
