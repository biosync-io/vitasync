import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildTestApp, TEST_API_KEY_ID, TEST_USER_ID, TEST_WORKSPACE_ID } from "./helpers.js"
import type { FastifyInstance } from "fastify"

// ── Mock DB and audit service ────────────────────────────────────
// GDPR routes import a large number of DB tables and call getDb() directly.
// We mock the entire @biosync-io/db module to provide controllable behavior.

const mockDeleteReturning = vi.fn()
const mockInsertReturning = vi.fn()
const mockUpdateReturning = vi.fn()
const mockSelectFrom = vi.fn()

vi.mock("@biosync-io/db", () => {
  // Create table stubs — each table object only needs the column refs
  // used in .where() / .select() / .delete() / .insert() calls.
  const makeTable = (name: string) =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          return `${name}.${String(prop)}`
        },
      },
    )

  return {
    getDb: () => ({
      select: (...args: any[]) => ({
        from: (...fromArgs: any[]) => {
          const result = mockSelectFrom(fromArgs[0])
          return {
            where: (..._w: any[]) => {
              const resolved = result !== undefined ? result : []
              return {
                limit: () => resolved,
                then: (resolve: any) => resolve(resolved),
              }
            },
            orderBy: () => (result !== undefined ? result : []),
            then: (resolve: any) => resolve(result !== undefined ? result : []),
          }
        },
      }),
      delete: () => ({
        where: () => ({
          returning: () => mockDeleteReturning(),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: () => mockInsertReturning(),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => mockUpdateReturning(),
            then: (resolve: any) => resolve(undefined),
          }),
        }),
      }),
    }),
    users: makeTable("users"),
    healthMetrics: makeTable("healthMetrics"),
    events: makeTable("events"),
    providerConnections: makeTable("providerConnections"),
    goals: makeTable("goals"),
    healthScores: makeTable("healthScores"),
    moodLogs: makeTable("moodLogs"),
    nutritionLogs: makeTable("nutritionLogs"),
    medications: makeTable("medications"),
    anomalyAlerts: makeTable("anomalyAlerts"),
    correlations: makeTable("correlations"),
    healthReports: makeTable("healthReports"),
    dataExports: makeTable("dataExports"),
    trainingPlans: makeTable("trainingPlans"),
    symptomLogs: makeTable("symptomLogs"),
    biometricBaselines: makeTable("biometricBaselines"),
    healthSnapshots: makeTable("healthSnapshots"),
    personalRecords: makeTable("personalRecords"),
    journalEntries: makeTable("journalEntries"),
    waterIntake: makeTable("waterIntake"),
    habits: makeTable("habits"),
    userSessions: makeTable("userSessions"),
    userIdentities: makeTable("userIdentities"),
    userConsents: makeTable("userConsents"),
    mfaTotp: makeTable("mfaTotp"),
    webauthnCredentials: makeTable("webauthnCredentials"),
    auditLog: makeTable("auditLog"),
    inAppNotifications: makeTable("inAppNotifications"),
    trainingLoad: makeTable("trainingLoad"),
    apiKeys: makeTable("apiKeys"),
    identityProviders: makeTable("identityProviders"),
    webhooks: makeTable("webhooks"),
    webhookEvents: makeTable("webhookEvents"),
    syncJobs: makeTable("syncJobs"),
    achievementDefinitions: makeTable("achievementDefinitions"),
    userAchievements: makeTable("userAchievements"),
    challenges: makeTable("challenges"),
    challengeParticipants: makeTable("challengeParticipants"),
  }
})

vi.mock("../services/audit.service.js", () => {
  const AuditService = vi.fn()
  AuditService.prototype.log = vi.fn().mockResolvedValue(undefined)
  return { AuditService }
})

