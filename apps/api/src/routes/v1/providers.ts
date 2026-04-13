import { providerRegistry } from "@biosync-io/provider-core"
import { AppError } from "@biosync-io/types"
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"

const providerIdParam = z.object({ providerId: z.string().min(1) })

const providersRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/providers — list all registered provider definitions
  app.get("/", async (_request, reply) => {
    const definitions = providerRegistry.listDefinitions().map((def) => ({
      id: def.id,
      name: def.name,
      description: def.description,
      authType: def.capabilities.oauth1 ? "oauth1" : "oauth2",
      capabilities: def.capabilities.supportedMetrics,
      logoUrl: def.logoUrl ?? null,
    }))

    return reply.send(definitions)
  })

  // GET /v1/providers/:providerId — single provider info
  app.get("/:providerId", async (request, reply) => {
    const { providerId } = providerIdParam.parse(request.params)
    const def = providerRegistry.getDefinition(providerId)
    if (!def) {
      throw AppError.notFound("Provider", providerId)
    }

    return reply.send({
      id: def.id,
      name: def.name,
      description: def.description,
      authType: def.capabilities.oauth1 ? "oauth1" : "oauth2",
      capabilities: def.capabilities.supportedMetrics,
      logoUrl: def.logoUrl ?? null,
    })
  })
}

export default providersRoutes
