import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import { AppError } from "@biosync-io/types"
import Fastify, { type FastifyError } from "fastify"
import { ZodError } from "zod"
import { config } from "./config.js"
import authPlugin from "./plugins/auth.js"
import { bullBoardPlugin } from "./plugins/bull-board.js"
import eventBusPlugin from "./plugins/event-bus.js"
import queuesPlugin from "./plugins/queues.js"
import { registerV1Routes } from "./routes/v1/index.js"

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "HH:MM:ss" },
            },
          }
        : {}),
    },
    trustProxy: true, // Enable X-Forwarded-For parsing (required behind reverse proxy)
    disableRequestLogging: false,
    requestIdHeader: "x-request-id",
  })

  // ── Raw body capture for webhook signature verification ────
  // Override the JSON content-type parser to also store the raw Buffer
  // on the request, so inbound webhook routes can verify HMAC signatures.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body: Buffer, done) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = body
      try {
        done(null, JSON.parse(body.toString()))
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  // ── Security headers ────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // Managed at CDN/proxy level
  })

  // ── CORS ────────────────────────────────────────────────────
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })

  // ── Cookie parsing ──────────────────────────────────────────
  await app.register(cookie)

  // ── Rate limiting ────────────────────────────────────────────
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    keyGenerator: (req) => {
      // Rate-limit by workspace ID (set by auth plugin) or fallback to IP
      return (req as typeof req & { workspaceId?: string }).workspaceId ?? req.ip
    },
    errorResponseBuilder: () => ({
      code: "RATE_LIMITED",
      message: "Too many requests. Please slow down.",
    }),
  })

  // ── OpenAPI / Swagger ────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "VitaSync API",
        description: "Unified wearable health data aggregation platform",
        version: "1.0.0",
        contact: {
          name: "VitaSync Team",
          url: "https://vitasync.dev",
        },
        license: {
          name: "MIT",
          url: "https://opensource.org/licenses/MIT",
        },
      },
      servers: [
        { url: "http://localhost:3001", description: "Local development" },
        { url: "https://api.vitasync.dev", description: "Production" },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            in: "header",
            name: "Authorization",
            description:
              "Bearer token with your VitaSync API key.\n\nFormat: `Authorization: Bearer vs_live_...`",
          },
        },
      },
      security: [{ apiKey: [] }],
      tags: [
        { name: "Users", description: "Manage end-users" },
        { name: "Connections", description: "Wearable provider connections" },
        { name: "Health Data", description: "Query normalized health metrics" },
        { name: "API Keys", description: "Manage workspace API keys" },
        { name: "Webhooks", description: "Configure event delivery" },
        { name: "Providers", description: "List available providers" },
        { name: "System", description: "Health checks and status" },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: false,
    logLevel: "warn",
  })

  // ── Routes ───────────────────────────────────────────────────
  await app.register(authPlugin)
  await app.register(queuesPlugin)
  await app.register(eventBusPlugin)

  // ── CQRS buses & projections ────────────────────────────────
  const { setupCQRS } = await import("./cqrs/index.js")
  setupCQRS(app)

  await app.register(registerV1Routes)

  // ── API request logging → PostgreSQL ────────────────────────
  // Logs all authenticated /v1/* requests asynchronously.
  // Fire-and-forget so logging never slows down responses.
  app.addHook("onResponse", (request, reply, done) => {
    // Only log authenticated v1 API requests
    if (!request.url.startsWith("/v1/")) {
      done()
      return
    }

    const durationMs = Math.round(reply.elapsedTime)
    const endpoint = request.url.split("?")[0] ?? request.url
    const statusCode = reply.statusCode

    // Fire-and-forget — import + insert in the background
    import("@biosync-io/db")
      .then(({ getDb, apiLogs }) => {
        const db = getDb()
        return db.insert(apiLogs).values({
          method: request.method,
          endpoint,
          statusCode,
          durationMs,
          errorMessage: statusCode >= 400 ? (reply.raw.statusMessage ?? null) : null,
        })
      })
      .catch((err) => {
        app.log.warn({ err }, "[api-logs] Failed to persist request log")
      })

    done()
  })

  // ── Bull Board queue dashboard ───────────────────────────────
  await app.register(bullBoardPlugin)

  // ── System routes (no auth) ──────────────────────────────────
  app.get(
    "/health",
    {
      schema: {
        summary: "Health check",
        tags: ["System"],
        security: [],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              version: { type: "string" },
              timestamp: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({
      status: "ok",
      version: process.env.APP_VERSION || "1.0.0",
      timestamp: new Date().toISOString(),
    }),
  )

  // ── Global error handler ─────────────────────────────────────
  app.setErrorHandler<FastifyError>(async (error, _req, reply) => {
    // ── AppError (thrown from services) ───────────────────────
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        app.log.error({ err: error }, error.message)
      } else {
        app.log.warn({ err: error }, error.message)
      }
      return reply.status(error.statusCode).send(error.toJSON())
    }

    // ── ZodError (input validation) ──────────────────────────
    if (error instanceof ZodError) {
      app.log.warn({ err: error }, "Validation error")
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Validation error",
        details: { issues: error.issues },
      })
    }

    // ── FastifyError / generic errors ────────────────────────
    if (error.statusCode && error.statusCode < 500) {
      app.log.warn({ err: error }, "Client error")
    } else {
      app.log.error({ err: error }, "Server error")
    }

    // Don't leak internal error details in production
    const message =
      config.NODE_ENV === "production" && (!error.statusCode || error.statusCode >= 500)
        ? "Internal server error"
        : error.message

    return reply.status(error.statusCode ?? 500).send({
      code: error.code ?? "INTERNAL_ERROR",
      message,
      ...(config.NODE_ENV !== "production" && error.statusCode && error.statusCode >= 500
        ? { stack: error.stack }
        : {}),
    })
  })

  app.setNotFoundHandler(async (_req, reply) => {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Route not found" })
  })

  return app
}
