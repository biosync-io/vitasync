import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnomalyDetectionService } from "../services/anomaly-detection.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/anomaly-detection.service.js", () => {
  const AnomalyDetectionService = vi.fn()
  AnomalyDetectionService.prototype.list = vi.fn()
  AnomalyDetectionService.prototype.detectAnomalies = vi.fn()
  AnomalyDetectionService.prototype.acknowledge = vi.fn()
  AnomalyDetectionService.prototype.dismiss = vi.fn()
  return { AnomalyDetectionService }
})

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID }
const anomalyId = "00000000-0000-0000-0000-000000000050"

const mockAnomaly = {
  id: anomalyId,
  userId: TEST_USER_ID,
  metric: "heart_rate",
  severity: "high",
  status: "new",
  detectedAt: new Date("2025-06-01"),
}

describe("Anomalies routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/anomalies", () => {
    it("returns user anomalies", async () => {
      vi.mocked(AnomalyDetectionService.prototype.list).mockResolvedValue([mockAnomaly] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/anomalies`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/anomalies`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/anomalies/detect", () => {
    it("triggers anomaly detection and returns results", async () => {
      vi.mocked(AnomalyDetectionService.prototype.detectAnomalies).mockResolvedValue([mockAnomaly] as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/anomalies/detect`,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.count).toBe(1)
    })
  })

  describe("POST /v1/users/:userId/anomalies/:anomalyId/acknowledge", () => {
    it("acknowledges an anomaly", async () => {
      vi.mocked(AnomalyDetectionService.prototype.acknowledge).mockResolvedValue({
        ...mockAnomaly,
        status: "acknowledged",
      } as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/anomalies/${anomalyId}/acknowledge`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when anomaly not found", async () => {
      vi.mocked(AnomalyDetectionService.prototype.acknowledge).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/anomalies/${anomalyId}/acknowledge`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/anomalies/:anomalyId/dismiss", () => {
    it("dismisses an anomaly", async () => {
      vi.mocked(AnomalyDetectionService.prototype.dismiss).mockResolvedValue({
        ...mockAnomaly,
        status: "dismissed",
      } as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/anomalies/${anomalyId}/dismiss`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when anomaly not found", async () => {
      vi.mocked(AnomalyDetectionService.prototype.dismiss).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/anomalies/${anomalyId}/dismiss`,
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
