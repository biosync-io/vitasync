import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import {
  getDb,
  users,
  healthMetrics,
  events,
  providerConnections,
  goals,
  healthScores,
  moodLogs,
  nutritionLogs,
  medications,
  anomalyAlerts,
  correlations,
  healthReports,
  dataExports,
  trainingPlans,
  symptomLogs,
  biometricBaselines,
  healthSnapshots,
  personalRecords,
  journalEntries,
  waterIntake,
  habits,
  userSessions,
  userIdentities,
  userConsents,
  mfaTotp,
  webauthnCredentials,
  auditLog,
  inAppNotifications,
  trainingLoad,
} from "@biosync-io/db"
import { and, eq } from "drizzle-orm"
import { requireScope } from "../../plugins/auth.js"
import { AuditService } from "../../services/audit.service.js"

const auditService = new AuditService()

const gdprRoutes: FastifyPluginAsync = async (app) => {
  // DELETE /v1/users/:userId/gdpr-erase — full data cascade purge
  app.delete(
    "/:userId/gdpr-erase",
    { preHandler: [requireScope("admin")] },
    async (request, reply) => {
      const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
      const db = getDb()

      // Verify user exists in workspace
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.workspaceId, request.workspaceId)))
        .limit(1)

      if (!user) {
        return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })
      }

      const deletionCounts: Record<string, number> = {}

      // Delete from all user-scoped tables (cascade would handle most,
      // but we track counts for the erasure certificate)
      const tables = [
        { name: "health_metrics", table: healthMetrics, fk: healthMetrics.userId },
        { name: "events", table: events, fk: events.userId },
        { name: "provider_connections", table: providerConnections, fk: providerConnections.userId },
        { name: "goals", table: goals, fk: goals.userId },
        { name: "health_scores", table: healthScores, fk: healthScores.userId },
        { name: "mood_logs", table: moodLogs, fk: moodLogs.userId },
        { name: "nutrition_logs", table: nutritionLogs, fk: nutritionLogs.userId },
        { name: "medications", table: medications, fk: medications.userId },
        { name: "anomaly_alerts", table: anomalyAlerts, fk: anomalyAlerts.userId },
        { name: "correlations", table: correlations, fk: correlations.userId },
        { name: "health_reports", table: healthReports, fk: healthReports.userId },
        { name: "data_exports", table: dataExports, fk: dataExports.userId },
        { name: "training_plans", table: trainingPlans, fk: trainingPlans.userId },
        { name: "symptom_logs", table: symptomLogs, fk: symptomLogs.userId },
        { name: "biometric_baselines", table: biometricBaselines, fk: biometricBaselines.userId },
        { name: "health_snapshots", table: healthSnapshots, fk: healthSnapshots.userId },
        { name: "personal_records", table: personalRecords, fk: personalRecords.userId },
        { name: "journal_entries", table: journalEntries, fk: journalEntries.userId },
        { name: "water_intake", table: waterIntake, fk: waterIntake.userId },
        { name: "habits", table: habits, fk: habits.userId },
        { name: "in_app_notifications", table: inAppNotifications, fk: inAppNotifications.userId },
        { name: "user_sessions", table: userSessions, fk: userSessions.userId },
        { name: "user_identities", table: userIdentities, fk: userIdentities.userId },
        { name: "user_consents", table: userConsents, fk: userConsents.userId },
        { name: "mfa_totp", table: mfaTotp, fk: mfaTotp.userId },
        { name: "webauthn_credentials", table: webauthnCredentials, fk: webauthnCredentials.userId },
      ]

      for (const { name, table, fk } of tables) {
        try {
          const deleted = await db
            .delete(table)
            .where(eq(fk, userId))
            .returning({ id: (table as any).id })
          deletionCounts[name] = deleted.length
        } catch {
          deletionCounts[name] = 0
        }
      }

      // Anonymize audit log entries (preserve chain but redact PII)
      await db
        .update(auditLog)
        .set({
          actorId: "[ERASED]",
          ipAddress: null,
          userAgent: null,
          metadata: {},
        })
        .where(and(eq(auditLog.actorType, "user"), eq(auditLog.actorId, userId)))

      // Delete the user itself
      await db.delete(users).where(eq(users.id, userId))
      deletionCounts["user"] = 1

      // Log the erasure in audit trail
      await auditService.log({
        actorType: request.authenticatedUserId ? "user" : "api_key",
        actorId: request.authenticatedUserId ?? request.apiKeyId,
        workspaceId: request.workspaceId,
        action: "gdpr.erase",
        resourceType: "user",
        resourceId: userId,
        metadata: { deletionCounts },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      })

      // Generate erasure certificate
      const certificate = {
        type: "gdpr_erasure_certificate",
        userId,
        workspaceId: request.workspaceId,
        erasedAt: new Date().toISOString(),
        deletionCounts,
        requestedBy: request.authenticatedUserId ?? request.apiKeyId,
      }

      return reply.send(certificate)
    },
  )

  // ── Consent management ────────────────────────────────────────

  // GET /v1/users/:userId/consents
  app.get("/:userId/consents", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const db = getDb()

    const consents = await db
      .select()
      .from(userConsents)
      .where(eq(userConsents.userId, userId))

    return reply.send(consents)
  })

  // POST /v1/users/:userId/consents — grant consent
  app.post("/:userId/consents", async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const body = z
      .object({
        consentType: z.string().min(1).max(100),
        version: z.string().min(1).max(20),
        metadata: z.record(z.unknown()).optional(),
      })
      .parse(request.body)

    const db = getDb()

    const [consent] = await db
      .insert(userConsents)
      .values({
        userId,
        consentType: body.consentType,
        granted: true,
        version: body.version,
        grantedAt: new Date(),
        ipAddress: request.ip,
        metadata: body.metadata ?? {},
      })
      .returning()

    await auditService.log({
      actorType: "user",
      actorId: userId,
      workspaceId: request.workspaceId,
      action: "consent.grant",
      resourceType: "consent",
      resourceId: consent?.id ?? null,
      metadata: { consentType: body.consentType, version: body.version },
      ipAddress: request.ip,
    })

    return reply.status(201).send(consent)
  })

  // DELETE /v1/users/:userId/consents/:consentType — revoke consent
  app.delete("/:userId/consents/:consentType", async (request, reply) => {
    const { userId, consentType } = z
      .object({ userId: z.string().uuid(), consentType: z.string() })
      .parse(request.params)

    const db = getDb()

    const [updated] = await db
      .update(userConsents)
      .set({ granted: false, revokedAt: new Date() })
      .where(
        and(
          eq(userConsents.userId, userId),
          eq(userConsents.consentType, consentType),
          eq(userConsents.granted, true),
        ),
      )
      .returning()

    if (!updated) {
      return reply.status(404).send({
        code: "NOT_FOUND",
        message: "Active consent not found",
      })
    }

    await auditService.log({
      actorType: "user",
      actorId: userId,
      workspaceId: request.workspaceId,
      action: "consent.revoke",
      resourceType: "consent",
      resourceId: updated.id,
      metadata: { consentType },
      ipAddress: request.ip,
    })

    return reply.send(updated)
  })
}

export default gdprRoutes
