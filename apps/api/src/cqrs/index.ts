import type { FastifyInstance } from "fastify"
import { CommandBus, QueryBus, loggingMiddleware } from "@biosync-io/cqrs"
import type {
  CommandBus as CommandBusType,
  QueryBus as QueryBusType,
  CqrsLogger,
  Query,
  QueryMiddleware,
} from "@biosync-io/cqrs"
import { getDb } from "@biosync-io/db"
import { registerHealthCommandHandlers } from "./commands/health.handlers.js"
import { registerHealthQueryHandlers } from "./queries/health.handlers.js"
import { HealthDataEventSourcedService } from "../services/health-data-es.service.js"
import { HealthDataService } from "../services/health-data.service.js"
import { EventStoreService } from "../services/event-store.service.js"
import { ProjectionService } from "../services/projection.service.js"

// ── Fastify type augmentation ───────────────────────────────────

declare module "fastify" {
  interface FastifyInstance {
    commandBus: CommandBusType
    queryBus: QueryBusType
  }
}

/**
 * Wire up the full CQRS stack:
 *  - Command & Query buses with middleware
 *  - Health domain command/query handlers
 *  - Projection service subscribed to the EventBus
 */
export function setupCQRS(app: FastifyInstance): void {
  const db = getDb()

  // ── Buses ──────────────────────────────────────────────────────
  const commandBus = new CommandBus()
  const queryBus = new QueryBus()

  // Shared logging middleware
  const logger = {
    info: (...args: unknown[]) => {
      app.log.info(String(args[0]))
    },
    error: (...args: unknown[]) => {
      app.log.error(String(args[0]))
    },
    warn: (...args: unknown[]) => {
      app.log.warn(String(args[0]))
    },
    debug: (...args: unknown[]) => {
      app.log.debug(String(args[0]))
    },
  }

  commandBus.use(loggingMiddleware(logger))

  // Build a query-logging middleware (same logic, typed for QueryMiddleware)
  const queryLogging: QueryMiddleware = async (query: Query, next: () => Promise<unknown>) => {
    const { type, metadata } = query
    logger.info(`[CQRS] Dispatching query "${type}"`)
    const start = performance.now()
    try {
      const result = await next()
      logger.info(`[CQRS] Query "${type}" completed in ${Math.round(performance.now() - start)}ms`)
      return result
    } catch (error) {
      logger.error(
        `[CQRS] Query "${type}" failed after ${Math.round(performance.now() - start)}ms`,
        error,
      )
      throw error
    }
  }
  queryBus.use(queryLogging)

  // ── Services ───────────────────────────────────────────────────
  const eventStoreService = new EventStoreService(db)
  const healthDataService = new HealthDataService()
  const healthEsService = new HealthDataEventSourcedService(
    healthDataService,
    eventStoreService,
    app.eventBus,
  )

  // ── Register handlers ──────────────────────────────────────────
  registerHealthCommandHandlers(commandBus, healthEsService)
  registerHealthQueryHandlers(queryBus, db)

  // ── Projection service ─────────────────────────────────────────
  const projectionService = new ProjectionService(db, app.eventBus, { logger })
  projectionService.registerHandlers()

  // ── Decorate Fastify ───────────────────────────────────────────
  app.decorate("commandBus", commandBus)
  app.decorate("queryBus", queryBus)

  app.log.info("[cqrs] Command & query buses initialized")
  app.log.info(`[cqrs] Registered commands: ${commandBus.getRegisteredCommands().join(", ")}`)
  app.log.info(`[cqrs] Registered queries: ${queryBus.getRegisteredQueries().join(", ")}`)
}
