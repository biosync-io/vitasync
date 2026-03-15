import { beforeEach, describe, expect, it, vi } from "vitest"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findOrCreate = vi.fn()
  UserService.prototype.findById = vi.fn()
  UserService.prototype.list = vi.fn()
  UserService.prototype.update = vi.fn()
  UserService.prototype.delete = vi.fn()
  return { UserService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
  externalId: "ext-001",
  email: "test@example.com",
  displayName: "Test User",
  metadata: {},
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
}

describe("Users routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await buildTestApp()
  })

  describe("POST /v1/users", () => {
    it("creates a new user and returns 201", async () => {
      vi.mocked(UserService.prototype.findOrCreate).mockResolvedValue(mockUser as never)

      const res = await app.inject({
        method: "POST",
        url: "/v1/users",
        body: { externalId: "ext-001", email: "test@example.com", displayName: "Test User" },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ externalId: "ext-001" })
    })

    it("returns 400 when externalId is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/users",
        body: { email: "test@example.com" },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/users", () => {
    it("returns list of users", async () => {
      vi.mocked(UserService.prototype.list).mockResolvedValue([mockUser] as never)

      const res = await app.inject({ method: "GET", url: "/v1/users" })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
    })
  })

  describe("GET /v1/users/:userId", () => {
    it("returns user by id", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)

      const res = await app.inject({ method: "GET", url: `/v1/users/${TEST_USER_ID}` })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ id: TEST_USER_ID })
    })

    it("returns 404 when user not found", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null)

      const res = await app.inject({ method: "GET", url: `/v1/users/${TEST_USER_ID}` })

      expect(res.statusCode).toBe(404)
      expect(res.json()).toMatchObject({ code: "NOT_FOUND" })
    })

    it("returns 400 for non-UUID userId", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/users/not-a-uuid" })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("PATCH /v1/users/:userId", () => {
    it("updates and returns the user", async () => {
      const updated = { ...mockUser, displayName: "Updated Name" }
      vi.mocked(UserService.prototype.update).mockResolvedValue(updated as never)

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/users/${TEST_USER_ID}`,
        body: { displayName: "Updated Name" },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ displayName: "Updated Name" })
    })

    it("returns 404 when user not found", async () => {
      vi.mocked(UserService.prototype.update).mockResolvedValue(null)

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/users/${TEST_USER_ID}`,
        body: { displayName: "X" },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("DELETE /v1/users/:userId", () => {
    it("deletes user and returns 204", async () => {
      vi.mocked(UserService.prototype.delete).mockResolvedValue(true)

      const res = await app.inject({ method: "DELETE", url: `/v1/users/${TEST_USER_ID}` })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when user not found", async () => {
      vi.mocked(UserService.prototype.delete).mockResolvedValue(false)

      const res = await app.inject({ method: "DELETE", url: `/v1/users/${TEST_USER_ID}` })

      expect(res.statusCode).toBe(404)
    })
  })
})
