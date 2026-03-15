import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { workspaces } from "./workspaces"

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** HMAC secret for signing payloads (stored encrypted) */
    secret: varchar("secret", { length: 64 }).notNull(),
    /** Event types to deliver (e.g., ["data.synced", "connection.created"]) */
    events: text("events").array().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    description: varchar("description", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_webhooks_workspace").on(t.workspaceId)],
)

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    responseStatus: integer("response_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_deliveries_webhook").on(t.webhookId),
    index("idx_deliveries_status").on(t.status),
  ],
)

export type Webhook = typeof webhooks.$inferSelect
export type WebhookInsert = typeof webhooks.$inferInsert
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect
export type WebhookDeliveryInsert = typeof webhookDeliveries.$inferInsert
