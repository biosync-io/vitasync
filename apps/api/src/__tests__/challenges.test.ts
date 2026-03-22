import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChallengeService } from "../services/challenge.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  return { UserService }
})

vi.mock("../services/challenge.service.js", () => {
  const ChallengeService = vi.fn()
  ChallengeService.prototype.list = vi.fn()
  ChallengeService.prototype.create = vi.fn()
  ChallengeService.prototype.findById = vi.fn()
  ChallengeService.prototype.join = vi.fn()
  ChallengeService.prototype.leave = vi.fn()
  ChallengeService.prototype.leaderboard = vi.fn()
  ChallengeService.prototype.activate = vi.fn()
  return { ChallengeService }
})

const mockUser = {
  id: TEST_USER_ID,
  workspaceId: TEST_WORKSPACE_ID,
}

const challengeId = "00000000-0000-0000-0000-000000000050"

const mockChallenge = {
  id: challengeId,
  workspaceId: TEST_WORKSPACE_ID,
  name: "Step challenge",
  challengeType: "target",
  metricType: "steps",
  status: "draft",
  startsAt: new Date("2025-07-01"),
  endsAt: new Date("2025-07-31"),
}

describe("Challenge routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("GET /v1/challenges", () => {
    it("returns workspace challenges", async () => {
      vi.mocked(ChallengeService.prototype.list).mockResolvedValue([mockChallenge] as never)

      const res = await app.inject({ method: "GET", url: "/v1/challenges" })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
    })
  })

  describe("POST /v1/challenges", () => {
    it("creates a challenge and returns 201", async () => {
      vi.mocked(ChallengeService.prototype.create).mockResolvedValue(mockChallenge as never)

      const res = await app.inject({
        method: "POST",
        url: "/v1/challenges",
        payload: {
          title: "Step challenge",
          metricType: "steps",
          goalValue: 10000,
          startDate: "2025-07-01T00:00:00.000Z",
          endDate: "2025-07-31T00:00:00.000Z",
        },
      })

      expect(res.statusCode).toBe(201)
    })

    it("returns 400 when title is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/challenges",
        payload: { metricType: "steps", goalValue: 10000 },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/challenges/:challengeId", () => {
    it("returns a single challenge", async () => {
      vi.mocked(ChallengeService.prototype.findById).mockResolvedValue(mockChallenge as never)

      const res = await app.inject({ method: "GET", url: `/v1/challenges/${challengeId}` })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when not found", async () => {
      vi.mocked(ChallengeService.prototype.findById).mockResolvedValue(null as never)

      const res = await app.inject({ method: "GET", url: `/v1/challenges/${challengeId}` })

      expect(res.statusCode).toBe(404)
    })
  })

  describe("POST /v1/challenges/:challengeId/join", () => {
    it("joins a challenge", async () => {
      vi.mocked(ChallengeService.prototype.join).mockResolvedValue({ challengeId, userId: TEST_USER_ID } as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/challenges/${challengeId}/join`,
        payload: { userId: TEST_USER_ID },
      })

      expect(res.statusCode).toBe(201)
    })
  })

  describe("POST /v1/challenges/:challengeId/leave", () => {
    it("leaves a challenge and returns 204", async () => {
      vi.mocked(ChallengeService.prototype.leave).mockResolvedValue(undefined as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/challenges/${challengeId}/leave`,
        payload: { userId: TEST_USER_ID },
      })

      expect(res.statusCode).toBe(204)
    })
  })

  describe("GET /v1/challenges/:challengeId/leaderboard", () => {
    it("returns the leaderboard", async () => {
      vi.mocked(ChallengeService.prototype.leaderboard).mockResolvedValue([
        { userId: TEST_USER_ID, rank: 1, value: 50000 },
      ] as never)

      const res = await app.inject({ method: "GET", url: `/v1/challenges/${challengeId}/leaderboard` })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })
  })

  describe("POST /v1/challenges/:challengeId/activate", () => {
    it("activates a challenge", async () => {
      vi.mocked(ChallengeService.prototype.activate).mockResolvedValue({ ...mockChallenge, status: "active" } as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/challenges/${challengeId}/activate`,
      })

      expect(res.statusCode).toBe(200)
    })

    it("returns 404 when challenge not found", async () => {
      vi.mocked(ChallengeService.prototype.activate).mockResolvedValue(null as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/challenges/${challengeId}/activate`,
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
