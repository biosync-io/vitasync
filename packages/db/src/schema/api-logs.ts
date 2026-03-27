import { sql } from "drizzle-orm"
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

export const apiLogs = pgTable(
  "api_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    method: varchar("method", { length: 10 }).notNull(),
    endpoint: text("endpoint").notNull(),
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_api_logs_method").on(t.method),
    index("idx_api_logs_endpoint").on(t.endpoint),
    index("idx_api_logs_status").on(t.statusCode),
    index("idx_api_logs_created").on(t.createdAt),
  ],
)

export type ApiLog = typeof apiLogs.$inferSelect
export type ApiLogInsert = typeof apiLogs.$inferInsert
