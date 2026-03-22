import { beforeEach, describe, expect, it, vi } from "vitest"
import { HealthSnapshotService } from "../services/health-snapshot.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/health-snapshot.service.js", () => {
  const HealthSnapshotService = vi.fn()
  HealthSnapshotService.prototype.list = vi.fn()
  HealthSnapshotService.prototype.findById = vi.fn()
  HealthSnapshotService.prototype.generateWeeklySnapshot = vi.fn()
  HealthSnapshotService.prototype.generateMonthlySnapshot = vi.fn()
  return { HealthSnapshotService }
})

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID }
const snapshotId = "00000000-0000-0000-0000-0000000000c0"

const mockSnapshot = {
  id: snapshotId,
  userId: TEST_USER_ID,
  periodType: "weekly",
  createdAt: new Date("2025-06-01"),
}

describe("Snapshots routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/snapshots", () => {
    it("returns user snapshots", async () => {
      vi.mocked(HealthSnapshotService.prototype.list).mockResolvedValue([mockSnapshot] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/snapshots`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/snapshots`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("GET /v1/users/:userId/snapshots/:snapshotId", () => {
    it("returns a single snapshot", async () => {
      vi.mocked(HealthSnapshotService.prototype.findById).mockResolvedValue(mockSnapshot as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/snapshots/${snapshotId}`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when snapshot not found", async () => {
      vi.mocked(HealthSnapshotService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/snapshots/${snapshotId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/snapshots/generate/weekly", () => {
    it("generates a weekly snapshot and returns 201", async () => {
      vi.mocked(HealthSnapshotService.prototype.generateWeeklySnapshot).mockResolvedValue(mockSnapshot as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/snapshots/generate/weekly`,
      })

      expect(res.statusCode).toBe(201)
    })
  })

  describe("POST /v1/users/:userId/snapshots/generate/monthly", () => {
    it("generates a monthly snapshot and returns 201", async () => {
      vi.mocked(HealthSnapshotService.prototype.generateMonthlySnapshot).mockResolvedValue({
        ...mockSnapshot,
        periodType: "monthly",
      } as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/snapshots/generate/monthly`,
      })

      expect(res.statusCode).toBe(201)
    })
  })
})
