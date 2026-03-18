import type { FastifyInstance } from "fastify"
import apiKeysRoutes from "./api-keys.js"
import connectionsRoutes from "./connections.js"
import eventsRoutes from "./events.js"
import healthDataRoutes from "./health-data.js"
import inboundRoutes from "./inbound.js"
import insightsRoutes from "./insights.js"
import oauthRoutes from "./oauth.js"
import personalRecordsRoutes from "./personal-records.js"
import providersRoutes from "./providers.js"
import syncJobsRoutes from "./sync-jobs.js"
import usersRoutes from "./users.js"
import webhooksRoutes from "./webhooks.js"

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
    },
    { prefix: "/v1" },
  )
}
