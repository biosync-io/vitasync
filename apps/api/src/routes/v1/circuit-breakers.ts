import type { FastifyPluginAsync } from "fastify"
import { requireAdmin } from "../../plugins/auth.js"

/**
 * Admin-only routes for inspecting and managing provider circuit breakers.
 *
 * These expose the in-process circuit breaker state from the worker.
 * In a multi-process deployment the worker's registry is separate from
 * the API's, so this route keeps its own lightweight mirror registry that
 * can be populated via shared Redis metrics or direct import when the API
 * and worker are co-located.  For now we import the same registry helpers.
 */

import {
  CircuitBreakerRegistry,
  type CircuitBreakerMetrics,
} from "@biosync-io/circuit-breaker"

const registry = new CircuitBreakerRegistry()

/** Lazily seed a provider breaker so the admin endpoint can report on it. */
function ensureBreaker(provider: string) {
  if (!registry.get(provider)) {
    registry.create(provider, {
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
      halfOpenMaxAttempts: 2,
      successThreshold: 2,
      timeout: 30_000,
    })
  }
}

const circuitBreakerRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/admin/circuit-breakers
   * Returns metrics for every known provider circuit breaker.
   */
  app.get(
    "/admin/circuit-breakers",
    { preHandler: [requireAdmin()] },
    async (_request, reply) => {
      const metrics: Record<string, CircuitBreakerMetrics> = registry.getAllMetrics()

      return reply.send({
        providers: metrics,
        count: Object.keys(metrics).length,
        timestamp: new Date().toISOString(),
      })
    },
  )

  /**
   * POST /v1/admin/circuit-breakers/:provider/reset
   * Manually reset a provider's circuit breaker to the closed state.
   */
  app.post<{ Params: { provider: string } }>(
    "/admin/circuit-breakers/:provider/reset",
    { preHandler: [requireAdmin()] },
    async (request, reply) => {
      const { provider } = request.params
      const breaker = registry.get(provider)

      if (!breaker) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: `No circuit breaker found for provider '${provider}'.`,
        })
      }

      breaker.reset()

      return reply.send({
        provider,
        message: "Circuit breaker reset to closed state.",
        metrics: breaker.getMetrics(),
      })
    },
  )
}

export default circuitBreakerRoutes

/**
 * Expose the API-side registry so other modules (e.g. system status) can
 * seed breakers or read metrics without circular imports.
 */
export { registry as apiCircuitBreakerRegistry, ensureBreaker }
