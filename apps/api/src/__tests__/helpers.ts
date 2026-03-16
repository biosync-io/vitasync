/**
 * Test helpers — build a lightweight Fastify instance with mocked auth,
 * allowing route tests to run without a real DB connection.
 */
import Fastify, { type FastifyError } from "fastify"
import { ZodError } from "zod"
import { registerV1Routes } from "../routes/v1/index.js"

export const TEST_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001"
export const TEST_API_KEY_ID = "00000000-0000-0000-0000-000000000002"
export const TEST_USER_ID = "00000000-0000-0000-0000-000000000003"

/**
 * Builds a test Fastify instance that skips real API-key auth.
 * The request context will already have `workspaceId` and `apiKeyScopes` set.
 */
export async function buildTestApp(scopes: string[] = ["read", "write", "admin"]) {
  const app = Fastify({ logger: false })

  // Inject auth context without DB lookup
  app.addHook("onRequest", async (req) => {
    req.workspaceId = TEST_WORKSPACE_ID
    req.apiKeyId = TEST_API_KEY_ID
    req.apiKeyScopes = scopes
  })

  // Convert Zod validation errors to 400 (mirrors production error handler)
  app.setErrorHandler<FastifyError>(async (error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        errors: error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      })
    }
    return reply.status(error.statusCode ?? 500).send({
      code: error.code ?? "INTERNAL_ERROR",
      message: error.message,
    })
  })

  await registerV1Routes(app)
  await app.ready()
  return app
}
