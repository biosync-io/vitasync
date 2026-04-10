import type { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import { EventBus, EventHandlerRegistry } from "@biosync-io/event-bus"
import type { EventBus as EventBusType } from "@biosync-io/event-bus"
import { DomainEventTypes } from "@biosync-io/types"
import type { SyncCompletedPayload, UserCreatedPayload, HealthMetricRecordedPayload } from "@biosync-io/types"
import { config } from "../config.js"

declare module "fastify" {
  interface FastifyInstance {
    eventBus: EventBusType
    eventHandlerRegistry: EventHandlerRegistry
  }
}

/**
 * Fastify plugin that initializes the domain EventBus with Redis,
 * decorates it on the server instance, registers core event handlers,
 * and tears it down on server close.
 */
const eventBusPlugin: FastifyPluginAsync = async (app) => {
  const bus = new EventBus({
    redis: config.REDIS_URL,
    channelPrefix: "vitasync",
    logger: {
      info: (...args: unknown[]) => { app.log.info(String(args[0])) },
      error: (...args: unknown[]) => { app.log.error(String(args[0])) },
      warn: (...args: unknown[]) => { app.log.warn(String(args[0])) },
      debug: (...args: unknown[]) => { app.log.debug(String(args[0])) },
    },
  })

  const registry = new EventHandlerRegistry(bus)

  app.decorate("eventBus", bus)
  app.decorate("eventHandlerRegistry", registry)

  // ── Core event handlers ──────────────────────────────────────

  registry.registerAll([
    {
      eventType: DomainEventTypes.USER_CREATED,
      name: "audit:user.created",
      handler: async (event) => {
        const payload = event.payload as UserCreatedPayload
        app.log.info(
          { eventId: event.id, userId: payload.userId },
          "[audit] User created",
        )
      },
    },
    {
      eventType: DomainEventTypes.HEALTH_METRIC_RECORDED,
      name: "webhook-check:health.metric.recorded",
      handler: async (event) => {
        const payload = event.payload as HealthMetricRecordedPayload
        app.log.debug(
          { eventId: event.id, userId: payload.userId },
          "[event-bus] Health metric recorded — webhook delivery check triggered",
        )
      },
    },
    {
      eventType: DomainEventTypes.SYNC_COMPLETED,
      name: "audit:sync.completed",
      handler: async (event) => {
        const payload = event.payload as SyncCompletedPayload
        app.log.info(
          {
            eventId: event.id,
            syncJobId: payload.syncJobId,
            provider: payload.provider,
            metricsCount: payload.metricsCount,
          },
          "[audit] Sync completed",
        )
      },
    },
    {
      eventType: DomainEventTypes.SYNC_COMPLETED,
      name: "analytics-trigger:sync.completed",
      priority: 200,
      handler: async (event) => {
        const payload = event.payload as SyncCompletedPayload
        app.log.debug(
          { eventId: event.id, userId: payload.userId },
          "[event-bus] Sync completed — analytics trigger",
        )
      },
    },
  ])

  // Graceful shutdown
  app.addHook("onClose", async () => {
    app.log.info("[event-bus] Shutting down EventBus…")
    await bus.close()
  })
}

export default fp(eventBusPlugin)
