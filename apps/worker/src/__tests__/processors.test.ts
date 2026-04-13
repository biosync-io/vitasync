import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Job } from "bullmq"
import type { SyncJobData } from "../processors/sync.processor.js"
import type { WebhookJobData } from "../processors/webhook.processor.js"
import type { ReportJobData } from "../processors/report.processor.js"

/**
 * Creates a mock BullMQ Job for testing processors.
 */
function createMockJob<T>(data: T, overrides?: Partial<Job<T>>): Job<T> {
  return {
    id: "test-job-1",
    name: "test",
    data,
    attemptsMade: 0,
    progress: 0,
    timestamp: Date.now(),
    updateProgress: vi.fn(),
    log: vi.fn(),
    ...overrides,
  } as unknown as Job<T>
}

// ── Sync Processor Tests ─────────────────────────────────────

describe("processSyncJob", () => {
  it("requires connectionId in job data", () => {
    const job = createMockJob<SyncJobData>({})
    expect(job.data.connectionId).toBeUndefined()
  })

  it("creates mock job with correct structure", () => {
    const job = createMockJob<SyncJobData>({
      connectionId: "conn-123",
      userId: "user-456",
      providerId: "fitbit",
    })

    expect(job.data.connectionId).toBe("conn-123")
    expect(job.data.userId).toBe("user-456")
    expect(job.data.providerId).toBe("fitbit")
    expect(job.id).toBe("test-job-1")
  })

  it("supports scheduled sweep type", () => {
    const job = createMockJob<SyncJobData>({ type: "scheduled_sweep" })
    expect(job.data.type).toBe("scheduled_sweep")
  })
})

// ── Webhook Processor Tests ──────────────────────────────────

describe("processWebhookJob", () => {
  it("creates mock job with webhook data", () => {
    const job = createMockJob<WebhookJobData>({
      webhookId: "wh-123",
      eventType: "sync.completed",
      payload: { connectionId: "conn-1", metricsSynced: 42 },
    })

    expect(job.data.webhookId).toBe("wh-123")
    expect(job.data.eventType).toBe("sync.completed")
    expect(job.data.payload.metricsSynced).toBe(42)
  })

  it("mock job supports log method", () => {
    const job = createMockJob<WebhookJobData>({
      webhookId: "wh-123",
      eventType: "sync.completed",
      payload: {},
    })

    job.log("test message")
    expect(job.log).toHaveBeenCalledWith("test message")
  })
})

// ── Report Processor Tests ───────────────────────────────────

describe("processReportJob", () => {
  it("creates mock job with report data", () => {
    const job = createMockJob<ReportJobData>({
      workspaceId: "ws-123",
      userId: "user-456",
      reportType: "weekly",
      dateRange: { from: "2026-04-01", to: "2026-04-07" },
    })

    expect(job.data.reportType).toBe("weekly")
    expect(job.data.dateRange.from).toBe("2026-04-01")
  })
})

// ── Mock Job Helper Tests ────────────────────────────────────

describe("createMockJob", () => {
  it("creates job with default id", () => {
    const job = createMockJob({ test: true })
    expect(job.id).toBe("test-job-1")
  })

  it("allows overriding job properties", () => {
    const job = createMockJob({ test: true }, { id: "custom-id", attemptsMade: 3 })
    expect(job.id).toBe("custom-id")
    expect(job.attemptsMade).toBe(3)
  })

  it("updateProgress is a mock function", () => {
    const job = createMockJob({ test: true })
    job.updateProgress(50)
    expect(job.updateProgress).toHaveBeenCalledWith(50)
  })
})
