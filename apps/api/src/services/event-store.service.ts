import {
  aggregateSnapshots,
  domainEvents,
  type Db,
} from "@biosync-io/db"
import { and, asc, desc, eq, gt, gte, lte, sql } from "drizzle-orm"

// ── Errors ────────────────────────────────────────────────────────

export class ConcurrencyError extends Error {
  constructor(aggregateId: string, expected: number, actual: number) {
    super(
      `Concurrency conflict on aggregate ${aggregateId}: expected sequence ${expected}, actual ${actual}`,
    )
    this.name = "ConcurrencyError"
  }
}

export class AggregateNotFoundError extends Error {
  constructor(aggregateId: string) {
    super(`No events found for aggregate ${aggregateId}`)
    this.name = "AggregateNotFoundError"
  }
}

// ── Types ─────────────────────────────────────────────────────────

export interface AppendEventInput {
  aggregateType: string
  aggregateId: string
  eventType: string
  payload: unknown
  metadata: {
    userId?: string
    workspaceId: string
    requestId?: string
    version?: number
  }
}

// ── Snapshot interval ─────────────────────────────────────────────

const SNAPSHOT_INTERVAL = 100

// ── Service ───────────────────────────────────────────────────────

export class EventStoreService {
  constructor(private db: Db) {}

  /**
   * Append one or more events to the store within a transaction.
   *
   * If `expectedSequence` is provided the current max sequence for the
   * aggregate must match — otherwise a `ConcurrencyError` is thrown
   * (optimistic concurrency control).
   */
  async append(
    events: AppendEventInput[],
    expectedSequence?: number,
  ): Promise<void> {
    if (events.length === 0) return

    // All events in a batch must target the same aggregate
    const firstInput = events[0]
    if (!firstInput) return
    const aggregateId = firstInput.aggregateId

    await this.db.transaction(async (tx) => {
      // Lock + fetch current sequence in a single query
      const seqRows = await tx
        .select({
          maxSeq: sql<number>`coalesce(max(${domainEvents.sequenceNumber}), 0)`,
        })
        .from(domainEvents)
        .where(eq(domainEvents.aggregateId, aggregateId))

      const currentSeq = Number(seqRows[0]?.maxSeq ?? 0)

      if (expectedSequence !== undefined && currentSeq !== expectedSequence) {
        throw new ConcurrencyError(aggregateId, expectedSequence, currentSeq)
      }

      let nextSeq = currentSeq

      const insertRows = events.map((e) => {
        nextSeq += 1
        return {
          aggregateType: e.aggregateType,
          aggregateId: e.aggregateId,
          eventType: e.eventType,
          payload: e.payload,
          metadata: e.metadata,
          sequenceNumber: nextSeq,
          workspaceId: e.metadata.workspaceId,
        }
      })

      await tx.insert(domainEvents).values(insertRows)

      // Auto-snapshot: if any new sequence crosses a SNAPSHOT_INTERVAL boundary
      const lastSeq = nextSeq
      if (
        Math.floor(lastSeq / SNAPSHOT_INTERVAL) >
          Math.floor(currentSeq / SNAPSHOT_INTERVAL)
      ) {
        // Build aggregate state by replaying all events (cheap for first 100, still bounded)
        const allEvents = await tx
          .select()
          .from(domainEvents)
          .where(eq(domainEvents.aggregateId, aggregateId))
          .orderBy(asc(domainEvents.sequenceNumber))

        const state = allEvents.map((ev) => ({
          eventType: ev.eventType,
          payload: ev.payload,
          sequenceNumber: ev.sequenceNumber,
          createdAt: ev.createdAt.toISOString(),
        }))

        await tx.insert(aggregateSnapshots).values({
          aggregateType: firstInput.aggregateType,
          aggregateId,
          sequenceNumber: lastSeq,
          state,
          workspaceId: firstInput.metadata.workspaceId,
        })
      }
    })
  }

