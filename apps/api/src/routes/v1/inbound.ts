import { providerRegistry } from "@biosync-io/provider-core"
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { ConnectionService } from "../../services/connection.service.js"
import { HealthDataService } from "../../services/health-data.service.js"

const connectionService = new ConnectionService()
const healthDataService = new HealthDataService()

/**
 * Inbound webhook routes for provider push notifications.
 *
 * Providers call these endpoints to push data or activity event notifications.
 * Each request is verified using an HMAC signature before any data is processed.
 *
 * Route: POST /v1/inbound/:providerId/webhook
 *
 * Headers expected:
 *   X-Webhook-Signature  — HMAC-SHA256 hex digest of the raw body, keyed with
 *                          the PROVIDER_WEBHOOK_SECRET env var for that provider.
 *   X-Provider-User-Id   — The provider's own user/athlete ID so we can route
 *                          the payload to the correct VitaSync connection.
 */
const inboundRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/:providerId/webhook",
    {
      config: { rawBody: true }, // Fastify must expose raw body for signature verification
    },
    async (request, reply) => {
      const { providerId } = z
        .object({ providerId: z.string().min(1).max(50) })
        .parse(request.params)

      if (!providerRegistry.isRegistered(providerId)) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: `Provider '${providerId}' is not available`,
        })
      }

      const provider = providerRegistry.resolve(providerId)

      // ── Signature verification ──────────────────────────────
      // Use a per-provider secret stored as STRAVA_WEBHOOK_SECRET, FITBIT_WEBHOOK_SECRET, etc.
      const secretEnvKey = `${providerId.toUpperCase()}_WEBHOOK_SECRET`
      const webhookSecret = process.env[secretEnvKey]

      if (!webhookSecret) {
        app.log.warn({ providerId }, "Inbound webhook received but no webhook secret configured")
        return reply.status(503).send({
          code: "NOT_CONFIGURED",
          message: "Webhook processing is not configured for this provider",
        })
      }

      const signature = (request.headers["x-webhook-signature"] as string | undefined) ?? ""
      const rawBody: Buffer =
        (request as typeof request & { rawBody?: Buffer }).rawBody ?? Buffer.from("")

      if (provider.verifyWebhookSignature) {
        const valid = provider.verifyWebhookSignature(rawBody, signature, webhookSecret)
        if (!valid) {
          app.log.warn({ providerId }, "Inbound webhook signature verification failed")
          return reply
            .status(401)
            .send({ code: "INVALID_SIGNATURE", message: "Webhook signature mismatch" })
        }
      }

      // ── Route to correct user ───────────────────────────────
      const providerUserId = request.headers["x-provider-user-id"] as string | undefined
      if (!providerUserId) {
        return reply.status(400).send({
          code: "MISSING_HEADER",
          message: "X-Provider-User-Id header is required",
        })
      }

      const connection = await connectionService.findByProviderUserId(providerId, providerUserId)
      if (!connection) {
        // Acknowledge to prevent provider retries, but take no action
        app.log.info({ providerId, providerUserId }, "No connection found for inbound webhook")
        return reply.status(200).send({ received: true })
      }

      // ── Process data points ─────────────────────────────────
      if (provider.processWebhook) {
        const dataPoints = await provider.processWebhook(request.body)

        if (dataPoints.length > 0) {
          await healthDataService.ingest({
            userId: connection.userId,
            connectionId: connection.id,
            dataPoints,
          })

          app.log.info(
            { providerId, providerUserId, count: dataPoints.length },
            "Inbound webhook data ingested",
          )
        }
      }

      return reply.status(200).send({ received: true })
    },
  )
}

export default inboundRoutes
