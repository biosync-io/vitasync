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
import { providerConnections } from "./provider-connections"

export const inboundWebhookLogs = pgTable(
  "inbound_webhook_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    providerId: varchar("provider_id", { length: 50 }).notNull(),
    providerUserId: varchar("provider_user_id", { length: 255 }),
    connectionId: uuid("connection_id").references(() => providerConnections.id, {
      onDelete: "set null",
    }),
    eventType: varchar("event_type", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("processed"),
    dataPointsIngested: integer("data_points_ingested").default(0),
    signatureValid: boolean("signature_valid"),
    httpStatus: integer("http_status"),
    error: text("error"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_inbound_wh_logs_provider").on(t.providerId),
    index("idx_inbound_wh_logs_created").on(t.createdAt),
    index("idx_inbound_wh_logs_status").on(t.status),
  ],
)

export type InboundWebhookLog = typeof inboundWebhookLogs.$inferSelect
export type InboundWebhookLogInsert = typeof inboundWebhookLogs.$inferInsert
