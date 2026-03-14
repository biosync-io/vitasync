import { getDb, providerConnections, users } from "@biosync-io/db"
import { eq, and } from "drizzle-orm"
import { providerRegistry } from "@biosync-io/provider-core"
import { encrypt, decrypt } from "../lib/crypto.js"
import { config } from "../config.js"
import type { ProviderConnection, ProviderTokens } from "@biosync-io/types"

export class ConnectionService {
  private get db() {
    return getDb()
  }

  private get encryptionKey() {
    return config.ENCRYPTION_KEY
  }

  /**
   * Returns the OAuth2 authorization URL for the given provider.
   * A PKCE code_verifier is included if the provider supports it.
   */
  async getAuthorizationUrl(
    providerId: string,
    redirectUri: string,
    state: string,
  ): Promise<{ url: string; codeVerifier?: string }> {
    const provider = providerRegistry.resolve(providerId)
    if (!("getAuthorizationUrl" in provider)) {
      throw new Error(`Provider '${providerId}' does not support OAuth2`)
    }
    return provider.getAuthorizationUrl(redirectUri, state)
  }

  /**
   * Exchanges the OAuth2 code for tokens and persists the connection.
   */
  async completeOAuth2(params: {
    userId: string
    workspaceId: string
    providerId: string
    code: string
    redirectUri: string
    codeVerifier?: string
  }): Promise<ProviderConnection> {
    const provider = providerRegistry.resolve(params.providerId)
    if (!("exchangeCode" in provider)) {
      throw new Error(`Provider '${params.providerId}' does not support OAuth2`)
    }

    const tokens = await provider.exchangeCode(params.code, params.redirectUri, params.codeVerifier)
    return this.upsertConnection(params.userId, params.workspaceId, params.providerId, tokens)
  }

  async upsertConnection(
    userId: string,
    workspaceId: string,
    providerId: string,
    tokens: ProviderTokens,
  ): Promise<ProviderConnection> {
    const encryptedTokens = encrypt(JSON.stringify(tokens), this.encryptionKey)

    const [connection] = await this.db
      .insert(providerConnections)
      .values({
        userId,
        workspaceId,
        providerId,
        encryptedTokens,
        status: "connected",
        connectedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [providerConnections.userId, providerConnections.providerId],
        set: {
          encryptedTokens,
          status: "connected",
          connectedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning()

    return connection as ProviderConnection
  }

  async getDecryptedTokens(connectionId: string): Promise<ProviderTokens> {
    const [conn] = await this.db
      .select()
      .from(providerConnections)
      .where(eq(providerConnections.id, connectionId))
      .limit(1)

    if (!conn) throw new Error(`Connection '${connectionId}' not found`)

    return JSON.parse(decrypt(conn.encryptedTokens, this.encryptionKey)) as ProviderTokens
  }

  async list(userId: string, workspaceId: string): Promise<ProviderConnection[]> {
    const rows = await this.db
      .select({
        id: providerConnections.id,
        userId: providerConnections.userId,
        workspaceId: providerConnections.workspaceId,
        providerId: providerConnections.providerId,
        status: providerConnections.status,
        providerUserId: providerConnections.providerUserId,
        scopes: providerConnections.scopes,
        connectedAt: providerConnections.connectedAt,
        lastSyncedAt: providerConnections.lastSyncedAt,
        createdAt: providerConnections.createdAt,
        updatedAt: providerConnections.updatedAt,
      })
      .from(providerConnections)
      .where(
        and(
          eq(providerConnections.userId, userId),
          eq(providerConnections.workspaceId, workspaceId),
        ),
      )

    return rows as ProviderConnection[]
  }

  async disconnect(connectionId: string, workspaceId: string): Promise<boolean> {
    const result = await this.db
      .update(providerConnections)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(
        and(
          eq(providerConnections.id, connectionId),
          eq(providerConnections.workspaceId, workspaceId),
        ),
      )
      .returning({ id: providerConnections.id })

    return result.length > 0
  }

  /**
   * Finds an active connection by the provider's own user/athlete ID.
   * Used to route inbound provider webhooks to the correct VitaSync user.
   */
  async findByProviderUserId(
    providerId: string,
    providerUserId: string,
  ): Promise<ProviderConnection | null> {
    const [row] = await this.db
      .select()
      .from(providerConnections)
      .where(
        and(
          eq(providerConnections.providerId, providerId),
          eq(providerConnections.providerUserId, providerUserId),
          eq(providerConnections.status, "connected"),
        ),
      )
      .limit(1)

    return (row as ProviderConnection) ?? null
  }
}
