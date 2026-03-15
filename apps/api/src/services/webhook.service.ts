import { createHmac } from "node:crypto"
import { getDb, webhookDeliveries, webhooks } from "@biosync-io/db"
import type { Webhook, WebhookDelivery, WebhookEvent } from "@biosync-io/types"
import { and, desc, eq } from "drizzle-orm"

export class WebhookService {
  private get db() {
    return getDb()
  }

  async create(params: {
    workspaceId: string
    url: string
    secret: string
    events: WebhookEvent[]
    description?: string
  }): Promise<Webhook> {
    const [webhook] = await this.db
      .insert(webhooks)
      .values({
        workspaceId: params.workspaceId,
        url: params.url,
        secret: params.secret,
        events: params.events,
        description: params.description ?? null,
        isActive: true,
      })
      .returning()

    return webhook as Webhook
  }

  async list(workspaceId: string): Promise<Webhook[]> {
    const rows = await this.db
      .select()
      .from(webhooks)
      .where(eq(webhooks.workspaceId, workspaceId))
      .orderBy(webhooks.createdAt)

    return rows as Webhook[]
  }

  async getById(id: string, workspaceId: string): Promise<Webhook | null> {
    const [webhook] = await this.db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, workspaceId)))
      .limit(1)

    return (webhook as Webhook) ?? null
  }

  async update(
    id: string,
    workspaceId: string,
    patch: { url?: string; events?: WebhookEvent[]; isActive?: boolean; description?: string },
  ): Promise<Webhook | null> {
    const [updated] = await this.db
      .update(webhooks)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, workspaceId)))
      .returning()

    return (updated as Webhook) ?? null
  }

  async delete(id: string, workspaceId: string): Promise<boolean> {
    const result = await this.db
      .delete(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, workspaceId)))
      .returning({ id: webhooks.id })

    return result.length > 0
  }

  async listDeliveries(webhookId: string, workspaceId: string): Promise<WebhookDelivery[]> {
    // Verify ownership first
    const webhook = await this.getById(webhookId, workspaceId)
    if (!webhook) return []

    const rows = await this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(50)

    return rows as WebhookDelivery[]
  }

  /**
   * Builds the `X-VitaSync-Signature` HMAC-SHA256 header value for a payload.
   * Consumers can verify deliveries by recomputing this signature.
   */
  static buildSignature(payload: string, secret: string): string {
    return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`
  }
}
