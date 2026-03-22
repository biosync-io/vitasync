import { beforeEach, describe, expect, it, vi } from "vitest"
import { CorrelationService } from "../services/correlation.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/correlation.service.js", () => {
  const CorrelationService = vi.fn()
  CorrelationService.prototype.list = vi.fn()
  CorrelationService.prototype.computeCorrelations = vi.fn()
  return { CorrelationService }
})

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID }

const mockCorrelation = {
  id: "00000000-0000-0000-0000-000000000060",
  userId: TEST_USER_ID,
  metricA: "steps",
  metricB: "sleep_quality",
  strength: 0.75,
}

describe("Correlations routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/correlations", () => {
    it("returns user correlations", async () => {
      vi.mocked(CorrelationService.prototype.list).mockResolvedValue([mockCorrelation] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/correlations`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/correlations`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/correlations/compute", () => {
    it("triggers correlation computation", async () => {
      vi.mocked(CorrelationService.prototype.computeCorrelations).mockResolvedValue([mockCorrelation] as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/correlations/compute`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.count).toBe(1)
    })
  })
})
