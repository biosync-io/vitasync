import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { getDb, identityProviders } from "@biosync-io/db"
import { and, eq } from "drizzle-orm"
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { requireAdmin } from "../../plugins/auth.js"

// Inline field encryption to avoid subpath export issues
function encryptField(plaintext: string): string {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) throw new Error("ENCRYPTION_KEY required")
  const key = Buffer.from(hex, "hex")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 })
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`
}

// ── Schemas ─────────────────────────────────────────────────────

const IdpCreateBody = z.object({
  name: z.string().min(1).max(255),
  protocol: z.enum(["oidc", "saml"]),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  enabled: z.boolean().optional(),
  // OIDC
  oidcIssuer: z.string().max(1024).optional(),
  oidcClientId: z.string().max(512).optional(),
  oidcClientSecret: z.string().optional(),
  oidcScopes: z.array(z.string()).optional(),
  oidcDiscoveryUrl: z.string().max(1024).optional(),
  // SAML
  samlEntityId: z.string().max(1024).optional(),
  samlSsoUrl: z.string().max(1024).optional(),
  samlCertificate: z.string().optional(),
  samlSignRequests: z.boolean().optional(),
  samlNameIdFormat: z.string().max(255).optional(),
  // Common
  autoProvision: z.boolean().optional(),
  defaultRole: z.enum(["user", "admin"]).optional(),
  attributeMapping: z.record(z.string()).optional(),
})

const IdpUpdateBody = IdpCreateBody.partial()

const idParams = z.object({ idpId: z.string().uuid() })

// ── Helpers ─────────────────────────────────────────────────────

function redactSecret(idp: typeof identityProviders.$inferSelect) {
  return {
    ...idp,
    // Never return the raw encrypted secret to clients
    oidcClientSecret: idp.oidcClientSecret ? "••••••••" : null,
  }
}

// ── Plugin ──────────────────────────────────────────────────────

const identityProviderRoutes: FastifyPluginAsync = async (app) => {
  const db = getDb()

  // GET /v1/identity-providers — list all IdPs for the workspace
  app.get("/", { preHandler: [requireAdmin()] }, async (request, reply) => {
    const rows = await db
      .select()
      .from(identityProviders)
      .where(eq(identityProviders.workspaceId, request.workspaceId))
    return reply.send(rows.map(redactSecret))
  })

  // POST /v1/identity-providers — create new IdP
  app.post("/", { preHandler: [requireAdmin()] }, async (request, reply) => {
    const body = IdpCreateBody.parse(request.body)

    const values: typeof identityProviders.$inferInsert = {
      workspaceId: request.workspaceId,
      name: body.name,
      protocol: body.protocol,
      slug: body.slug,
      enabled: body.enabled ?? true,
      // OIDC
      oidcIssuer: body.oidcIssuer ?? null,
      oidcClientId: body.oidcClientId ?? null,
      oidcClientSecret: body.oidcClientSecret ? encryptField(body.oidcClientSecret) : null,
      oidcScopes: body.oidcScopes ?? null,
      oidcDiscoveryUrl: body.oidcDiscoveryUrl ?? null,
      // SAML
      samlEntityId: body.samlEntityId ?? null,
      samlSsoUrl: body.samlSsoUrl ?? null,
      samlCertificate: body.samlCertificate ?? null,
      samlSignRequests: body.samlSignRequests ?? false,
      samlNameIdFormat: body.samlNameIdFormat ?? null,
      // Common
      autoProvision: body.autoProvision ?? true,
      defaultRole: body.defaultRole ?? "user",
      attributeMapping: body.attributeMapping ?? {},
    }

    const [created] = await db.insert(identityProviders).values(values).returning()
    return reply.status(201).send(redactSecret(created!))
  })

  // GET /v1/identity-providers/:idpId — get single IdP details
  app.get("/:idpId", { preHandler: [requireAdmin()] }, async (request, reply) => {
    const { idpId } = idParams.parse(request.params)
    const [idp] = await db
      .select()
      .from(identityProviders)
      .where(
        and(
          eq(identityProviders.id, idpId),
          eq(identityProviders.workspaceId, request.workspaceId),
        ),
      )
      .limit(1)

    if (!idp) {
      return reply
        .status(404)
        .send({ code: "NOT_FOUND", message: "Identity provider not found" })
    }
    return reply.send(redactSecret(idp))
  })

  // PATCH /v1/identity-providers/:idpId — update IdP
  app.patch("/:idpId", { preHandler: [requireAdmin()] }, async (request, reply) => {
    const { idpId } = idParams.parse(request.params)
    const body = IdpUpdateBody.parse(request.body)

    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updates.name = body.name
    if (body.protocol !== undefined) updates.protocol = body.protocol
    if (body.slug !== undefined) updates.slug = body.slug
    if (body.enabled !== undefined) updates.enabled = body.enabled
    // OIDC
    if (body.oidcIssuer !== undefined) updates.oidcIssuer = body.oidcIssuer
    if (body.oidcClientId !== undefined) updates.oidcClientId = body.oidcClientId
    if (body.oidcClientSecret !== undefined) {
      updates.oidcClientSecret = body.oidcClientSecret
        ? encryptField(body.oidcClientSecret)
        : null
    }
    if (body.oidcScopes !== undefined) updates.oidcScopes = body.oidcScopes
    if (body.oidcDiscoveryUrl !== undefined) updates.oidcDiscoveryUrl = body.oidcDiscoveryUrl
    // SAML
    if (body.samlEntityId !== undefined) updates.samlEntityId = body.samlEntityId
    if (body.samlSsoUrl !== undefined) updates.samlSsoUrl = body.samlSsoUrl
    if (body.samlCertificate !== undefined) updates.samlCertificate = body.samlCertificate
    if (body.samlSignRequests !== undefined) updates.samlSignRequests = body.samlSignRequests
    if (body.samlNameIdFormat !== undefined) updates.samlNameIdFormat = body.samlNameIdFormat
    // Common
    if (body.autoProvision !== undefined) updates.autoProvision = body.autoProvision
    if (body.defaultRole !== undefined) updates.defaultRole = body.defaultRole
    if (body.attributeMapping !== undefined) updates.attributeMapping = body.attributeMapping

    const [updated] = await db
      .update(identityProviders)
      .set(updates)
      .where(
        and(
          eq(identityProviders.id, idpId),
          eq(identityProviders.workspaceId, request.workspaceId),
        ),
      )
      .returning()

    if (!updated) {
      return reply
        .status(404)
        .send({ code: "NOT_FOUND", message: "Identity provider not found" })
    }
    return reply.send(redactSecret(updated))
  })

  // DELETE /v1/identity-providers/:idpId — delete IdP
  app.delete("/:idpId", { preHandler: [requireAdmin()] }, async (request, reply) => {
    const { idpId } = idParams.parse(request.params)
    const result = await db
      .delete(identityProviders)
      .where(
        and(
          eq(identityProviders.id, idpId),
          eq(identityProviders.workspaceId, request.workspaceId),
        ),
      )
      .returning({ id: identityProviders.id })

    if (result.length === 0) {
      return reply
        .status(404)
        .send({ code: "NOT_FOUND", message: "Identity provider not found" })
    }
    return reply.status(204).send()
  })

  // POST /v1/identity-providers/:idpId/test — validate IdP configuration
  app.post("/:idpId/test", { preHandler: [requireAdmin()] }, async (request, reply) => {
    const { idpId } = idParams.parse(request.params)
    const [idp] = await db
      .select()
      .from(identityProviders)
      .where(
        and(
          eq(identityProviders.id, idpId),
          eq(identityProviders.workspaceId, request.workspaceId),
        ),
      )
      .limit(1)

    if (!idp) {
      return reply
        .status(404)
        .send({ code: "NOT_FOUND", message: "Identity provider not found" })
    }

    if (idp.protocol === "oidc") {
      // Test OIDC discovery endpoint
      const discoveryUrl =
        idp.oidcDiscoveryUrl ?? `${idp.oidcIssuer}/.well-known/openid-configuration`
      try {
        const res = await fetch(discoveryUrl)
        if (!res.ok) {
          return reply.send({
            success: false,
            message: `Discovery endpoint returned ${res.status}`,
          })
        }
        const metadata = (await res.json()) as Record<string, unknown>
        return reply.send({
          success: true,
          message: "OIDC discovery successful",
          details: {
            issuer: metadata.issuer,
            authorizationEndpoint: metadata.authorization_endpoint,
            tokenEndpoint: metadata.token_endpoint,
          },
        })
      } catch (err) {
        return reply.send({
          success: false,
          message: `Failed to reach discovery endpoint: ${(err as Error).message}`,
        })
      }
    }

    if (idp.protocol === "saml") {
      // Basic SAML configuration validation
      const errors: string[] = []
      if (!idp.samlSsoUrl) errors.push("SSO URL is not configured")
      if (!idp.samlCertificate) errors.push("X.509 certificate is not configured")
      if (!idp.samlEntityId) errors.push("Entity ID is not configured")

      if (idp.samlCertificate) {
        const hasPemHeader =
          idp.samlCertificate.includes("-----BEGIN CERTIFICATE-----") &&
          idp.samlCertificate.includes("-----END CERTIFICATE-----")
        if (!hasPemHeader) errors.push("Certificate does not appear to be PEM-encoded")
      }

      return reply.send({
        success: errors.length === 0,
        message: errors.length === 0 ? "SAML configuration looks valid" : "Configuration errors",
        errors: errors.length > 0 ? errors : undefined,
      })
    }

    return reply.send({ success: false, message: `Unknown protocol: ${idp.protocol}` })
  })
}

export default identityProviderRoutes
