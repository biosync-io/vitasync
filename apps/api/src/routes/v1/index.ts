import type { FastifyInstance } from "fastify"
import achievementsRoutes from "./achievements.js"
import anomaliesRoutes from "./anomalies.js"
import apiKeysRoutes from "./api-keys.js"
import baselinesRoutes from "./baselines.js"
import challengesRoutes from "./challenges.js"
import connectionsRoutes from "./connections.js"
import correlationsRoutes from "./correlations.js"
import eventsRoutes from "./events.js"
import exportsRoutes from "./exports.js"
import goalsRoutes from "./goals.js"
import healthDataRoutes from "./health-data.js"
import healthScoresRoutes from "./health-scores.js"
import inboundRoutes from "./inbound.js"
import insightsRoutes from "./insights.js"
import medicationsRoutes from "./medications.js"
import moodRoutes from "./mood.js"
import nutritionRoutes from "./nutrition.js"
import oauthRoutes from "./oauth.js"
import personalRecordsRoutes from "./personal-records.js"
import providersRoutes from "./providers.js"
import reportsRoutes from "./reports.js"
import sleepAnalysisRoutes from "./sleep-analysis.js"
import snapshotsRoutes from "./snapshots.js"
import symptomsRoutes from "./symptoms.js"
import syncJobsRoutes from "./sync-jobs.js"
import trainingPlansRoutes from "./training-plans.js"
import usersRoutes from "./users.js"
import webhooksRoutes from "./webhooks.js"
import analyticsRoutes from "./analytics.js"
import notificationsRoutes from "./notifications.js"
import readinessRoutes from "./readiness.js"
import journalRoutes from "./journal.js"
import waterRoutes from "./water.js"
import habitsRoutes from "./habits.js"

/**
 * Registers all v1 API routes under the `/v1` prefix.
 */
export async function registerV1Routes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (v1) => {
      await v1.register(providersRoutes, { prefix: "/providers" })

      // OAuth flows (skipped by auth plugin for /v1/oauth prefix)
      await v1.register(oauthRoutes, { prefix: "/oauth" })

      // API key management
      await v1.register(apiKeysRoutes, { prefix: "/api-keys" })

      // Webhooks
      await v1.register(webhooksRoutes, { prefix: "/webhooks" })

      // User management — /v1/users
      await v1.register(usersRoutes, { prefix: "/users" })

      // User connections — /v1/users/:userId/connections
      await v1.register(connectionsRoutes, { prefix: "/users" })

      // User health data — /v1/users/:userId/health
      await v1.register(healthDataRoutes, { prefix: "/users" })

      // User events (workouts, sleep, activities) — /v1/users/:userId/events
      await v1.register(eventsRoutes, { prefix: "/users" })

      // Personal records — /v1/users/:userId/personal-records
      await v1.register(personalRecordsRoutes, { prefix: "/users" })

      // Inbound provider webhooks — /v1/inbound/:providerId/webhook
      await v1.register(inboundRoutes, { prefix: "/inbound" })

      // Sync job status — /v1/sync-jobs
      await v1.register(syncJobsRoutes, { prefix: "/sync-jobs" })

      // Health insights — /v1/users/:userId/insights + /v1/insights/algorithms
      await v1.register(insightsRoutes, { prefix: "/users" })
      await v1.register(insightsRoutes, { prefix: "/insights" })

      // --- New feature routes ---

      // Health scores — /v1/users/:userId/health-scores
      await v1.register(healthScoresRoutes, { prefix: "/users" })

      // Goals — /v1/users/:userId/goals
      await v1.register(goalsRoutes, { prefix: "/users" })

      // Achievements — /v1/users/:userId/achievements + /v1/achievements/definitions
      await v1.register(achievementsRoutes, { prefix: "/users" })
      await v1.register(achievementsRoutes, { prefix: "/achievements" })

      // Challenges — /v1/challenges
      await v1.register(challengesRoutes, { prefix: "/challenges" })

      // Mood tracking — /v1/users/:userId/mood
      await v1.register(moodRoutes, { prefix: "/users" })

      // Nutrition logging — /v1/users/:userId/nutrition
      await v1.register(nutritionRoutes, { prefix: "/users" })

      // Medication tracking — /v1/users/:userId/medications
      await v1.register(medicationsRoutes, { prefix: "/users" })

      // Anomaly detection — /v1/users/:userId/anomalies
      await v1.register(anomaliesRoutes, { prefix: "/users" })

      // Metric correlations — /v1/users/:userId/correlations
      await v1.register(correlationsRoutes, { prefix: "/users" })

      // Health reports — /v1/users/:userId/reports
      await v1.register(reportsRoutes, { prefix: "/users" })

      // Data exports — /v1/users/:userId/exports
      await v1.register(exportsRoutes, { prefix: "/users" })

      // Training plans — /v1/users/:userId/training-plans
      await v1.register(trainingPlansRoutes, { prefix: "/users" })

      // Symptom tracking — /v1/users/:userId/symptoms
      await v1.register(symptomsRoutes, { prefix: "/users" })

      // Biometric baselines — /v1/users/:userId/baselines
      await v1.register(baselinesRoutes, { prefix: "/users" })

      // Health snapshots — /v1/users/:userId/snapshots
      await v1.register(snapshotsRoutes, { prefix: "/users" })

      // Sleep analysis — /v1/users/:userId/sleep-analysis
      await v1.register(sleepAnalysisRoutes, { prefix: "/users" })

      // Notifications — /v1/users/:userId/notifications/*
      await v1.register(notificationsRoutes, { prefix: "/users" })

      // Analytics (LLM context, enhanced correlations, enhanced anomalies)
      await v1.register(analyticsRoutes, { prefix: "/users" })

      // Readiness & Training Load — /v1/users/:userId/readiness, /v1/users/:userId/training-load
      await v1.register(readinessRoutes, { prefix: "/users" })

      // Daily journal — /v1/users/:userId/journal
      await v1.register(journalRoutes, { prefix: "/users" })

      // Water intake tracking — /v1/users/:userId/water
      await v1.register(waterRoutes, { prefix: "/users" })

      // Habits tracking — /v1/users/:userId/habits
      await v1.register(habitsRoutes, { prefix: "/users" })
    },
    { prefix: "/v1" },
  )
}
