import { beforeEach, describe, expect, it, vi } from "vitest"
import { DataExportService } from "../services/data-export.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/data-export.service.js", () => {
  const DataExportService = vi.fn()
  DataExportService.prototype.list = vi.fn()
  DataExportService.prototype.findById = vi.fn()
  DataExportService.prototype.requestExport = vi.fn()
  return { DataExportService }
})

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID }
const exportId = "00000000-0000-0000-0000-000000000070"

const mockExport = {
  id: exportId,
  userId: TEST_USER_ID,
  format: "json",
  status: "completed",
  createdAt: new Date("2025-06-01"),
}

describe("Exports routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/exports", () => {
    it("returns user exports", async () => {
      vi.mocked(DataExportService.prototype.list).mockResolvedValue([mockExport] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/exports`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/exports`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/users/:userId/exports/:exportId", () => {
    it("returns a single export", async () => {
      vi.mocked(DataExportService.prototype.findById).mockResolvedValue(mockExport as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/exports/${exportId}`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when export not found", async () => {
      vi.mocked(DataExportService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/exports/${exportId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/exports", () => {
    it("creates a new export and returns 201", async () => {
      vi.mocked(DataExportService.prototype.requestExport).mockResolvedValue(mockExport as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/exports`,
        payload: { format: "json" },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 400 for invalid format", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/exports`,
        payload: { format: "invalid_format" },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
