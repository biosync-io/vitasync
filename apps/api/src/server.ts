import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import { config } from "./config.js"
import { bullBoardPlugin } from "./plugins/bull-board.js"

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
            description: `Bearer token with your VitaSync API key.\n\nFormat: \`Authorization: Bearer vs_live_...\``,
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
  await app.register(import("./routes/v1/index.js"), { prefix: "/v1" })

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
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    }),
  )

  // ── Global error handler ─────────────────────────────────────
  app.setErrorHandler(async (error, _req, reply) => {
    // Log 5xx errors at error level, 4xx at warn
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
