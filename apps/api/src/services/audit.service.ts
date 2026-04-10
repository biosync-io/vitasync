import { createHash } from "node:crypto"
import { auditLog, getDb } from "@biosync-io/db"
import { desc, eq } from "drizzle-orm"

// Genesis hash for the first entry in the chain
const GENESIS_HASH = "0".repeat(64)

interface AuditEntry {
  actorType: "user" | "api_key" | "system"
  actorId: string
  workspaceId?: string
  action: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

function computeEntryHash(previousHash: string, entry: {
  timestamp: string
  actorType: string
  actorId: string
  action: string
  resourceType?: string | null
  resourceId?: string | null
}): string {
  const data = [
    previousHash,
    entry.timestamp,
    entry.actorType,
    entry.actorId,
    entry.action,
    entry.resourceType ?? "",
    entry.resourceId ?? "",
  ].join("|")
  return createHash("sha256").update(data).digest("hex")
}

export class AuditService {
  private get db() {
    return getDb()
  }

  /** Append a new entry to the audit log hash chain. */
  async log(entry: AuditEntry): Promise<void> {
    // Get the last entry's hash (or genesis)
    const [last] = await this.db
      .select({ entryHash: auditLog.entryHash })
      .from(auditLog)
      .orderBy(desc(auditLog.id))
      .limit(1)

    const previousHash = last?.entryHash ?? GENESIS_HASH
    const now = new Date()
    const timestamp = now.toISOString()

    const entryHash = computeEntryHash(previousHash, {
      timestamp,
      actorType: entry.actorType,
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
    })

    await this.db.insert(auditLog).values({
      timestamp: now,
      actorType: entry.actorType,
      actorId: entry.actorId,
      workspaceId: entry.workspaceId ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      metadata: entry.metadata ?? {},
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      previousHash,
      entryHash,
    })
  }

  /** Verify the integrity of the hash chain between two IDs. */
  async verifyChain(fromId?: number, toId?: number): Promise<{ valid: boolean; checkedCount: number; brokenAt?: number }> {
    const rows = await this.db
      .select()
      .from(auditLog)
      .orderBy(auditLog.id)

    let checkedCount = 0
    let expectedPrevHash = GENESIS_HASH

    for (const row of rows) {
      if (fromId && row.id < fromId) {
        expectedPrevHash = row.entryHash
        continue
      }
      if (toId && row.id > toId) break

      checkedCount++

      if (row.previousHash !== expectedPrevHash) {
        return { valid: false, checkedCount, brokenAt: row.id }
      }

      const recomputed = computeEntryHash(row.previousHash, {
        timestamp: row.timestamp.toISOString(),
        actorType: row.actorType,
        actorId: row.actorId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
      })

      if (recomputed !== row.entryHash) {
        return { valid: false, checkedCount, brokenAt: row.id }
      }

      expectedPrevHash = row.entryHash
    }

    return { valid: true, checkedCount }
  }
}
