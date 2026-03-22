import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildTestApp } from "./helpers.js"

vi.mock("../queues/sync.js", () => ({
  getSyncQueue: vi.fn().mockReturnValue({
    getJobs: vi.fn().mockResolvedValue([]),
  }),
}))

const mockJob = {
  id: "job-1",
  name: "sync",
  data: { userId: "u1", connectionId: "c1" },
  progress: 100,
  attemptsMade: 1,
  failedReason: null,
  processedOn: 1717200000000,
  finishedOn: 1717200060000,
  timestamp: 1717200000000,
}

describe("Sync Jobs routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    vi.resetAllMocks()

    const { getSyncQueue } = await import("../queues/sync.js")
    vi.mocked(getSyncQueue).mockReturnValue({
      getJobs: vi.fn().mockResolvedValue([]),
    } as never)

    app = await buildTestApp()
  })

  describe("GET /v1/sync-jobs", () => {
    it("returns empty job list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/sync-jobs",
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.jobs).toEqual([])
    })

    it("returns jobs from queue", async () => {
      const { getSyncQueue } = await import("../queues/sync.js")
      const mockGetJobs = vi.fn()
        .mockResolvedValueOnce([mockJob]) // waiting
        .mockResolvedValueOnce([])        // active
        .mockResolvedValueOnce([])        // completed
        .mockResolvedValueOnce([])        // failed
        .mockResolvedValueOnce([])        // delayed

      vi.mocked(getSyncQueue).mockReturnValue({
        getJobs: mockGetJobs,
      } as never)

      // Re-build app to pick up new mocks
      app = await (await import("./helpers.js")).buildTestApp()

      const res = await app.inject({
        method: "GET",
        url: "/v1/sync-jobs",
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.jobs).toHaveLength(1)
      expect(body.jobs[0].id).toBe("job-1")
    })
  })
})
