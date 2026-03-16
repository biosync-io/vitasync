import { events, getDb } from "@biosync-io/db"
import type { EventInsert, EventRow } from "@biosync-io/db"
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import { decodeCursor, encodeCursor } from "../lib/cursor.js"

export interface EventQuery {
  userId: string
  workspaceId: string
  eventType?: string
  activityType?: string
  from?: Date
  to?: Date
  limit?: number
  cursor?: string
}

export class EventService {
  private get db() {
    return getDb()
  }

  async query(
    params: EventQuery,
  ): Promise<{ data: EventRow[]; nextCursor?: string; hasMore: boolean }> {
    const { userId, eventType, activityType, from, to, limit = 50 } = params

    const conditions = [eq(events.userId, userId)]
    if (eventType) conditions.push(eq(events.eventType, eventType))
    if (activityType) conditions.push(eq(events.activityType, activityType))
    if (from) conditions.push(gte(events.startedAt, from))
    if (to) conditions.push(lte(events.startedAt, to))

    if (params.cursor) {
      const { id: cursorId, ts: cursorTs } = decodeCursor(params.cursor)
      conditions.push(
        sql`(${events.startedAt}, ${events.id}) < (${new Date(cursorTs).toISOString()}::timestamptz, ${cursorId}::uuid)`,
      )
    }

    const fetchLimit = Math.min(limit, 200) + 1

    const rows = await this.db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.startedAt))
      .limit(fetchLimit)

    const hasMore = rows.length > Math.min(limit, 200)
    const data = rows.slice(0, Math.min(limit, 200))

    let nextCursor: string | undefined
    const last = data.at(-1)
    if (hasMore && last) {
      nextCursor = encodeCursor(last.id, new Date(last.startedAt))
    }

    return { data, nextCursor, hasMore }
  }

  async findById(id: string, userId: string): Promise<EventRow | null> {
    const [row] = await this.db
      .select()
      .from(events)
      .where(and(eq(events.id, id), eq(events.userId, userId)))
      .limit(1)

    return row ?? null
  }

  async bulkUpsert(records: EventInsert[]): Promise<number> {
    if (records.length === 0) return 0

    const result = await this.db
      .insert(events)
      .values(records)
      .onConflictDoNothing({ target: [events.userId, events.providerId, events.providerEventId] })
      .returning({ id: events.id })

    return result.length
  }
}
