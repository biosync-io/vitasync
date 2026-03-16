import { providerRegistry } from "@biosync-io/provider-core"
import type { FastifyPluginAsync } from "fastify"

const providersRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/providers — list all registered provider definitions
  app.get("/", async (_request, reply) => {
    const definitions = providerRegistry.listDefinitions().map((def) => ({
      id: def.id,
      name: def.name,
      description: def.description,
      authType: def.authType,
      capabilities: def.capabilities,
      logoUrl: def.logoUrl ?? null,
    }))

    return reply.send(definitions)
  })

  // GET /v1/providers/:providerId — single provider info
  app.get("/:providerId", async (request, reply) => {
    const { providerId } = request.params as { providerId: string }
    const def = providerRegistry.getDefinition(providerId)
    if (!def) {
      return reply
        .status(404)
        .send({ code: "NOT_FOUND", message: `Provider '${providerId}' is not registered` })
    }

    return reply.send({
      id: def.id,
      name: def.name,
      description: def.description,
      authType: def.authType,
      capabilities: def.capabilities,
      logoUrl: def.logoUrl ?? null,
    })
  })
}

export default providersRoutes
