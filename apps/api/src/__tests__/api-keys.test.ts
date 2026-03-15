import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiKeyService } from "../services/api-key.service.js"
import { TEST_API_KEY_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/api-key.service.js", () => {
  const ApiKeyService = vi.fn()
  ApiKeyService.prototype.create = vi.fn()
  ApiKeyService.prototype.list = vi.fn()
  ApiKeyService.prototype.revoke = vi.fn()
  ApiKeyService.prototype.rotate = vi.fn()
  return { ApiKeyService }
})

const mockKey = {
  id: TEST_API_KEY_ID,
  workspaceId: TEST_WORKSPACE_ID,
  name: "Test Key",
  keyPrefix: "vs_test_AAA",
  scopes: ["read", "write"],
  expiresAt: null,
  lastUsedAt: null,
  createdAt: new Date("2025-01-01"),
}

describe("API keys routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await buildTestApp()
  })

  describe("POST /v1/api-keys", () => {
    it("creates a key and returns rawKey once", async () => {
      vi.mocked(ApiKeyService.prototype.create).mockResolvedValue({
        apiKey: mockKey as never,
        rawKey: "vs_test_AAABBBCCC",
      })

      const res = await app.inject({
        method: "POST",
        url: "/v1/api-keys",
        body: { name: "Test Key", scopes: ["read", "write"] },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.rawKey).toBe("vs_test_AAABBBCCC")
      expect(body.name).toBe("Test Key")
    })

    it("returns 400 when scopes array is empty", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/api-keys",
        body: { name: "Bad Key", scopes: [] },
      })

      expect(res.statusCode).toBe(400)
    })

    it("returns 400 for invalid scope value", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/api-keys",
        body: { name: "Bad Key", scopes: ["superadmin"] },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/api-keys", () => {
    it("lists keys without rawKey", async () => {
      vi.mocked(ApiKeyService.prototype.list).mockResolvedValue([mockKey] as never)

      const res = await app.inject({ method: "GET", url: "/v1/api-keys" })

      expect(res.statusCode).toBe(200)
      const body = res.json() as (typeof mockKey)[]
      expect(body).toHaveLength(1)
      expect(body[0]).not.toHaveProperty("rawKey")
    })
  })

  describe("DELETE /v1/api-keys/:keyId", () => {
    it("revokes key and returns 204", async () => {
      vi.mocked(ApiKeyService.prototype.revoke).mockResolvedValue(true)

      const res = await app.inject({ method: "DELETE", url: `/v1/api-keys/${TEST_API_KEY_ID}` })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when key not found", async () => {
      vi.mocked(ApiKeyService.prototype.revoke).mockResolvedValue(false)

      const res = await app.inject({ method: "DELETE", url: `/v1/api-keys/${TEST_API_KEY_ID}` })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/api-keys/:keyId/rotate", () => {
    it("returns new rawKey on rotation", async () => {
      vi.mocked(ApiKeyService.prototype.rotate).mockResolvedValue({
        apiKey: mockKey as never,
        rawKey: "vs_test_NEWKEY999",
      })

      const res = await app.inject({
        method: "POST",
        url: `/v1/api-keys/${TEST_API_KEY_ID}/rotate`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ rawKey: "vs_test_NEWKEY999" })
    })

    it("returns 404 when key not found", async () => {
      vi.mocked(ApiKeyService.prototype.rotate).mockResolvedValue(null)

      const res = await app.inject({
        method: "POST",
        url: `/v1/api-keys/${TEST_API_KEY_ID}/rotate`,
      })

      expect(res.statusCode).toBe(404)
    })

    it("returns 400 for invalid UUID", async () => {
      const res = await app.inject({ method: "POST", url: "/v1/api-keys/not-a-uuid/rotate" })

      expect(res.statusCode).toBe(400)
    })
  })
})
