import { describe, expect, it } from "vitest"
import Fastify from "fastify"
import { requireSelf, requireAdmin } from "../plugins/auth.js"

// ── requireSelf ─────────────────────────────────────────────────

describe("requireSelf middleware", () => {
  it("allows API key auth (no authenticatedUserId) to pass", async () => {
    const app = Fastify({ logger: false })
    app.addHook("onRequest", async (req) => {
      req.workspaceId = "ws-1"
      req.apiKeyId = "key-1"
      req.apiKeyScopes = ["read"]
    })
    app.get("/test/:userId", { preHandler: [requireSelf()] }, async () => ({ ok: true }))
    await app.ready()

    const res = await app.inject({ method: "GET", url: "/test/any-user-id" })
    expect(res.statusCode).toBe(200)
  })

  it("allows admin users to access any userId", async () => {
    const app = Fastify({ logger: false })
    app.addHook("onRequest", async (req) => {
      req.workspaceId = "ws-1"
      req.apiKeyId = "key-1"
      req.apiKeyScopes = ["read"]
      req.authenticatedUserId = "user-admin"
      req.userRole = "admin"
    })
    app.get("/test/:userId", { preHandler: [requireSelf()] }, async () => ({ ok: true }))
    await app.ready()

    const res = await app.inject({ method: "GET", url: "/test/different-user" })
    expect(res.statusCode).toBe(200)
  })

  it("allows user to access their own userId", async () => {
    const app = Fastify({ logger: false })
    app.addHook("onRequest", async (req) => {
      req.workspaceId = "ws-1"
      req.apiKeyId = "key-1"
      req.apiKeyScopes = ["read"]
      req.authenticatedUserId = "user-123"
      req.userRole = "user"
    })
    app.get("/test/:userId", { preHandler: [requireSelf()] }, async () => ({ ok: true }))
    await app.ready()

    const res = await app.inject({ method: "GET", url: "/test/user-123" })
    expect(res.statusCode).toBe(200)
  })

  it("blocks user from accessing another userId", async () => {
    const app = Fastify({ logger: false })
    app.addHook("onRequest", async (req) => {
      req.workspaceId = "ws-1"
      req.apiKeyId = "key-1"
      req.apiKeyScopes = ["read"]
      req.authenticatedUserId = "user-123"
      req.userRole = "user"
    })
    app.get("/test/:userId", { preHandler: [requireSelf()] }, async () => ({ ok: true }))
    await app.ready()

    const res = await app.inject({ method: "GET", url: "/test/user-456" })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe("FORBIDDEN")
  })

  it("passes when route has no userId param", async () => {
    const app = Fastify({ logger: false })
    app.addHook("onRequest", async (req) => {
      req.workspaceId = "ws-1"
      req.apiKeyId = "key-1"
      req.apiKeyScopes = ["read"]
      req.authenticatedUserId = "user-123"
      req.userRole = "user"
    })
    app.get("/test/no-param", { preHandler: [requireSelf()] }, async () => ({ ok: true }))
    await app.ready()

    const res = await app.inject({ method: "GET", url: "/test/no-param" })
    expect(res.statusCode).toBe(200)
  })
})

// ── requireAdmin ────────────────────────────────────────────────

describe("requireAdmin middleware", () => {
  it("allows API key auth (no authenticatedUserId) to pass", async () => {
    const app = Fastify({ logger: false })
    app.addHook("onRequest", async (req) => {
      req.workspaceId = "ws-1"
      req.apiKeyId = "key-1"
      req.apiKeyScopes = ["read"]
    })
    app.get("/test", { preHandler: [requireAdmin()] }, async () => ({ ok: true }))
    await app.ready()

    const res = await app.inject({ method: "GET", url: "/test" })
    expect(res.statusCode).toBe(200)
  })

  it("allows admin users", async () => {
    const app = Fastify({ logger: false })
    app.addHook("onRequest", async (req) => {
      req.workspaceId = "ws-1"
      req.apiKeyId = "key-1"
      req.apiKeyScopes = ["read"]
      req.authenticatedUserId = "user-admin"
      req.userRole = "admin"
    })
    app.get("/test", { preHandler: [requireAdmin()] }, async () => ({ ok: true }))
    await app.ready()

    const res = await app.inject({ method: "GET", url: "/test" })
    expect(res.statusCode).toBe(200)
  })

  it("blocks non-admin users", async () => {
    const app = Fastify({ logger: false })
    app.addHook("onRequest", async (req) => {
      req.workspaceId = "ws-1"
      req.apiKeyId = "key-1"
      req.apiKeyScopes = ["read"]
      req.authenticatedUserId = "user-123"
      req.userRole = "user"
    })
    app.get("/test", { preHandler: [requireAdmin()] }, async () => ({ ok: true }))
    await app.ready()

    const res = await app.inject({ method: "GET", url: "/test" })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({
      code: "FORBIDDEN",
      message: "Admin access required.",
    })
  })
})
