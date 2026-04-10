import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

/**
 * Audit log hash chain tests.
 *
 * The AuditService uses SHA-256 hash chaining to guarantee tamper-evident
 * audit entries.  We test the hashing algorithm directly (pure function)
 * rather than mocking the entire Drizzle database layer.
 */

const GENESIS_HASH = "0".repeat(64)

/** Mirror of the private `computeEntryHash` in audit.service.ts */
function computeEntryHash(
  previousHash: string,
  entry: {
    timestamp: string
    actorType: string
    actorId: string
    action: string
    resourceType?: string | null
    resourceId?: string | null
  },
): string {
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

describe("Audit log hash chain", () => {
  describe("computeEntryHash", () => {
    it("produces deterministic hashes for the same input", () => {
      const entry = {
        timestamp: "2025-01-01T00:00:00.000Z",
        actorType: "user",
        actorId: "user-1",
        action: "auth.login",
      }
      const hash1 = computeEntryHash(GENESIS_HASH, entry)
      const hash2 = computeEntryHash(GENESIS_HASH, entry)
      expect(hash1).toBe(hash2)
    })

    it("returns a 64-char hex string (SHA-256)", () => {
      const hash = computeEntryHash(GENESIS_HASH, {
        timestamp: "2025-06-01T12:00:00.000Z",
        actorType: "api_key",
        actorId: "key-1",
        action: "data.read",
      })
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it("produces different hashes for different actions", () => {
      const base = {
        timestamp: "2025-01-01T00:00:00.000Z",
        actorType: "user",
        actorId: "user-1",
      }
      const h1 = computeEntryHash(GENESIS_HASH, { ...base, action: "auth.login" })
      const h2 = computeEntryHash(GENESIS_HASH, { ...base, action: "auth.logout" })
      expect(h1).not.toBe(h2)
    })

    it("produces different hashes for different actors", () => {
      const base = {
        timestamp: "2025-01-01T00:00:00.000Z",
        actorType: "user" as const,
        action: "auth.login",
      }
      const h1 = computeEntryHash(GENESIS_HASH, { ...base, actorId: "user-1" })
      const h2 = computeEntryHash(GENESIS_HASH, { ...base, actorId: "user-2" })
      expect(h1).not.toBe(h2)
    })

    it("produces different hashes for different previous hashes (chaining)", () => {
      const entry = {
        timestamp: "2025-01-01T00:00:00.000Z",
        actorType: "user",
        actorId: "user-1",
        action: "auth.login",
      }
      const h1 = computeEntryHash(GENESIS_HASH, entry)
      const h2 = computeEntryHash("a".repeat(64), entry)
      expect(h1).not.toBe(h2)
    })

    it("handles optional resourceType and resourceId", () => {
      const entry = {
        timestamp: "2025-01-01T00:00:00.000Z",
        actorType: "user",
        actorId: "user-1",
        action: "resource.update",
        resourceType: "health_metric",
        resourceId: "metric-42",
      }
      const hash = computeEntryHash(GENESIS_HASH, entry)
      expect(hash).toHaveLength(64)

      // Null/undefined resource fields should produce different hash
      const hashNoResource = computeEntryHash(GENESIS_HASH, {
        ...entry,
        resourceType: null,
        resourceId: null,
      })
      expect(hash).not.toBe(hashNoResource)
    })
  })

  describe("chain integrity verification", () => {
    it("simulates a valid chain of 3 entries", () => {
      const entries = [
        {
          timestamp: "2025-01-01T00:00:00.000Z",
          actorType: "system",
          actorId: "bootstrap",
          action: "system.init",
        },
        {
          timestamp: "2025-01-01T00:00:01.000Z",
          actorType: "user",
          actorId: "user-1",
          action: "auth.login",
        },
        {
          timestamp: "2025-01-01T00:00:02.000Z",
          actorType: "user",
          actorId: "user-1",
          action: "data.read",
          resourceType: "health_metric",
          resourceId: "m-1",
        },
      ]

      const chain: Array<{ previousHash: string; entryHash: string }> = []
      let prevHash = GENESIS_HASH

      for (const entry of entries) {
        const entryHash = computeEntryHash(prevHash, entry)
        chain.push({ previousHash: prevHash, entryHash })
        prevHash = entryHash
      }

      // Verify: each entry's previousHash matches the prior entry's hash
      expect(chain[0]!.previousHash).toBe(GENESIS_HASH)
      expect(chain[1]!.previousHash).toBe(chain[0]!.entryHash)
      expect(chain[2]!.previousHash).toBe(chain[1]!.entryHash)

      // All hashes are unique
      const hashes = chain.map((c) => c.entryHash)
      expect(new Set(hashes).size).toBe(3)
    })

    it("detects tampering when an entry is modified", () => {
      const entry1 = {
        timestamp: "2025-01-01T00:00:00.000Z",
        actorType: "user",
        actorId: "user-1",
        action: "auth.login",
      }
      const hash1 = computeEntryHash(GENESIS_HASH, entry1)

      const entry2 = {
        timestamp: "2025-01-01T00:00:01.000Z",
        actorType: "user",
        actorId: "user-1",
        action: "data.delete",
        resourceType: "health_metric",
        resourceId: "m-1",
      }
      const hash2 = computeEntryHash(hash1, entry2)

      // Tamper: change entry1's action
      const tampered1 = { ...entry1, action: "auth.logout" }
      const tamperedHash1 = computeEntryHash(GENESIS_HASH, tampered1)

      // The chain breaks: entry2's previousHash no longer matches
      expect(tamperedHash1).not.toBe(hash1)

      // Recomputing entry2 with the tampered hash gives a different result
      const recomputedHash2 = computeEntryHash(tamperedHash1, entry2)
      expect(recomputedHash2).not.toBe(hash2)
    })
  })
})
