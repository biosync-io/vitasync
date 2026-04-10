import {
  bigint,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

/**
 * Append-only domain event log (Event Store).
 *
 * Every state-changing operation is captured as an immutable event.
 * Events are ordered per-aggregate via `sequenceNumber` and globally
 * via `createdAt`.  The table is designed for partitioning by
 * `createdAt` when event volume grows.
 */
export const domainEvents = pgTable(
  "domain_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 200 }).notNull(),
    payload: jsonb("payload").notNull(),
    metadata: jsonb("metadata").$type<{
      userId?: string
      workspaceId: string
      requestId?: string
      version?: number
    }>().notNull(),
    sequenceNumber: bigint("sequence_number", { mode: "number" }).notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_domain_events_aggregate_seq").on(
      t.aggregateType,
      t.aggregateId,
      t.sequenceNumber,
    ),
    index("idx_domain_events_event_type").on(t.eventType),
    index("idx_domain_events_workspace_time").on(t.workspaceId, t.createdAt),
    index("idx_domain_events_created_at").on(t.createdAt),
  ],
)

export type DomainEventRow = typeof domainEvents.$inferSelect
export type DomainEventInsert = typeof domainEvents.$inferInsert

/**
 * Periodic aggregate state snapshots for fast reconstruction.
 *
 * Instead of replaying all events from the beginning, consumers
 * load the latest snapshot and replay only subsequent events.
 */
export const aggregateSnapshots = pgTable(
  "aggregate_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    sequenceNumber: bigint("sequence_number", { mode: "number" }).notNull(),
    state: jsonb("state").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_aggregate_snapshots_agg_seq").on(
      t.aggregateType,
      t.aggregateId,
      t.sequenceNumber,
    ),
  ],
)

export type AggregateSnapshotRow = typeof aggregateSnapshots.$inferSelect
export type AggregateSnapshotInsert = typeof aggregateSnapshots.$inferInsert
