import { createHmac } from "node:crypto"
import { getDb, webhookDeliveries, webhooks } from "@biosync-io/db"
import type { Job } from "bullmq"
import { eq } from "drizzle-orm"
import { getWorkerEventBus } from "../lib/event-bus.js"

export interface WebhookJobData {
  webhookId: string
  eventType: string
  payload: Record<string, unknown>
}

/**
 * BullMQ job processor for outbound webhook deliveries.
 *
 * Signs the payload with HMAC-SHA256 and posts to the subscriber URL.
 * BullMQ's retry mechanism handles exponential backoff on failure.
 */
export async function processWebhookJob(job: Job<WebhookJobData>): Promise<void> {
  const { webhookId, eventType, payload } = job.data
  const db = getDb()

  const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, webhookId)).limit(1)

  if (!webhook) {
    job.log(`Webhook ${webhookId} not found — skipping`)
    return
  }

  if (!webhook.isActive) {
    job.log(`Webhook ${webhookId} is disabled — skipping`)
    return
  }

  const body = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  })
  const signature = `sha256=${createHmac("sha256", webhook.secret).update(body).digest("hex")}`

  // Create delivery record
  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      webhookId,
      eventType,
      payload,
      status: "pending",
      attempts: 0,
    })
    .returning()

  const deliveryId = delivery!.id
  let responseStatus: number | null = null

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VitaSync-Signature": signature,
        "X-VitaSync-Event": eventType,
        "X-VitaSync-Delivery": deliveryId,
        "User-Agent": "VitaSync-Webhooks/1.0",
      },
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    })

    responseStatus = response.status

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => "")}`)
    }

    await db
      .update(webhookDeliveries)
      .set({
        status: "delivered",
        attempts: (delivery!.attempts ?? 0) + 1,
        lastAttemptedAt: new Date(),
        responseStatus,
      })
      .where(eq(webhookDeliveries.id, deliveryId))

    // Emit webhook delivered event
    getWorkerEventBus().publish({
      type: "webhook.delivered",
      aggregateType: "webhook",
      aggregateId: webhookId,
      payload: {
        webhookId,
        deliveryId,
        eventType,
        responseStatus: responseStatus!,
      },
    }).catch(() => {})
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    await db
      .update(webhookDeliveries)
      .set({
        status: job.attemptsMade >= (job.opts.attempts ?? 1) - 1 ? "failed" : "pending",
        attempts: (delivery!.attempts ?? 0) + 1,
        lastAttemptedAt: new Date(),
        responseStatus,
      })
      .where(eq(webhookDeliveries.id, deliveryId))

    // Emit webhook failed event
    getWorkerEventBus().publish({
      type: "webhook.failed",
      aggregateType: "webhook",
      aggregateId: webhookId,
      payload: {
        webhookId,
        deliveryId,
        eventType,
        error: message,
      },
    }).catch(() => {})

    throw err // Re-throw so BullMQ retries
  }
}
