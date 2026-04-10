#!/usr/bin/env tsx
/**
 * Projection Rebuilder CLI
 *
 * Truncates all projection tables, replays every domain event from the
 * event store in order, and rebuilds all projections from scratch.
 *
 * Usage:
 *   npx tsx apps/api/src/cli/rebuild-projections.ts
 *
 * Environment:
 *   DATABASE_URL — required PostgreSQL connection string
 */

import { initDb, getDb, closeDb, domainEvents } from "@biosync-io/db"
import { EventBus } from "@biosync-io/event-bus"
import type { DomainEvent } from "@biosync-io/event-bus"
import { asc, sql } from "drizzle-orm"
import { ProjectionService } from "../services/projection.service.js"

// ── Helpers ──────────────────────────────────────────────────────

function elapsed(startMs: number): string {
  const ms = Date.now() - startMs
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is required")
    process.exit(1)
  }

  console.log("🔄 Projection Rebuilder")
  console.log("=".repeat(50))

  const totalStart = Date.now()

  // 1. Connect to DB
  console.log("\n📡 Connecting to database…")
  initDb(databaseUrl)
  const db = getDb()

  // Create a no-op event bus (not publishing, just need the service interface)
  const eventBus = new EventBus()

  const logger = {
    info: (...args: unknown[]) => console.log("[projections]", ...args),
    error: (...args: unknown[]) => console.error("[projections]", ...args),
    warn: (...args: unknown[]) => console.warn("[projections]", ...args),
    debug: () => {}, // suppress debug during rebuild for cleaner output
  }

  const projectionService = new ProjectionService(db, eventBus, { logger })

  // 2. Truncate all projection tables
  console.log("\n🗑️  Truncating projection tables…")
  const truncateStart = Date.now()
  await projectionService.truncateAll()
  console.log(`   Done in ${elapsed(truncateStart)}`)

  // 3. Count total events
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(domainEvents)
  const totalEvents = Number(countResult[0]?.count ?? 0)
  console.log(`\n📊 Total domain events to replay: ${totalEvents.toLocaleString()}`)

  if (totalEvents === 0) {
    console.log("\n✅ No events to replay. Projections are empty.")
    await eventBus.close()
    await closeDb()
    return
  }

  // 4. Replay events in batches
  console.log("\n▶️  Replaying events…")
  const replayStart = Date.now()

  const BATCH_SIZE = 1000
  let processed = 0
  let offset = 0
  let errors = 0

  while (offset < totalEvents) {
    const batch = await db
      .select()
      .from(domainEvents)
      .orderBy(asc(domainEvents.createdAt), asc(domainEvents.sequenceNumber))
      .limit(BATCH_SIZE)
      .offset(offset)

    for (const row of batch) {
      try {
        // Convert the DB row into a DomainEvent shape
        const event: DomainEvent = {
          id: row.id,
          type: row.eventType,
          aggregateType: row.aggregateType,
          aggregateId: row.aggregateId,
          payload: row.payload as Record<string, unknown>,
          metadata: {
            ...(row.metadata as Record<string, unknown>),
            timestamp: row.createdAt.toISOString(),
            version: (row.metadata as { version?: number })?.version ?? 1,
          },
        }

        await projectionService.processEvent(event)
        processed++
      } catch (err) {
        errors++
        console.error(`   ⚠ Error processing event ${row.id} (${row.eventType}):`, err)
      }
    }

    offset += batch.length

    // Progress logging every batch
    const pct = Math.min(100, Math.round((processed / totalEvents) * 100))
    process.stdout.write(
      `\r   Processed ${processed.toLocaleString()} / ${totalEvents.toLocaleString()} events (${pct}%)`,
    )

    if (batch.length < BATCH_SIZE) break
  }

  console.log() // newline after progress

  // 5. Summary
  console.log("\n" + "=".repeat(50))
  console.log("✅ Projection rebuild complete!")
  console.log(`   Events processed: ${processed.toLocaleString()}`)
  if (errors > 0) {
    console.log(`   Errors:           ${errors.toLocaleString()}`)
  }
  console.log(`   Replay time:      ${elapsed(replayStart)}`)
  console.log(`   Total time:       ${elapsed(totalStart)}`)

  // Cleanup
  await eventBus.close()
  await closeDb()
}

main().catch((err) => {
  console.error("\n❌ Fatal error during projection rebuild:", err)
  process.exit(1)
})