  /**
   * Retrieve events for an aggregate, optionally starting/ending at a
   * specific sequence number.
   */
  async getEvents(
    aggregateId: string,
    opts?: {
      fromSequence?: number
      toSequence?: number
      limit?: number
    },
  ): Promise<Array<typeof domainEvents.$inferSelect>> {
    const conditions = [eq(domainEvents.aggregateId, aggregateId)]

    if (opts?.fromSequence !== undefined) {
      conditions.push(gt(domainEvents.sequenceNumber, opts.fromSequence))
    }
    if (opts?.toSequence !== undefined) {
      conditions.push(lte(domainEvents.sequenceNumber, opts.toSequence))
    }

    const query = this.db
      .select()
      .from(domainEvents)
      .where(and(...conditions))
      .orderBy(asc(domainEvents.sequenceNumber))
      .limit(opts?.limit ?? 10_000)

    return query
  }

  /**
   * Query events by type — useful for building read-model projections.
   */
  async getEventsByType(
    eventType: string,
    opts?: {
      since?: Date
      limit?: number
      workspaceId?: string
    },
  ): Promise<Array<typeof domainEvents.$inferSelect>> {
    const conditions = [eq(domainEvents.eventType, eventType)]

    if (opts?.since) {
      conditions.push(gte(domainEvents.createdAt, opts.since))
    }
    if (opts?.workspaceId) {
      conditions.push(eq(domainEvents.workspaceId, opts.workspaceId))
    }

    const query = this.db
      .select()
      .from(domainEvents)
      .where(and(...conditions))
      .orderBy(asc(domainEvents.createdAt))
      .limit(opts?.limit ?? 10_000)

    return query
  }

  // ── Snapshot management ───────────────────────────────────────────

  async saveSnapshot(
    aggregateType: string,
    aggregateId: string,
    sequenceNumber: number,
    state: unknown,
    workspaceId: string,
  ): Promise<void> {
    await this.db.insert(aggregateSnapshots).values({
      aggregateType,
      aggregateId,
      sequenceNumber,
      state,
      workspaceId,
    })
  }

  async getLatestSnapshot(
    aggregateId: string,
  ): Promise<{ state: unknown; sequenceNumber: number } | null> {
    const rows = await this.db
      .select({
        state: aggregateSnapshots.state,
        sequenceNumber: aggregateSnapshots.sequenceNumber,
      })
      .from(aggregateSnapshots)
      .where(eq(aggregateSnapshots.aggregateId, aggregateId))
      .orderBy(desc(aggregateSnapshots.sequenceNumber))
      .limit(1)

    const row = rows[0]
    if (!row) return null

    return {
      state: row.state,
      sequenceNumber: Number(row.sequenceNumber),
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /**
   * Get the current (max) sequence number for an aggregate.
   * Returns 0 if the aggregate has no events.
   */
  async getCurrentSequence(aggregateId: string): Promise<number> {
    const rows = await this.db
      .select({
        maxSeq: sql<number>`coalesce(max(${domainEvents.sequenceNumber}), 0)`,
      })
      .from(domainEvents)
      .where(eq(domainEvents.aggregateId, aggregateId))

    return Number(rows[0]?.maxSeq ?? 0)
  }

  /**
   * Load aggregate state: start from latest snapshot then replay
   * subsequent events.
   */
  async loadAggregate(aggregateId: string): Promise<{
    events: Array<typeof domainEvents.$inferSelect>
    snapshot: { state: unknown; sequenceNumber: number } | null
    currentSequence: number
  }> {
    const snapshot = await this.getLatestSnapshot(aggregateId)

    const fromSeq = snapshot?.sequenceNumber
    const events = await this.getEvents(aggregateId, {
      ...(fromSeq !== undefined ? { fromSequence: fromSeq } : {}),
    })

    if (!snapshot && events.length === 0) {
      throw new AggregateNotFoundError(aggregateId)
    }

    const currentSequence =
      events.length > 0
        ? Number(events[events.length - 1]!.sequenceNumber)
        : snapshot?.sequenceNumber ?? 0

    return { events, snapshot, currentSequence }
  }
}
