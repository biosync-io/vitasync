import { beforeEach, describe, expect, it, vi } from "vitest"
import { HealthReportService } from "../services/health-report.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/health-report.service.js", () => {
  const HealthReportService = vi.fn()
  HealthReportService.prototype.list = vi.fn()
  HealthReportService.prototype.findById = vi.fn()
  HealthReportService.prototype.generate = vi.fn()
  return { HealthReportService }
})

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID }
const reportId = "00000000-0000-0000-0000-0000000000a0"

const mockReport = {
  id: reportId,
  userId: TEST_USER_ID,
  reportType: "weekly",
  periodStart: new Date("2025-05-25"),
  periodEnd: new Date("2025-06-01"),
  createdAt: new Date("2025-06-01"),
}

describe("Reports routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/reports", () => {
    it("returns user reports", async () => {
      vi.mocked(HealthReportService.prototype.list).mockResolvedValue([mockReport] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/reports`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/reports`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/users/:userId/reports/:reportId", () => {
    it("returns a single report", async () => {
      vi.mocked(HealthReportService.prototype.findById).mockResolvedValue(mockReport as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/reports/${reportId}`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when report not found", async () => {
      vi.mocked(HealthReportService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/reports/${reportId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/reports/generate", () => {
    it("generates a report and returns 201", async () => {
      vi.mocked(HealthReportService.prototype.generate).mockResolvedValue(mockReport as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/reports/generate`,
        payload: { reportType: "weekly" },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 400 for invalid report type", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/reports/generate`,
        payload: { reportType: "invalid_type" },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
