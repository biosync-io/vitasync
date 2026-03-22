import { beforeEach, describe, expect, it, vi } from "vitest"
import { JournalService } from "../services/journal.service.js"
import { WaterIntakeService } from "../services/water-intake.service.js"
import { HabitsService } from "../services/habits.service.js"
import { UserService } from "../services/user.service.js"
import { TEST_USER_ID, TEST_WORKSPACE_ID, buildTestApp } from "./helpers.js"

vi.mock("../services/journal.service.js", () => {
  const JournalService = vi.fn()
  JournalService.prototype.create = vi.fn()
  JournalService.prototype.list = vi.fn()
  JournalService.prototype.update = vi.fn()
  JournalService.prototype.delete = vi.fn()
  JournalService.prototype.getStats = vi.fn()
  return { JournalService }
})

vi.mock("../services/water-intake.service.js", () => {
  const WaterIntakeService = vi.fn()
  WaterIntakeService.prototype.create = vi.fn()
  WaterIntakeService.prototype.list = vi.fn()
  WaterIntakeService.prototype.delete = vi.fn()
  WaterIntakeService.prototype.getDailySummary = vi.fn()
  WaterIntakeService.prototype.getWeeklyStats = vi.fn()
  return { WaterIntakeService }
})

vi.mock("../services/habits.service.js", () => {
  const HabitsService = vi.fn()
  HabitsService.prototype.createHabit = vi.fn()
  HabitsService.prototype.listHabits = vi.fn()
  HabitsService.prototype.logCompletion = vi.fn()
  HabitsService.prototype.getDailySummary = vi.fn()
  return { HabitsService }
})

vi.mock("../services/user.service.js", () => {
  const UserService = vi.fn()
  UserService.prototype.findById = vi.fn()
  UserService.prototype.list = vi.fn()
  UserService.prototype.findOrCreate = vi.fn()
  UserService.prototype.update = vi.fn()
  UserService.prototype.delete = vi.fn()
  return { UserService }
})

const mockUser = { id: TEST_USER_ID, workspaceId: TEST_WORKSPACE_ID, externalId: "u1" }

describe("Journal routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("POST /v1/users/:userId/journal", () => {
    it("creates journal entry with body as required field", async () => {
      vi.mocked(JournalService.prototype.create).mockResolvedValue({ id: "j-1" } as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/journal`,
        body: { body: "Today was great", title: "Good Day", moodScore: 4, tags: ["health"] },
      })

      expect(res.statusCode).toBe(201)
    })

    it("rejects when body text is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/journal`,
        body: { title: "No body" },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})

describe("Water intake routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("POST /v1/users/:userId/water", () => {
    it("creates water intake log", async () => {
      vi.mocked(WaterIntakeService.prototype.create).mockResolvedValue({ id: "w-1" } as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/water`,
        body: { amountMl: 250, beverageType: "water" },
      })

      expect(res.statusCode).toBe(201)
    })

    it("rejects negative amount", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/water`,
        body: { amountMl: -100 },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("GET /v1/users/:userId/water/today", () => {
    it("returns daily summary", async () => {
      vi.mocked(WaterIntakeService.prototype.getDailySummary).mockResolvedValue({
        totalMl: 1500, goalMl: 2500, progressPct: 60, logCount: 5, byBeverage: { water: 1500 },
      } as never)

      const res = await app.inject({
        method: "GET",
        url: `/v1/users/${TEST_USER_ID}/water/today`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().totalMl).toBe(1500)
    })
  })
})

describe("Habits routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(UserService.prototype.findById).mockResolvedValue(mockUser as never)
    app = await buildTestApp()
  })

  describe("POST /v1/users/:userId/habits", () => {
    it("creates habit with name and icon", async () => {
      vi.mocked(HabitsService.prototype.createHabit).mockResolvedValue({ id: "h-1", name: "Meditate" } as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/habits`,
        body: { name: "Meditate", icon: "🧘", color: "purple" },
      })

      expect(res.statusCode).toBe(201)
    })

    it("rejects empty habit name", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/habits`,
        body: { name: "" },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe("POST /v1/users/:userId/habits/:habitId/complete", () => {
    it("marks habit as completed for today", async () => {
      vi.mocked(HabitsService.prototype.logCompletion).mockResolvedValue({ id: "hl-1" } as never)

      const res = await app.inject({
        method: "POST",
        url: `/v1/users/${TEST_USER_ID}/habits/00000000-0000-0000-0000-000000000099/complete`,
        body: {},
      })

      expect(res.statusCode).toBe(201)
    })
  })
})
