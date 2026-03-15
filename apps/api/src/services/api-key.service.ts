import { apiKeys, getDb, workspaces } from "@biosync-io/db"
import type { ApiKey, ApiKeyScope } from "@biosync-io/types"
import { and, eq } from "drizzle-orm"
import { generateApiKey } from "../lib/api-key.js"

export class ApiKeyService {
  private get db() {
    return getDb()
  }

  /**
   * Creates a new API key. The raw key is returned ONCE and never stored.
   */
  async create(params: {
    workspaceId: string
    name: string
    scopes: ApiKeyScope[]
    expiresAt?: Date
  }): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const { raw, hash, prefix } = generateApiKey()

    const [record] = await this.db
      .insert(apiKeys)
      .values({
        workspaceId: params.workspaceId,
        name: params.name,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: params.scopes,
        expiresAt: params.expiresAt ?? null,
      })
      .returning()

    return { apiKey: record as ApiKey, rawKey: raw }
  }

  async list(workspaceId: string): Promise<ApiKey[]> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.workspaceId, workspaceId))
      .orderBy(apiKeys.createdAt)

    return rows as ApiKey[]
  }

  async revoke(id: string, workspaceId: string): Promise<boolean> {
    const result = await this.db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId)))
      .returning({ id: apiKeys.id })

    return result.length > 0
  }

  /**
   * Rotates an API key: generates a new secret in-place, preserving all other
   * metadata (name, scopes, expiry). The old raw key is immediately invalidated.
   * The new raw key is returned once and must never be stored.
   */
  async rotate(
    id: string,
    workspaceId: string,
  ): Promise<{ apiKey: ApiKey; rawKey: string } | null> {
    const { raw, hash, prefix } = generateApiKey()

    const [updated] = await this.db
      .update(apiKeys)
      .set({ keyHash: hash, keyPrefix: prefix })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId)))
      .returning()

    if (!updated) return null
    return { apiKey: updated as ApiKey, rawKey: raw }
  }
}
