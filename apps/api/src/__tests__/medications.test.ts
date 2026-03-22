import { beforeEach, describe, expect, it, vi } from "vitest"
import { MedicationService } from "../services/medication.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/medication.service.js", () => {
  const MedicationService = vi.fn()
  MedicationService.prototype.listMedications = vi.fn()
  MedicationService.prototype.createMedication = vi.fn()
  MedicationService.prototype.findMedicationById = vi.fn()
  MedicationService.prototype.updateMedication = vi.fn()
  MedicationService.prototype.deleteMedication = vi.fn()
  MedicationService.prototype.logAdherence = vi.fn()
  MedicationService.prototype.getAdherenceLogs = vi.fn()
  MedicationService.prototype.getAdherenceStats = vi.fn()
  return { MedicationService }
})

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID }
const medId = "00000000-0000-0000-0000-000000000080"

const mockMedication = {
  id: medId,
  userId: TEST_USER_ID,
  name: "Aspirin",
  dosage: "100mg",
  frequency: "daily",
  isActive: true,
  startDate: new Date("2025-01-01"),
}

describe("Medications routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/users/:userId/medications", () => {
    it("returns user medications", async () => {
      vi.mocked(MedicationService.prototype.listMedications).mockResolvedValue([mockMedication] as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/medications`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it("returns 404 for unknown user", async () => {
      vi.mocked(UserService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/medications`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/medications", () => {
    it("creates a medication and returns 201", async () => {
      vi.mocked(MedicationService.prototype.createMedication).mockResolvedValue(mockMedication as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/medications`,
        payload: {
          name: "Aspirin",
          dosage: "100mg",
          frequency: "daily",
          startDate: "2025-01-01T00:00:00.000Z",
        },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 400 when name is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/medications`,
        payload: {
          frequency: "daily",
          startDate: "2025-01-01T00:00:00.000Z",
        },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/users/:userId/medications/:medId", () => {
    it("returns a single medication", async () => {
      vi.mocked(MedicationService.prototype.findMedicationById).mockResolvedValue(mockMedication as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/medications/${medId}`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when medication not found", async () => {
      vi.mocked(MedicationService.prototype.findMedicationById).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/medications/${medId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("PUT /v1/users/:userId/medications/:medId", () => {
    it("updates a medication", async () => {
      vi.mocked(MedicationService.prototype.updateMedication).mockResolvedValue({
        ...mockMedication,
        dosage: "200mg",
      } as never)

      const res = await app.inject({
        method: "PUT",
        url: `/v1/users/${TEST_USER_ID}/medications/${medId}`,
        payload: { dosage: "200mg" },
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when medication not found", async () => {
      vi.mocked(MedicationService.prototype.updateMedication).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "PUT",
        url: `/v1/users/${TEST_USER_ID}/medications/${medId}`,
        payload: { dosage: "200mg" },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("DELETE /v1/users/:userId/medications/:medId", () => {
    it("deletes a medication and returns 204", async () => {
      vi.mocked(MedicationService.prototype.deleteMedication).mockResolvedValue(true as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/medications/${medId}`,
      })

      expect(res.statusCode).toBe(204)
    })

    it("returns 404 when medication not found", async () => {
      vi.mocked(MedicationService.prototype.deleteMedication).mockResolvedValue(false as never)

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/users/${TEST_USER_ID}/medications/${medId}`,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/users/:userId/medications/:medId/log", () => {
    it("logs medication adherence and returns 201", async () => {
      const mockLog = { id: "log1", medicationId: medId, status: "taken" }
      vi.mocked(MedicationService.prototype.logAdherence).mockResolvedValue(mockLog as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/medications/${medId}/log`,
        payload: {
          status: "taken",
          scheduledAt: "2025-06-01T08:00:00.000Z",
          takenAt: "2025-06-01T08:05:00.000Z",
        },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 400 for invalid status", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/medications/${medId}/log`,
        payload: {
          status: "invalid",
          scheduledAt: "2025-06-01T08:00:00.000Z",
        },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/users/:userId/medications/:medId/logs", () => {
    it("returns adherence logs", async () => {
      const mockLogs = [{ id: "log1", status: "taken" }]
      vi.mocked(MedicationService.prototype.getAdherenceLogs).mockResolvedValue(mockLogs as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/medications/${medId}/logs`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })
  })

  describe("GET /v1/users/:userId/medications/:medId/stats", () => {
    it("returns adherence stats", async () => {
      const mockStats = { adherenceRate: 0.95, totalDoses: 30, takenDoses: 28 }
      vi.mocked(MedicationService.prototype.getAdherenceStats).mockResolvedValue(mockStats as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/medications/${medId}/stats`,
      })

      expect(res.statusCode).toBe(200)
    })
  })
})
