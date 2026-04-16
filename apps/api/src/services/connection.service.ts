import {
  type ProviderConnection as DbProviderConnection,
  providerConnections,
} from "@biosync-io/db"
import { providerRegistry } from "@biosync-io/provider-core"
import type { ProviderConnection, ProviderTokens } from "@biosync-io/types"
import { AppError } from "@biosync-io/types"
import { and, eq } from "drizzle-orm"
import { config } from "../config.js"
import { decrypt, encrypt } from "../lib/crypto.js"
import { BaseService } from "./base.service.js"

export class ConnectionService extends BaseService {
  private get encryptionKey() {
    return config.ENCRYPTION_KEY
  }

  /**
   * Returns the OAuth2 authorization URL for the given provider.
   * PKCE codeVerifier is not yet supported by the current provider implementations.
   */
  async getAuthorizationUrl(
    providerId: string,
    _redirectUri: string,
    state: string,
  ): Promise<{ url: string; codeVerifier?: string }> {
    const provider = providerRegistry.resolve(providerId)
    if (!("getAuthorizationUrl" in provider)) {
      throw AppError.unsupported(`Provider '${providerId}' does not support OAuth2`)
    }
    const url = provider.getAuthorizationUrl(state)
    return { url: url.toString() }
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
      throw AppError.unsupported(`Provider '${params.providerId}' does not support OAuth2`)
    }

    const tokens = await provider.exchangeCode(params.code)
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
        providerId,
        encryptedTokens,
        status: "connected",
      })
      .onConflictDoUpdate({
        target: [providerConnections.userId, providerConnections.providerId],
        set: {
          encryptedTokens,
          status: "connected",
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

    if (!conn) throw AppError.notFound("Connection", connectionId)
    if (!conn.encryptedTokens)
      throw AppError.validation(`Connection '${connectionId}' has no stored tokens`)

    return JSON.parse(decrypt(conn.encryptedTokens, this.encryptionKey)) as ProviderTokens
  }

  async list(userId: string, _workspaceId: string): Promise<ProviderConnection[]> {
    const rows = await this.db
      .select({
        id: providerConnections.id,
        userId: providerConnections.userId,
        providerId: providerConnections.providerId,
        status: providerConnections.status,
        providerUserId: providerConnections.providerUserId,
        scopes: providerConnections.scopes,
        lastSyncedAt: providerConnections.lastSyncedAt,
        createdAt: providerConnections.createdAt,
        updatedAt: providerConnections.updatedAt,
      })
      .from(providerConnections)
      .where(eq(providerConnections.userId, userId))

    return rows as ProviderConnection[]
  }

  async disconnect(connectionId: string, _workspaceId: string): Promise<boolean> {
    const result = await this.db
      .update(providerConnections)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(eq(providerConnections.id, connectionId))
      .returning({ id: providerConnections.id })

    return result.length > 0
  }

  /**
   * Retrieve a connection by its ID, including encrypted tokens.
   * Used for operations that need to decrypt and use the tokens (e.g., revocation).
   */
  async getById(connectionId: string): Promise<DbProviderConnection | null> {
    const [row] = await this.db
      .select()
      .from(providerConnections)
      .where(eq(providerConnections.id, connectionId))
      .limit(1)

    return row ?? null
  }

  /**
   * Disconnect a connection with best-effort token revocation.
   * Attempts to revoke tokens at the provider before updating status.
   */
  async disconnectWithRevocation(
    connectionId: string,
    _workspaceId: string,
    log?: { warn: (obj: Record<string, unknown>, msg: string) => void },
  ): Promise<boolean> {
    const connection = await this.getById(connectionId)
    if (!connection) return false

    // Best-effort token revocation at the provider
    if (connection.encryptedTokens && providerRegistry.isRegistered(connection.providerId)) {
      try {
        const provider = providerRegistry.resolve(connection.providerId)
        if ("revokeTokens" in provider && typeof provider.revokeTokens === "function") {
          const tokens = JSON.parse(decrypt(connection.encryptedTokens, this.encryptionKey))
          await provider.revokeTokens(tokens)
        }
      } catch (err) {
        log?.warn(
          { err, connectionId, providerId: connection.providerId },
          "Token revocation failed (best-effort)",
        )
      }
    }

    const result = await this.db
      .update(providerConnections)
      .set({ status: "disconnected", encryptedTokens: null, updatedAt: new Date() })
      .where(eq(providerConnections.id, connectionId))
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