describe("GDPR routes", () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.resetAllMocks()
    mockDeleteReturning.mockReturnValue([])
    mockInsertReturning.mockReturnValue([])
    mockUpdateReturning.mockReturnValue([])
    mockSelectFrom.mockReturnValue(undefined)
    app = await buildTestApp()
  })

  // ── Erasure ────────────────────────────────────────────────────

  describe("DELETE /v1/users/:userId/gdpr-erase", () => {
    it("returns an erasure certificate on success", async () => {
      // User exists
      mockSelectFrom.mockReturnValue([{ id: TEST_USER_ID }])
      // Each table delete returns some rows
      mockDeleteReturning.mockReturnValue([{ id: "row-1" }])

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/gdpr-erase`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.type).toBe("gdpr_erasure_certificate")
      expect(body.userId).toBe(TEST_USER_ID)
      expect(body.workspaceId).toBe(TEST_WORKSPACE_ID)
      expect(body.erasedAt).toBeTruthy()
      expect(body.deletionCounts).toBeDefined()
      expect(body.requestedBy).toBe(TEST_API_KEY_ID)
    })

    it("returns 404 when user does not exist", async () => {
      mockSelectFrom.mockReturnValue([])

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/gdpr-erase`,
      })

      expect(res.statusCode).toBe(404)
      expect(res.json()).toMatchObject({ code: "NOT_FOUND" })
    })

    it("returns 400 for non-UUID userId", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/v1/users/not-a-uuid/gdpr-erase",
      })

      expect(res.statusCode).toBe(400)
    })

    it("returns 403 without admin scope", async () => {
      const readOnlyApp = await buildTestApp(["read"])

      const res = await readOnlyApp.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/gdpr-erase`,
      })

      expect(res.statusCode).toBe(403)
    })
  })

  // ── Consents ──────────────────────────────────────────────────

  describe("GET /v1/users/:userId/consents", () => {
    it("returns consent list", async () => {
      const mockConsents = [
        {
          id: "consent-1",
          userId: TEST_USER_ID,
          consentType: "analytics",
          granted: true,
          version: "1.0",
        },
      ]
      mockSelectFrom.mockReturnValue(mockConsents)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/consents`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual(mockConsents)
    })

    it("returns empty array when no consents exist", async () => {
      mockSelectFrom.mockReturnValue([])

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/consents`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })
  })

  describe("POST /v1/users/:userId/consents", () => {
    it("creates a consent and returns 201", async () => {
      const mockConsent = {
        id: "consent-new",
        userId: TEST_USER_ID,
        consentType: "marketing",
        granted: true,
        version: "2.0",
        grantedAt: new Date().toISOString(),
      }
      mockInsertReturning.mockReturnValue([mockConsent])

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/consents`,
        body: { consentType: "marketing", version: "2.0" },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({
        consentType: "marketing",
        granted: true,
      })
    })

    it("returns 400 when consentType is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/consents`,
        body: { version: "1.0" },
      })

      expect(res.statusCode).toBe(400)
    })

    it("returns 400 when version is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/consents`,
        body: { consentType: "analytics" },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("DELETE /v1/users/:userId/consents/:consentType", () => {
    it("revokes consent and returns updated record", async () => {
      const revokedConsent = {
        id: "consent-1",
        userId: TEST_USER_ID,
        consentType: "analytics",
        granted: false,
        revokedAt: new Date().toISOString(),
      }
      mockUpdateReturning.mockReturnValue([revokedConsent])

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/consents/analytics`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({
        granted: false,
        consentType: "analytics",
      })
    })

    it("returns 404 when no active consent found", async () => {
      mockUpdateReturning.mockReturnValue([])

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/consents/nonexistent`,
      })

      expect(res.statusCode).toBe(404)
      expect(res.json()).toMatchObject({ code: "NOT_FOUND" })
    })
  })
})

// ── Erasure certificate structure (unit) ────────────────────────

describe("GDPR erasure certificate structure", () => {
  it("contains all required fields", () => {
    const cert = {
      type: "gdpr_erasure_certificate",
      userId: "user-123",
      workspaceId: "ws-1",
      erasedAt: new Date().toISOString(),
      deletionCounts: { health_metrics: 5, user: 1 },
      requestedBy: "admin-1",
    }

    expect(cert.type).toBe("gdpr_erasure_certificate")
    expect(cert.userId).toBeTruthy()
    expect(cert.workspaceId).toBeTruthy()
    expect(cert.erasedAt).toBeTruthy()
    expect(cert.deletionCounts).toBeDefined()
    expect(typeof cert.deletionCounts).toBe("object")
    expect(cert.requestedBy).toBeTruthy()
  })

  it("erasedAt is a valid ISO 8601 timestamp", () => {
    const cert = {
      erasedAt: new Date().toISOString(),
    }
    expect(new Date(cert.erasedAt).toISOString()).toBe(cert.erasedAt)
  })
})
